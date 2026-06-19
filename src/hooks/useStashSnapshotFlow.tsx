import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { fetchPoeStashTabs } from '../lib/poe-cookie-client'
import type { LegacyStashTab } from '../lib/poe-cookie-client'
import { supabase } from '../lib/supabase'
import { queryKeys } from '../lib/queryKeys'
import { usePoeSession } from '../store/poe-session-store'
import { usePoeSnapshot } from './usePoeSnapshot'
import { StashTabSelectorModal, MAX_STASH_TABS } from '../components/sync/StashTabSelectorModal'
import { useSnapshotPreferencesStore } from '../store/snapshot-preferences-store'
import { useMyProfile } from './useCurrentUser'
import { useSnapshotStore } from '../store/snapshot-store'
type Step = 'idle' | 'fetching-tabs' | 'selecting' | 'snapshotting'

/**
 * Handles the stash snapshot flow for the Economy page:
 *   1. Fetch available stash tabs from PoE
 *   2. Show tab-selector modal (remembers selection in poe-session-store)
 *   3. Run snapshotStash + applyPricing with the chosen tabs
 *
 * Usage:
 *   const { triggerSnapshot, isBusy, modal } = useStashSnapshotFlow()
 *   // render `modal` somewhere in JSX
 *   // call `triggerSnapshot(groupId, league)` on button press
 */
export function useStashSnapshotFlow() {
  const { sessId, cfClearance, accountName, selectedTabIds, setSelectedTabIds } = usePoeSession()
  const { snapshotStash, applyPricing, recordGroupWealthHistory } = usePoeSnapshot()
  const resetTimer = useSnapshotPreferencesStore((s) => s.resetTimer)
  const { data: profile } = useMyProfile()
  const { setProgress, reset } = useSnapshotStore()
  const queryClient = useQueryClient()

  const [step, setStep] = useState<Step>('idle')
  const [availableTabs, setAvailableTabs] = useState<LegacyStashTab[]>([])
  const [pendingGroupId, setPendingGroupId] = useState<string | null>(null)
  const [pendingLeague, setPendingLeague] = useState<string | null>(null)
  const [localSelection, setLocalSelection] = useState<string[]>([])
  const [fetchError, setFetchError] = useState<string | null>(null)

  const isBusy = step !== 'idle'
  const canUseOAuthFlow = !!profile?.poe_token_expires_at
  const preferOAuthFlow = canUseOAuthFlow

  const getAuthenticatedUserId = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')
    return user.id
  }

  const fetchOAuthStashTabs = async (league: string): Promise<LegacyStashTab[]> => {
    const userId = await getAuthenticatedUserId()

    const { data, error } = await supabase.functions.invoke('poe-list-stash-tabs', {
      body: {
        user_id: userId,
        league,
      },
    })

    if (error) throw error

    return Array.isArray(data?.tabs) ? (data.tabs as LegacyStashTab[]) : []
  }

  const runOAuthSnapshot = async (groupId: string, league: string, tabIds: string[]) => {
    const userId = await getAuthenticatedUserId()

    const { error } = await supabase.functions.invoke('poe-snapshot', {
      body: {
        group_id: groupId,
        user_id: userId,
        league,
        selected_tab_ids: tabIds,
      },
    })

    if (error) throw error
    queryClient.invalidateQueries({ queryKey: [...queryKeys.snapshots.latest(groupId)] })
    queryClient.invalidateQueries({ queryKey: [...queryKeys.economy(groupId)] })
    queryClient.invalidateQueries({ queryKey: [...queryKeys.snapshots.groupHistory(groupId)] })
    queryClient.invalidateQueries({ queryKey: [...queryKeys.characters.active(groupId)] })
  }

  const triggerSnapshot = async (groupId: string, league: string) => {
    setPendingGroupId(groupId)
    setPendingLeague(league)
    setFetchError(null)
    setStep('fetching-tabs')

    try {
      const tabs =
        preferOAuthFlow
          ? await fetchOAuthStashTabs(league)
          : await fetchPoeStashTabs(accountName, sessId, cfClearance, league)
      const visible = tabs.filter((t) => !t.hidden && !t.n.includes('(Remove-only)'))
      setAvailableTabs(visible)

      const persisted = selectedTabIds ?? []
      const validIds = visible.map((t) => t.id)
      const valid = persisted.filter((id) => validIds.includes(id))
      // Restore previous selection only if it was a partial selection
      // within the tab limit; never open with every tab pre-selected
      // or more than MAX_STASH_TABS.
      const seed =
        valid.length > 0 && valid.length < visible.length && valid.length <= MAX_STASH_TABS
          ? valid
          : []

      setLocalSelection(seed)
      setStep('selecting')
    } catch (err) {
      console.error('Failed to fetch stash tabs:', err)
      setAvailableTabs([])
      setFetchError(
        err instanceof Error ? err.message : 'Failed to fetch stash tabs. Check your PoE session.',
      )
      setStep('selecting')
    }
  }

  const handleConfirm = async () => {
    if (!pendingGroupId || !pendingLeague) return
    setSelectedTabIds(localSelection)
    setStep('snapshotting')

    const selectedTabs = availableTabs.filter((t) => localSelection.includes(t.id))

    try {
      if (preferOAuthFlow) {
        reset()
        setProgress({
          phase: 'stash',
          tabsCurrent: 0,
          tabsTotal: selectedTabs.length,
          message: `Syncing ${selectedTabs.length} tabs...`,
        })
        await runOAuthSnapshot(
          pendingGroupId,
          pendingLeague,
          selectedTabs.map((tab) => tab.id),
        )
        setProgress({
          phase: 'done',
          tabsCurrent: selectedTabs.length,
          tabsTotal: selectedTabs.length,
          message: `Synced ${selectedTabs.length} tabs`,
        })
      } else {
        const snapshotId = await snapshotStash(pendingGroupId, pendingLeague, selectedTabs)
        await applyPricing(pendingGroupId, pendingLeague, snapshotId)
        // Best-effort group wealth history recording
        try {
          await recordGroupWealthHistory(pendingGroupId, snapshotId)
        } catch (e) {
          console.error('Failed to record group wealth history:', e)
        }
      }
      resetTimer()
    } catch (error) {
      setProgress({ phase: 'error', message: String(error) })
      throw error
    } finally {
      setStep('idle')
    }
  }

  const triggerScheduledSnapshot = async (groupId: string, league: string) => {
    if (!selectedTabIds?.length) {
      throw new Error('Choose stash tabs in a manual snapshot before enabling interval snapshots.')
    }

    setPendingGroupId(groupId)
    setPendingLeague(league)
    setFetchError(null)
    setStep('snapshotting')

    try {
      if (preferOAuthFlow) {
        reset()
        setProgress({
          phase: 'stash',
          tabsCurrent: 0,
          tabsTotal: selectedTabIds.length,
          message: `Syncing ${selectedTabIds.length} tabs...`,
        })
        await runOAuthSnapshot(groupId, league, selectedTabIds)
        setProgress({
          phase: 'done',
          tabsCurrent: selectedTabIds.length,
          tabsTotal: selectedTabIds.length,
          message: `Synced ${selectedTabIds.length} tabs`,
        })
        resetTimer()
        return
      }

      const tabs = await fetchPoeStashTabs(accountName, sessId, cfClearance, league)
      const visible = tabs.filter((t) => !t.hidden && !t.n.includes('(Remove-only)'))
      const selectedTabs = visible.filter((t) => selectedTabIds.includes(t.id)).slice(0, MAX_STASH_TABS)

      if (selectedTabs.length === 0) {
        throw new Error('Your saved stash tab selection is no longer valid. Run a manual snapshot to pick tabs again.')
      }

      const snapshotId = await snapshotStash(groupId, league, selectedTabs)
      await applyPricing(groupId, league, snapshotId)

      try {
        await recordGroupWealthHistory(groupId, snapshotId)
      } catch (e) {
        console.error('Failed to record group wealth history:', e)
      }

      resetTimer()
    } catch (error) {
      setProgress({ phase: 'error', message: String(error) })
      throw error
    } finally {
      setStep('idle')
    }
  }

  const handleCancel = () => {
    setStep('idle')
  }

  const modal = (
    <StashTabSelectorModal
      isOpen={step === 'selecting' || step === 'fetching-tabs'}
      isFetchingTabs={step === 'fetching-tabs'}
      tabs={availableTabs}
      selectedIds={localSelection}
      onSelectionChange={setLocalSelection}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
      error={fetchError}
    />
  )

  return { triggerSnapshot, triggerScheduledSnapshot, isBusy, modal }
}
