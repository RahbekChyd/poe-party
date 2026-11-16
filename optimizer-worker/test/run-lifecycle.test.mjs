import assert from 'node:assert/strict'
import test from 'node:test'

import {
  AUTHENTICATED_RUN_KIND,
  createRunLifecycleClient,
  GUEST_RUN_KIND,
  isRetryableAnalysisError,
} from '../src/lib/run-lifecycle.mjs'

test('run lifecycle client maps authenticated and guest transitions to guarded RPC payloads', async () => {
  const calls = []
  const client = createRunLifecycleClient({
    leaseDurationSeconds: 180,
    supabase: {
      async rpc(functionName, payload) {
        calls.push({ functionName, payload })
        return functionName === 'heartbeat_optimizer_run_attempt' ? true : { ok: true }
      },
    },
  })

  await client.claim({
    runKind: GUEST_RUN_KIND,
    runId: 'guest-run',
    leaseOwner: 'worker:attempt',
    resumeWaiting: true,
  })
  await client.heartbeat({
    runKind: AUTHENTICATED_RUN_KIND,
    runId: 'auth-run',
    leaseOwner: 'worker:attempt',
    summary: { current_phase: { id: 'loading_inputs' } },
  })
  await client.defer({
    runKind: GUEST_RUN_KIND,
    runId: 'guest-run',
    leaseOwner: 'worker:attempt',
    summary: { rare_trade_search: { waiting_for_retry: true } },
    partialReason: 'trade cooldown',
  })
  await client.complete({
    runKind: AUTHENTICATED_RUN_KIND,
    runId: 'auth-run',
    leaseOwner: 'worker:attempt',
    status: 'completed',
    summary: { engine: 'pob' },
    partialReason: null,
    plans: [],
  })
  await client.fail({
    runKind: GUEST_RUN_KIND,
    runId: 'guest-run',
    leaseOwner: 'worker:attempt',
    errorDetail: 'provider unavailable',
    retryable: true,
  })

  assert.deepEqual(
    calls.map(({ functionName }) => functionName),
    [
      'claim_optimizer_run_attempt',
      'heartbeat_optimizer_run_attempt',
      'defer_optimizer_run_attempt',
      'complete_optimizer_run_attempt',
      'fail_optimizer_run_attempt',
    ],
  )
  assert.equal(calls[0].payload.p_run_kind, GUEST_RUN_KIND)
  assert.equal(calls[0].payload.p_lease_seconds, 180)
  assert.equal(calls[0].payload.p_resume_waiting, true)
  assert.equal(calls[3].payload.p_run_kind, AUTHENTICATED_RUN_KIND)
  assert.deepEqual(calls[3].payload.p_plans, [])
  assert.equal(calls[4].payload.p_retryable, true)
})

test('retry classification separates deterministic configuration errors from transient failures', () => {
  assert.equal(isRetryableAnalysisError(new Error('temporary trade API failure')), true)
  assert.equal(isRetryableAnalysisError(new Error('POB_RUNTIME_COMMAND is not configured')), false)
  assert.equal(isRetryableAnalysisError(new Error('PoB runtime returned invalid JSON')), false)
})
