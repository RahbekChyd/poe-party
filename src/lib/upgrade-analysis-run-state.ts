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
