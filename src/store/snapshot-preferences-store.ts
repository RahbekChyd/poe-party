import { create } from 'zustand'
import { persist } from 'zustand/middleware'
export type SnapshotMode = 'manual' | 'mix'
export type SnapshotIntervalHours = 1 | 2 | 3 | 6

interface SnapshotPreferencesState {
  mode: SnapshotMode
  intervalHours: SnapshotIntervalHours
  lastTimerResetAt: number | null
  setMode: (mode: SnapshotMode) => void
  setIntervalHours: (hours: SnapshotIntervalHours) => void
  resetTimer: (at?: number) => void
}

export const useSnapshotPreferencesStore = create<SnapshotPreferencesState>()(
  persist(
    (set) => ({
      mode: 'manual',
      intervalHours: 1,
      lastTimerResetAt: null,
      setMode: (mode) =>
        set((state) => ({
          mode,
          lastTimerResetAt: mode === 'mix' ? Date.now() : state.lastTimerResetAt,
        })),
      setIntervalHours: (intervalHours) =>
        set({
          intervalHours,
          lastTimerResetAt: Date.now(),
        }),
      resetTimer: (at) => set({ lastTimerResetAt: at ?? Date.now() }),
    }),
    {
      name: 'poe-group-tool:snapshot-preferences',
    },
  ),
)
