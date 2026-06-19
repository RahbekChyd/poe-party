import { create } from 'zustand'
import { persist } from 'zustand/middleware'
interface GroupStore {
  activeGroupId: string | null
  setActiveGroupId: (id: string | null) => void
}

export const useGroupStore = create<GroupStore>()(
  persist(
    (set) => ({
      activeGroupId: null,
      setActiveGroupId: (id) => set({ activeGroupId: id }),
    }),
    {
      name: 'poe-group-tool:active-group',
    },
  ),
)
