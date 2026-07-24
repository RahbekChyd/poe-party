import test from 'node:test'
import assert from 'node:assert/strict'
import { createShutdownCoordinator } from '../src/lib/worker-shutdown.mjs'

const QUIET_LOGGER = { info() {}, error() {} }

test('shutdown marks readiness false, stops polling, closes HTTP, and drains once', async () => {
  const events = []
  const coordinator = createShutdownCoordinator({
    markReady(value) {
      events.push(`ready:${value}`)
    },
    stopPolling() {
      events.push('polling:stopped')
    },
    async closeServer() {
      events.push('http:closed')
    },
    async drain() {
      events.push('jobs:drained')
    },
    timeoutMs: 100,
    logger: QUIET_LOGGER,
  })

  const first = coordinator.shutdown('SIGTERM')
  const second = coordinator.shutdown('SIGINT')
  assert.equal(first, second)
  assert.deepEqual(await first, { timedOut: false })
  assert.deepEqual(events, ['ready:false', 'polling:stopped', 'http:closed', 'jobs:drained'])
  assert.equal(coordinator.isShuttingDown(), true)
})

test('shutdown force-closes after its bounded drain timeout', async () => {
  let forceClosed = false
  const never = new Promise(() => {})
  const coordinator = createShutdownCoordinator({
    markReady() {},
    stopPolling() {},
    closeServer: () => never,
    drain: () => never,
    forceClose() {
      forceClosed = true
    },
    timeoutMs: 20,
    logger: QUIET_LOGGER,
  })

  assert.deepEqual(await coordinator.shutdown('SIGTERM'), { timedOut: true })
  assert.equal(forceClosed, true)
})
