import {
  POE1_EXCHANGE_TYPES,
  parseNinjaExchangeResponse,
} from '../../supabase/functions/_shared/ninja-economy'
import type { PoeGame } from './poe-game'
interface NinjaExchangeLine {
  id: string
  primaryValue: number
}

interface NinjaExchangeItem {
  id: string
  name: string
  icon?: string
  image?: string
}

interface NinjaExchangeResponse {
  lines: NinjaExchangeLine[]
  items: NinjaExchangeItem[]
}

interface NinjaItemLine {
  name: string
  icon?: string
}

interface NinjaItemOverviewResponse {
  lines: NinjaItemLine[]
}

const POE2_EXCHANGE_TYPES = [
  'Currency',
  'Essence',
  'Fragment',
  'Oil',
  'DeliriumOrb',
  'DivinationCard',
  'Omen',
] as const

export type NinjaExchangeType =
  | (typeof POE1_EXCHANGE_TYPES)[number]
  | (typeof POE2_EXCHANGE_TYPES)[number]

export interface NinjaPriceMap {
  byName: Map<string, number>
  divinePrice: number | null
  failedCategories: string[]
}

export interface NinjaExchangeEntry {
  id: string
  name: string
  icon: string | null
  primaryValue: number
}

export interface NinjaMarketSection {
  type: NinjaExchangeType
  entries: NinjaExchangeEntry[]
}

export interface NinjaSkillGemIcon {
  name: string
  icon: string
}

function getNinjaPrefix(game: PoeGame): '/poe1' | '/poe2' {
  return game === 'poe2' ? '/poe2' : '/poe1'
}

function getExchangeTypes(game: PoeGame): readonly NinjaExchangeType[] {
  return game === 'poe2' ? POE2_EXCHANGE_TYPES : POE1_EXCHANGE_TYPES
}

function buildNinjaPath(game: PoeGame, path: string): string {
  return `${getNinjaPrefix(game)}${path}`
}

function normalizeNinjaImageUrl(value: string | null | undefined): string | null {
  if (!value) return null
  if (value.startsWith('http://') || value.startsWith('https://')) return value
  if (value.startsWith('/gen/image/')) return `https://web.poecdn.com${value}`
  if (value.startsWith('/')) return `https://poe.ninja${value}`
  return value
}

export async function fetchNinjaEconomyLeagueIds(game: PoeGame): Promise<string[]> {
  const response = await ninjaGet<unknown>(buildNinjaPath(game, '/api/economy/leagues'))
  if (!Array.isArray(response)) throw new Error('Invalid poe.ninja economy leagues')

  return response.map((league: unknown) => {
    if (league === null || typeof league !== 'object' || !('id' in league) ||
        typeof league.id !== 'string' || !league.id) {
      throw new Error('Invalid poe.ninja economy league ID')
    }
    return league.id
  })
}

export async function fetchNinjaExchangeEntries(
  league: string,
  type: NinjaExchangeType,
  game: PoeGame = 'poe1',
): Promise<NinjaExchangeEntry[]> {
  const response = await ninjaGet<NinjaExchangeResponse>(
    buildNinjaPath(
      game,
      `/api/economy/exchange/current/overview?league=${encodeURIComponent(league)}&type=${type}`,
    ),
  )

  if (game === 'poe1') return parseNinjaExchangeResponse(response, type === 'Currency')

  const itemById = new Map(response.items.map((item) => [item.id, item]))

  return response.lines.flatMap((line) => {
    const item = itemById.get(line.id)
    if (!item?.name || !Number.isFinite(line.primaryValue) || line.primaryValue <= 0) return []
    return [
      {
        id: line.id,
        name: item.name,
        icon: normalizeNinjaImageUrl(item.icon ?? item.image),
        primaryValue: line.primaryValue,
      },
    ]
  })
}

export async function fetchAllNinjaPrices(
  league: string,
  game: PoeGame = 'poe1',
): Promise<NinjaPriceMap> {
  const byName = new Map<string, number>()
  const failedCategories: string[] = []
  const exchangeResponses = await mapLimited(getExchangeTypes(game), async (type) => {
    try {
      return await fetchNinjaExchangeEntries(league, type, game)
    } catch {
      failedCategories.push(type)
      return []
    }
  })

  for (const response of exchangeResponses) {
    for (const entry of response) {
      byName.set(entry.name, entry.primaryValue)
    }
  }

  return {
    byName,
    divinePrice: byName.get('Divine Orb') ?? null,
    failedCategories,
  }
}

export async function fetchNinjaMarketOverview(
  league: string,
  game: PoeGame = 'poe1',
): Promise<NinjaMarketSection[]> {
  const results = await mapLimited(getExchangeTypes(game), async (type) => {
    try {
      return { type, entries: await fetchNinjaExchangeEntries(league, type, game) }
    } catch {
      return null
    }
  })
  const sections = results.filter((section) => section !== null)
  if (sections.length === 0) throw new Error('Market prices unavailable')

  return sections
    .map((section) => ({
      ...section,
      entries: [...section.entries].sort((left, right) => right.primaryValue - left.primaryValue),
    }))
    .filter((section) => section.entries.length > 0)
}

export async function fetchNinjaSkillGemIcons(
  game: PoeGame = 'poe1',
): Promise<NinjaSkillGemIcon[]> {
  const response = await ninjaGet<NinjaItemOverviewResponse>(
    buildNinjaPath(game, '/api/economy/stash/current/item/overview?league=Standard&type=SkillGem'),
  )

  const seen = new Set<string>()
  const result: NinjaSkillGemIcon[] = []

  for (const line of response.lines) {
    if (!line.name || !line.icon) continue
    const key = line.name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push({ name: line.name, icon: line.icon })
  }

  return result
}

async function ninjaGet<T>(path: string): Promise<T> {
  const res = await fetch(`/api/ninja${path}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`poe.ninja API error: ${res.status} ${path}`)
  return res.json() as Promise<T>
}

async function mapLimited<T, R>(
  values: readonly T[],
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(values.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(3, values.length) }, async () => {
      while (next < values.length) {
        const index = next++
        results[index] = await mapper(values[index])
      }
    }),
  )
  return results
}
