import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { PoeItem, PoeProperty } from '../types/poe-api'
import { supabase } from '../lib/supabase'
import { queryKeys } from '../lib/queryKeys'
import type {
  CharacterProfileEmbeddedGem,
  CharacterProfileItem,
  CharacterProfilePassiveTree,
  CharacterProfileProperty,
  CharacterProfileSnapshot,
  CharacterProfileSocket,
} from '../lib/character-profile'
import { fetchPoeCharacterItems, fetchPoeCharacterPassiveTree } from '../lib/poe-cookie-client'
import { normalizeCharacterClassInfo } from '../lib/poe-character-class'
import { asRecord } from '../lib/parse-helpers'
import { usePoeSession } from '../store/poe-session-store'
import { useMyProfile } from './useCurrentUser'
import { useActiveGroupContext } from './useGroups'
type CharacterProfileRow = Omit<
  CharacterProfileSnapshot,
  'poe_account_name' | 'raw_character' | 'raw_league_account'
> & {
  user?: {
    poe_account_name?: string | null
  } | null
  raw_character: Record<string, unknown> | null
  raw_league_account: Record<string, unknown> | null
}

export interface CharacterProfileDailySnapshotSummary {
  id: string
  snapshot_date: string
  last_synced_at: string
  character_name: string
  class: string | null
  ascendancy_class: number | null
  level: number | null
}

type ActiveCharacterRow = {
  id: string
  name: string
  league: string | null
  class: string | null
  ascendancy_class: number | null
  level: number
}

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
const CLASS_IDS: Record<string, number> = {
  Scion: 0,
  Marauder: 1,
  Ranger: 2,
  Witch: 3,
  Duelist: 4,
  Templar: 5,
  Shadow: 6,
}
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

function compareNullableStrings(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  return (a ?? '').localeCompare(b ?? '')
}

function compareNullableNumbers(
  a: number | null | undefined,
  b: number | null | undefined,
): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return a - b
}

function sortNumberArray(values: number[]): number[] {
  return [...values].sort((a, b) => a - b)
}

function sortStringArray(values: string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b))
}

function compareEmbeddedGems(
  a: CharacterProfileEmbeddedGem,
  b: CharacterProfileEmbeddedGem,
): number {
  return (
    compareNullableStrings(a.id, b.id) ||
    compareNullableStrings(a.name, b.name) ||
    compareNullableStrings(a.typeLine, b.typeLine) ||
    Number(a.support) - Number(b.support) ||
    compareNullableNumbers(a.level, b.level) ||
    compareNullableStrings(a.quality, b.quality)
  )
}

function compareProfileItems(a: CharacterProfileItem, b: CharacterProfileItem): number {
  const slotRankA = a.slot ? (EQUIPMENT_SLOT_SORT_ORDER.get(a.slot) ?? 99) : 99
  const slotRankB = b.slot ? (EQUIPMENT_SLOT_SORT_ORDER.get(b.slot) ?? 99) : 99

  return (
    slotRankA - slotRankB ||
    compareNullableStrings(a.slot, b.slot) ||
    compareNullableStrings(a.id, b.id) ||
    compareNullableStrings(a.name, b.name) ||
    compareNullableStrings(a.typeLine, b.typeLine) ||
    compareNullableNumbers(a.itemLevel, b.itemLevel)
  )
}

function toCharacterProfile(row: CharacterProfileRow): CharacterProfileSnapshot {
  const rawCharacter = row.raw_character ?? {}
  const storedPassiveTree = asRecord(row.passive_tree)
  const rawPassiveTree = asRecord(asRecord(rawCharacter).passive_tree)
  return {
    ...row,
    poe_account_name: row.user?.poe_account_name ?? null,
    passive_tree: normalizePassiveTree(
      {
        ...rawPassiveTree,
        ...storedPassiveTree,
        passives: {
          ...asRecord(rawPassiveTree.passives),
          ...asRecord(storedPassiveTree.passives),
        },
        metadata: {
          ...asRecord(rawPassiveTree.metadata),
          ...asRecord(storedPassiveTree.metadata),
        },
      },
      {
        id: row.character_id ?? row.id,
        name: row.character_name,
        league: row.league,
        class: row.class,
        ascendancy_class: row.ascendancy_class,
        level: row.level ?? 0,
      },
    ),
    raw_character: rawCharacter,
    raw_league_account: row.raw_league_account ?? {},
  }
}

function toCharacterProfileDailySnapshotSummary(
  row: Record<string, unknown>,
): CharacterProfileDailySnapshotSummary {
  return {
    id: String(row.id),
    snapshot_date: String(row.snapshot_date ?? ''),
    last_synced_at: String(row.last_synced_at ?? new Date(0).toISOString()),
    character_name: String(row.character_name ?? 'Unknown character'),
    class: typeof row.class === 'string' ? row.class : null,
    ascendancy_class: row.ascendancy_class == null ? null : Number(row.ascendancy_class),
    level: row.level == null ? null : Number(row.level),
  }
}

function readNumberArray(record: Record<string, unknown>, ...keys: string[]): number[] {
  for (const key of keys) {
    const value = record[key]
    if (Array.isArray(value)) {
      return value
        .map((entry) => (typeof entry === 'number' ? entry : Number(entry)))
        .filter((entry) => Number.isFinite(entry))
    }
  }
  return []
}

function readNumber(record: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key]
    const parsedValue = typeof value === 'number' ? value : Number(value)
    if (Number.isFinite(parsedValue)) return parsedValue
  }
  return null
}

function readString(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
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
          return (((effect & 0xffff) << 16) | (node & 0xffff)) >>> 0
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
  passiveTree: Record<string, unknown>,
  passives: Record<string, unknown>,
): CharacterProfilePassiveTree['jewelData'] {
  const topLevelSnake = asRecord(passiveTree.jewel_data)
  const topLevelCamel = asRecord(passiveTree.jewelData)
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
    .sort((left, right) => compareNullableNumbers(left.socketIndex, right.socketIndex))
}

function normalizeModifierLines(lines: string[] | undefined): string[] {
  return (lines ?? []).filter((line) => typeof line === 'string' && line.trim().length > 0)
}

function mapVeiledMods(item: PoeItem): string[] {
  return normalizeModifierLines(item.veiledMods).map((mod) => {
    if (mod.startsWith('Prefix')) return 'Veiled Prefix'
    if (mod.startsWith('Suffix')) return 'Veiled Suffix'
    return 'Veiled Modifier'
  })
}

function collectModifierLines(item: PoeItem): string[] {
  return [
    ...normalizeModifierLines(item.enchantMods),
    ...normalizeModifierLines(item.implicitMods),
    ...normalizeModifierLines(item.fracturedMods),
    ...normalizeModifierLines(item.explicitMods),
    ...normalizeModifierLines(item.craftedMods),
    ...mapVeiledMods(item),
  ].slice(0, 8)
}

function mapProperty(property: PoeProperty): CharacterProfileProperty {
  return {
    name: property.name,
    values: (property.values ?? []).map(([value]) => value),
  }
}

function mapSockets(item: PoeItem): CharacterProfileSocket[] {
  return (item.sockets ?? []).map((socket) => ({
    group: socket.group,
    color: socket.sColour ?? socket.attr ?? null,
  }))
}

function findPropertyValue(item: PoeItem, name: string): string | null {
  const match = (item.properties ?? []).find((property) => property.name === name)
  return match?.values?.[0]?.[0] ?? null
}

function mapSocketedItems(item: PoeItem): CharacterProfileEmbeddedGem[] {
  return (item.socketedItems ?? [])
    .map((socketedItem) => ({
      id: socketedItem.id ?? null,
      name: socketedItem.name ?? '',
      typeLine: socketedItem.typeLine ?? '',
      icon: socketedItem.icon ?? null,
      support: !!socketedItem.support,
      level: Number(findPropertyValue(socketedItem, 'Level')) || null,
      quality: findPropertyValue(socketedItem, 'Quality'),
    }))
    .sort(compareEmbeddedGems)
}

function mapItem(item: PoeItem): CharacterProfileItem {
  return {
    id: item.id ?? null,
    slot: item.inventoryId ?? null,
    name: item.name ?? '',
    typeLine: item.typeLine ?? '',
    baseType: item.baseType ?? null,
    icon: item.icon ?? null,
    rarity: item.rarity ?? null,
    frameType: typeof item.frameType === 'number' ? item.frameType : null,
    itemLevel:
      typeof item.ilvl === 'number'
        ? item.ilvl
        : typeof item.itemLevel === 'number'
          ? item.itemLevel
          : null,
    identified: !!item.identified,
    corrupted: !!item.corrupted,
    fractured: !!item.fractured,
    synthesised: !!item.synthesised,
    veiled: !!item.veiled || (item.veiledMods?.length ?? 0) > 0,
    influences: sortStringArray(
      Object.entries(item.influences ?? {})
        .filter(([, active]) => !!active)
        .map(([name]) => name),
    ),
    note: item.note ?? null,
    width: item.w ?? null,
    height: item.h ?? null,
    sockets: mapSockets(item),
    socketedItems: mapSocketedItems(item),
    properties: (item.properties ?? []).map(mapProperty).slice(0, 5),
    requirements: (item.requirements ?? []).map(mapProperty).slice(0, 4),
    implicitMods: normalizeModifierLines(item.implicitMods),
    explicitMods: normalizeModifierLines(item.explicitMods),
    craftedMods: normalizeModifierLines(item.craftedMods),
    fracturedMods: normalizeModifierLines(item.fracturedMods),
    enchantMods: normalizeModifierLines(item.enchantMods),
    veiledMods: mapVeiledMods(item),
    modifiers: collectModifierLines(item),
  }
}

function normalizeItemGroups(items: PoeItem[]) {
  const gear: CharacterProfileItem[] = []
  const inventory: CharacterProfileItem[] = []
  const jewels: CharacterProfileItem[] = []

  for (const item of items) {
    const slot = item.inventoryId ?? ''
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

function normalizePassiveTree(
  passiveTree: Record<string, unknown>,
  activeCharacter: ActiveCharacterRow,
): CharacterProfilePassiveTree {
  const passives = asRecord(passiveTree.passives)
  const metadata = asRecord(passiveTree.metadata)
  const passivesHashes = readNumberArray(passives, 'hashes', 'passiveSkills')
  const passivesHashesEx = readNumberArray(passives, 'hashes_ex', 'hashesEx')
  const treeMasteryPairs = readNumberArray(
    passiveTree,
    'mastery_effect_pairs',
    'masteryEffectPairs',
    'masteryEffects',
  )
  const passivesMasteryPairs = readNumberArray(passives, 'mastery_effect_pairs', 'masteryEffectPairs')
  return {
    url: readString(
      passiveTree,
      'passive_tree_url',
      'passiveTreeUrl',
      'passive_skill_tree_url',
      'url',
    ),
    version:
      readString(metadata, 'version') ??
      readString(passiveTree, 'version', 'treeVersion', 'gameVersion'),
    hashes: sortNumberArray(
      passivesHashes.length > 0
        ? passivesHashes
        : readNumberArray(passiveTree, 'hashes', 'passiveSkills'),
    ),
    hashesEx: sortNumberArray(
      passivesHashesEx.length > 0
        ? passivesHashesEx
        : readNumberArray(passiveTree, 'hashes_ex', 'hashesEx'),
    ),
    masteryEffects: sortNumberArray(
      treeMasteryPairs.length > 0
        ? treeMasteryPairs
        : passivesMasteryPairs.length > 0
          ? passivesMasteryPairs
          : [
              ...packMasteryEffectPairs(passiveTree, 'mastery_effects', 'masteryEffects'),
              ...packMasteryEffectPairs(passives, 'mastery_effects', 'masteryEffects'),
            ],
    ),
    jewelData: normalizePassiveTreeJewelData(passiveTree, passives),
    classId: activeCharacter.class ? (CLASS_IDS[activeCharacter.class] ?? null) : null,
    ascendancyId: activeCharacter.ascendancy_class ?? null,
  }
}

export function useCharacterProfiles(groupId: string | null) {
  return useQuery({
    queryKey: [...queryKeys.characterProfiles.group(groupId)],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('character_profile_snapshots')
        .select(
          'id, user_id, group_id, character_id, character_name, league, class, ascendancy_class, level, visibility, gear, inventory, jewels, passive_tree, atlas_tree, raw_character, raw_league_account, last_synced_at, user:users(poe_account_name)',
        )
        .eq('group_id', groupId!)
        .order('character_name', { ascending: true })

      if (error) throw error
      return ((data ?? []) as CharacterProfileRow[]).map(toCharacterProfile)
    },
  })
}

export function useCharacterProfileDailySnapshotSummaries(
  groupId: string | null,
  profileId: string | null,
  characterId: string | null,
) {
  return useQuery({
    queryKey: [...queryKeys.characterProfiles.dailySummaries(groupId, profileId, characterId)],
    enabled: !!groupId && !!profileId && !!characterId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('character_profile_daily_snapshots')
        .select('id, snapshot_date, last_synced_at, character_name, class, ascendancy_class, level')
        .eq('group_id', groupId!)
        .eq('profile_id', profileId!)
        .eq('character_id', characterId!)
        .order('snapshot_date', { ascending: false })
        .order('last_synced_at', { ascending: false })
        .limit(14)

      if (error) throw error
      return ((data ?? []) as Record<string, unknown>[]).map(toCharacterProfileDailySnapshotSummary)
    },
  })
}

export function useCharacterProfileDailySnapshotDetail(
  groupId: string | null,
  dailySnapshotId: string | null,
) {
  return useQuery({
    queryKey: [...queryKeys.characterProfiles.dailyDetail(groupId, dailySnapshotId)],
    enabled: !!groupId && !!dailySnapshotId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('character_profile_daily_snapshots')
        .select(
          'id, user_id, group_id, character_id, character_name, league, class, ascendancy_class, level, visibility, gear, inventory, jewels, passive_tree, atlas_tree, raw_character, raw_league_account, last_synced_at, user:users(poe_account_name)',
        )
        .eq('group_id', groupId!)
        .eq('id', dailySnapshotId!)
        .maybeSingle()

      if (error) throw error
      return data ? toCharacterProfile(data as CharacterProfileRow) : null
    },
  })
}

export function useSyncCharacterProfile() {
  const queryClient = useQueryClient()
  const { data: profile } = useMyProfile()
  const { sessId, cfClearance, accountName } = usePoeSession()
  const { game } = useActiveGroupContext()

  return useMutation({
    mutationFn: async ({
      groupId,
      characterId,
    }: {
      groupId: string
      characterId?: string | null
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      let characterQuery = supabase
        .from('characters')
        .select('id, name, league, class, ascendancy_class, level')
        .eq('group_id', groupId)
        .eq('user_id', user.id)
      if (characterId) {
        characterQuery = characterQuery.eq('id', characterId)
      } else {
        characterQuery = characterQuery.eq('is_active', true)
      }

      const { data: activeCharacter, error: activeCharacterError } =
        await characterQuery.maybeSingle()

      if (activeCharacterError) throw activeCharacterError
      if (!activeCharacter) {
        if (characterId) {
          throw new Error('Character profile sync could not find the selected character.')
        }
        return
      }

      const { data: existingProfile } = await supabase
        .from('character_profile_snapshots')
        .select('visibility')
        .eq('user_id', user.id)
        .eq('group_id', groupId)
        .eq('character_id', activeCharacter.id)
        .maybeSingle()

      const visibility = existingProfile?.visibility === 'public' ? 'public' : 'group_only'

      if (profile?.poe_token_expires_at) {
        const { error } = await supabase.functions.invoke('poe-sync-character-profile', {
          body: { group_id: groupId, character_id: activeCharacter.id },
        })
        if (error) throw error
        return
      }

      if (!sessId || !accountName) {
        throw new Error('Character profile sync requires either PoE OAuth or a session cookie.')
      }

      if (game === 'poe2') {
        throw new Error('Path of Exile 2 character profile sync currently requires OAuth access.')
      }

      const [items, passiveTree] = await Promise.all([
        fetchPoeCharacterItems(accountName, sessId, cfClearance, activeCharacter.name),
        fetchPoeCharacterPassiveTree(accountName, sessId, cfClearance, activeCharacter.name),
      ])
      const normalized = normalizeCharacterClassInfo(
        game ?? 'poe1',
        activeCharacter.class,
        activeCharacter.ascendancy_class,
      )
      const { gear, inventory, jewels } = normalizeItemGroups(items)

      const { error: upsertError } = await supabase.from('character_profile_snapshots').upsert(
        {
          user_id: user.id,
          group_id: groupId,
          character_id: activeCharacter.id,
          character_name: activeCharacter.name,
          league: activeCharacter.league,
          class: normalized.className,
          ascendancy_class: normalized.ascendancyClass,
          level: activeCharacter.level,
          visibility,
          gear,
          inventory,
          jewels,
          passive_tree: normalizePassiveTree(passiveTree, {
            ...activeCharacter,
            class: normalized.className ?? activeCharacter.class,
            ascendancy_class: normalized.ascendancyClass,
          }),
          atlas_tree: {
            url: null,
            hashes: [],
            league: activeCharacter.league,
          },
          raw_character: {
            items,
            passive_tree: passiveTree,
          },
          raw_league_account: {},
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,group_id,character_id' },
      )

      if (upsertError) throw upsertError
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.characterProfiles.root],
      })
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.characters.active(variables.groupId)],
      })
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.gearOptimizer.root],
      })
    },
  })
}

export function useUpdateCharacterProfileVisibility() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      groupId,
      profileId,
      visibility,
    }: {
      groupId: string
      profileId: string
      visibility: 'group_only' | 'public'
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { error } = await supabase
        .from('character_profile_snapshots')
        .update({ visibility })
        .eq('id', profileId)
        .eq('group_id', groupId)
        .eq('user_id', user.id)

      if (error) throw error
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.characterProfiles.group(variables.groupId)],
      })
      queryClient.invalidateQueries({ queryKey: ['public-directory'] })
    },
  })
}
