import { asRecord } from './parse-helpers'
import type { UpgradeAnalysisRun } from '../types/app'

export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes <= 0) return `${seconds}s`
  if (seconds === 0) return `${minutes}m`
  return `${minutes}m ${seconds}s`
}

type RunPhaseId =
  | 'loading_inputs'
  | 'fetching_market_uniques'
  | 'planning_live_rare_search'
  | 'searching_live_rares'
  | 'scoring_upgrades'
  | 'persisting_results'

const RUN_PHASE_ORDER_THOROUGH: RunPhaseId[] = [
  'loading_inputs',
  'fetching_market_uniques',
  'planning_live_rare_search',
  'searching_live_rares',
  'scoring_upgrades',
  'persisting_results',
]

const RUN_PHASE_ORDER_QUICK: RunPhaseId[] = [
  'loading_inputs',
  'fetching_market_uniques',
  'scoring_upgrades',
  'persisting_results',
]

const RUN_PHASE_LABELS: Record<RunPhaseId, string> = {
  loading_inputs: 'Loading build and character inputs',
  fetching_market_uniques: 'Fetching live unique prices',
  planning_live_rare_search: 'Scoring rare templates and planning live search',
  searching_live_rares: 'Searching live rare market for shortlisted slots',
  scoring_upgrades: 'Scoring final upgrades in PoB runtime',
  persisting_results: 'Saving recommendations',
}

function getCurrentPhaseId(summary: Record<string, unknown>): RunPhaseId | null {
  const phase = asRecord(summary.current_phase).id
  return typeof phase === 'string' && Object.prototype.hasOwnProperty.call(RUN_PHASE_LABELS, phase)
    ? (phase as RunPhaseId)
    : null
}

export function getAnalysisPhaseLabel(summary: Record<string, unknown>): string | null {
  const phase = getCurrentPhaseId(summary)
  return phase ? RUN_PHASE_LABELS[phase] : null
}

export function getRunPhaseTimeline(
  run: Pick<UpgradeAnalysisRun, 'analysis_mode' | 'summary' | 'status'>,
): Array<{ id: RunPhaseId; label: string; status: 'done' | 'active' | 'pending' }> {
  const order = run.analysis_mode === 'thorough' ? RUN_PHASE_ORDER_THOROUGH : RUN_PHASE_ORDER_QUICK
  const currentPhaseId = run.status === 'running' ? getCurrentPhaseId(run.summary) : null
  const activeIndex =
    currentPhaseId && order.includes(currentPhaseId) ? order.indexOf(currentPhaseId) : -1
  return order.map((phaseId, index) => {
    let status: 'done' | 'active' | 'pending' = 'pending'
    if (activeIndex === -1) {
      status = 'pending'
    } else if (index < activeIndex) {
      status = 'done'
    } else if (index === activeIndex) {
      status = 'active'
    }
    return {
      id: phaseId,
      label: RUN_PHASE_LABELS[phaseId],
      status,
    }
  })
}

export function formatElapsedSince(
  startedAt: string | null | undefined,
  nowMs: number,
): string | null {
  if (!startedAt) return null
  const startedMs = Date.parse(startedAt)
  if (!Number.isFinite(startedMs)) return null
  const elapsedMs = Math.max(0, nowMs - startedMs)
  return formatCountdown(elapsedMs)
}
