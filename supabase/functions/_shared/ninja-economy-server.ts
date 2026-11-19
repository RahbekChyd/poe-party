import {
  POE1_EXCHANGE_TYPES,
  parseNinjaExchangeResponse,
  parseNinjaItemResponse,
  requiredNinjaItemTypes,
  matchSnapshotItemPrice,
  type NinjaCatalog,
  type NinjaRecord,
  type SnapshotPricingSummary,
} from './ninja-economy.ts'

const cache = new Map<string, { value: unknown; etag: string | null; expires: number }>()
const inflight = new Map<string, Promise<unknown>>()
const USER_AGENT = 'PoEParty/3.30 (+https://github.com/RahbekChyd/poe-party)'
async function getOverview(
  league: string,
  category: string,
  family: 'exchange' | 'stash',
): Promise<unknown> {
  const key = `${league}:${family}:${category}`
  const hit = cache.get(key)
  if (hit && hit.expires > Date.now()) return hit.value
  const pending = inflight.get(key)
  if (pending) return pending
  const request = (async () => {
    const path = family === 'exchange' ? 'exchange/current/overview' : 'stash/current/item/overview'
    const response = await fetch(
      `https://poe.ninja/poe1/api/economy/${path}?league=${encodeURIComponent(league)}&type=${category}`,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': USER_AGENT,
          ...(hit?.etag ? { 'If-None-Match': hit.etag } : {}),
        },
        signal: AbortSignal.timeout(10_000),
      },
    )
    if (!response.ok && response.status !== 304)
      throw new Error(`Economy category ${category}: HTTP ${response.status}`)
    const value = response.status === 304 && hit ? hit.value : await response.json()
    const maxAge = response.headers
      .get('cache-control')
      ?.match(/(?:^|,)\s*(?:s-maxage|max-age)=(\d+)/)?.[1]
    const ttl = maxAge ? Number(maxAge) * 1000 : 5 * 60_000
    const noStore = /no-store|no-cache/.test(response.headers.get('cache-control') ?? '')
    cache.set(key, {
      value,
      etag: response.headers.get('etag') ?? hit?.etag ?? null,
      expires: Date.now() + (noStore ? 0 : ttl),
    })
    // Bound isolate memory without ever caching private item/account data.
    if (cache.size > 128) cache.delete(cache.keys().next().value!)
    return value
  })()
  inflight.set(key, request)
  try {
    return await request
  } finally {
    inflight.delete(key)
  }
}

export async function priceSnapshotItems(league: string, items: NinjaRecord[]) {
  const catalog: NinjaCatalog = { exchange: [], items: new Map() }
  const failed: string[] = []
  const requests = [
    ...POE1_EXCHANGE_TYPES.map((category) => ({ category, family: 'exchange' as const })),
    ...requiredNinjaItemTypes(items).map((category) => ({ category, family: 'stash' as const })),
  ]
  let next = 0,
    successes = 0
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (next < requests.length) {
        const { category, family } = requests[next++]
        try {
          const raw = await getOverview(league, category, family)
          if (family === 'exchange')
            catalog.exchange.push(...parseNinjaExchangeResponse(raw, category === 'Currency'))
          else catalog.items.set(category, parseNinjaItemResponse(raw))
          successes++
        } catch {
          failed.push(category)
        }
      }
    }),
  )
  // Core currencies repeat across exchange categories; identical reference quotes are one identity.
  catalog.exchange = [...new Map(catalog.exchange.map((entry) => [entry.id, entry])).values()]
  const divinePrice =
    catalog.exchange.find((entry) => entry.name === 'Divine Orb')?.primaryValue ?? null
  const prices = items.map((item) => {
    const match = matchSnapshotItemPrice(item, catalog)
    const price =
      match.unitPriceChaos === null ? null : match.unitPriceChaos * Number(item.stack_size ?? 1)
    return {
      id: String(item.id),
      price_chaos: price,
      price_divine:
        price !== null && divinePrice !== null && divinePrice > 0 ? price / divinePrice : null,
    }
  })
  const pricedCount = prices.filter((item) => item.price_chaos !== null).length
  const summary: SnapshotPricingSummary = {
    status:
      successes === 0 || (items.length > 0 && pricedCount === 0 && failed.length > 0)
        ? 'unavailable'
        : failed.length
          ? 'partial'
          : 'complete',
    priced_item_count: pricedCount,
    unpriced_item_count: items.length - pricedCount,
    failed_categories: [...new Set(failed)].sort(),
    divine_price: divinePrice,
    source: 'poe.ninja',
    version: 1,
    priced_at: new Date().toISOString(),
  }
  return { prices, summary }
}
export function unavailableSnapshotPricing(items: NinjaRecord[]) {
  return {
    prices: items.map((item) => ({ id: String(item.id), price_chaos: null, price_divine: null })),
    summary: {
      status: 'unavailable',
      priced_item_count: 0,
      unpriced_item_count: items.length,
      failed_categories: ['pricing'],
      divine_price: null,
      source: 'poe.ninja',
      version: 1,
      priced_at: new Date().toISOString(),
    } as SnapshotPricingSummary,
  }
}
