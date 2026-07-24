import test from 'node:test'
import assert from 'node:assert/strict'
import { createWorkerHttpServer } from '../src/http-server.mjs'

const STRONG_TOKEN = '0123456789abcdef0123456789abcdef'
const RUN_ID = '10000000-0000-4000-8000-000000000001'
const QUIET_LOGGER = { error() {} }

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  return `http://127.0.0.1:${address.port}`
}

test('health routes separate liveness from readiness and keep /health as the readiness alias', async (t) => {
  let ready = false
  const jobRunner = {
    getDiagnostics: () => ({
      poll_loop_active: ready,
      max_stash_items: 50000,
      worker_id: 'private-hostname',
      run_id: RUN_ID,
      pob_runtime_command: '/private/runtime/command',
    }),
    startRunTask: () => true,
  }
  const server = createWorkerHttpServer({
    workerAuthToken: STRONG_TOKEN,
    jobRunner,
    logger: QUIET_LOGGER,
    isReady: () => ready,
  })
  const baseUrl = await listen(server)
  t.after(() => new Promise((resolve) => server.close(resolve)))

  const live = await fetch(`${baseUrl}/health/live`)
  assert.equal(live.status, 200)
  assert.deepEqual(await live.json(), {
    ok: true,
    status: 'live',
    uptime_seconds: 0,
  })

  for (const path of ['/health', '/health/ready']) {
    const response = await fetch(`${baseUrl}${path}`)
    assert.equal(response.status, 503)
    assert.equal((await response.json()).status, 'not_ready')
  }

  ready = true
  const readyResponse = await fetch(`${baseUrl}/health`)
  assert.equal(readyResponse.status, 200)
  const readyBody = await readyResponse.json()
  assert.equal(readyBody.ok, true)
  assert.equal(readyBody.status, 'ready')
  assert.equal(readyBody.max_stash_items, 50000)
  assert.equal(Object.hasOwn(readyBody, 'worker_id'), false)
  assert.equal(Object.hasOwn(readyBody, 'run_id'), false)
  assert.equal(Object.hasOwn(readyBody, 'pob_runtime_command'), false)
})

test('jobs endpoint rejects invalid bearer tokens before accepting work', async (t) => {
  const started = []
  const jobRunner = {
    getDiagnostics: () => ({ ready: true }),
    startRunTask(runId, runType) {
      started.push({ runId, runType })
      return true
    },
  }
  const server = createWorkerHttpServer({
    workerAuthToken: STRONG_TOKEN,
    jobRunner,
    logger: QUIET_LOGGER,
    isReady: () => true,
  })
  const baseUrl = await listen(server)
  t.after(() => new Promise((resolve) => server.close(resolve)))

  const unauthorized = await fetch(`${baseUrl}/jobs`, {
    method: 'POST',
    headers: { authorization: 'Bearer wrong-token', 'content-type': 'application/json' },
    body: JSON.stringify({ run_id: RUN_ID }),
  })
  assert.equal(unauthorized.status, 401)
  assert.equal(started.length, 0)

  const accepted = await fetch(`${baseUrl}/jobs`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${STRONG_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ run_id: RUN_ID }),
  })
  assert.equal(accepted.status, 202)
  assert.deepEqual(started, [{ runId: RUN_ID, runType: undefined }])
})
