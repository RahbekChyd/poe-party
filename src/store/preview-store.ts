import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { normalizePoeGame, type PoeGame } from '../lib/poe-game'
interface PreviewStore {
  selectedGame: PoeGame
  selectedLeague: string | null
  setSelectedGame: (game: PoeGame) => void
  setSelectedLeague: (league: string | null) => void
}

export const usePreviewStore = create<PreviewStore>()(
  persist(
    (set) => ({
      selectedGame: 'poe1',
      selectedLeague: null,
      setSelectedGame: (selectedGame) =>
        set({
          selectedGame: normalizePoeGame(selectedGame),
          selectedLeague: null,
        }),
      setSelectedLeague: (selectedLeague) => set({ selectedLeague }),
    }),
    {
      name: 'poe-party:preview',
      partialize: (state) => ({
        selectedGame: state.selectedGame,
        selectedLeague: state.selectedLeague,
      }),
      merge: (persistedState, currentState) => {
        const stored = (persistedState ?? {}) as Partial<PreviewStore>
        return {
          ...currentState,
          ...stored,
          selectedGame: normalizePoeGame(stored.selectedGame),
        }
      },
    },
  ),
)
