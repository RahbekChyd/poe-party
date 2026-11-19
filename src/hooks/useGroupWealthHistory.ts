import { readAllPages } from '../lib/supabase-pagination'
import type { SnapshotPricingSummary } from '../lib/snapshot-pricing'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { queryKeys } from '../lib/queryKeys'
export interface GroupWealthDataPoint {
  pricing_summary: SnapshotPricingSummary | null
  id: string
  created_at: string
  total_wealth_chaos: number
  member_count: number
  strategy_id: string | null
  triggered_by_user_id: string
  member_wealth_breakdown: {
    user_id: string
    display_name: string
    total_chaos: number
  }[]
}

/**
 * Fetches all group wealth history records for a group,
 * ordered oldest-first. Used for the group wealth-over-time chart.
 */
export function useGroupWealthHistory(groupId: string | null) {
  return useQuery({
    queryKey: [...queryKeys.snapshots.groupHistory(groupId)],
    enabled: !!groupId,
    queryFn: async () => {
      const data = await readAllPages((from, to) =>
        supabase
          .from('group_wealth_history')
          .select(
            'id, created_at, total_wealth_chaos, member_count, strategy_id, triggered_by_user_id, member_wealth_breakdown, pricing_summary',
          )
          .eq('group_id', groupId!)
          .order('created_at', { ascending: true })
          .order('id')
          .range(from, to),
      )
      return (data ?? []) as GroupWealthDataPoint[]
    },
  })
}
