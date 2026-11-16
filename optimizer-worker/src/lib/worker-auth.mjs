import { createHash, timingSafeEqual } from 'node:crypto'

export const MIN_WORKER_AUTH_TOKEN_BYTES = 32

export function requireStrongWorkerAuthToken(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(
      'Missing WORKER_AUTH_TOKEN. Configure a unique random token with at least 32 bytes.',
    )
  }

  if (value !== value.trim()) {
    throw new Error('WORKER_AUTH_TOKEN must not contain leading or trailing whitespace.')
  }

  if (Buffer.byteLength(value, 'utf8') < MIN_WORKER_AUTH_TOKEN_BYTES) {
    throw new Error(
      `WORKER_AUTH_TOKEN must contain at least ${MIN_WORKER_AUTH_TOKEN_BYTES} bytes.`,
    )
  }

  if (/^(?:change-?me|replace-?me|dev-worker-token|test-token)$/i.test(value)) {
    throw new Error('WORKER_AUTH_TOKEN must not use a documented placeholder value.')
  }

  return value
}

export function isAuthorizedWorkerRequest(authorizationHeader, workerAuthToken) {
  const provided = typeof authorizationHeader === 'string' ? authorizationHeader : ''
  const expected = `Bearer ${workerAuthToken}`
  const providedDigest = createHash('sha256').update(provided, 'utf8').digest()
  const expectedDigest = createHash('sha256').update(expected, 'utf8').digest()
  return timingSafeEqual(providedDigest, expectedDigest)
}
