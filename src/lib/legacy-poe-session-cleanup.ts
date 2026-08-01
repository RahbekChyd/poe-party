export const STASH_TAB_SELECTION_STORAGE_KEY = 'poe-stash-tab-selection'

// Older builds could keep POESESSID and Cloudflare cookie values in these stores.
// Migrate only the harmless tab-id preference, then remove every legacy container
// as soon as the application boots so route splitting cannot delay credential cleanup.
if (typeof window !== 'undefined') {
  const legacySelection = (() => {
    try {
      const raw = window.sessionStorage.getItem('poe-session-tab')
      if (!raw) return null
      const parsed = JSON.parse(raw) as { state?: { selectedTabIds?: unknown } }
      const ids = parsed.state?.selectedTabIds
      return Array.isArray(ids) && ids.every((id) => typeof id === 'string') ? ids : null
    } catch {
      return null
    }
  })()

  if (legacySelection && !window.sessionStorage.getItem(STASH_TAB_SELECTION_STORAGE_KEY)) {
    window.sessionStorage.setItem(
      STASH_TAB_SELECTION_STORAGE_KEY,
      JSON.stringify({ state: { selectedTabIds: legacySelection }, version: 0 }),
    )
  }

  window.sessionStorage.removeItem('poe-session-tab')
  window.sessionStorage.removeItem('poe-session')
  window.localStorage.removeItem('poe-session')
}
