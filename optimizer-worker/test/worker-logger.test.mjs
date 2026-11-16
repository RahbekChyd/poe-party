import test from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeDiagnosticValue } from '../src/lib/worker-logger.mjs'

test('structured diagnostics retain correlation hashes and counts while redacting identity text', () => {
  const sanitized = sanitizeDiagnosticValue({
    runId: 'run-correlation-id',
    inputHash: 'input-hash',
    planCount: 4,
    groupId: 'private-group-id',
    targetUserId: 'private-user-id',
    characterName: 'PrivateCharacter',
    name: 'Private build name',
    label: 'Private stage label',
    title: 'Private stage title',
  })

  assert.equal(sanitized.runId, 'run-correlation-id')
  assert.equal(sanitized.inputHash, 'input-hash')
  assert.equal(sanitized.planCount, 4)
  assert.equal(sanitized.groupId, '[redacted]')
  assert.equal(sanitized.targetUserId, '[redacted]')
  assert.equal(sanitized.characterName, '[redacted]')
  assert.equal(sanitized.name, '[redacted]')
  assert.equal(sanitized.label, '[redacted]')
  assert.equal(sanitized.title, '[redacted]')
})

test('structured errors do not emit arbitrary provider or payload details', () => {
  const sanitized = sanitizeDiagnosticValue(
    new Error('Supabase failed: {"access_token":"private-token","characterName":"Private"}'),
  )

  assert.equal(sanitized.message, 'Worker operation failed')
  assert.match(sanitized.fingerprint, /^[0-9a-f]{12}$/)
  assert.equal(JSON.stringify(sanitized).includes('private-token'), false)
  assert.equal(JSON.stringify(sanitized).includes('Private'), false)
})
