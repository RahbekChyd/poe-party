import { useLayoutEffect } from 'react'
import covensDesktop from '../assets/seasonal/covens-workbench.webp'
import covensMobile from '../assets/seasonal/covens-workbench-close.webp'
import covensWorkspace from '../assets/seasonal/covens-workbench-masthead.webp'
import type { PoeGame } from './poe-game'

const leagueThemes = {
  poe1: { covens: 'covens', 'covens of umbra': 'covens' },
  poe2: {},
} as const satisfies Record<PoeGame, Readonly<Record<string, string>>>

type LeagueThemes = typeof leagueThemes
export type LeagueTheme = {
  [Game in PoeGame]: LeagueThemes[Game][keyof LeagueThemes[Game]]
}[PoeGame]

interface LeagueThemeDetails {
  label: string
  artwork: {
    desktop: { src: string; width: number; height: number }
    mobile: { src: string; width: number; height: number }
    workspace: string
  }
}

export const leagueThemeDetails: Record<LeagueTheme, LeagueThemeDetails> = {
  covens: {
    label: 'Covens of Umbra',
    artwork: {
      desktop: { src: covensDesktop, width: 1536, height: 1024 },
      mobile: { src: covensMobile, width: 910, height: 665 },
      workspace: covensWorkspace,
    },
  },
}

const featuredLeague: { game: PoeGame; league: string } = { game: 'poe1', league: 'Covens' }

const leagueModes = /^(?:(?:hardcore|hc|ssf|ruthless)\s+)+|(?:\s+(?:hardcore|hc|ssf|ruthless))+$/g

export function resolveLeagueTheme(game: PoeGame | null, league: string | null): LeagueTheme | null {
  if (!game || !league) return null

  const name = league.trim().toLowerCase().replace(/\s+/g, ' ').replace(leagueModes, '')
  const themes: Readonly<Record<string, LeagueTheme>> = leagueThemes[game]
  return Object.prototype.hasOwnProperty.call(themes, name) ? themes[name] : null
}

export const featuredLeagueTheme = resolveLeagueTheme(featuredLeague.game, featuredLeague.league)

export function useLeagueTheme(theme: LeagueTheme | null) {
  useLayoutEffect(() => {
    // HeroUI overlays are siblings of the app and inherit the active theme from the document.
    const root = document.documentElement
    if (theme === null) {
      delete root.dataset.leagueTheme
      return
    }

    root.dataset.leagueTheme = theme
    return () => {
      if (root.dataset.leagueTheme === theme) delete root.dataset.leagueTheme
    }
  }, [theme])
}
