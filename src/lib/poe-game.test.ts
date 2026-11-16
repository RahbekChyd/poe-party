import { describe, expect, it } from 'vitest'
import {
  getPoeGameCapabilities,
  getPoeRealm,
  normalizePoeGame,
} from './poe-game'

describe('PoE capability boundaries', () => {
  it('keeps stash, atlas, and optimizer capabilities PoE1-only', () => {
    const poe1 = getPoeGameCapabilities('poe1')
    const poe2 = getPoeGameCapabilities('poe2')

    expect(poe1).toMatchObject({
      supportsStashSnapshots: true,
      supportsGroupEconomy: true,
      supportsAtlasTree: true,
      supportsOptimizer: true,
    })
    expect(poe2).toMatchObject({
      supportsStashSnapshots: false,
      supportsGroupEconomy: false,
      supportsAtlasTree: false,
      supportsOptimizer: false,
      supportsMarketOverview: true,
    })
  })

  it('normalizes unknown games to PoE1 and maps realms explicitly', () => {
    expect(normalizePoeGame('poe2')).toBe('poe2')
    expect(normalizePoeGame('unknown')).toBe('poe1')
    expect(getPoeRealm('poe1')).toBe('pc')
    expect(getPoeRealm('poe2')).toBe('poe2')
  })
})
