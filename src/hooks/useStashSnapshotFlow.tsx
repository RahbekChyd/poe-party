import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { PoeStashTabSummary } from '../types/poe-api'
import { supabase } from '../lib/supabase'
import { queryKeys } from '../lib/queryKeys'
import { useStashTabSelectionStore } from '../store/stash-tab-selection-store'
import { StashTabSelectorModal, MAX_STASH_TABS } from '../components/sync/StashTabSelectorModal'
import { useSnapshotPreferencesStore } from '../store/snapshot-preferences-store'
import { useMyProfile } from './useCurrentUser'
import { useSnapshotStore } from '../store/snapshot-store'
import { trackProductEvent } from '../lib/analytics'
type Step = 'idle' | 'fetching-tabs' | 'selecting' | 'snapshotting'

/**
 * Handles the stash snapshot flow for the Economy page:
 *   1. Fetch available stash tabs from PoE
 *   2. Show tab-selector modal (remembers the user's selection for this browser tab)
 *   3. Ask the OAuth-backed Edge Function to create and price the snapshot
 *
 * Usage:
 *   const { triggerSnapshot, isBusy, modal } = useStashSnapshotFlow()
 *   // render `modal` somewhere in JSX
 *   // call `triggerSnapshot(groupId, league)` on button press
 */
export function useStashSnapshotFlow() {
  const { selectedTabIds, setSelectedTabIds } = useStashTabSelectionStore()
  const resetTimer = useSnapshotPreferencesStore((s) => s.resetTimer)
  const { data: profile } = useMyProfile()
  const { setProgress, reset } = useSnapshotStore()
  const queryClient = useQueryClient()

  const [step, setStep] = useState<Step>('idle')
  const [availableTabs, setAvailableTabs] = useState<PoeStashTabSummary[]>([])
  const [pendingGroupId, setPendingGroupId] = useState<string | null>(null)
  const [pendingLeague, setPendingLeague] = useState<string | null>(null)
  const [localSelection, setLocalSelection] = useState<string[]>([])
  const [fetchError, setFetchError] = useState<string | null>(null)

  const isBusy = step !== 'idle'
  const hasOAuthAccess = !!profile?.poe_token_expires_at

  const getAuthenticatedUserId = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')
    return user.id
  }

  const fetchOAuthStashTabs = async (league: string): Promise<PoeStashTabSummary[]> => {
    const userId = await getAuthenticatedUserId()

    const { data, error } = await supabase.functions.invoke('poe-list-stash-tabs', {
      body: {
        user_id: userId,
        league,
      },
    })

    if (error) throw error

    return Array.isArray(data?.tabs) ? (data.tabs as PoeStashTabSummary[]) : []
  }

  const runOAuthSnapshot = async (groupId: string, league: string, tabIds: string[]) => {
    const userId = await getAuthenticatedUserId()

    const { data, error } = await supabase.functions.invoke('poe-snapshot', {
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
    queryClient.invalidateQueries({ queryKey: queryKeys.snapshots.groupItems(groupId) })
    queryClient.invalidateQueries({ queryKey: ['snapshot-items', groupId] })
    queryClient.invalidateQueries({ queryKey: ['snapshot-history', groupId] })
    return typeof data?.warning === 'string' ? data.warning : null
  }

  const triggerSnapshot = async (groupId: string, league: string) => {
    setPendingGroupId(groupId)
    setPendingLeague(league)
    setFetchError(null)
    setStep('fetching-tabs')

    try {
      if (!hasOAuthAccess) {
        throw new Error('Connect your PoE account before taking a stash snapshot.')
      }
      const tabs = await fetchOAuthStashTabs(league)
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
        err instanceof Error ? err.message : 'Failed to fetch stash tabs. Try reconnecting OAuth.',
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
      reset()
      setProgress({
        phase: 'stash',
        tabsCurrent: 0,
        tabsTotal: selectedTabs.length,
        message: `Syncing ${selectedTabs.length} tabs...`,
      })
      const warning = await runOAuthSnapshot(
        pendingGroupId,
        pendingLeague,
        selectedTabs.map((tab) => tab.id),
      )
      setProgress({
        phase: 'done',
        tabsCurrent: selectedTabs.length,
        tabsTotal: selectedTabs.length,
        message: warning ?? `Synced ${selectedTabs.length} tabs`,
      })
      resetTimer()
      trackProductEvent('activation_stash_snapshot_completed', {
        transport: 'oauth',
        tab_count: selectedTabs.length,
        scheduled: false,
      })
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
      if (!hasOAuthAccess) {
        throw new Error('Connect your PoE account before taking a stash snapshot.')
      }
      reset()
      setProgress({
        phase: 'stash',
        tabsCurrent: 0,
        tabsTotal: selectedTabIds.length,
        message: `Syncing ${selectedTabIds.length} tabs...`,
      })
      const warning = await runOAuthSnapshot(groupId, league, selectedTabIds)
      setProgress({
        phase: 'done',
        tabsCurrent: selectedTabIds.length,
        tabsTotal: selectedTabIds.length,
        message: warning ?? `Synced ${selectedTabIds.length} tabs`,
      })
      resetTimer()
      trackProductEvent('activation_stash_snapshot_completed', {
        transport: 'oauth',
        tab_count: selectedTabIds.length,
        scheduled: true,
      })
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
