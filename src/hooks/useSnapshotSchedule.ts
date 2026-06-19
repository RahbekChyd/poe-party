import { useEffect, useMemo, useState } from 'react'
import { useLatestSnapshots } from './useSnapshots'
import { useCurrentUser, useMyProfile } from './useCurrentUser'
import { usePoeSession } from '../store/poe-session-store'
import { useSnapshotPreferencesStore } from '../store/snapshot-preferences-store'
import { useActiveGroupContext } from './useGroups'
import { hasActiveProAccess } from '../lib/billing'
function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

export function useSnapshotSchedule(groupId: string | null) {
  const { data: user } = useCurrentUser()
  const { data: profile } = useMyProfile()
  const { data: snapshots } = useLatestSnapshots(groupId)
  const { sessId, selectedTabIds } = usePoeSession()
  const { league: activeLeague, capabilities } = useActiveGroupContext(groupId)
  const mode = useSnapshotPreferencesStore((s) => s.mode)
  const intervalHours = useSnapshotPreferencesStore((s) => s.intervalHours)
  const lastTimerResetAt = useSnapshotPreferencesStore((s) => s.lastTimerResetAt)
  const resetTimer = useSnapshotPreferencesStore((s) => s.resetTimer)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (mode !== 'mix') return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [mode])

  const mySnapshot = snapshots?.find((s) => s.user_id === user?.id)
  const isPro = hasActiveProAccess(profile)
  const hasOAuthAccess = !!profile?.poe_token_expires_at
  const hasCookieAccess = !!sessId
  const hasSavedTabs = (selectedTabIds?.length ?? 0) > 0
  const hasSnapshotAccess = hasCookieAccess || hasOAuthAccess
  const intervalMs = intervalHours * 60 * 60 * 1000

  useEffect(() => {
    if (mode !== 'mix' || lastTimerResetAt != null) return
    const fallback = mySnapshot?.completed_at
      ? new Date(mySnapshot.completed_at).getTime()
      : Date.now()
    resetTimer(fallback)
  }, [lastTimerResetAt, mode, mySnapshot?.completed_at, resetTimer])

  const blockingReason = useMemo(() => {
    if (mode !== 'mix') return 'Switch to mix mode to enable interval snapshots.'
    if (!capabilities?.supportsStashSnapshots) {
      return 'Stash snapshots are currently only available for Path of Exile 1 workspaces.'
    }
    if (!isPro) return 'Supporter capacity is required for interval snapshots.'
    if (!groupId || !activeLeague) return 'Choose an active group with a league.'
    if (!hasSnapshotAccess) return 'Connect your PoE account to enable interval snapshots.'
    if (!hasSavedTabs) return 'Take a manual snapshot and choose tabs first.'
    return null
  }, [activeLeague, capabilities?.supportsStashSnapshots, groupId, hasSavedTabs, hasSnapshotAccess, isPro, mode])

  const isEligible = blockingReason == null
  const nextSnapshotAt =
    isEligible && lastTimerResetAt != null ? lastTimerResetAt + intervalMs : null
  const msUntilNext = nextSnapshotAt != null ? Math.max(0, nextSnapshotAt - now) : null

  return {
    mode,
    intervalHours,
    activeLeague,
    isPro,
    isEligible,
    blockingReason,
    hasSavedTabs,
    hasSnapshotAccess,
    nextSnapshotAt,
    msUntilNext,
    countdownLabel: msUntilNext != null ? formatCountdown(msUntilNext) : null,
    resetTimer,
  }
}
