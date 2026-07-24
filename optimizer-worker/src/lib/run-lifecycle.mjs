import { randomUUID } from 'node:crypto'

export const AUTHENTICATED_RUN_KIND = 'upgrade_analysis'
export const GUEST_RUN_KIND = 'guest_upgrade_analysis'

export class RunAttemptOwnershipLostError extends Error {
  constructor(message = 'Optimizer run attempt ownership was lost') {
    super(message)
    this.name = 'RunAttemptOwnershipLostError'
  }
}

export function normalizeRunKind(value) {
  return value === GUEST_RUN_KIND ? GUEST_RUN_KIND : AUTHENTICATED_RUN_KIND
}

export function createAttemptLeaseOwner(workerId) {
  return `${String(workerId || 'worker').slice(0, 120)}:${randomUUID()}`
}

export function isRetryableAnalysisError(error) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  if (!message) return true
  return ![
    'POB_RUNTIME_COMMAND is not configured',
    'POB_RUNTIME_COMMAND points to a Windows path',
    'PoB runtime returned invalid JSON',
    'query exceeded the configured',
    'Invalid optimizer',
    'Unsupported optimizer',
  ].some((pattern) => message.includes(pattern))
}

export function createRunLifecycleClient({ supabase, leaseDurationSeconds }) {
  if (!supabase?.rpc) throw new Error('Run lifecycle client requires Supabase RPC support')
  if (!Number.isSafeInteger(leaseDurationSeconds) || leaseDurationSeconds < 30) {
    throw new Error('Run lifecycle lease duration must be at least 30 seconds')
  }

  return {
    async claim({ runKind, runId, leaseOwner, resumeWaiting = false }) {
      return supabase.rpc('claim_optimizer_run_attempt', {
        p_run_kind: normalizeRunKind(runKind),
        p_run_id: runId,
        p_lease_owner: leaseOwner,
        p_lease_seconds: leaseDurationSeconds,
        p_resume_waiting: resumeWaiting,
      })
    },
    async heartbeat({ runKind, runId, leaseOwner, summary = null }) {
      return supabase.rpc('heartbeat_optimizer_run_attempt', {
        p_run_kind: normalizeRunKind(runKind),
        p_run_id: runId,
        p_lease_owner: leaseOwner,
        p_lease_seconds: leaseDurationSeconds,
        p_summary: summary,
      })
    },
    async defer({ runKind, runId, leaseOwner, summary, partialReason }) {
      return supabase.rpc('defer_optimizer_run_attempt', {
        p_run_kind: normalizeRunKind(runKind),
        p_run_id: runId,
        p_lease_owner: leaseOwner,
        p_summary: summary,
        p_partial_reason: partialReason,
      })
    },
    async complete({ runKind, runId, leaseOwner, status, summary, partialReason, plans }) {
      return supabase.rpc('complete_optimizer_run_attempt', {
        p_run_kind: normalizeRunKind(runKind),
        p_run_id: runId,
        p_lease_owner: leaseOwner,
        p_status: status,
        p_summary: summary,
        p_partial_reason: partialReason,
        p_plans: plans,
      })
    },
    async fail({ runKind, runId, leaseOwner, errorDetail, retryable }) {
      return supabase.rpc('fail_optimizer_run_attempt', {
        p_run_kind: normalizeRunKind(runKind),
        p_run_id: runId,
        p_lease_owner: leaseOwner,
        p_error_detail: errorDetail,
        p_retryable: retryable,
      })
    },
  }
}
