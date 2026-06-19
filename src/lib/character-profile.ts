import type { PoeGame } from './poe-game'
export type CharacterProfileVisibility = 'group_only' | 'public'

export interface CharacterProfileSocket {
  group: number
  color: string | null
}

export interface CharacterProfileProperty {
  name: string
  values: string[]
}

export interface CharacterProfileEmbeddedGem {
  id: string | null
  name: string
  typeLine: string
  icon: string | null
  support: boolean
  level: number | null
  quality: string | null
}

export interface CharacterProfileItem {
  id: string | null
  slot: string | null
  name: string
  typeLine: string
  baseType: string | null
  icon: string | null
  rarity: string | null
  frameType: number | null
  itemLevel: number | null
  identified: boolean
  corrupted: boolean
  fractured: boolean
  synthesised: boolean
  veiled: boolean
  influences: string[]
  note: string | null
  width: number | null
  height: number | null
  sockets: CharacterProfileSocket[]
  socketedItems: CharacterProfileEmbeddedGem[]
  properties: CharacterProfileProperty[]
  requirements: CharacterProfileProperty[]
  implicitMods: string[]
  explicitMods: string[]
  craftedMods: string[]
  fracturedMods: string[]
  enchantMods: string[]
  veiledMods: string[]
  modifiers: string[]
}

export interface CharacterProfilePassiveTreeJewelDataEntry {
  socketIndex: number | null
  type: string | null
  radius: number | null
  radiusMin: number | null
  radiusVisual: string | null
  subgraphNodeIds: number[]
  subgraphGroupIds: number[]
}

export interface CharacterProfilePassiveTree {
  url: string | null
  version: string | null
  hashes: number[]
  hashesEx: number[]
  masteryEffects: number[]
  jewelData: CharacterProfilePassiveTreeJewelDataEntry[]
  classId: number | null
  ascendancyId: number | null
}

export interface CharacterProfileAtlasTree {
  url: string | null
  hashes: number[]
  league: string | null
}

export interface CharacterProfileSnapshot {
  id: string
  user_id: string
  group_id: string
  poe_account_name: string | null
  character_id: string | null
  character_name: string
  league: string | null
  class: string | null
  ascendancy_class: number | null
  level: number | null
  visibility: CharacterProfileVisibility
  gear: CharacterProfileItem[]
  inventory: CharacterProfileItem[]
  jewels: CharacterProfileItem[]
  passive_tree: CharacterProfilePassiveTree
  atlas_tree: CharacterProfileAtlasTree
  raw_character: Record<string, unknown>
  raw_league_account: Record<string, unknown>
  last_synced_at: string
}

const CLASS_IDS: Record<string, number> = {
  Scion: 0,
  Marauder: 1,
  Ranger: 2,
  Witch: 3,
  Duelist: 4,
  Templar: 5,
  Shadow: 6,
}

export const EQUIPMENT_SLOT_ORDER = [
  'Helm',
  'Weapon',
  'Amulet',
  'Offhand',
  'Gloves',
  'BodyArmour',
  'Ring',
  'Belt',
  'Ring2',
  'Boots',
  'Weapon2',
  'Offhand2',
] as const

const SLOT_LABELS: Record<string, string> = {
  Helm: 'Helmet',
  BodyArmour: 'Body Armour',
  Weapon: 'Main Hand',
  Offhand: 'Off Hand',
  Gloves: 'Gloves',
  Boots: 'Boots',
  Ring: 'Ring 1',
  Ring2: 'Ring 2',
  Weapon2: 'Swap Main',
  Offhand2: 'Swap Off Hand',
  Amulet: 'Amulet',
  Belt: 'Belt',
}

const POE1_ASCENDANCIES: Record<string, string[]> = {
  Marauder: ['Juggernaut', 'Berserker', 'Chieftain'],
  Ranger: ['Raider', 'Deadeye', 'Pathfinder'],
  Witch: ['Necromancer', 'Occultist', 'Elementalist'],
  Duelist: ['Slayer', 'Gladiator', 'Champion'],
  Templar: ['Inquisitor', 'Hierophant', 'Guardian'],
  Shadow: ['Assassin', 'Saboteur', 'Trickster'],
  Scion: ['Ascendant'],
}

const BLOODLINE_ASCENDANCY_BYTES: Record<string, number> = {
  'Chaos': 17,
  'Chaos Bloodline': 17,
  'Oshabi': 21,
  'Oshabi Bloodline': 21,
  'Nameless': 25,
  'Nameless Bloodline': 25,
  'Aul': 29,
  'Aul Bloodline': 29,
  'Lycia': 33,
  'Lycia Bloodline': 33,
  'Delirious': 37,
  'Delirious Bloodline': 37,
  'Olroth': 41,
  'Olroth Bloodline': 41,
  'Catarina': 45,
  'Catarina Bloodline': 45,
  'Farrul': 49,
  'Farrul Bloodline': 49,
  'Breachlord': 53,
  'Breachlord Bloodline': 53,
  'Saresh': 57,
  'Saresh Bloodline': 57,
}

const UINT16_MAX = 0xffff
const CLUSTER_NODE_OFFSET = 0x10000

export function getCharacterProfileSlotLabel(slot: string | null): string {
  if (!slot) return 'Unknown slot'
  return SLOT_LABELS[slot] ?? slot
}

export function getItemDisplayName(item: CharacterProfileItem): string {
  return item.name.trim() || item.typeLine.trim() || item.baseType?.trim() || 'Unknown item'
}

export function getFrameTypeLabel(frameType: number | null, rarity: string | null): string {
  if (rarity) return rarity
  switch (frameType) {
    case 0:
      return 'Normal'
    case 1:
      return 'Magic'
    case 2:
      return 'Rare'
    case 3:
      return 'Unique'
    case 4:
      return 'Gem'
    case 5:
      return 'Currency'
    case 6:
      return 'Divination Card'
    default:
      return 'Item'
  }
}

export function getAscendancyLabel(
  className: string | null,
  ascendancyClass: number | null,
  game: PoeGame = 'poe1',
): string | null {
  if (game !== 'poe1') return null
  if (!className || !ascendancyClass || ascendancyClass < 1) return null
  return POE1_ASCENDANCIES[className]?.[ascendancyClass - 1] ?? null
}

export function formatRelativeTimestamp(timestamp: string | null): string {
  if (!timestamp) return 'Never synced'
  const deltaMs = Date.now() - new Date(timestamp).getTime()
  if (!Number.isFinite(deltaMs) || deltaMs < 0) return 'Just now'

  const minutes = Math.floor(deltaMs / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`

  return new Date(timestamp).toLocaleDateString()
}

export function getSocketColorClass(color: string | null): string {
  switch (color) {
    case 'S':
      return 'bg-red-500'
    case 'D':
      return 'bg-green-500'
    case 'I':
      return 'bg-blue-500'
    case 'G':
      return 'bg-white'
    case 'A':
      return 'bg-amber-400'
    default:
      return 'bg-default-300'
  }
}

export function getCharacterClassId(className: string | null): number | null {
  if (!className) return null
  return CLASS_IDS[className] ?? null
}

export function hasPassiveTreeClusterSubgraphs(
  passiveTree: CharacterProfilePassiveTree | null | undefined,
): boolean {
  return passiveTree?.jewelData?.some((entry) => entry.subgraphNodeIds.length > 0) ?? false
}

export function countPassiveTreeClusterJewels(
  passiveTree: CharacterProfilePassiveTree | null | undefined,
): number {
  return passiveTree?.jewelData?.filter((entry) => entry.subgraphNodeIds.length > 0).length ?? 0
}

export function getBloodlineAscendancyByte(alternateAscendancy: string | null): number | null {
  if (!alternateAscendancy) return null
  return BLOODLINE_ASCENDANCY_BYTES[alternateAscendancy.trim()] ?? null
}

function pushUint16(bytes: number[], value: number): void {
  bytes.push((value >>> 8) & 0xff, value & 0xff)
}

function pushUint32(bytes: number[], value: number): void {
  bytes.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff)
}

function encodeClusterNodeId(value: number): number | null {
  if (!Number.isFinite(value)) return null
  const normalizedValue = Math.trunc(value)
  if (normalizedValue < 0) return null
  if (normalizedValue > UINT16_MAX) {
    return normalizedValue - CLUSTER_NODE_OFFSET
  }
  return normalizedValue
}

function toBase64Url(bytes: number[]): string {
  const binary = String.fromCharCode(...bytes)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_')
}

function encodeTreePayload({
  classId,
  ascendancyId,
  hashes,
  hashesEx,
  masteryEffects,
}: {
  classId: number
  ascendancyId: number
  hashes: number[]
  hashesEx: number[]
  masteryEffects: number[]
}): string | null {
  if (!Number.isFinite(classId) || !Number.isFinite(ascendancyId)) return null

  const filteredHashes = hashes.filter(
    (value) => Number.isFinite(value) && value >= 0 && value <= UINT16_MAX,
  )
  const filteredHashesEx = hashesEx
    .map(encodeClusterNodeId)
    .filter((value): value is number => value != null && value >= 0 && value <= UINT16_MAX)
  const filteredMasteries = masteryEffects.filter(
    (value) => Number.isFinite(value) && value >= 0 && value <= 0xffffffff,
  )

  if (filteredHashes.length > 255 || filteredHashesEx.length > 255 || filteredMasteries.length > 255) {
    return null
  }

  const bytes: number[] = []
  pushUint32(bytes, 6)
  bytes.push(classId & 0xff)
  bytes.push(ascendancyId & 0xff)
  bytes.push(filteredHashes.length & 0xff)
  filteredHashes.forEach((value) => pushUint16(bytes, value))
  bytes.push(filteredHashesEx.length & 0xff)
  filteredHashesEx.forEach((value) => pushUint16(bytes, value))
  bytes.push(filteredMasteries.length & 0xff)
  filteredMasteries.forEach((value) => pushUint32(bytes, value))
  return toBase64Url(bytes)
}

export function buildPassiveTreeUrl({
  game = 'poe1',
  gameVersion,
  classId,
  ascendancyId,
  alternateAscendancy = null,
  hashes,
  hashesEx,
  masteryEffects,
}: {
  game?: PoeGame
  gameVersion: string | null
  classId: number | null
  ascendancyId: number | null
  alternateAscendancy?: string | null
  hashes: number[]
  hashesEx: number[]
  masteryEffects: number[]
}): string | null {
  if (game !== 'poe1') return null
  if (!gameVersion || classId == null || !hashes.length) return null
  const encodedAscendancyId = getBloodlineAscendancyByte(alternateAscendancy) ?? ascendancyId ?? 0
  const payload = encodeTreePayload({
    classId,
    ascendancyId: encodedAscendancyId,
    hashes,
    hashesEx,
    masteryEffects,
  })
  if (!payload) return null
  return `https://www.pathofexile.com/fullscreen-passive-skill-tree/${gameVersion}/${payload}`
}

export function addPassiveTreeProfileContext(
  url: string | null,
  {
    accountName,
    characterName,
    realm = 'pc',
  }: {
    accountName?: string | null
    characterName?: string | null
    realm?: string | null
  },
): string | null {
  if (!url) return null
  if (!accountName?.trim() || !characterName?.trim()) return url

  try {
    const parsedUrl = new URL(url)
    parsedUrl.searchParams.set('accountName', accountName.trim())
    parsedUrl.searchParams.set('characterName', characterName.trim())
    parsedUrl.searchParams.set('realm', realm?.trim() || 'pc')
    return parsedUrl.toString()
  } catch {
    return url
  }
}

export function buildAtlasTreeUrl({
  game = 'poe1',
  league,
  hashes,
}: {
  game?: PoeGame
  league: string | null
  hashes: number[]
}): string | null {
  if (game !== 'poe1') return null
  if (!hashes.length) return null
  const payload = encodeTreePayload({
    classId: 0,
    ascendancyId: 0,
    hashes,
    hashesEx: [],
    masteryEffects: [],
  })
  if (!payload) return null
  const ruthlessPrefix = league?.toLowerCase().includes('ruthless') ? 'ruthless/' : ''
  return `https://www.pathofexile.com/fullscreen-atlas-skill-tree/${ruthlessPrefix}${payload}`
}
