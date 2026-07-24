import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isAuthorizedWorkerRequest,
  requireStrongWorkerAuthToken,
} from '../src/lib/worker-auth.mjs'
import { loadWorkerConfig } from '../src/lib/worker-config.mjs'

const STRONG_TOKEN = '0123456789abcdef0123456789abcdef'
const BASE_ENV = {
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_SECRET_KEY: 'local-service-key',
}

test('worker startup configuration rejects a missing auth token', () => {
  assert.throws(
    () => loadWorkerConfig(BASE_ENV),
    /Missing WORKER_AUTH_TOKEN/,
  )
})

test('worker startup configuration rejects a weak auth token', () => {
  assert.throws(
    () => loadWorkerConfig({ ...BASE_ENV, WORKER_AUTH_TOKEN: 'dev-worker-token' }),
    /at least 32 bytes/,
  )
})

test('worker startup configuration accepts a strong token and applies safe defaults', () => {
  const config = loadWorkerConfig({ ...BASE_ENV, WORKER_AUTH_TOKEN: STRONG_TOKEN })
  assert.equal(config.workerAuthToken, STRONG_TOKEN)
  assert.equal(config.maxStashItems, 50000)
  assert.equal(config.shutdownTimeoutMs, 25000)
})

test('worker bearer validation only accepts the exact configured token', () => {
  assert.equal(requireStrongWorkerAuthToken(STRONG_TOKEN), STRONG_TOKEN)
  assert.equal(isAuthorizedWorkerRequest(`Bearer ${STRONG_TOKEN}`, STRONG_TOKEN), true)
  assert.equal(isAuthorizedWorkerRequest(`Bearer ${STRONG_TOKEN}x`, STRONG_TOKEN), false)
  assert.equal(isAuthorizedWorkerRequest('', STRONG_TOKEN), false)
})
