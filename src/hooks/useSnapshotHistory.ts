import { readAllPages } from '../lib/supabase-pagination'
import type { SnapshotPricingSummary } from '../lib/snapshot-pricing'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { queryKeys } from '../lib/queryKeys'
export interface SnapshotDataPoint {
  pricing_summary: SnapshotPricingSummary | null
  id: string
  snapshot_id: string | null
  completed_at: string
  total_chaos: number
  excluded_chaos_total: number
  strategy_id: string | null
}

/**
 * Fetches all completed snapshots for a specific user within a group,
 * ordered oldest-first, with total wealth computed from their tabs.
 * Used to render the wealth-over-time chart on the per-user economy page.
 */
export function useSnapshotHistory(groupId: string | null, userId: string | null) {
  return useQuery({
    queryKey: [...queryKeys.snapshots.history(groupId, userId)],
    enabled: !!groupId && !!userId,
    queryFn: async () => {
      const data = await readAllPages((from, to) =>
        supabase
          .from('snapshot_value_history')
          .select(
            'id, snapshot_id, completed_at, included_chaos_total, excluded_chaos_total, strategy_id, pricing_summary',
          )
          .eq('user_id', userId!)
          .eq('group_id', groupId!)
          .order('completed_at', { ascending: true })
          .order('id')
          .range(from, to),
      )

      return (data ?? []).map(
        (snap) =>
          ({
            id: snap.id as string,
            pricing_summary: snap.pricing_summary as SnapshotPricingSummary | null,
            snapshot_id: ((snap as Record<string, unknown>).snapshot_id as string | null) ?? null,
            completed_at: snap.completed_at as string,
            total_chaos: Number((snap as Record<string, unknown>).included_chaos_total ?? 0),
            excluded_chaos_total: Number(
              (snap as Record<string, unknown>).excluded_chaos_total ?? 0,
            ),
            strategy_id: ((snap as Record<string, unknown>).strategy_id as string | null) ?? null,
          }) as SnapshotDataPoint,
      )
    },
  })
}
