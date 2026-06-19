import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { queryKeys } from '../lib/queryKeys'
import type { CharacterProfileSnapshot } from '../lib/character-profile'
import { normalizePoeGame, type PoeGame } from '../lib/poe-game'
export interface PublicCharacterSearchResult {
  profile_id: string
  group_id: string
  group_name: string
  group_game: PoeGame | null
  owner_name: string
  character_name: string
  class: string | null
  ascendancy_class: number | null
  level: number | null
  league: string | null
}

export interface PublicGroupCharacterSummary {
  profile_id: string
  character_name: string
  class: string | null
  ascendancy_class: number | null
  level: number | null
  owner_name: string
}

export interface PublicGroupSearchResult {
  group_id: string
  group_name: string
  game: PoeGame | null
  league: string
  public_character_count: number
  characters: PublicGroupCharacterSummary[]
}

export interface PublicGroupDetail {
  group_id: string
  group_name: string
  game: PoeGame | null
  league: string
  public_character_count: number
}

export interface PublicGroupMemberCharacter {
  profile_id: string
  owner_name: string
  character_name: string
  class: string | null
  ascendancy_class: number | null
  level: number | null
}

export interface PublicCharacterDetail extends CharacterProfileSnapshot {
  group_name: string
  group_game?: PoeGame | null
  owner_name: string
}

export interface PublicCharacterDailySnapshotSummary {
  id: string
  snapshot_date: string
  last_synced_at: string
  character_name: string
  class: string | null
  ascendancy_class: number | null
  level: number | null
}

type PublicDirectoryViewTargetType = 'character' | 'group'

const recordedDirectoryViews = new Set<string>()

function toPublicCharacterSearchResult(row: Record<string, unknown>): PublicCharacterSearchResult {
  return {
    profile_id: String(row.profile_id),
    group_id: String(row.group_id),
    group_name: String(row.group_name ?? 'Unknown group'),
    group_game: row.group_game == null ? null : normalizePoeGame(row.group_game),
    owner_name: String(row.owner_name ?? 'Unknown'),
    character_name: String(row.character_name ?? 'Unknown character'),
    class: typeof row.class === 'string' ? row.class : null,
    ascendancy_class: row.ascendancy_class == null ? null : Number(row.ascendancy_class),
    level: row.level == null ? null : Number(row.level),
    league: typeof row.league === 'string' ? row.league : null,
  }
}

function toPublicGroupSearchResult(row: Record<string, unknown>): PublicGroupSearchResult {
  return {
    group_id: String(row.group_id),
    group_name: String(row.group_name ?? 'Unknown group'),
    game: row.game == null ? null : normalizePoeGame(row.game),
    league: String(row.league ?? ''),
    public_character_count: Number(row.public_character_count ?? 0),
    characters: Array.isArray(row.characters)
      ? (row.characters as PublicGroupCharacterSummary[]).map((character) => ({
          profile_id: String(character.profile_id),
          character_name: String(character.character_name),
          class: character.class ?? null,
          ascendancy_class:
            character.ascendancy_class == null ? null : Number(character.ascendancy_class),
          level: character.level == null ? null : Number(character.level),
          owner_name: String(character.owner_name ?? 'Unknown'),
        }))
      : [],
  }
}

function toPublicCharacterDetail(row: Record<string, unknown>): PublicCharacterDetail {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    group_id: String(row.group_id),
    poe_account_name: null,
    group_name: String(row.group_name ?? 'Unknown group'),
    group_game: row.group_game == null ? null : normalizePoeGame(row.group_game),
    owner_name: String(row.owner_name ?? 'Unknown'),
    character_id: typeof row.character_id === 'string' ? row.character_id : null,
    character_name: String(row.character_name ?? 'Unknown character'),
    league: typeof row.league === 'string' ? row.league : null,
    class: typeof row.class === 'string' ? row.class : null,
    ascendancy_class: row.ascendancy_class == null ? null : Number(row.ascendancy_class),
    level: row.level == null ? null : Number(row.level),
    visibility: row.visibility === 'public' ? 'public' : 'group_only',
    gear: Array.isArray(row.gear) ? row.gear : [],
    inventory: Array.isArray(row.inventory) ? row.inventory : [],
    jewels: Array.isArray(row.jewels) ? row.jewels : [],
    passive_tree:
      row.passive_tree && typeof row.passive_tree === 'object'
        ? (row.passive_tree as CharacterProfileSnapshot['passive_tree'])
        : {
            url: null,
            version: null,
            hashes: [],
            hashesEx: [],
            masteryEffects: [],
            jewelData: [],
            classId: null,
            ascendancyId: null,
          },
    atlas_tree:
      row.atlas_tree && typeof row.atlas_tree === 'object'
        ? (row.atlas_tree as CharacterProfileSnapshot['atlas_tree'])
        : {
            url: null,
            hashes: [],
            league: null,
          },
    raw_character:
      row.raw_character && typeof row.raw_character === 'object'
        ? (row.raw_character as Record<string, unknown>)
        : {},
    raw_league_account:
      row.raw_league_account && typeof row.raw_league_account === 'object'
        ? (row.raw_league_account as Record<string, unknown>)
        : {},
    last_synced_at: String(row.last_synced_at ?? new Date(0).toISOString()),
  }
}

function toPublicCharacterDailySnapshotSummary(
  row: Record<string, unknown>,
): PublicCharacterDailySnapshotSummary {
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

export function usePublicCharacterSearch(groupId: string | null, query: string) {
  return useQuery({
    queryKey: [...queryKeys.publicDirectory.characters(groupId, query)],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('search_public_characters', {
        p_viewer_group_id: groupId!,
        p_query: query,
      })

      if (error) throw error
      return ((data ?? []) as Record<string, unknown>[]).map(toPublicCharacterSearchResult)
    },
  })
}

export function usePublicGroupSearch(groupId: string | null, query: string) {
  return useQuery({
    queryKey: [...queryKeys.publicDirectory.groups(groupId, query)],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('search_public_groups', {
        p_viewer_group_id: groupId!,
        p_query: query,
      })

      if (error) throw error
      return ((data ?? []) as Record<string, unknown>[]).map(toPublicGroupSearchResult)
    },
  })
}

export function usePublicGroupDetail(groupId: string | null, publicGroupId: string | null) {
  return useQuery({
    queryKey: [...queryKeys.publicDirectory.groupDetail(groupId, publicGroupId)],
    enabled: !!groupId && !!publicGroupId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_public_group_detail', {
        p_viewer_group_id: groupId!,
        p_group_id: publicGroupId!,
      })

      if (error) throw error
      const row = Array.isArray(data) ? data[0] : null
      if (!row) return null

      return {
        group_id: String((row as Record<string, unknown>).group_id),
        group_name: String((row as Record<string, unknown>).group_name ?? 'Unknown group'),
        game:
          (row as Record<string, unknown>).game == null
            ? null
            : normalizePoeGame((row as Record<string, unknown>).game),
        league: String((row as Record<string, unknown>).league ?? ''),
        public_character_count: Number(
          (row as Record<string, unknown>).public_character_count ?? 0,
        ),
      } as PublicGroupDetail
    },
  })
}

export function useGuestPublicGroupDetail(publicGroupId: string | null) {
  return useQuery({
    queryKey: [...queryKeys.preview.groupDetail(publicGroupId)],
    enabled: !!publicGroupId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_public_group_detail_preview', {
        p_group_id: publicGroupId!,
      })

      if (error) throw error
      const row = Array.isArray(data) ? data[0] : null
      if (!row) return null

      return {
        group_id: String((row as Record<string, unknown>).group_id),
        group_name: String((row as Record<string, unknown>).group_name ?? 'Unknown group'),
        game:
          (row as Record<string, unknown>).game == null
            ? null
            : normalizePoeGame((row as Record<string, unknown>).game),
        league: String((row as Record<string, unknown>).league ?? ''),
        public_character_count: Number(
          (row as Record<string, unknown>).public_character_count ?? 0,
        ),
      } as PublicGroupDetail
    },
  })
}

export function usePublicCharacterDetail(groupId: string | null, profileId: string | null) {
  return useQuery({
    queryKey: [...queryKeys.publicDirectory.characterDetail(groupId, profileId)],
    enabled: !!groupId && !!profileId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_public_character_detail', {
        p_viewer_group_id: groupId!,
        p_profile_id: profileId!,
      })

      if (error) throw error
      const row = Array.isArray(data) ? data[0] : null
      return row ? toPublicCharacterDetail(row as Record<string, unknown>) : null
    },
  })
}

export function useGuestPublicCharacterDetail(profileId: string | null) {
  return useQuery({
    queryKey: [...queryKeys.preview.characterDetail(profileId)],
    enabled: !!profileId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_public_character_detail_preview', {
        p_profile_id: profileId!,
      })

      if (error) throw error
      const row = Array.isArray(data) ? data[0] : null
      return row ? toPublicCharacterDetail(row as Record<string, unknown>) : null
    },
  })
}

export function usePublicCharacterDailySnapshotSummaries(
  groupId: string | null,
  profileId: string | null,
) {
  return useQuery({
    queryKey: [...queryKeys.publicDirectory.characterDailySummaries(groupId, profileId)],
    enabled: !!groupId && !!profileId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_public_character_daily_snapshot_summaries', {
        p_viewer_group_id: groupId!,
        p_profile_id: profileId!,
      })

      if (error) throw error
      return ((data ?? []) as Record<string, unknown>[]).map(toPublicCharacterDailySnapshotSummary)
    },
  })
}

export function useGuestPublicCharacterDailySnapshotSummaries(profileId: string | null) {
  return useQuery({
    queryKey: [...queryKeys.preview.characterDailySummaries(profileId)],
    enabled: !!profileId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        'get_public_character_daily_snapshot_summaries_preview',
        {
          p_profile_id: profileId!,
        },
      )

      if (error) throw error
      return ((data ?? []) as Record<string, unknown>[]).map(toPublicCharacterDailySnapshotSummary)
    },
  })
}

export function usePublicCharacterDailySnapshotDetail(
  groupId: string | null,
  profileId: string | null,
  dailySnapshotId: string | null,
) {
  return useQuery({
    queryKey: [
      ...queryKeys.publicDirectory.characterDailyDetail(groupId, profileId, dailySnapshotId),
    ],
    enabled: !!groupId && !!profileId && !!dailySnapshotId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_public_character_daily_snapshot_detail', {
        p_viewer_group_id: groupId!,
        p_profile_id: profileId!,
        p_daily_snapshot_id: dailySnapshotId!,
      })

      if (error) throw error
      const row = Array.isArray(data) ? data[0] : null
      return row ? toPublicCharacterDetail(row as Record<string, unknown>) : null
    },
  })
}

export function useGuestPublicCharacterDailySnapshotDetail(
  profileId: string | null,
  dailySnapshotId: string | null,
) {
  return useQuery({
    queryKey: [...queryKeys.preview.characterDailyDetail(profileId, dailySnapshotId)],
    enabled: !!profileId && !!dailySnapshotId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        'get_public_character_daily_snapshot_detail_preview',
        {
          p_profile_id: profileId!,
          p_daily_snapshot_id: dailySnapshotId!,
        },
      )

      if (error) throw error
      const row = Array.isArray(data) ? data[0] : null
      return row ? toPublicCharacterDetail(row as Record<string, unknown>) : null
    },
  })
}

export function usePublicGroupCharacters(
  groupId: string | null,
  publicGroupId: string | null,
  excludeProfileId?: string | null,
) {
  return useQuery({
    queryKey: [
      ...queryKeys.publicDirectory.groupCharacters(groupId, publicGroupId, excludeProfileId),
    ],
    enabled: !!groupId && !!publicGroupId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_public_group_characters', {
        p_viewer_group_id: groupId!,
        p_group_id: publicGroupId!,
        p_exclude_profile_id: excludeProfileId ?? null,
      })

      if (error) throw error
      return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
        profile_id: String(row.profile_id),
        owner_name: String(row.owner_name ?? 'Unknown'),
        character_name: String(row.character_name ?? 'Unknown character'),
        class: typeof row.class === 'string' ? row.class : null,
        ascendancy_class: row.ascendancy_class == null ? null : Number(row.ascendancy_class),
        level: row.level == null ? null : Number(row.level),
      })) as PublicGroupMemberCharacter[]
    },
  })
}

export function useGuestPublicGroupCharacters(
  publicGroupId: string | null,
  excludeProfileId?: string | null,
) {
  return useQuery({
    queryKey: [...queryKeys.preview.groupCharacters(publicGroupId, excludeProfileId)],
    enabled: !!publicGroupId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_public_group_characters_preview', {
        p_group_id: publicGroupId!,
        p_exclude_profile_id: excludeProfileId ?? null,
      })

      if (error) throw error
      return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
        profile_id: String(row.profile_id),
        owner_name: String(row.owner_name ?? 'Unknown'),
        character_name: String(row.character_name ?? 'Unknown character'),
        class: typeof row.class === 'string' ? row.class : null,
        ascendancy_class: row.ascendancy_class == null ? null : Number(row.ascendancy_class),
        level: row.level == null ? null : Number(row.level),
      })) as PublicGroupMemberCharacter[]
    },
  })
}

export function useRecordPublicDirectoryView(
  targetType: PublicDirectoryViewTargetType,
  targetId: string | null,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled || !targetId) return

    const viewKey = `${targetType}:${targetId}`
    const storageKey = `poe-party:public-directory-view:${viewKey}`
    if (recordedDirectoryViews.has(viewKey)) return

    try {
      if (window.sessionStorage.getItem(storageKey)) {
        recordedDirectoryViews.add(viewKey)
        return
      }
      window.sessionStorage.setItem(storageKey, '1')
    } catch {
      // Ignore unavailable storage and fall back to in-memory de-duping.
    }

    recordedDirectoryViews.add(viewKey)
    void supabase
      .rpc('record_public_directory_view', {
        p_target_type: targetType,
        p_target_id: targetId,
      })
      .then(({ error }) => {
        if (error) {
          console.warn('Failed to record public directory view:', error)
        }
      })
  }, [enabled, targetId, targetType])
}
