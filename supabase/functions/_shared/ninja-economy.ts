// Pure economy contracts shared by Edge Functions and browser clients.
// Supported public surface: https://poe.ninja/docs/api
export const POE1_EXCHANGE_TYPES = [
  'Currency',
  'Fragment',
  'Runegraft',
  'AllflameEmber',
  'Tattoo',
  'Omen',
  'DjinnCoin',
  'Ducat',
  'EnshroudingCrystal',
  'DivinationCard',
  'Artifact',
  'Oil',
  'DeliriumOrb',
  'Astrolabe',
  'Thread',
  'Fossil',
  'Resonator',
  'Essence',
] as const
export const POE1_ITEM_TYPES = [
  'UniqueWeapon',
  'UniqueArmour',
  'UniqueAccessory',
  'UniqueFlask',
  'UniqueJewel',
  'UniqueTincture',
  'SkillGem',
  'ImbuedGem',
  'Map',
  'BlightedMap',
  'BlightRavagedMap',
  'UniqueMap',
  'Viscera',
  'Wombgift',
  'Corpse',
] as const
export type NinjaExchangeEntry = {
  id: string
  name: string
  icon: string | null
  primaryValue: number
}
export type NinjaRecord = Record<string, unknown>
export type NinjaCatalog = { exchange: NinjaExchangeEntry[]; items: Map<string, NinjaRecord[]> }
export interface SnapshotPricingSummary {
  status: 'complete' | 'partial' | 'unavailable'
  priced_item_count: number
  unpriced_item_count: number
  failed_categories: string[]
  divine_price: number | null
  source: 'poe.ninja'
  version: 1
  priced_at: string
}
export function asRecord(value: unknown): NinjaRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as NinjaRecord)
    : {}
}
function norm(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}
function finitePrice(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}
export function normalizeNinjaImageUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  if (value.startsWith('/gen/image/')) return `https://web.poecdn.com${value}`
  if (value.startsWith('/')) return `https://poe.ninja${value}`
  return /^https?:\/\//.test(value) ? value : null
}
export function parseNinjaExchangeResponse(
  value: unknown,
  includeReferenceCurrencies = false,
): NinjaExchangeEntry[] {
  const response = asRecord(value)
  const core = asRecord(response.core)
  if (!Array.isArray(response.lines) || !Array.isArray(response.items))
    throw new Error('Invalid exchange response')
  // primaryValue is denominated in core.primary, not necessarily chaos in other games.
  if (norm(core.primary).toLowerCase() !== 'chaos')
    throw new Error('Unsupported exchange reference currency')
  const metadata = new Map(
    response.items.map((item) => {
      const record = asRecord(item)
      return [String(record.id), record]
    }),
  )
  const entries = response.lines.flatMap((value) => {
    const line = asRecord(value),
      item = metadata.get(String(line.id))
    if (!item || !norm(item.name) || !finitePrice(line.primaryValue)) return []
    return [
      {
        id: String(line.id),
        name: norm(item.name),
        icon: normalizeNinjaImageUrl(item.icon ?? item.image),
        primaryValue: line.primaryValue,
      },
    ]
  })
  // Reference currencies may only occur in core.items, rather than lines/items.
  for (const value of includeReferenceCurrencies && Array.isArray(core.items) ? core.items : []) {
    const item = asRecord(value),
      id = String(item.id)
    const rate = asRecord(core.rates)[id]
    const price = id === core.primary ? 1 : finitePrice(rate) && rate > 0 ? 1 / rate : null
    if (
      price !== null &&
      Number.isFinite(price) &&
      norm(item.name) &&
      !entries.some((entry) => entry.id === id)
    ) {
      entries.push({
        id,
        name: norm(item.name),
        icon: normalizeNinjaImageUrl(item.image ?? item.icon),
        primaryValue: price,
      })
    }
  }
  return entries
}
export function parseNinjaItemResponse(value: unknown): NinjaRecord[] {
  const response = asRecord(value)
  if (!Array.isArray(response.lines)) throw new Error('Invalid stash item response')
  return response.lines
    .map(asRecord)
    .filter((line) => norm(line.name) && finitePrice(line.chaosValue))
}
function modLines(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((line) =>
        typeof line === 'string'
          ? [line]
          : typeof (asRecord(line).description ?? asRecord(line).text) === 'string'
            ? [String(asRecord(line).description ?? asRecord(line).text)]
            : [],
      )
    : []
}
function signature(value: unknown): string {
  const lines = typeof value === 'string' ? [value] : modLines(value)
  return lines
    .map((line) =>
      line
        .toLowerCase()
        .replace(/\([^)]*\)/g, '#')
        .replace(/[+-]?\d+(?:\.\d+)?/g, '#')
        .replace(/[+-]?#/g, '#')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .sort()
    .join('|')
}
function propertyNumber(raw: NinjaRecord, name: string): number | null {
  const prop = (Array.isArray(raw.properties) ? raw.properties : [])
    .map(asRecord)
    .find((p) => norm(p.name).toLowerCase() === name.toLowerCase())
  const values = prop?.values
  const text = Array.isArray(values) && Array.isArray(values[0]) ? String(values[0][0]) : ''
  const match = text.match(/\d+/)
  return match ? Number(match[0]) : null
}
function linkCount(raw: NinjaRecord): number {
  const counts = new Map<unknown, number>()
  for (const socket of Array.isArray(raw.sockets) ? raw.sockets : []) {
    const group = asRecord(socket).group
    counts.set(group, (counts.get(group) ?? 0) + 1)
  }
  return Math.max(0, ...counts.values())
}
function hasFlag(raw: NinjaRecord, flag: string): boolean {
  return ['implicitMods', 'explicitMods'].some((key) =>
    (Array.isArray(raw[key]) ? raw[key] : []).some(
      (mod) => asRecord(asRecord(mod).flags)[flag] === true,
    ),
  )
}
export function requiredNinjaItemTypes(items: NinjaRecord[]): string[] {
  const needed = new Set<string>()
  for (const stored of items) {
    const raw = asRecord(stored.raw_data),
      frame = Number(raw.frameType ?? stored.frame_type)
    const type = norm(raw.typeLine ?? stored.type_line),
      rarity = norm(raw.rarity ?? raw.frameTypeId).toLowerCase()
    if (raw.builtInSupport) needed.add('ImbuedGem')
    else if (frame === 4 || rarity === 'gem') needed.add('SkillGem')
    else if (frame === 15 || rarity === 'viscera' || norm(raw.inventoryId).startsWith('Viscera'))
      needed.add('Viscera')
    else if (/Wombgift/i.test(type)) needed.add('Wombgift')
    else if (
      /Corpse/i.test(type) ||
      raw.corpse === true ||
      (frame === 5 && !/Wombgift/i.test(type))
    )
      needed.add('Corpse')
    else if (propertyNumber(raw, 'Map Tier') !== null || /Map(?: \(Tier \d+\))?$/.test(type)) {
      needed.add(
        frame === 3 || frame === 9 || rarity === 'unique'
          ? 'UniqueMap'
          : /Blight-ravaged/i.test(type)
            ? 'BlightRavagedMap'
            : /Blighted/i.test(type)
              ? 'BlightedMap'
              : 'Map',
      )
    } else if (frame === 3 || frame === 9 || rarity === 'unique' || rarity === 'foil') {
      for (const category of POE1_ITEM_TYPES.filter(
        (type) => type.startsWith('Unique') && type !== 'UniqueMap',
      ))
        needed.add(category)
    }
  }
  return [...needed]
}
export function matchSnapshotItemPrice(
  stored: NinjaRecord,
  catalog: NinjaCatalog,
): { unitPriceChaos: number | null; category: string | null; reason: string } {
  const raw = asRecord(stored.raw_data)
  const name = norm(raw.name ?? stored.name),
    type = norm(raw.typeLine ?? stored.type_line),
    base = norm(raw.baseType ?? stored.base_type ?? type)
  const unknown = (reason: string) => ({ unitPriceChaos: null, category: null, reason })
  // Exchange items have fixed identities; never route equipment through a name-only match.
  const frame = Number(raw.frameType ?? stored.frame_type)
  const rarity = norm(raw.rarity ?? raw.frameTypeId).toLowerCase()
  if (
    ![1, 2, 3, 4, 9, 15].includes(frame) &&
    !['magic', 'rare', 'unique', 'foil', 'gem', 'viscera'].includes(rarity)
  ) {
    const exchange = catalog.exchange.filter((entry) => [type, base].includes(entry.name))
    if (exchange.length === 1)
      return { unitPriceChaos: exchange[0].primaryValue, category: 'exchange', reason: 'matched' }
  }
  const allowed = requiredNinjaItemTypes([stored])
  const candidates: { row: NinjaRecord; category: string }[] = []
  for (const category of allowed) {
    for (const row of catalog.items.get(category) ?? []) {
      if (!finitePrice(row.chaosValue)) continue
      const rowName = norm(row.name)
      let matches = false
      if (category === 'SkillGem') {
        const level = propertyNumber(raw, 'Level'),
          quality = propertyNumber(raw, 'Quality') ?? 0
        matches =
          [name, type, base].includes(rowName) &&
          level !== null &&
          row.gemLevel === level &&
          (row.gemQuality ?? 0) === quality &&
          (row.corrupted ?? false) === (raw.corrupted ?? false)
      } else if (category === 'ImbuedGem') {
        matches =
          [name, type, base].includes(rowName) && norm(row.variant) === norm(raw.builtInSupport)
      } else if (category === 'Viscera') {
        const implicit = signature(raw.implicitMods)
        matches =
          [name, type, base].includes(rowName) &&
          !!implicit &&
          implicit === signature(row.implicitModifiers ?? row.variant)
      } else if (category === 'Wombgift') {
        matches =
          [name, type, base].includes(rowName) &&
          typeof raw.monsterLevel === 'number' &&
          row.levelRequired === raw.monsterLevel
      } else if (category === 'Corpse') {
        matches = [name, type, base].includes(rowName)
      } else if (category === 'UniqueMap') {
        const tier = propertyNumber(raw, 'Map Tier')
        matches =
          rowName === name &&
          (!row.baseType || norm(row.baseType) === base) &&
          (row.mapTier == null || row.mapTier === tier)
      } else if (category.endsWith('Map') || category === 'Map') {
        // Special map implicits cannot inherit the generic tier estimate.
        if (
          modLines(raw.implicitMods).length ||
          (raw.influences && Object.keys(asRecord(raw.influences)).length)
        )
          continue
        const tier =
          propertyNumber(raw, 'Map Tier') ?? Number(type.match(/\(Tier (\d+)\)/)?.[1] ?? NaN)
        const rowTier =
          typeof row.mapTier === 'number'
            ? row.mapTier
            : Number(rowName.match(/\(Tier (\d+)\)/)?.[1] ?? NaN)
        const generic =
          category === 'Map'
            ? 'Map'
            : category === 'BlightedMap'
              ? 'Blighted Map'
              : 'Blight-ravaged Map'
        matches =
          Number.isFinite(tier) &&
          tier === rowTier &&
          ([type, base].includes(rowName) || rowName === `${generic} (Tier ${tier})`)
      } else if (category.startsWith('Unique')) {
        if (rowName !== name || (row.baseType && norm(row.baseType) !== base)) continue
        const foil = frame === 9 || rarity === 'foil'
        if ((Number(row.itemClass) === 9) !== foil) continue
        const links = linkCount(raw)
        if (links >= 5 ? row.links !== links : Number(row.links ?? 0) > 4) continue
        if (raw.doubleCorrupted) continue
        if ((row.corrupted ?? false) !== (raw.corrupted ?? false)) continue
        const mutated = hasFlag(raw, 'mutated') || raw.mutated === true
        if (mutated || row.mutatedModifiers) {
          const mods = (Array.isArray(raw.explicitMods) ? raw.explicitMods : []).filter(
            (mod) => asRecord(asRecord(mod).flags).mutated === true,
          )
          if (!mutated || !signature(mods) || signature(mods) !== signature(row.mutatedModifiers))
            continue
        } else if (norm(row.variant)) continue
        matches = true
      }
      if (matches) candidates.push({ row, category })
    }
  }
  return candidates.length === 1
    ? {
        unitPriceChaos: candidates[0].row.chaosValue as number,
        category: candidates[0].category,
        reason: 'matched',
      }
    : unknown(candidates.length > 1 ? 'ambiguous_variant' : 'no_supported_quote')
}
