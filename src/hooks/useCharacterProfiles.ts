import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { queryKeys } from '../lib/queryKeys'
import type { CharacterProfilePassiveTree, CharacterProfileSnapshot } from '../lib/character-profile'
import { asRecord } from '../lib/parse-helpers'
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

const CLASS_IDS: Record<string, number> = {
  Scion: 0,
  Marauder: 1,
  Ranger: 2,
  Witch: 3,
  Duelist: 4,
  Templar: 5,
  Shadow: 6,
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

      const { error } = await supabase.functions.invoke('poe-sync-character-profile', {
        body: { group_id: groupId, character_id: activeCharacter.id },
      })
      if (error) throw error
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
