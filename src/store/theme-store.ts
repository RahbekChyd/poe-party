import { create } from 'zustand'
import { persist } from 'zustand/middleware'
type Theme = 'light' | 'dark'
const THEME_STORAGE_KEY = 'theme'

function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.classList.toggle('light', theme === 'light')
  root.dataset.theme = theme
  root.style.colorScheme = theme
}

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getStoredTheme(): Theme | null {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as {
      state?: { theme?: unknown }
    }
    const theme = parsed?.state?.theme
    return theme === 'light' || theme === 'dark' ? theme : null
  } catch {
    return null
  }
}

function initialTheme(): Theme {
  return getStoredTheme() ?? systemTheme()
}

interface ThemeStore {
  theme: Theme
  toggle: () => void
  setTheme: (theme: Theme) => void
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      theme: initialTheme(),
      toggle: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark'
        applyTheme(next)
        set({ theme: next })
      },
      setTheme: (theme: Theme) => {
        applyTheme(theme)
        set({ theme })
      },
    }),
    {
      name: 'theme',
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.theme)
      },
    },
  ),
)

// Apply immediately on module load (before rehydration completes)
applyTheme(initialTheme())
