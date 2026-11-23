import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { useMyAnalysisRunNotifications, type AnalysisRunListEntry } from './useGearOptimizer'

const STORAGE_PREFIX = 'poe-party:analysis-notifications:v1:'
const CHANGE_EVENT = 'poe-party:analysis-notifications-changed'
const fallback = new Map<string, string>()
const EMPTY_STATE = { initialized: false, opened: [] as string[] }

function storageKey(groupId: string | null, userId: string | null) {
  return groupId && userId ? `${STORAGE_PREFIX}${userId}:${groupId}` : null
}

function readSnapshot(key: string | null): string | null {
  if (!key || typeof window === 'undefined') return null
  try {
    return fallback.get(key) ?? window.localStorage.getItem(key)
  } catch {
    return fallback.get(key) ?? null
  }
}

function parseState(snapshot: string | null): typeof EMPTY_STATE {
  if (!snapshot) return EMPTY_STATE
  try {
    const state = JSON.parse(snapshot)
    if (Array.isArray(state?.opened)) {
      return {
        initialized: state.initialized === true,
        opened: state.opened.filter((id: unknown) => typeof id === 'string'),
      }
    }
  } catch {
    // A corrupt browser preference can be rebuilt from the run list.
  }
  return EMPTY_STATE
}

function writeState(key: string, state: typeof EMPTY_STATE) {
  const snapshot = JSON.stringify(state)
  if (snapshot === readSnapshot(key)) return
  try {
    window.localStorage.setItem(key, snapshot)
    fallback.delete(key)
  } catch {
    fallback.set(key, snapshot)
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function subscribe(listener: () => void) {
  function handleStorage(event: StorageEvent) {
    if (!event.key || event.key.startsWith(STORAGE_PREFIX)) listener()
  }
  window.addEventListener('storage', handleStorage)
  window.addEventListener(CHANGE_EVENT, listener)
  return () => {
    window.removeEventListener('storage', handleStorage)
    window.removeEventListener(CHANGE_EVENT, listener)
  }
}

function isReady(run: AnalysisRunListEntry) {
  return run.status === 'completed' || run.status === 'partial' ||
    (run.status === 'stale' && run.staleReason !== 'user-cancelled' && !!run.completedAt)
}

export function useAnalysisNotifications(groupId: string | null, userId: string | null) {
  const key = storageKey(groupId, userId)
  const query = useMyAnalysisRunNotifications(groupId, userId)
  const getSnapshot = useCallback(() => readSnapshot(key), [key])
  const state = parseState(useSyncExternalStore(subscribe, getSnapshot, () => null))
  const runs = query.data

  useEffect(() => {
    if (!key || !query.isSuccess || !runs) return
    const current = parseState(readSnapshot(key))
    // The first successful fetch establishes which results predate notifications.
    if (!current.initialized) {
      writeState(key, {
        initialized: true,
        opened: Array.from(new Set([...current.opened, ...runs.filter(isReady).map((run) => run.id)])),
      })
    }
  }, [key, query.isSuccess, runs])

  return {
    active: runs?.filter((run) => run.status === 'queued' || run.status === 'running') ?? [],
    unread: state.initialized
      ? runs?.filter((run) => isReady(run) && !state.opened.includes(run.id)) ?? []
      : [],
  }
}

export function useMarkAnalysisOpened(groupId: string | null, userId: string | null) {
  const key = storageKey(groupId, userId)
  return useCallback((runId: string) => {
    if (!key) return
    const state = parseState(readSnapshot(key))
    if (!state.opened.includes(runId)) {
      writeState(key, { ...state, opened: [...state.opened, runId] })
    }
  }, [key])
}
