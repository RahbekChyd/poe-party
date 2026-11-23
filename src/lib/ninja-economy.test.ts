import { afterEach, describe, expect, it, vi } from 'vitest'
import { priceSnapshotItems } from '../../supabase/functions/_shared/ninja-economy-server'
import { fetchNinjaMarketOverview } from './poe-ninja-client'
import {
  parseNinjaExchangeResponse,
  parseNinjaItemResponse,
  matchSnapshotItemPrice,
  type NinjaCatalog,
} from '../../supabase/functions/_shared/ninja-economy'
const catalog = (category: string, rows: Record<string, unknown>[]): NinjaCatalog => ({
  exchange: [],
  items: new Map([[category, rows]]),
})
const stored = (raw: Record<string, unknown>) => ({ frame_type: raw.frameType ?? 0, raw_data: raw })

describe('PoE2 market availability', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reports a total feed outage as an error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 503 })))

    await expect(fetchNinjaMarketOverview('Fixture league', 'poe2')).rejects.toThrow(
      'Market prices unavailable',
    )
  })

  it('keeps available categories when other feeds fail', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.endsWith('type=Currency')
        ? Response.json({
            items: [{ id: 'divine', name: 'Divine Orb' }],
            lines: [{ id: 'divine', primaryValue: 100 }],
          })
        : new Response(null, { status: 503 }),
    ))

    await expect(fetchNinjaMarketOverview('Fixture league', 'poe2')).resolves.toMatchObject([
      { type: 'Currency', entries: [{ name: 'Divine Orb', primaryValue: 100 }] },
    ])
  })
})

describe('snapshot economy matching', () => {
  it('validates primary currency and derives reference quotes without a fake rate', () => {
    const response = {
      core: {
        primary: 'chaos',
        rates: { divine: 0.005 },
        items: [
          { id: 'chaos', name: 'Chaos Orb' },
          { id: 'divine', name: 'Divine Orb' },
        ],
      },
      lines: [{ id: 'thread', primaryValue: 4 }],
      items: [{ id: 'thread', name: 'Breach Thread', image: '/gen/image/thread.png' }],
    }
    const entries = parseNinjaExchangeResponse(response, true)
    expect(entries.find((entry) => entry.name === 'Divine Orb')?.primaryValue).toBe(200)
    expect(entries[0].icon).toBe('https://web.poecdn.com/gen/image/thread.png')
    expect(() => parseNinjaExchangeResponse({ ...response, core: { primary: 'exalted' } })).toThrow(
      'reference currency',
    )
    expect(() => parseNinjaExchangeResponse({})).toThrow('Invalid exchange')
  })
  it('does not accept malformed or nonfinite prices', () => {
    expect(
      parseNinjaItemResponse({
        lines: [
          { name: 'X', chaosValue: Infinity },
          { name: 'Y', chaosValue: -1 },
        ],
      }),
    ).toEqual([])
    expect(() => parseNinjaItemResponse({ lines: null })).toThrow()
  })
  it('prices exact exchange identities while refusing name-only rare equipment', () => {
    const prices: NinjaCatalog = {
      exchange: [{ id: 'thread', name: 'Breach Thread', icon: null, primaryValue: 8 }],
      items: new Map(),
    }
    expect(
      matchSnapshotItemPrice(stored({ typeLine: 'Breach Thread', frameType: 5 }), prices)
        .unitPriceChaos,
    ).toBe(8)
    expect(
      matchSnapshotItemPrice(stored({ typeLine: 'Breach Thread', frameType: 2 }), prices)
        .unitPriceChaos,
    ).toBeNull()
  })
  it('matches gem level, quality and corruption exactly and refuses ambiguous rows', () => {
    const gem = stored({
      frameType: 4,
      typeLine: 'Arc',
      properties: [
        { name: 'Level', values: [['21', 0]] },
        { name: 'Quality', values: [['+20%', 0]] },
      ],
      corrupted: true,
    })
    const line = { name: 'Arc', gemLevel: 21, gemQuality: 20, corrupted: true, chaosValue: 10 }
    expect(matchSnapshotItemPrice(gem, catalog('SkillGem', [line])).unitPriceChaos).toBe(10)
    expect(
      matchSnapshotItemPrice(gem, catalog('SkillGem', [{ ...line, gemLevel: 20 }])).unitPriceChaos,
    ).toBeNull()
    expect(matchSnapshotItemPrice(gem, catalog('SkillGem', [line, line])).reason).toBe(
      'ambiguous_variant',
    )
  })
  it('never substitutes an ordinary gem quote for an imbued support variant', () => {
    const gem = stored({ frameType: 4, typeLine: 'Arc', builtInSupport: 'Added Cold Damage' })
    expect(
      matchSnapshotItemPrice(
        gem,
        catalog('ImbuedGem', [{ name: 'Arc', variant: 'Added Cold Damage', chaosValue: 25 }]),
      ).unitPriceChaos,
    ).toBe(25)
    expect(
      matchSnapshotItemPrice(
        gem,
        catalog('ImbuedGem', [{ name: 'Arc', variant: 'Added Fire Damage', chaosValue: 25 }]),
      ).unitPriceChaos,
    ).toBeNull()
  })
  it('matches generic 3.30 map tiers without upstream mapTier and rejects special maps', () => {
    const raw = {
      frameType: 2,
      typeLine: 'Dread Strand Map of Ice',
      baseType: 'Strand Map',
      properties: [{ name: 'Map Tier', values: [['16', 0]] }],
    }
    const market = catalog('Map', [{ name: 'Map (Tier 16)', chaosValue: 3, variant: 'Gen-24' }])
    expect(matchSnapshotItemPrice(stored(raw), market).unitPriceChaos).toBe(3)
    expect(
      matchSnapshotItemPrice(
        stored({ ...raw, implicitMods: [{ description: 'Map is occupied by The Eradicator' }] }),
        market,
      ).unitPriceChaos,
    ).toBeNull()
  })
  it('matches Viscera by complete implicit signature, accepting GGG and ninja mod shapes', () => {
    const raw = stored({
      frameType: 15,
      typeLine: "Queen's Crown",
      implicitMods: [{ description: '+1 to maximum number of Spectres' }],
    })
    const market = catalog('Viscera', [
      {
        name: "Queen's Crown",
        implicitModifiers: [{ text: '+(1-2) to maximum number of Spectres' }],
        chaosValue: 100,
      },
    ])
    expect(matchSnapshotItemPrice(raw, market).unitPriceChaos).toBe(100)
    expect(
      matchSnapshotItemPrice(
        stored({ ...raw.raw_data, implicitMods: ['10% increased Damage'] }),
        market,
      ).unitPriceChaos,
    ).toBeNull()
  })
  it('requires the exact Wombgift level', () => {
    const market = catalog('Wombgift', [
      { name: 'Ancient Wombgift', levelRequired: 40, chaosValue: 30 },
    ])
    expect(
      matchSnapshotItemPrice(
        stored({ frameType: 5, typeLine: 'Ancient Wombgift', monsterLevel: 40 }),
        market,
      ).unitPriceChaos,
    ).toBe(30)
    expect(
      matchSnapshotItemPrice(
        stored({ frameType: 5, typeLine: 'Ancient Wombgift', monsterLevel: 80 }),
        market,
      ).unitPriceChaos,
    ).toBeNull()
  })
  it('does not substitute an unlinked or corrupted unique quote for different gear', () => {
    const raw = {
      frameType: 3,
      name: 'The Example',
      typeLine: 'Vaal Regalia',
      baseType: 'Vaal Regalia',
      sockets: Array.from({ length: 6 }, () => ({ group: 0 })),
    }
    const line = {
      name: 'The Example',
      baseType: 'Vaal Regalia',
      itemClass: 3,
      links: 6,
      chaosValue: 20,
    }
    expect(
      matchSnapshotItemPrice(stored(raw), catalog('UniqueArmour', [line])).unitPriceChaos,
    ).toBe(20)
    expect(
      matchSnapshotItemPrice(stored(raw), catalog('UniqueArmour', [{ ...line, links: 0 }]))
        .unitPriceChaos,
    ).toBeNull()
    expect(
      matchSnapshotItemPrice(stored({ ...raw, corrupted: true }), catalog('UniqueArmour', [line]))
        .unitPriceChaos,
    ).toBeNull()
  })
})

describe('snapshot provider availability', () => {
  afterEach(() => vi.unstubAllGlobals())
  const exchangeResponse = (lines: Record<string, unknown>[] = []) => ({
    core: { primary: 'chaos', items: [{ id: 'chaos', name: 'Chaos Orb' }] },
    lines,
    items: [{ id: 'thread', name: 'Breach Thread' }],
  })
  it('keeps unknown prices null on a total outage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      }),
    )
    const result = await priceSnapshotItems('Outage fixture', [
      { id: '1', stack_size: 3, type_line: 'Breach Thread', frame_type: 5 },
    ])
    expect(result.summary.status).toBe('unavailable')
    expect(result.summary.divine_price).toBeNull()
    expect(result.prices[0].price_chaos).toBeNull()
  })
  it('reports partial feeds, multiplies stacks, and caches concurrent requests', async () => {
    let active = 0,
      peak = 0
    const fetcher = vi.fn(async (url: string) => {
      active++
      peak = Math.max(peak, active)
      await Promise.resolve()
      active--
      const category = new URL(url).searchParams.get('type')
      if (category === 'Fossil') return new Response('unavailable', { status: 503 })
      return new Response(
        JSON.stringify(
          category === 'Corpse'
            ? { lines: [] }
            : exchangeResponse(category === 'Thread' ? [{ id: 'thread', primaryValue: 4 }] : []),
        ),
        { headers: { 'Cache-Control': 'public, max-age=300' } },
      )
    })
    vi.stubGlobal('fetch', fetcher)
    const items = [{ id: '1', stack_size: 3, type_line: 'Breach Thread', frame_type: 5 }]
    const result = await priceSnapshotItems('Partial fixture', items)
    expect(result.summary.status).toBe('partial')
    expect(result.summary.failed_categories).toEqual(['Fossil'])
    expect(result.prices[0].price_chaos).toBe(12)
    expect(result.prices[0].price_divine).toBeNull()
    expect(peak).toBeLessThanOrEqual(3)
    const requests = fetcher.mock.calls.length
    await priceSnapshotItems('Partial fixture', items)
    expect(fetcher.mock.calls.length).toBe(requests + 1) // Only the failed category is retried.
  })
})
