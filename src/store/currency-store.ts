import { create } from 'zustand'
import { persist } from 'zustand/middleware'
interface CurrencyStore {
  display: 'chaos' | 'divine'
  toggle: () => void
}

export const useCurrencyStore = create<CurrencyStore>()(
  persist(
    (set, get) => ({
      display: 'chaos',
      toggle: () => set({ display: get().display === 'chaos' ? 'divine' : 'chaos' }),
    }),
    { name: 'poe-currency-display' },
  ),
)
