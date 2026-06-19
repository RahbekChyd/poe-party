import { create } from 'zustand'
type SnapshotPhase = 'idle' | 'characters' | 'stash' | 'pricing' | 'done' | 'error'

interface SnapshotProgress {
  phase: SnapshotPhase
  tabsCurrent: number
  tabsTotal: number
  message: string
}

interface SnapshotStore {
  progress: SnapshotProgress
  setProgress: (progress: Partial<SnapshotProgress>) => void
  reset: () => void
}

const defaultProgress: SnapshotProgress = {
  phase: 'idle',
  tabsCurrent: 0,
  tabsTotal: 0,
  message: '',
}

export const useSnapshotStore = create<SnapshotStore>((set) => ({
  progress: defaultProgress,
  setProgress: (update) =>
    set((s) => ({ progress: { ...s.progress, ...update } })),
  reset: () => set({ progress: defaultProgress }),
}))
