import { describe, expect, it } from 'vitest'
import { resolveLeagueTheme } from './league-theme'

describe('resolveLeagueTheme', () => {
  it.each([
    'Covens',
    ' Covens of Umbra ',
    'Hardcore Covens',
    'HC SSF Covens',
    'SSF  Covens   Ruthless',
  ])('uses the Covens palette for the PoE1 league %s', (league) => {
    expect(resolveLeagueTheme('poe1', league)).toBe('covens')
  })

  it('uses the base palette outside registered game and league pairs', () => {
    expect(resolveLeagueTheme('poe2', 'Covens')).toBeNull()
    expect(resolveLeagueTheme('poe1', 'Standard')).toBeNull()
    expect(resolveLeagueTheme('poe1', 'My Covens league')).toBeNull()
    expect(resolveLeagueTheme('poe1', 'constructor')).toBeNull()
    expect(resolveLeagueTheme('poe1', null)).toBeNull()
    expect(resolveLeagueTheme(null, 'Covens')).toBeNull()
  })
})
