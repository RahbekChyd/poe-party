import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { queryKeys } from '../lib/queryKeys'
import { normalizeThreads, type Thread } from '../lib/strategy-threads'
import { normalizeScarabs, type Scarab } from '../lib/strategy-scarabs'
import {
  normalizeStrategyContentMetadata,
  type StrategyContentMetadata,
} from '../lib/public-strategy-content'
import { trackProductEvent } from '../lib/analytics'

export interface MapRequirements {
  atlas_drops?: number | null
  more_threads?: number | null
  item_quantity?: number | null
  item_rarity?: number | null
  pack_size?: number | null
  more_scarabs?: number | null
  more_currency?: number | null
  more_unique?: number | null
}

export type StrategyVisibility = 'group_only' | 'public'
export type StrategySubscriptionState = 'live' | 'frozen' | null

export interface Strategy {
  setup_cutoff_at: string | null
  id: string
  group_id: string
  name: string
  description: string | null
  colour: string
  difficulty: 'easy' | 'normal' | 'hard'
  is_active: boolean
  created_by: string
  created_at: string
  atlas_tree_url: string | null
  scarabs: Scarab[]
  threads: Thread[]
  map_trade_link: string | null
  map_requirements: MapRequirements
  map_cost: number | null
  admin_locked: boolean
  visibility: StrategyVisibility
  source_strategy_id: string | null
  source_group_id: string | null
  source_group_name: string | null
  subscription_state: StrategySubscriptionState
  last_synced_from_source_at: string | null
  content_slug: string | null
  content_metadata: StrategyContentMetadata | null
}

export interface PublicStrategy {
  id: string
  group_id: string
  group_name: string
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
  live_subscription_id: string | null
}

function normalizeStrategy(row: Record<string, unknown>): Strategy {
  const strategy = row as unknown as Strategy
  return {
    ...strategy,
    setup_cutoff_at: typeof row.setup_cutoff_at === 'string' ? row.setup_cutoff_at : null,
    scarabs: normalizeScarabs(row.scarabs),
    threads: normalizeThreads(row.threads),
    map_requirements:
      row.map_requirements && typeof row.map_requirements === 'object'
        ? (row.map_requirements as MapRequirements)
        : {},
    content_slug: typeof row.content_slug === 'string' ? row.content_slug : null,
    content_metadata: normalizeStrategyContentMetadata(row.content_metadata),
  }
}

function normalizePublicStrategy(row: Record<string, unknown>): PublicStrategy {
  return {
    id: String(row.id),
    group_id: String(row.group_id),
    group_name: String(row.group_name ?? 'Unknown group'),
    group_league: String(row.group_league ?? ''),
    name: String(row.name ?? 'Unnamed strategy'),
    description: typeof row.description === 'string' ? row.description : null,
    colour: String(row.colour ?? '#6366f1'),
    difficulty: (row.difficulty as PublicStrategy['difficulty']) ?? 'normal',
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
    live_subscription_id:
      typeof row.live_subscription_id === 'string' ? row.live_subscription_id : null,
  }
}

function invalidateStrategyQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: [...queryKeys.strategies.root] })
  queryClient.invalidateQueries({ queryKey: ['public-strategies'] })
  queryClient.invalidateQueries({ queryKey: ['public-strategy'] })
}

export function useStrategies(groupId: string | null) {
  return useQuery({
    queryKey: [...queryKeys.strategies.all(groupId)],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('strategies')
        .select(
          `
          id, group_id, name, description, colour, difficulty, is_active, created_by, created_at,
          atlas_tree_url, scarabs, threads, setup_cutoff_at, map_trade_link, map_requirements, map_cost, admin_locked,
          visibility, source_strategy_id, source_group_id, source_group_name, subscription_state, last_synced_from_source_at,
          content_slug, content_metadata
        `,
        )
        .eq('group_id', groupId!)
        .eq('is_active', true)
        .order('updated_at', { ascending: false })

      if (error) throw error
      return ((data ?? []) as Record<string, unknown>[]).map(normalizeStrategy)
    },
  })
}

export function useStrategy(strategyId: string | undefined) {
  return useQuery({
    queryKey: [...queryKeys.strategies.single(strategyId!)],
    enabled: !!strategyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('strategies')
        .select(
          `
          id, group_id, name, description, colour, difficulty, is_active, created_by, created_at,
          atlas_tree_url, scarabs, threads, setup_cutoff_at, map_trade_link, map_requirements, map_cost, admin_locked,
          visibility, source_strategy_id, source_group_id, source_group_name, subscription_state, last_synced_from_source_at,
          content_slug, content_metadata
        `,
        )
        .eq('id', strategyId!)
        .maybeSingle()

      if (error) throw error
      return data ? normalizeStrategy(data as Record<string, unknown>) : null
    },
  })
}

export function usePublicStrategies(groupId: string | null) {
  return useQuery({
    queryKey: [...queryKeys.strategies.publicList(groupId)],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_public_strategies', {
        p_viewer_group_id: groupId!,
      })

      if (error) throw error
      return ((data ?? []) as Record<string, unknown>[]).map(normalizePublicStrategy)
    },
  })
}

export function usePublicStrategy(groupId: string | null, strategyId: string | null) {
  return useQuery({
    queryKey: [...queryKeys.strategies.publicSingle(groupId, strategyId)],
    enabled: !!groupId && !!strategyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_public_strategy_detail', {
        p_viewer_group_id: groupId!,
        p_strategy_id: strategyId!,
      })

      if (error) throw error
      const row = Array.isArray(data) ? data[0] : null
      if (!row) return null
      return normalizePublicStrategy(row as Record<string, unknown>)
    },
  })
}

export function useCreateStrategy() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: {
      group_id: string
      name: string
      description?: string | null
      colour: string
      difficulty: 'easy' | 'normal' | 'hard'
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data, error } = await supabase
        .from('strategies')
        .insert({ ...values, created_by: user.id })
        .select()
        .single()

      if (error) throw error
      return data as Strategy
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.strategies.all(data.group_id)] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.strategies.count(data.group_id)] })
      invalidateStrategyQueries(queryClient)
      trackProductEvent('activation_strategy_created', {
        difficulty: data.difficulty,
        visibility: data.visibility,
      })
    },
  })
}

export function useDeleteStrategy() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: { id: string; group_id: string }) => {
      const { error } = await supabase
        .from('strategies')
        .update({ is_active: false })
        .eq('id', values.id)

      if (error) throw error
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.strategies.single(variables.id)] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.strategies.all(variables.group_id)] })
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.strategies.count(variables.group_id)],
      })
      invalidateStrategyQueries(queryClient)
    },
  })
}

export function useUpdateStrategy() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: {
      id: string
      group_id: string
      name: string
      description?: string | null
      colour: string
      difficulty: 'easy' | 'normal' | 'hard'
      atlas_tree_url?: string | null
      scarabs?: Scarab[]
      threads: Thread[]
      map_trade_link?: string | null
      map_requirements: MapRequirements
      map_cost?: number | null
      admin_locked?: boolean
      visibility?: StrategyVisibility
    }) => {
      const fields = { ...values }
      delete (fields as { id?: string }).id
      delete (fields as { group_id?: string }).group_id

      const { data, error } = await supabase
        .from('strategies')
        .update(fields)
        .eq('id', values.id)
        .select()
        .single()

      if (error) throw error
      return data as Strategy
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.strategies.single(data.id)] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.strategies.all(data.group_id)] })
      invalidateStrategyQueries(queryClient)
    },
  })
}

export function useSubscribeToStrategy() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      groupId,
      sourceStrategyId,
    }: {
      groupId: string
      sourceStrategyId: string
    }) => {
      const { data, error } = await supabase.rpc('subscribe_to_public_strategy', {
        p_viewer_group_id: groupId,
        p_source_strategy_id: sourceStrategyId,
      })

      if (error) throw error
      return String(data)
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.strategies.all(variables.groupId)] })
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.strategies.count(variables.groupId)],
      })
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.strategies.publicList(variables.groupId)],
      })
      invalidateStrategyQueries(queryClient)
    },
  })
}
