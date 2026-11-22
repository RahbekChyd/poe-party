import type { PoeGame } from './poe-game'

const leagueThemes = {
  poe1: { covens: 'covens', 'covens of umbra': 'covens' },
  poe2: {},
} as const satisfies Record<PoeGame, Readonly<Record<string, string>>>

type LeagueThemes = typeof leagueThemes
export type LeagueTheme = {
  [Game in PoeGame]: LeagueThemes[Game][keyof LeagueThemes[Game]]
}[PoeGame]

const leagueModes = /^(?:(?:hardcore|hc|ssf|ruthless)\s+)+|(?:\s+(?:hardcore|hc|ssf|ruthless))+$/g

export function resolveLeagueTheme(game: PoeGame | null, league: string | null): LeagueTheme | null {
  if (!game || !league) return null

  const name = league.trim().toLowerCase().replace(/\s+/g, ' ').replace(leagueModes, '')
  const themes: Readonly<Record<string, LeagueTheme>> = leagueThemes[game]
  return Object.prototype.hasOwnProperty.call(themes, name) ? themes[name] : null
}
