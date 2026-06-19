import type { UpgradeRecommendationPlan } from '../types/app'
import { asRecord, readString } from './parse-helpers'
export type RecommendationScoreAxis = 'overall' | 'dps' | 'ehp' | 'reservation'

export type RecommendationScoreBreakdown = {
  primaryMetric: string | null
  overall: number | null
  dps: number | null
  ehp: number | null
  reservation: number | null
}

export function shouldShowRecommendationScore(
  axis: RecommendationScoreAxis,
  value: number | null | undefined,
): boolean {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false
  if (axis === 'reservation') {
    return Math.abs(value) >= 0.01
  }
  return true
}

/** Like the shared readNumber, but also coerces numeric strings. */
function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export function getRecommendationScoreBreakdown(
  plan: Pick<UpgradeRecommendationPlan, 'score' | 'ranking_reason'> | null | undefined,
): RecommendationScoreBreakdown {
  const rankingReason = asRecord(plan?.ranking_reason)
  const scoreBreakdown = asRecord(rankingReason.score_breakdown)

  return {
    primaryMetric:
      readString(scoreBreakdown.primary_metric) ?? readString(rankingReason.primary_metric),
    overall: typeof plan?.score === 'number' && Number.isFinite(plan.score) ? plan.score : null,
    dps: readNumber(scoreBreakdown.dps_score),
    ehp: readNumber(scoreBreakdown.ehp_score),
    reservation: readNumber(scoreBreakdown.reservation_score),
  }
}

export function getRecommendationScoreAxisValue(
  plan: Pick<
    UpgradeRecommendationPlan,
    'score' | 'ranking_reason'
  > | null | undefined,
  axis: RecommendationScoreAxis,
): number | null {
  const breakdown = getRecommendationScoreBreakdown(plan)
  switch (axis) {
    case 'dps':
      return breakdown.dps
    case 'ehp':
      return breakdown.ehp
    case 'reservation':
      return breakdown.reservation
    default:
      return breakdown.overall
  }
}

export function rankRecommendationPlans(
  plans: UpgradeRecommendationPlan[],
  axis: RecommendationScoreAxis,
): Map<string, number> {
  const entries = plans
    .map((plan) => ({
      plan,
      axisValue: getRecommendationScoreAxisValue(plan, axis),
      overallValue: getRecommendationScoreAxisValue(plan, 'overall'),
    }))
    .filter(
      (entry): entry is {
        plan: UpgradeRecommendationPlan
        axisValue: number
        overallValue: number | null
      } => entry.axisValue != null && Number.isFinite(entry.axisValue),
    )
    .sort((left, right) => {
      if (left.axisValue !== right.axisValue) {
        return right.axisValue - left.axisValue
      }

      const leftOverall = left.overallValue ?? Number.NEGATIVE_INFINITY
      const rightOverall = right.overallValue ?? Number.NEGATIVE_INFINITY
      if (leftOverall !== rightOverall) {
        return rightOverall - leftOverall
      }

      if (left.plan.stage_progress_score !== right.plan.stage_progress_score) {
        return right.plan.stage_progress_score - left.plan.stage_progress_score
      }

      if (left.plan.effective_cost_chaos !== right.plan.effective_cost_chaos) {
        return left.plan.effective_cost_chaos - right.plan.effective_cost_chaos
      }

      return left.plan.id.localeCompare(right.plan.id)
    })

  return new Map(entries.map((entry, index) => [entry.plan.id, index + 1]))
}
