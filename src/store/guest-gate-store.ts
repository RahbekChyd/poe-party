import { create } from 'zustand'
interface GuestGateState {
  isOpen: boolean
  title: string
  description: string
  open: (payload?: { title?: string; description?: string }) => void
  close: () => void
}

const DEFAULT_TITLE = 'Sign in to continue'
const DEFAULT_DESCRIPTION =
  'Create your own party workspace to inspect details, collaborate with your group, and unlock the full toolset.'

export const useGuestGateStore = create<GuestGateState>((set) => ({
  isOpen: false,
  title: DEFAULT_TITLE,
  description: DEFAULT_DESCRIPTION,
  open: (payload) =>
    set({
      isOpen: true,
      title: payload?.title ?? DEFAULT_TITLE,
      description: payload?.description ?? DEFAULT_DESCRIPTION,
    }),
  close: () =>
    set({
      isOpen: false,
      title: DEFAULT_TITLE,
      description: DEFAULT_DESCRIPTION,
    }),
}))
