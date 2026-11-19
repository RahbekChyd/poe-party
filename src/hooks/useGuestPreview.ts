import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { queryKeys } from '../lib/queryKeys'
import type { PoeGame } from '../lib/poe-game'
import { normalizeThreads, type Thread } from '../lib/strategy-threads'
import { normalizeScarabs, type Scarab } from '../lib/strategy-scarabs'
import type { MapRequirements } from './useStrategies'
import {
  normalizeStrategyContentMetadata,
  type StrategyContentMetadata,
} from '../lib/public-strategy-content'
export interface GuestPublicStrategyPreview {
  id: string
  group_id: string
  group_name: string
  group_game: PoeGame | null
  group_league: string
  name: string
  description: string | null
  colour: string
  difficulty: 'easy' | 'normal' | 'hard'
  created_at: string
  atlas_tree_url: string | null
  scarabs: Scarab[]
  threads: Thread[]
  map_trade_link: string | null
  map_requirements: MapRequirements
  map_cost: number | null
  content_slug: string | null
  content_metadata: StrategyContentMetadata | null
  benchmark_sample_count: number
  benchmark_chaos_per_hour: number | null
}

export interface GuestPublicCharacterSearchResult {
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

export interface GuestPublicGroupCharacterSummary {
  profile_id: string
  character_name: string
  class: string | null
  ascendancy_class: number | null
  level: number | null
  owner_name: string
}

export interface GuestPublicGroupSearchResult {
  group_id: string
  group_name: string
  game: PoeGame | null
  league: string
  public_character_count: number
  characters: GuestPublicGroupCharacterSummary[]
}

function normalizeGuestStrategy(row: Record<string, unknown>): GuestPublicStrategyPreview {
  return {
    id: String(row.id),
    group_id: String(row.group_id),
    group_name: String(row.group_name ?? 'Unknown group'),
    group_game: row.group_game === 'poe2' ? 'poe2' : 'poe1',
    group_league: String(row.group_league ?? ''),
    name: String(row.name ?? 'Unnamed strategy'),
    description: typeof row.description === 'string' ? row.description : null,
    colour: String(row.colour ?? '#f5a524'),
    difficulty: (row.difficulty as GuestPublicStrategyPreview['difficulty']) ?? 'normal',
    created_at: String(row.created_at ?? new Date(0).toISOString()),
    atlas_tree_url: typeof row.atlas_tree_url === 'string' ? row.atlas_tree_url : null,
    scarabs: normalizeScarabs(row.scarabs),
    threads: normalizeThreads(row.threads),
    map_trade_link: typeof row.map_trade_link === 'string' ? row.map_trade_link : null,
    map_requirements:
      row.map_requirements && typeof row.map_requirements === 'object'
        ? (row.map_requirements as MapRequirements)
        : {},
    map_cost: row.map_cost == null ? null : Number(row.map_cost),
    content_slug: typeof row.content_slug === 'string' ? row.content_slug : null,
    content_metadata: normalizeStrategyContentMetadata(row.content_metadata),
    benchmark_sample_count: Number(row.benchmark_sample_count ?? 0),
    benchmark_chaos_per_hour:
      row.benchmark_chaos_per_hour == null ? null : Number(row.benchmark_chaos_per_hour),
  }
}

function normalizeGuestCharacter(row: Record<string, unknown>): GuestPublicCharacterSearchResult {
  return {
    profile_id: String(row.profile_id),
    group_id: String(row.group_id),
    group_name: String(row.group_name ?? 'Unknown group'),
    group_game: row.group_game === 'poe2' ? 'poe2' : 'poe1',
    owner_name: String(row.owner_name ?? 'Unknown'),
    character_name: String(row.character_name ?? 'Unknown character'),
    class: typeof row.class === 'string' ? row.class : null,
    ascendancy_class: row.ascendancy_class == null ? null : Number(row.ascendancy_class),
    level: row.level == null ? null : Number(row.level),
    league: typeof row.league === 'string' ? row.league : null,
  }
}

function normalizeGuestGroup(row: Record<string, unknown>): GuestPublicGroupSearchResult {
  return {
    group_id: String(row.group_id),
    group_name: String(row.group_name ?? 'Unknown group'),
    game: row.game === 'poe2' ? 'poe2' : 'poe1',
    league: String(row.league ?? ''),
    public_character_count: Number(row.public_character_count ?? 0),
    characters: Array.isArray(row.characters)
      ? row.characters.map((character) => ({
          profile_id: String((character as Record<string, unknown>).profile_id),
          character_name: String(
            (character as Record<string, unknown>).character_name ?? 'Unknown character',
          ),
          class:
            typeof (character as Record<string, unknown>).class === 'string'
              ? String((character as Record<string, unknown>).class)
              : null,
          ascendancy_class:
            (character as Record<string, unknown>).ascendancy_class == null
              ? null
              : Number((character as Record<string, unknown>).ascendancy_class),
          level:
            (character as Record<string, unknown>).level == null
              ? null
              : Number((character as Record<string, unknown>).level),
          owner_name: String((character as Record<string, unknown>).owner_name ?? 'Unknown'),
        }))
      : [],
  }
}

export function useGuestPublicStrategies(game: PoeGame, league: string | null) {
  return useQuery({
    queryKey: [...queryKeys.preview.strategies(game, league)],
    enabled: !!league,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_public_strategies_for_league', {
        p_game: game,
        p_league: league!,
      })

      if (error) throw error
      return ((data ?? []) as Record<string, unknown>[]).map(normalizeGuestStrategy)
    },
  })
}

export function useGuestPublicStrategyPreview(strategyId: string | null) {
  return useQuery({
    queryKey: [...queryKeys.preview.strategy(strategyId)],
    enabled: !!strategyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_public_strategy_preview', {
        p_strategy_id: strategyId!,
      })

      if (error) throw error
      const row = Array.isArray(data) ? data[0] : null
      return row ? normalizeGuestStrategy(row as Record<string, unknown>) : null
    },
  })
}

export function useGuestPublicCharacterSearch(game: PoeGame, league: string | null, query: string) {
  return useQuery({
    queryKey: [...queryKeys.preview.characterSearch(game, league, query)],
    enabled: !!league && query.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('search_public_characters_for_league', {
        p_game: game,
        p_league: league!,
        p_query: query,
      })

      if (error) throw error
      return ((data ?? []) as Record<string, unknown>[]).map(normalizeGuestCharacter)
    },
  })
}

export function useGuestPublicGroupSearch(game: PoeGame, league: string | null, query: string) {
  return useQuery({
    queryKey: [...queryKeys.preview.groupSearch(game, league, query)],
    enabled: !!league && query.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('search_public_groups_for_league', {
        p_game: game,
        p_league: league!,
        p_query: query,
      })

      if (error) throw error
      return ((data ?? []) as Record<string, unknown>[]).map(normalizeGuestGroup)
    },
  })
}
