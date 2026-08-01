import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { STASH_TAB_SELECTION_STORAGE_KEY } from '../lib/legacy-poe-session-cleanup'

interface StashTabSelectionState {
  /** null = never chosen (default to all); string[] = user's last explicit selection */
  selectedTabIds: string[] | null
  setSelectedTabIds: (ids: string[]) => void
}

export const useStashTabSelectionStore = create<StashTabSelectionState>()(
  persist(
    (set) => ({
      selectedTabIds: null,
      setSelectedTabIds: (ids) => set({ selectedTabIds: ids }),
    }),
    {
      name: STASH_TAB_SELECTION_STORAGE_KEY,
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ selectedTabIds: state.selectedTabIds }),
    },
  ),
)
