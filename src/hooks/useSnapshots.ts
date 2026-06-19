import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { queryKeys } from '../lib/queryKeys'
export interface LatestSnapshot {
  id: string
  user_id: string
  group_id: string
  tab_count: number | null
  item_count: number | null
  completed_at: string | null
}

export interface ActiveCharacter {
  id: string
  user_id: string
  name: string
  class: string
  ascendancy_class: number
  level: number
}

export interface MemberEconomy {
  user_id: string
  completed_at: string | null
  total_chaos: number
  tabs: { name: string; tab_type: string; value: number }[]
}

export interface StrategyLinkedSnapshot {
  id: string
  created_at: string
  total_wealth_chaos: number
  triggered_by_user_id: string
  triggered_by_snapshot_id: string | null
  trigger_snapshot_history_id: string | null
}

export function useLatestSnapshots(groupId: string | null) {
  return useQuery({
    queryKey: [...queryKeys.snapshots.latest(groupId)],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('latest_snapshots')
        .select('id, user_id, group_id, tab_count, item_count, completed_at')
        .eq('group_id', groupId!)
      if (error) throw error
      return data as LatestSnapshot[]
    },
  })
}

export function useActiveCharacters(groupId: string | null) {
  return useQuery({
    queryKey: [...queryKeys.characters.active(groupId)],
    enabled: !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('characters')
        .select('id, user_id, name, class, ascendancy_class, level')
        .eq('group_id', groupId!)
        .eq('is_active', true)
      if (error) throw error
      return data as ActiveCharacter[]
    },
  })
}

export function useGroupEconomy(groupId: string | null) {
  return useQuery({
    queryKey: [...queryKeys.economy(groupId)],
    enabled: !!groupId,
    queryFn: async () => {
      const { data: snaps, error: snapError } = await supabase
        .from('latest_snapshots')
        .select('id, user_id, completed_at')
        .eq('group_id', groupId!)
      if (snapError) throw snapError
      if (!snaps?.length) return []

      const { data: tabs, error: tabError } = await supabase
        .from('stash_tabs')
        .select('user_id, snapshot_id, name, tab_type, estimated_value_chaos')
        .in(
          'snapshot_id',
          snaps.map((s) => s.id),
        )
      if (tabError) throw tabError

      const snapByUserId = Object.fromEntries(snaps.map((s) => [s.user_id, s]))
      const tabsByUserId: Record<string, NonNullable<typeof tabs>> = {}
      for (const tab of tabs ?? []) {
        if (!tabsByUserId[tab.user_id]) tabsByUserId[tab.user_id] = []
        tabsByUserId[tab.user_id].push(tab)
      }

      return Object.entries(tabsByUserId).map(([userId, userTabs]) => ({
        user_id: userId,
        completed_at: snapByUserId[userId]?.completed_at ?? null,
        total_chaos: userTabs.reduce((sum, t) => sum + (t.estimated_value_chaos ?? 0), 0),
        tabs: userTabs.map((t) => ({
          name: t.name,
          tab_type: t.tab_type,
          value: t.estimated_value_chaos ?? 0,
        })),
      })) as MemberEconomy[]
    },
  })
}

export function useLinkSnapshotStrategy() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      snapshotId,
      strategyId,
    }: {
      snapshotId: string
      strategyId: string | null
    }) => {
      const { error } = await supabase.rpc('set_snapshot_strategy_link', {
        p_snapshot_id: snapshotId,
        p_strategy_id: strategyId,
      })

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['snapshots'] })
      queryClient.invalidateQueries({ queryKey: ['snapshot-history'] })
      queryClient.invalidateQueries({ queryKey: ['group-wealth-history'] })
      queryClient.invalidateQueries({ queryKey: ['strategy-linked-snapshot-count'] })
      queryClient.invalidateQueries({ queryKey: ['strategy-linked-snapshots'] })
    },
  })
}

export function useClearStrategySnapshots() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      groupId,
      strategyId,
    }: {
      groupId: string
      strategyId: string
    }) => {
      const { error } = await supabase.rpc('clear_strategy_snapshot_links', {
        p_group_id: groupId,
        p_strategy_id: strategyId,
      })

      if (error) throw error
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['snapshots'] })
      queryClient.invalidateQueries({ queryKey: ['snapshot-history'] })
      queryClient.invalidateQueries({ queryKey: ['group-wealth-history'] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.strategies.single(variables.strategyId)] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.strategies.all(variables.groupId)] })
      queryClient.invalidateQueries({ queryKey: ['public-strategies'] })
      queryClient.invalidateQueries({ queryKey: ['public-strategy'] })
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.strategies.linkedSnapshotCount(variables.groupId, variables.strategyId)],
      })
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.strategies.linkedSnapshots(variables.groupId, variables.strategyId)],
      })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.economy(variables.groupId)] })
    },
  })
}

export function useStrategyLinkedSnapshots(groupId: string | null, strategyId: string | null) {
  return useQuery({
    queryKey: [...queryKeys.strategies.linkedSnapshots(groupId, strategyId)],
    enabled: !!groupId && !!strategyId,
    queryFn: async () => {
      const { data: historyRows, error: historyError } = await supabase
        .from('group_wealth_history')
        .select(
          'id, created_at, total_wealth_chaos, triggered_by_user_id, triggered_by_snapshot_id',
        )
        .eq('group_id', groupId!)
        .eq('strategy_id', strategyId!)
        .order('created_at', { ascending: false })

      if (historyError) throw historyError

      const rows = (historyRows ?? []) as Array<{
        id: string
        created_at: string
        total_wealth_chaos: number | string
        triggered_by_user_id: string
        triggered_by_snapshot_id: string | null
      }>

      if (rows.length === 0) return [] as StrategyLinkedSnapshot[]

      const { data: contributions, error: contributionsError } = await supabase
        .from('group_wealth_history_contributions')
        .select('group_history_id, user_id, snapshot_value_history_id')
        .in(
          'group_history_id',
          rows.map((row) => row.id),
        )

      if (contributionsError) throw contributionsError

      const triggerHistoryIdByEntry = new Map(
        (contributions ?? []).map((contribution) => [
          `${String(contribution.group_history_id)}:${String(contribution.user_id)}`,
          contribution.snapshot_value_history_id == null
            ? null
            : String(contribution.snapshot_value_history_id),
        ]),
      )

      return rows.map((row) => ({
        id: row.id,
        created_at: row.created_at,
        total_wealth_chaos: Number(row.total_wealth_chaos ?? 0),
        triggered_by_user_id: row.triggered_by_user_id,
        triggered_by_snapshot_id: row.triggered_by_snapshot_id,
        trigger_snapshot_history_id:
          triggerHistoryIdByEntry.get(`${row.id}:${row.triggered_by_user_id}`) ?? null,
      }))
    },
  })
}

export function useSetGroupHistoryStrategyLink() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      groupHistoryId,
      strategyId,
    }: {
      groupHistoryId: string
      strategyId: string | null
    }) => {
      const { error } = await supabase.rpc('set_group_history_strategy_link', {
        p_group_history_id: groupHistoryId,
        p_strategy_id: strategyId,
      })

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['snapshots'] })
      queryClient.invalidateQueries({ queryKey: ['snapshot-history'] })
      queryClient.invalidateQueries({ queryKey: ['group-wealth-history'] })
      queryClient.invalidateQueries({ queryKey: ['strategy-linked-snapshot-count'] })
      queryClient.invalidateQueries({ queryKey: ['strategy-linked-snapshots'] })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.strategies.root] })
      queryClient.invalidateQueries({ queryKey: ['public-strategies'] })
      queryClient.invalidateQueries({ queryKey: ['public-strategy'] })
    },
  })
}

export function useStrategyLinkedSnapshotCount(groupId: string | null, strategyId: string | null) {
  return useQuery({
    queryKey: [...queryKeys.strategies.linkedSnapshotCount(groupId, strategyId)],
    enabled: !!groupId && !!strategyId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('stash_snapshots')
        .select('id', { count: 'exact', head: true })
        .eq('group_id', groupId!)
        .eq('strategy_id', strategyId!)

      if (error) throw error
      return count ?? 0
    },
  })
}

export function useStrategiesCount(groupId: string | null) {
  return useQuery({
    queryKey: [...queryKeys.strategies.count(groupId)],
    enabled: !!groupId,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('strategies')
        .select('id', { count: 'exact', head: true })
        .eq('group_id', groupId!)
        .eq('is_active', true)
      if (error) throw error
      return count ?? 0
    },
  })
}
