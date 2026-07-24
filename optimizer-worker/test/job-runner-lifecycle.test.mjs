import assert from 'node:assert/strict'
import { setImmediate as waitForImmediate } from 'node:timers/promises'
import test from 'node:test'

import { createJobRunner } from '../src/job-runner.mjs'
import { RunAttemptOwnershipLostError } from '../src/lib/run-lifecycle.mjs'

function createSilentLogger() {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  }
}

test('ownership loss during a phase heartbeat aborts before expensive input reads', async () => {
  const rpcCalls = []
  let runReadCount = 0
  const supabase = {
    async selectSingle(table) {
      if (table === 'upgrade_analysis_runs' && runReadCount === 0) {
        runReadCount += 1
        return {
          id: '00000000-0000-4000-8000-000000000001',
          status: 'queued',
          summary: {},
        }
      }
      throw new Error(`unexpected expensive input read from ${table}`)
    },
    async rpc(functionName, payload) {
      rpcCalls.push({ functionName, payload })
      if (functionName === 'claim_optimizer_run_attempt') {
        return {
          claimed: true,
          run: {
            id: payload.p_run_id,
            status: 'running',
            summary: {},
          },
        }
      }
      if (functionName === 'heartbeat_optimizer_run_attempt') return false
      if (functionName === 'fail_optimizer_run_attempt') {
        return { accepted: false, retry_scheduled: false }
      }
      throw new Error(`unexpected RPC ${functionName}`)
    },
  }
  const runner = createJobRunner({
    supabase,
    heartbeatIntervalMs: 60_000,
    logger: createSilentLogger(),
    workerId: 'ownership-test-worker',
  })

  await assert.rejects(
    runner.processRunById('00000000-0000-4000-8000-000000000001'),
    RunAttemptOwnershipLostError,
  )

  assert.equal(runReadCount, 1)
  assert.deepEqual(
    rpcCalls.map((call) => call.functionName),
    [
      'claim_optimizer_run_attempt',
      'heartbeat_optimizer_run_attempt',
      'fail_optimizer_run_attempt',
    ],
  )
  assert.equal(rpcCalls[2].payload.p_retryable, true)
})

test('polling does not schedule queued runs before retry_not_before', async () => {
  const retryAt = new Date(Date.now() + 60_000).toISOString()
  const queuedSelections = []
  let claimCalls = 0
  let runner
  const supabase = {
    async selectMany(table, filters, select) {
      if (filters.status === 'running') return []
      queuedSelections.push({ table, select })
      return [
        {
          id:
            table === 'upgrade_analysis_runs'
              ? '00000000-0000-4000-8000-000000000002'
              : '00000000-0000-4000-8000-000000000003',
          created_at: '2026-01-01T00:00:00.000Z',
          retry_not_before: retryAt,
        },
      ]
    },
    async rpc(functionName) {
      if (functionName === 'claim_optimizer_run_attempt') {
        claimCalls += 1
        runner.stopPolling()
        return { claimed: false }
      }
      throw new Error(`unexpected RPC ${functionName}`)
    },
  }
  runner = createJobRunner({
    supabase,
    pollIntervalMs: 60_000,
    logger: createSilentLogger(),
    workerId: 'retry-test-worker',
  })

  runner.startPolling()
  await waitForImmediate()
  runner.stopPolling()
  await runner.waitForIdle()

  assert.equal(claimCalls, 0)
  assert.equal(queuedSelections.length, 2)
  assert.ok(queuedSelections.every(({ select }) => select.includes('retry_not_before')))
})
