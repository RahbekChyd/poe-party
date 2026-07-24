import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
interface PoeSessionState {
  sessId: string
  cfClearance: string
  accountName: string
  /** null = never chosen (default to all); string[] = user's last explicit selection */
  selectedTabIds: string[] | null
  setSessId: (sessId: string) => void
  setCfClearance: (cfClearance: string) => void
  setAccountName: (accountName: string) => void
  setSession: (accountName: string, sessId: string, cfClearance: string) => void
  setSelectedTabIds: (ids: string[]) => void
  clear: () => void
}

export const usePoeSession = create<PoeSessionState>()(
  persist(
    (set) => ({
      sessId: '',
      cfClearance: '',
      accountName: '',
      selectedTabIds: null,
      setSessId: (sessId) => set({ sessId }),
      setCfClearance: (cfClearance) => set({ cfClearance }),
      setAccountName: (accountName) => set({ accountName }),
      setSession: (accountName, sessId, cfClearance) => set({ accountName, sessId, cfClearance }),
      setSelectedTabIds: (ids) => set({ selectedTabIds: ids }),
      clear: () => set({ sessId: '', cfClearance: '', accountName: '', selectedTabIds: null }),
    }),
    {
      name: 'poe-session-tab',
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
)

// Older builds persisted POESESSID in localStorage. Remove that legacy copy now that the
// development-only transport is scoped to the current browser tab.
if (typeof window !== 'undefined') {
  window.localStorage.removeItem('poe-session')
}
