/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import { normalizeCharacterClassInfo } from './poe-character-class.ts'

export type GuestCharacterSummary = {
  name: string
  class: string | null
  ascendancy_class: number
  league: string | null
  level: number | null
  realm: string
}

export type GuestTargetStage = {
  label: string
  notes: string | null
  order_index: number
  tree_spec_id: string | null
  tree_spec_title: string | null
  item_set_id: string | null
  item_set_title: string | null
  skill_set_id: string | null
  skill_set_title: string | null
  config_set_id: string | null
  config_set_title: string | null
  primary_offensive_metric: string
  target_metrics: Record<string, unknown>
  hard_requirements: TargetStageRequirement[]
}

type TargetStageRequirement = {
  kind:
    | 'mandatory_unique'
    | 'minimum_links'
    | 'minimum_sockets'
    | 'resistance_cap'
    | 'attribute_floor'
    | 'custom_note'
  label: string
  slot?: string | null
  item_name?: string | null
  value?: number | null
  value_key?: string | null
  details?: string | null
}

type PobImportMetadata = {
  source_kind: 'pob_share_code' | 'pob_xml' | 'legacy_pob_code'
  class_name: string | null
  ascendancy_name: string | null
  target_version: string | null
  notes: string | null
  player_stats: Record<string, unknown>
  tree_specs: Array<{
    id: string
    title: string
    url: string | null
    treeVersion: string | null
    classId: number | null
    ascendancyId: number | null
    secondaryAscendancyId: number | null
    hashes: number[]
    hashesEx: number[]
    masteryEffects: number[]
    clusterJewels: Array<{
      socketNodeId: number
      itemId: string | null
      size: 'large' | 'medium' | 'small' | 'unknown'
      name: string | null
      typeLine: string | null
    }>
  }>
  skill_sets: Array<{
    id: string
    title: string
    gemNames: string[]
    gems: Array<{
      name: string
      level: number | null
      quality: string | null
      enabled: boolean | null
      isItemGranted: boolean
    }>
    groups: Array<{
      id: string
      label: string | null
      slot: string | null
      enabled: boolean | null
      linkCount: number
      gems: Array<{
        name: string
        level: number | null
        quality: string | null
        enabled: boolean | null
        isItemGranted: boolean
      }>
    }>
  }>
  config_sets: Array<{ id: string; title: string }>
  active_config_set_id: string | null
  active_config_set_title: string | null
  item_sets: Array<{
    id: string
    title: string
    useSecondWeaponSet: boolean
    items: Array<{
      itemId: string | null
      slot: string
      rarity: string | null
      name: string | null
      typeLine: string | null
      socketCount: number | null
      maxLinkCount: number | null
      rawText: string | null
    }>
  }>
}

type LegacyItemRecord = Record<string, unknown>

const ACCOUNT_NAME_REGEX = /^[^\s#][^#]{1,63}#\d{4}$/
const UINT16_MAX = 0xffff
const MAX_GUEST_UPSTREAM_BODY_BYTES = 8 * 1024 * 1024
const MAX_DECOMPRESSED_POB_BYTES = 8 * 1024 * 1024
const GUEST_UPSTREAM_TIMEOUT_MS = 10_000
const LEGACY_CHARACTER_WINDOW_BASE = 'https://www.pathofexile.com/character-window'
const DEFAULT_GUEST_ANALYSIS_USER_AGENT =
  'poe-party/1.0 (contact: support@poe-party.com) guest-analysis'

const EQUIPMENT_SLOTS = new Set([
  'Helm',
  'Amulet',
  'BodyArmour',
  'Weapon',
  'Offhand',
  'Gloves',
  'Ring',
  'Ring2',
  'Belt',
  'Boots',
  'Weapon2',
  'Offhand2',
])
const JEWEL_SLOT_MARKERS = ['Passive', 'Jewel']
const INVENTORY_SLOT_MARKERS = ['MainInventory', 'Flask', 'Map', 'Sanctum', 'Relic']
const EQUIPMENT_SLOT_SORT_ORDER = new Map([
  ['Helm', 0],
  ['Weapon', 1],
  ['Amulet', 2],
  ['Offhand', 3],
  ['Gloves', 4],
  ['BodyArmour', 5],
  ['Ring', 6],
  ['Belt', 7],
  ['Ring2', 8],
  ['Boots', 9],
  ['Weapon2', 10],
  ['Offhand2', 11],
])
const CLASS_IDS: Record<string, number> = {
  Scion: 0,
  Marauder: 1,
  Ranger: 2,
  Witch: 3,
  Duelist: 4,
  Templar: 5,
  Shadow: 6,
}

export class GuestPoePublicError extends Error {
  status: number
  code: string

  constructor(message: string, status = 400, code = 'poe_public_error') {
    super(message)
    this.status = status
    this.code = code
  }
}

export function normalizeGuestAccountName(value: unknown): {
  accountName: string
  normalizedAccountName: string
} {
  const accountName = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
  if (!ACCOUNT_NAME_REGEX.test(accountName)) {
    throw new GuestPoePublicError(
      'Enter a Path of Exile account name with discriminator, for example AccountName#1234.',
      400,
      'invalid_account_name',
    )
  }

  return {
    accountName,
    normalizedAccountName: accountName.toLowerCase(),
  }
}

export function normalizeCharacterName(value: unknown): string {
  const characterName = typeof value === 'string' ? value.trim() : ''
  const hasControlCharacter = [...characterName].some((char) => char.charCodeAt(0) < 32)
  if (!characterName || characterName.length > 80 || hasControlCharacter) {
    throw new GuestPoePublicError('Choose one public character first.', 400, 'invalid_character')
  }
  return characterName
}

export function utcUsageDate(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}

export function nextUtcResetAt(now = new Date()): string {
  const reset = new Date(now)
  reset.setUTCHours(24, 0, 0, 0)
  return reset.toISOString()
}

export function getClientIp(req: Request): string | null {
  const candidates = [
    req.headers.get('cf-connecting-ip'),
    req.headers.get('x-real-ip'),
    req.headers.get('x-forwarded-for')?.split(',')[0],
  ]
  const ip = candidates.find((entry) => entry?.trim())
  return ip?.trim() ?? null
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function createRunToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return bytesToBase64Url(bytes)
}

function getHashSecret(): string {
  const secret =
    Deno.env.get('GUEST_ANALYSIS_HASH_SECRET') ??
    Deno.env.get('SUPABASE_SECRET_KEY') ??
    Deno.env.get('SECRET_KEY') ??
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!secret) {
    throw new Error('Missing hash secret for Public Analysis tokens')
  }
  return secret
}

export async function hmacSha256Hex(value: string, purpose: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(`${purpose}:${getHashSecret()}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  return [...new Uint8Array(signature)].map((entry) => entry.toString(16).padStart(2, '0')).join('')
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((entry) => entry.toString(16).padStart(2, '0')).join('')
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readString(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function readNumber(record: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key]
    const parsed = typeof value === 'number' ? value : Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function readNumberArray(record: Record<string, unknown>, ...keys: string[]): number[] {
  for (const key of keys) {
    const value = record[key]
    if (Array.isArray(value)) {
      return sortNumberArray(
        value
          .map((entry) => (typeof entry === 'number' ? entry : Number(entry)))
          .filter((entry) => Number.isFinite(entry)),
      )
    }
  }
  return []
}

function sortNumberArray(values: number[]): number[] {
  return [...values].sort((left, right) => left - right)
}

function sortStringArray(values: string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right))
}

function normalizePoeApiError(status: number, text: string): GuestPoePublicError {
  if (status === 403) {
    return new GuestPoePublicError(
      'That account or character is private. Public character access is required for Public Analysis.',
      403,
      'poe_private',
    )
  }
  if (status === 404) {
    return new GuestPoePublicError(
      'No public Path of Exile account or character was found for that name.',
      404,
      'poe_not_found',
    )
  }
  if (status === 429) {
    return new GuestPoePublicError(
      'Path of Exile is rate limiting public character lookups. Try again shortly.',
      429,
      'poe_rate_limited',
    )
  }
  return new GuestPoePublicError(
    `Path of Exile public character lookup failed (${status}).`,
    502,
    text ? 'poe_upstream_error_with_body' : 'poe_upstream_error',
  )
}

async function fetchLegacyCharacterWindowJson<T>(
  path: string,
  params: Record<string, string | null | undefined>,
): Promise<T> {
  const url = new URL(`${LEGACY_CHARACTER_WINDOW_BASE}${path}`)
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value)
  }

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(GUEST_UPSTREAM_TIMEOUT_MS),
    headers: {
      Accept: 'application/json',
      'User-Agent':
        Deno.env.get('POE_PUBLIC_USER_AGENT') ??
        Deno.env.get('POE_TRADE_USER_AGENT') ??
        DEFAULT_GUEST_ANALYSIS_USER_AGENT,
    },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw normalizePoeApiError(res.status, text)
  }

  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('json')) {
    throw new GuestPoePublicError(
      'Path of Exile returned a non-JSON public character response.',
      502,
      'poe_invalid_response',
    )
  }

  const contentLength = Number(res.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > MAX_GUEST_UPSTREAM_BODY_BYTES) {
    throw new GuestPoePublicError(
      'Path of Exile returned an oversized public character response.',
      502,
      'poe_response_too_large',
    )
  }

  const reader = res.body?.getReader()
  const decoder = new TextDecoder()
  let responseText = ''
  let responseBytes = 0

  if (reader) {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      responseBytes += value.byteLength
      if (responseBytes > MAX_GUEST_UPSTREAM_BODY_BYTES) {
        await reader.cancel('Path of Exile response exceeded the guest-analysis limit')
        throw new GuestPoePublicError(
          'Path of Exile returned an oversized public character response.',
          502,
          'poe_response_too_large',
        )
      }
      responseText += decoder.decode(value, { stream: true })
    }
    responseText += decoder.decode()
  }

  try {
    return JSON.parse(responseText) as T
  } catch {
    throw new GuestPoePublicError(
      'Path of Exile returned an invalid public character response.',
      502,
      'poe_invalid_json',
    )
  }
}

export async function fetchGuestCharacters(accountName: string): Promise<GuestCharacterSummary[]> {
  const payload = await fetchLegacyCharacterWindowJson<unknown>('/get-characters', {
    accountName,
  })
  const characters = Array.isArray(payload) ? payload : asArray(asRecord(payload).characters)

  return characters
    .map((entry) => {
      const record = asRecord(entry)
      const name = readString(record, 'name')
      if (!name) return null

      const className = readString(record, 'class')
      const normalizedClass = normalizeCharacterClassInfo(
        'poe1',
        className,
        readNumber(record, 'ascendancyClass', 'ascendancy_class'),
      )

      return {
        name,
        class: normalizedClass.className,
        ascendancy_class: normalizedClass.ascendancyClass,
        league: readString(record, 'league'),
        level: readNumber(record, 'level'),
        realm: readString(record, 'realm') ?? 'pc',
      } satisfies GuestCharacterSummary
    })
    .filter((entry): entry is GuestCharacterSummary => entry !== null)
}

export async function fetchGuestCharacterProfile(
  accountName: string,
  characterName: string,
  summary: GuestCharacterSummary | null,
) {
  const realm = summary?.realm ?? 'pc'
  const [itemsPayload, passivePayload] = await Promise.all([
    fetchLegacyCharacterWindowJson<Record<string, unknown>>('/get-items', {
      accountName,
      character: characterName,
      realm,
    }),
    fetchLegacyCharacterWindowJson<Record<string, unknown>>('/get-passive-skills', {
      accountName,
      character: characterName,
      realm,
    }),
  ])

  const characterRecord = asRecord(itemsPayload.character)
  const characterClass =
    readString(characterRecord, 'class') ?? summary?.class ?? readString(itemsPayload, 'class')
  const normalizedClass = normalizeCharacterClassInfo(
    'poe1',
    characterClass,
    readNumber(characterRecord, 'ascendancyClass', 'ascendancy_class') ??
      summary?.ascendancy_class ??
      0,
  )
  const resolvedCharacter = {
    name: readString(characterRecord, 'name') ?? summary?.name ?? characterName,
    class: characterClass ?? normalizedClass.className,
    league: readString(characterRecord, 'league') ?? summary?.league ?? null,
    level: readNumber(characterRecord, 'level') ?? summary?.level ?? null,
  }
  const rawCharacter = {
    ...itemsPayload,
    character: resolvedCharacter,
    passives: passivePayload,
  }
  const rawItems = asArray(itemsPayload.items).filter(
    (entry): entry is LegacyItemRecord => !!entry && typeof entry === 'object',
  )
  const { gear, inventory, jewels } = normalizeItemGroups(rawItems)

  return {
    id: null,
    user_id: null,
    group_id: null,
    character_id: null,
    character_name: resolvedCharacter.name,
    league: resolvedCharacter.league,
    class: normalizedClass.className,
    ascendancy_class: normalizedClass.ascendancyClass,
    level: resolvedCharacter.level,
    visibility: 'guest_token',
    gear,
    inventory,
    jewels,
    passive_tree: normalizePassiveTree(passivePayload, rawCharacter, normalizedClass.className),
    atlas_tree: { url: null, hashes: [], league: resolvedCharacter.league },
    raw_character: rawCharacter,
    raw_league_account: {},
    last_synced_at: new Date().toISOString(),
  }
}

function normalizeModifierLines(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((line): line is string => typeof line === 'string' && line.trim().length > 0)
    : []
}

function mapProperty(property: unknown) {
  const record = asRecord(property)
  return {
    name: readString(record, 'name') ?? '',
    values: asArray(record.values)
      .map((entry) => (Array.isArray(entry) ? String(entry[0] ?? '') : String(entry ?? '')))
      .filter(Boolean),
  }
}

function findPropertyValue(item: Record<string, unknown>, name: string): string | null {
  for (const property of asArray(item.properties)) {
    const record = asRecord(property)
    if (record.name !== name) continue
    const firstValue = asArray(record.values)[0]
    if (Array.isArray(firstValue)) return String(firstValue[0] ?? '') || null
  }
  return null
}

function mapSockets(item: Record<string, unknown>) {
  return asArray(item.sockets).map((socket) => {
    const record = asRecord(socket)
    return {
      group: readNumber(record, 'group') ?? 0,
      color: readString(record, 'sColour', 'attr'),
    }
  })
}

function mapSocketedItems(item: Record<string, unknown>) {
  return asArray(item.socketedItems)
    .map((entry) => {
      const record = asRecord(entry)
      return {
        id: readString(record, 'id'),
        name: readString(record, 'name') ?? '',
        typeLine: readString(record, 'typeLine') ?? '',
        icon: readString(record, 'icon'),
        support: record.support === true,
        level: Number(findPropertyValue(record, 'Level')) || null,
        quality: findPropertyValue(record, 'Quality'),
      }
    })
    .sort(
      (left, right) =>
        (left.id ?? '').localeCompare(right.id ?? '') ||
        left.name.localeCompare(right.name) ||
        left.typeLine.localeCompare(right.typeLine) ||
        Number(left.support) - Number(right.support) ||
        Number(left.level ?? -1) - Number(right.level ?? -1) ||
        (left.quality ?? '').localeCompare(right.quality ?? ''),
    )
}

function mapItem(item: LegacyItemRecord) {
  const influences = asRecord(item.influences)
  const veiledMods = normalizeModifierLines(item.veiledMods).map((mod) => {
    if (mod.startsWith('Prefix')) return 'Veiled Prefix'
    if (mod.startsWith('Suffix')) return 'Veiled Suffix'
    return 'Veiled Modifier'
  })
  const modifiers = [
    ...normalizeModifierLines(item.enchantMods),
    ...normalizeModifierLines(item.implicitMods),
    ...normalizeModifierLines(item.fracturedMods),
    ...normalizeModifierLines(item.explicitMods),
    ...normalizeModifierLines(item.craftedMods),
    ...veiledMods,
    ...normalizeModifierLines(item.scourgeMods),
  ].slice(0, 8)

  return {
    id: readString(item, 'id'),
    slot: readString(item, 'inventoryId'),
    name: readString(item, 'name') ?? '',
    typeLine: readString(item, 'typeLine') ?? '',
    baseType: readString(item, 'baseType'),
    icon: readString(item, 'icon'),
    rarity: readString(item, 'rarity'),
    frameType: readNumber(item, 'frameType'),
    itemLevel: readNumber(item, 'itemLevel', 'ilvl'),
    identified: item.identified !== false,
    corrupted: item.corrupted === true,
    fractured: item.fractured === true,
    synthesised: item.synthesised === true,
    veiled: item.veiled === true || veiledMods.length > 0,
    influences: sortStringArray(
      Object.entries(influences)
        .filter(([, active]) => !!active)
        .map(([name]) => name),
    ),
    note: readString(item, 'note'),
    width: readNumber(item, 'w'),
    height: readNumber(item, 'h'),
    sockets: mapSockets(item),
    socketedItems: mapSocketedItems(item),
    properties: asArray(item.properties).map(mapProperty).slice(0, 5),
    requirements: asArray(item.requirements).map(mapProperty).slice(0, 4),
    implicitMods: normalizeModifierLines(item.implicitMods),
    explicitMods: normalizeModifierLines(item.explicitMods),
    craftedMods: normalizeModifierLines(item.craftedMods),
    fracturedMods: normalizeModifierLines(item.fracturedMods),
    enchantMods: normalizeModifierLines(item.enchantMods),
    veiledMods,
    modifiers,
  }
}

function compareProfileItems(
  left: {
    slot: string | null
    id: string | null
    name: string
    typeLine: string
    itemLevel: number | null
  },
  right: {
    slot: string | null
    id: string | null
    name: string
    typeLine: string
    itemLevel: number | null
  },
) {
  const leftRank = left.slot ? (EQUIPMENT_SLOT_SORT_ORDER.get(left.slot) ?? 99) : 99
  const rightRank = right.slot ? (EQUIPMENT_SLOT_SORT_ORDER.get(right.slot) ?? 99) : 99
  return (
    leftRank - rightRank ||
    (left.slot ?? '').localeCompare(right.slot ?? '') ||
    (left.id ?? '').localeCompare(right.id ?? '') ||
    left.name.localeCompare(right.name) ||
    left.typeLine.localeCompare(right.typeLine) ||
    Number(left.itemLevel ?? Number.MAX_SAFE_INTEGER) -
      Number(right.itemLevel ?? Number.MAX_SAFE_INTEGER)
  )
}

function normalizeItemGroups(items: LegacyItemRecord[]) {
  const gear = []
  const inventory = []
  const jewels = []

  for (const item of items) {
    const slot = readString(item, 'inventoryId') ?? ''
    const normalized = mapItem(item)

    if (slot && EQUIPMENT_SLOTS.has(slot)) {
      gear.push(normalized)
      continue
    }
    if (JEWEL_SLOT_MARKERS.some((marker) => slot.includes(marker))) {
      jewels.push(normalized)
      continue
    }
    if (!slot || INVENTORY_SLOT_MARKERS.some((marker) => slot.includes(marker))) {
      inventory.push(normalized)
      continue
    }
    inventory.push(normalized)
  }

  return {
    gear: [...gear].sort(compareProfileItems),
    inventory: [...inventory].sort(compareProfileItems),
    jewels: [...jewels].sort(compareProfileItems),
  }
}

function packMasteryEffectPairs(record: Record<string, unknown>, ...keys: string[]): number[] {
  for (const key of keys) {
    const value = record[key]
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.entries(value as Record<string, unknown>)
        .map(([nodeHash, effectHash]) => {
          const node = Number(nodeHash)
          const effect = typeof effectHash === 'number' ? effectHash : Number(effectHash)
          if (!Number.isFinite(node) || !Number.isFinite(effect)) return null
          return (((effect & UINT16_MAX) << 16) | (node & UINT16_MAX)) >>> 0
        })
        .filter((entry): entry is number => entry != null)
    }
  }
  return []
}

function readNumericRecordKeys(record: Record<string, unknown>): number[] {
  return Object.keys(record)
    .map((key) => Number(key))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right)
}

function normalizePassiveTreeJewelData(
  characterRecord: Record<string, unknown>,
  passives: Record<string, unknown>,
) {
  const topLevelSnake = asRecord(characterRecord.jewel_data)
  const topLevelCamel = asRecord(characterRecord.jewelData)
  const nestedSnake = asRecord(passives.jewel_data)
  const nestedCamel = asRecord(passives.jewelData)
  const jewelData =
    Object.keys(topLevelSnake).length > 0
      ? topLevelSnake
      : Object.keys(topLevelCamel).length > 0
        ? topLevelCamel
        : Object.keys(nestedSnake).length > 0
          ? nestedSnake
          : nestedCamel

  return Object.entries(jewelData)
    .map(([socketIndex, entry]) => {
      const normalizedEntry = asRecord(entry)
      const subgraph = asRecord(normalizedEntry.subgraph)
      return {
        socketIndex: Number.isFinite(Number(socketIndex)) ? Number(socketIndex) : null,
        type: readString(normalizedEntry, 'type'),
        radius: readNumber(normalizedEntry, 'radius'),
        radiusMin: readNumber(normalizedEntry, 'radiusMin'),
        radiusVisual: readString(normalizedEntry, 'radiusVisual'),
        subgraphNodeIds: readNumericRecordKeys(asRecord(subgraph.nodes)),
        subgraphGroupIds: readNumericRecordKeys(asRecord(subgraph.groups)),
      }
    })
    .sort((left, right) => {
      const leftValue = left.socketIndex ?? Number.MAX_SAFE_INTEGER
      const rightValue = right.socketIndex ?? Number.MAX_SAFE_INTEGER
      return leftValue - rightValue
    })
}

function normalizePassiveTree(
  passivePayload: Record<string, unknown>,
  rawCharacter: Record<string, unknown>,
  activeCharacterClass: string | null,
) {
  const passives = asRecord(passivePayload.passives ?? passivePayload)
  const metadata = asRecord(passivePayload.metadata)
  const passivesHashes = readNumberArray(passives, 'hashes', 'passiveSkills')
  const passivesHashesEx = readNumberArray(passives, 'hashes_ex', 'hashesEx')
  const recordMasteryPairs = readNumberArray(
    rawCharacter,
    'mastery_effect_pairs',
    'masteryEffectPairs',
    'masteryEffects',
  )
  const passivesMasteryPairs = readNumberArray(
    passives,
    'mastery_effect_pairs',
    'masteryEffectPairs',
  )

  return {
    url: readString(
      rawCharacter,
      'passive_tree_url',
      'passiveTreeUrl',
      'passive_skill_tree_url',
      'url',
    ),
    version:
      readString(metadata, 'version') ??
      readString(rawCharacter, 'version', 'treeVersion', 'gameVersion'),
    hashes: sortNumberArray(
      passivesHashes.length > 0
        ? passivesHashes
        : readNumberArray(rawCharacter, 'hashes', 'passiveSkills'),
    ),
    hashesEx: sortNumberArray(
      passivesHashesEx.length > 0
        ? passivesHashesEx
        : readNumberArray(rawCharacter, 'hashes_ex', 'hashesEx'),
    ),
    masteryEffects: sortNumberArray(
      recordMasteryPairs.length > 0
        ? recordMasteryPairs
        : passivesMasteryPairs.length > 0
          ? passivesMasteryPairs
          : [
              ...packMasteryEffectPairs(rawCharacter, 'mastery_effects', 'masteryEffects'),
              ...packMasteryEffectPairs(passives, 'mastery_effects', 'masteryEffects'),
            ],
    ),
    jewelData: normalizePassiveTreeJewelData(rawCharacter, passives),
    classId:
      readNumber(rawCharacter, 'classId', 'class_id') ??
      (activeCharacterClass ? (CLASS_IDS[activeCharacterClass] ?? null) : null),
    ascendancyId:
      readNumber(rawCharacter, 'ascendancyClass', 'ascendancy_class') ??
      readNumber(asRecord(rawCharacter.character), 'ascendancy_class'),
  }
}

function normalizeSourceKind(input: string): PobImportMetadata['source_kind'] {
  return input.trim().startsWith('<') ? 'pob_xml' : 'pob_share_code'
}

async function inflateBase64Payload(base64Payload: string): Promise<string> {
  try {
    const normalized = base64Payload.trim().replace(/-/g, '+').replace(/_/g, '/')
    const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
    const binary = atob(`${normalized}${padding}`)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    const reader = new Blob([bytes])
      .stream()
      .pipeThrough(new DecompressionStream('deflate'))
      .getReader()
    const decoder = new TextDecoder()
    let output = ''
    let outputBytes = 0

    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      outputBytes += value.byteLength
      if (outputBytes > MAX_DECOMPRESSED_POB_BYTES) {
        await reader.cancel('decompressed PoB payload too large')
        throw new GuestPoePublicError(
          'The decompressed PoB import is too large for Public Analysis.',
          413,
          'pob_decompressed_too_large',
        )
      }
      output += decoder.decode(value, { stream: true })
    }

    output += decoder.decode()
    return output
  } catch (error) {
    if (error instanceof GuestPoePublicError) throw error
    throw new GuestPoePublicError('The PoB share code is invalid.', 400, 'invalid_pob')
  }
}

function parseNumber(value: string | null): number | null {
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parseIntegerAttribute(node: Element, attribute: string): number | null {
  return parseNumber(node.getAttribute(attribute))
}

function parseBooleanAttribute(value: string | null): boolean | null {
  if (value === 'true') return true
  if (value === 'false') return false
  return null
}

function readNodeText(node: Element | null): string | null {
  const value = node?.textContent?.trim()
  return value ? value : null
}

function parseNumberList(value: string | null): number[] {
  if (!value?.trim()) return []
  return sortNumberArray(
    value
      .split(',')
      .map((entry) => Number(entry.trim()))
      .filter((entry) => Number.isFinite(entry)),
  )
}

function parseTreeSpecMasteryEffects(value: string | null): number[] {
  if (!value?.trim()) return []
  return sortNumberArray(
    Array.from(value.matchAll(/\{(\d+),(\d+)\}/g))
      .map(([, masteryNodeId, effectId]) => {
        const node = Number(masteryNodeId)
        const effect = Number(effectId)
        if (!Number.isFinite(node) || !Number.isFinite(effect)) return null
        return (((effect & UINT16_MAX) << 16) | (node & UINT16_MAX)) >>> 0
      })
      .filter((entry): entry is number => entry != null),
  )
}

function splitTreeSpecNodeIds(values: number[]): { hashes: number[]; hashesEx: number[] } {
  const hashes: number[] = []
  const hashesEx: number[] = []
  for (const value of values) {
    if (!Number.isFinite(value) || value < 0) continue
    if (value > UINT16_MAX) {
      hashesEx.push(value)
    } else {
      hashes.push(value)
    }
  }
  return { hashes: sortNumberArray(hashes), hashesEx: sortNumberArray(hashesEx) }
}

function normalizeRarity(value: string | null): string | null {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) return null
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function normalizeSlotName(slotName: string): string {
  return slotName.replace(/\s+/g, ' ').trim()
}

function parsePobItemText(rawText: string | null) {
  const lines = (rawText ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const rarityIndex = lines.findIndex((line) => line.startsWith('Rarity:'))
  const rarity =
    rarityIndex >= 0 ? normalizeRarity(lines[rarityIndex].replace('Rarity:', '').trim()) : null
  const headerLines =
    rarityIndex >= 0 ? lines.slice(rarityIndex + 1, rarityIndex + 3) : lines.slice(0, 2)
  const socketsLine = lines.find((line) => line.startsWith('Sockets:'))
  const socketGroups = socketsLine
    ? socketsLine.replace('Sockets:', '').trim().split(/\s+/).filter(Boolean)
    : []
  const socketCount = socketGroups.reduce(
    (total, group) => total + group.split('-').filter(Boolean).length,
    0,
  )
  const maxLinkCount = socketGroups.reduce(
    (maxLinks, group) => Math.max(maxLinks, group.split('-').filter(Boolean).length),
    0,
  )

  return {
    rarity,
    name: headerLines[0] ?? null,
    typeLine: headerLines[1] ?? headerLines[0] ?? null,
    socketCount: socketCount || null,
    maxLinkCount: maxLinkCount || null,
    rawText,
  }
}

function buildPobItemSummaryLookup(document: Document) {
  const itemNodes = new Map<string, ReturnType<typeof parsePobItemText>>()
  for (const itemNode of document.querySelectorAll('Items > Item[id]')) {
    const itemId = itemNode.getAttribute('id')?.trim()
    if (!itemId) continue
    itemNodes.set(itemId, parsePobItemText(itemNode.textContent ?? null))
  }
  return itemNodes
}

type ClusterJewelSize = 'large' | 'medium' | 'small' | 'unknown'

function getClusterJewelSize(typeLine: string | null | undefined): ClusterJewelSize | null {
  const normalized = typeLine?.trim().toLowerCase()
  if (!normalized) return null
  if (normalized.includes('large cluster jewel')) return 'large'
  if (normalized.includes('medium cluster jewel')) return 'medium'
  if (normalized.includes('small cluster jewel')) return 'small'
  if (normalized.includes('cluster jewel')) return 'unknown'
  return null
}

function parseTreeSpecClusterJewels(
  specNode: Element,
  itemNodes: Map<string, ReturnType<typeof parsePobItemText>>,
) {
  return [...specNode.querySelectorAll('Sockets > Socket')]
    .map((socketNode) => {
      const socketNodeId = parseIntegerAttribute(socketNode, 'nodeId')
      if (socketNodeId == null) return null
      const itemId = socketNode.getAttribute('itemId')?.trim() ?? null
      const itemSummary = itemId ? itemNodes.get(itemId) : null
      const size = getClusterJewelSize(itemSummary?.typeLine)
      if (!size) return null
      return {
        socketNodeId,
        itemId,
        size,
        name: itemSummary?.name ?? null,
        typeLine: itemSummary?.typeLine ?? null,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry != null)
}

function parseTreeSpecs(document: Document): PobImportMetadata['tree_specs'] {
  const itemNodes = buildPobItemSummaryLookup(document)
  return [...document.querySelectorAll('Tree > Spec')].map((node, index) => {
    const nodeIds = parseNumberList(node.getAttribute('nodes'))
    const { hashes, hashesEx } = splitTreeSpecNodeIds(nodeIds)
    return {
      id:
        node.getAttribute('title')?.trim() ||
        node.getAttribute('specId')?.trim() ||
        String(index + 1),
      title: node.getAttribute('title')?.trim() || `Tree ${index + 1}`,
      url:
        node.querySelector('URL')?.getAttribute('link') ?? readNodeText(node.querySelector('URL')),
      treeVersion: node.getAttribute('treeVersion')?.trim() || null,
      classId: parseIntegerAttribute(node, 'classId'),
      ascendancyId: parseIntegerAttribute(node, 'ascendClassId'),
      secondaryAscendancyId: parseIntegerAttribute(node, 'secondaryAscendClassId'),
      hashes,
      hashesEx,
      masteryEffects: parseTreeSpecMasteryEffects(node.getAttribute('masteryEffects')),
      clusterJewels: parseTreeSpecClusterJewels(node, itemNodes),
    }
  })
}

function formatGemQuality(value: number | null): string | null {
  return value == null ? null : `${value}%`
}

function parseSkillSets(document: Document): PobImportMetadata['skill_sets'] {
  return [...document.querySelectorAll('Skills > SkillSet')].map((node, index) => {
    const groups = [...node.querySelectorAll('Skill')].map((skillNode, skillIndex) => {
      const skillEnabled = parseBooleanAttribute(skillNode.getAttribute('enabled'))
      const gems = [...skillNode.querySelectorAll('Gem')]
        .map((gemNode) => {
          const nameSpec = gemNode.getAttribute('nameSpec')?.trim() || null
          const name =
            nameSpec ||
            skillNode.getAttribute('label')?.trim() ||
            gemNode.getAttribute('skillId')?.trim() ||
            null
          if (!name) return null
          return {
            name,
            level: parseNumber(gemNode.getAttribute('level')),
            quality: formatGemQuality(parseNumber(gemNode.getAttribute('quality'))),
            enabled: parseBooleanAttribute(gemNode.getAttribute('enabled')) ?? skillEnabled,
            isItemGranted: !nameSpec,
          }
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry != null)
      const enabledGems = gems.filter((entry) => entry.enabled !== false && !entry.isItemGranted)
      return {
        id: skillNode.getAttribute('slot')?.trim() || `${index + 1}-${skillIndex + 1}`,
        label: skillNode.getAttribute('label')?.trim() || null,
        slot: skillNode.getAttribute('slot')?.trim() || null,
        enabled: skillEnabled,
        linkCount: enabledGems.length,
        gems,
      }
    })
    const gems = groups.flatMap((group) => group.gems)
    const gemNames = Array.from(new Set(gems.map((entry) => entry.name).filter(Boolean)))
    return {
      id: node.getAttribute('id')?.trim() || String(index + 1),
      title: node.getAttribute('title')?.trim() || `Skill Set ${index + 1}`,
      gemNames,
      gems,
      groups,
    }
  })
}

function parseItemSets(document: Document): PobImportMetadata['item_sets'] {
  const itemNodes = buildPobItemSummaryLookup(document)
  return [...document.querySelectorAll('Items > ItemSet')].map((itemSetNode, index) => {
    const items = [...itemSetNode.querySelectorAll('Slot')].map((slotNode) => {
      const itemId = slotNode.getAttribute('itemId')?.trim() ?? null
      const base = itemId ? itemNodes.get(itemId) : null
      return {
        itemId,
        slot: normalizeSlotName(slotNode.getAttribute('name')?.trim() || 'Unknown'),
        rarity: base?.rarity ?? null,
        name: base?.name ?? null,
        typeLine: base?.typeLine ?? null,
        socketCount: base?.socketCount ?? null,
        maxLinkCount: base?.maxLinkCount ?? null,
        rawText: base?.rawText ?? null,
      }
    })
    return {
      id: itemSetNode.getAttribute('id')?.trim() || String(index + 1),
      title: itemSetNode.getAttribute('title')?.trim() || `Item Set ${index + 1}`,
      useSecondWeaponSet: itemSetNode.getAttribute('useSecondWeaponSet') === 'true',
      items,
    }
  })
}

function parseConfigSets(document: Document) {
  const configNode = document.querySelector('Config')
  const activeConfigSetId = configNode?.getAttribute('activeConfigSet')?.trim() ?? null
  const configSets = [...document.querySelectorAll('Config > ConfigSet')].map((node, index) => ({
    id: node.getAttribute('id')?.trim() || String(index + 1),
    title: node.getAttribute('title')?.trim() || `Config ${index + 1}`,
  }))
  if (configSets.length === 0 && configNode) {
    configSets.push({ id: activeConfigSetId || '1', title: 'Default' })
  }
  const activeConfigSetTitle =
    configSets.find((entry) => entry.id === activeConfigSetId)?.title ??
    (activeConfigSetId == null ? (configSets[0]?.title ?? null) : null)
  return {
    config_sets: configSets,
    active_config_set_id: activeConfigSetId ?? configSets[0]?.id ?? null,
    active_config_set_title: activeConfigSetTitle,
  }
}

function parsePlayerStats(document: Document): Record<string, unknown> {
  const buildNode = document.querySelector('Build')
  const stats: Record<string, unknown> = {}
  for (const node of document.querySelectorAll('Build > PlayerStat')) {
    const statName = node.getAttribute('stat')
    const statValue = parseNumber(node.getAttribute('value'))
    if (!statName || statValue == null) continue
    switch (statName) {
      case 'TotalDPS':
        stats.totalDps = statValue
        break
      case 'CombinedDPS':
        stats.combinedDps = statValue
        break
      case 'TotalEHP':
        stats.totalEhp = statValue
        break
      case 'Life':
        stats.life = statValue
        break
      case 'Mana':
        stats.mana = statValue
        break
      case 'EnergyShield':
        stats.energyShield = statValue
        break
      case 'Armour':
        stats.armour = statValue
        break
      case 'Evasion':
        stats.evasion = statValue
        break
      case 'Ward':
        stats.ward = statValue
        break
      case 'FireResist':
        stats.fireResist = statValue
        break
      case 'ColdResist':
        stats.coldResist = statValue
        break
      case 'LightningResist':
        stats.lightningResist = statValue
        break
      case 'ChaosResist':
        stats.chaosResist = statValue
        break
      default:
        stats[statName] = statValue
    }
  }
  const level = buildNode ? parseNumber(buildNode.getAttribute('level')) : null
  if (level != null) stats.characterLevel = level
  return stats
}

function parsePobXml(
  rawXml: string,
  sourceKind: PobImportMetadata['source_kind'],
): PobImportMetadata {
  const document = new DOMParser().parseFromString(rawXml, 'application/xml')
  const parserError = document.querySelector('parsererror')
  if (parserError) {
    throw new GuestPoePublicError('The PoB payload could not be parsed as XML.', 400, 'invalid_pob')
  }
  const buildNode = document.querySelector('Build')
  const configData = parseConfigSets(document)
  return {
    source_kind: sourceKind,
    class_name: buildNode?.getAttribute('className')?.trim() ?? null,
    ascendancy_name: buildNode?.getAttribute('ascendClassName')?.trim() ?? null,
    target_version: buildNode?.getAttribute('targetVersion')?.trim() ?? null,
    notes: readNodeText(document.querySelector('Notes')),
    player_stats: parsePlayerStats(document),
    tree_specs: parseTreeSpecs(document),
    skill_sets: parseSkillSets(document),
    config_sets: configData.config_sets,
    active_config_set_id: configData.active_config_set_id,
    active_config_set_title: configData.active_config_set_title,
    item_sets: parseItemSets(document),
  }
}

export async function parseGuestPobImport(input: unknown): Promise<{
  source_kind: PobImportMetadata['source_kind']
  raw_import: string
  raw_xml: string
  metadata: PobImportMetadata
}> {
  const raw_import = typeof input === 'string' ? input.trim() : ''
  if (!raw_import) {
    throw new GuestPoePublicError('Paste a PoB share code or XML export first.', 400, 'missing_pob')
  }
  if (raw_import.length > 2_000_000) {
    throw new GuestPoePublicError(
      'The PoB import is too large for Public Analysis.',
      413,
      'pob_too_large',
    )
  }
  const source_kind = normalizeSourceKind(raw_import)
  const raw_xml = source_kind === 'pob_xml' ? raw_import : await inflateBase64Payload(raw_import)
  const metadata = parsePobXml(raw_xml, source_kind)
  return { source_kind, raw_import, raw_xml, metadata }
}

function isMeaningfulLinkRequirement(
  slotName: string | null | undefined,
  value: number | null | undefined,
): boolean {
  const normalizedSlot = normalizeSlotName(slotName ?? '').toLowerCase()
  const normalizedValue = Number(value ?? 0)
  if (!Number.isFinite(normalizedValue) || normalizedValue < 6) return false
  return (
    normalizedSlot === 'body armour' ||
    normalizedSlot === 'weapon 1' ||
    normalizedSlot === 'weapon 2'
  )
}

function deriveStageRequirementsFromSelection(
  metadata: PobImportMetadata,
  selection: { item_set_id?: string | null },
): TargetStageRequirement[] {
  const requirements: TargetStageRequirement[] = []
  const itemSet = metadata.item_sets.find((entry) => entry.id === selection.item_set_id)

  for (const item of itemSet?.items ?? []) {
    if (normalizeRarity(item.rarity) === 'Unique' && item.name) {
      requirements.push({
        kind: 'mandatory_unique',
        label: `${item.name}${item.slot ? ` (${item.slot})` : ''}`,
        slot: item.slot,
        item_name: item.name,
        details: item.typeLine ?? null,
      })
    }
    if (isMeaningfulLinkRequirement(item.slot, item.maxLinkCount)) {
      requirements.push({
        kind: 'minimum_links',
        label: `${item.slot} needs ${item.maxLinkCount} links`,
        slot: item.slot,
        value: item.maxLinkCount,
      })
    }
  }

  return requirements
}

function resolveSelection<T extends { id: string }>(entries: T[], preferredId: unknown): T | null {
  const normalizedId =
    typeof preferredId === 'string' && preferredId.trim() ? preferredId.trim() : null
  if (normalizedId) {
    const matched = entries.find((entry) => entry.id === normalizedId)
    if (matched) return matched
  }
  return entries[0] ?? null
}

export function buildGuestTargetStage(
  metadata: PobImportMetadata,
  options: {
    target_name?: unknown
    tree_spec_id?: unknown
    item_set_id?: unknown
    skill_set_id?: unknown
    config_set_id?: unknown
  },
): GuestTargetStage {
  const treeSpec = resolveSelection(metadata.tree_specs, options.tree_spec_id)
  const itemSet = resolveSelection(metadata.item_sets, options.item_set_id)
  const skillSet = resolveSelection(metadata.skill_sets, options.skill_set_id)
  const configSet =
    resolveSelection(metadata.config_sets, options.config_set_id) ??
    metadata.config_sets.find((entry) => entry.id === metadata.active_config_set_id) ??
    null
  const targetName =
    typeof options.target_name === 'string' && options.target_name.trim()
      ? options.target_name.trim().slice(0, 120)
      : 'Public target'

  return {
    label: targetName,
    notes: null,
    order_index: 1,
    tree_spec_id: treeSpec?.id ?? null,
    tree_spec_title: treeSpec?.title ?? null,
    item_set_id: itemSet?.id ?? null,
    item_set_title: itemSet?.title ?? null,
    skill_set_id: skillSet?.id ?? null,
    skill_set_title: skillSet?.title ?? null,
    config_set_id: configSet?.id ?? null,
    config_set_title: configSet?.title ?? null,
    primary_offensive_metric: 'totalDps',
    target_metrics: metadata.player_stats,
    hard_requirements: deriveStageRequirementsFromSelection(metadata, {
      item_set_id: itemSet?.id ?? null,
    }),
  }
}
