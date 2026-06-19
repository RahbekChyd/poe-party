import type { UpgradeAnalysisRun } from '../types/app'
import { asRecord, readString, readStringList } from './parse-helpers'
export function getUpgradeAnalysisSummaryEngine(
  run: UpgradeAnalysisRun | null | undefined,
): string | null {
  return readString(asRecord(run?.summary).engine)
}

export function usesRetiredAnalysisEngine(
  run: UpgradeAnalysisRun | null | undefined,
): boolean {
  const engine = getUpgradeAnalysisSummaryEngine(run)
  if (engine && engine !== 'pob') {
    return true
  }
  return false
}

export function getRetiredAnalysisEngineMessage(): string {
  return 'This run was created by an older analysis engine. Run analysis again to get current exact PoB-backed results.'
}

export function getUpgradeAnalysisFailureCopy(
  run: UpgradeAnalysisRun | null | undefined,
): {
  title: string
  description: string
  technicalDetail: string | null
} {
  const detail = readString(run?.error_detail)

  if (!detail) {
    return {
      title: 'Exact analysis failed',
      description:
        'The worker did not finish storing recommendations for this run. Check the worker logs, then run the analysis again.',
      technicalDetail: null,
    }
  }

  if (detail.includes('POB_RUNTIME_COMMAND is not configured')) {
    return {
      title: 'Exact PoB analysis is not configured',
      description:
        'The worker could not start the Path of Building runtime. Keep POB_RUNTIME_COMMAND at /app/pob/run-pob-runtime.sh, then run the analysis again.',
      technicalDetail: detail,
    }
  }

  if (detail.includes('POB_RUNTIME_COMMAND points to a Windows path')) {
    return {
      title: 'The worker is using the wrong PoB runtime path',
      description:
        'Railway runs the worker on Linux, so the PoB runtime command cannot point at a Windows path. Set POB_RUNTIME_COMMAND to /app/pob/run-pob-runtime.sh, redeploy, then rerun the analysis.',
      technicalDetail: detail,
    }
  }

  if (
    detail.includes('PoB runtime exited with code') ||
    detail.includes('PoB runtime returned invalid JSON') ||
    detail.includes('spawn ') ||
    detail.includes('ENOENT')
  ) {
    return {
      title: 'Exact PoB analysis crashed in the worker',
      description:
        'The worker reached the Path of Building runtime, but it failed before recommendations could be stored. Check the Railway logs for the PoB process error, then rerun the analysis.',
      technicalDetail: detail,
    }
  }

  return {
    title: 'Exact analysis failed',
    description:
      'The worker hit an unexpected error before it could store recommendations. Check the worker logs, then run the analysis again.',
    technicalDetail: detail,
  }
}

export function getUpgradeAnalysisEmptyPlansCopy(
  run: UpgradeAnalysisRun | null | undefined,
): {
  title: string
  description: string
  warning: string | null
} {
  if (usesRetiredAnalysisEngine(run)) {
    return {
      title: 'This run used an older analysis engine',
      description:
        'The stored output came from an older worker version instead of the current exact PoB analysis path. Run analysis again to regenerate it.',
      warning: null,
    }
  }

  const summary = asRecord(run?.summary)
  const engine = readString(summary.engine)
  const warnings = readStringList(summary.warnings)

  if (engine === 'pob') {
    return {
      title: 'Exact analysis finished without actionable plans',
      description:
        'The PoB worker completed this run, but it did not store any recommendation plans for the current setup. Try changing the target stage, budget, or rare-item search constraints and rerun.',
      warning: warnings[0] ?? null,
    }
  }

  return {
    title: 'No recommendation plans were stored for this run',
    description:
      'Try running analysis again after checking the selected setup, budget, and worker configuration.',
    warning: warnings[0] ?? null,
  }
}
