import { useMemo } from 'react'
import { useGroupWealthHistory } from './useGroupWealthHistory'
export interface StrategyHourlyEstimate {
  strategyId: string
  chaosPerHour: number
  totalDeltaChaos: number
  totalHours: number
  sampleCount: number
  latestAt: string
}

export function useStrategyHourlyEstimates(groupId: string | null) {
  const { data: history, isLoading } = useGroupWealthHistory(groupId)

  const data = useMemo(() => {
    const estimates: Record<string, StrategyHourlyEstimate> = {}
    if (!history || history.length < 2) return estimates

    const sorted = [...history].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    )

    for (let i = 1; i < sorted.length; i += 1) {
      const previous = sorted[i - 1]
      const current = sorted[i]
      if (!current.strategy_id) continue

      const hours =
        (new Date(current.created_at).getTime() - new Date(previous.created_at).getTime()) /
        3_600_000

      if (!Number.isFinite(hours) || hours <= 0) continue

      const strategyId = current.strategy_id
      const existing = estimates[strategyId] ?? {
        strategyId,
        chaosPerHour: 0,
        totalDeltaChaos: 0,
        totalHours: 0,
        sampleCount: 0,
        latestAt: current.created_at,
      }

      existing.totalDeltaChaos += current.total_wealth_chaos - previous.total_wealth_chaos
      existing.totalHours += hours
      existing.sampleCount += 1
      existing.latestAt = current.created_at
      existing.chaosPerHour = existing.totalDeltaChaos / existing.totalHours
      estimates[strategyId] = existing
    }

    return estimates
  }, [history])

  return { data, isLoading }
}
