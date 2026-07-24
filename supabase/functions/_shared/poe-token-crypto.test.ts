import { assertEquals, assertNotEquals, assertRejects } from 'jsr:@std/assert@1.0.18'
import {
  createPoeTokenEncryptionConfig,
  decryptPoeToken,
  encryptPoeToken,
  fingerprintPoeRefreshToken,
} from './poe-token-crypto.ts'
import {
  buildEncryptedPoeTokenStorage,
  decodePoeTokenStorage,
  resolvePoeTokenStorage,
  type PoeTokenStorageRow,
} from './poe-token-storage.ts'

const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

function encodeKey(seed: number): string {
  const bytes = Uint8Array.from({ length: 32 }, (_, index) => (seed + index) % 256)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function config(activeKeyId: 'old' | 'active') {
  return await createPoeTokenEncryptionConfig(
    activeKeyId,
    JSON.stringify({ old: encodeKey(1), active: encodeKey(101) }),
  )
}

function legacyRow(overrides: Partial<PoeTokenStorageRow> = {}): PoeTokenStorageRow {
  return {
    access_token: 'legacy-access-token',
    refresh_token: 'legacy-refresh-token',
    access_token_ciphertext: null,
    refresh_token_ciphertext: null,
    token_ciphertext_version: null,
    token_encryption_key_id: null,
    refresh_token_fingerprint: null,
    expires_at: '2030-01-01T00:00:00.000Z',
    updated_at: '2026-07-20T10:00:00.000Z',
    ...overrides,
  }
}

Deno.test('AES-256-GCM envelopes round-trip with a random nonce and bound context', async () => {
  const keyRing = await config('active')
  const first = await encryptPoeToken('access-secret', `${USER_ID}:access`, keyRing)
  const second = await encryptPoeToken('access-secret', `${USER_ID}:access`, keyRing)

  assertNotEquals(first.ciphertext, second.ciphertext)
  assertEquals(JSON.parse(first.ciphertext).v, 1)
  assertEquals(JSON.parse(first.ciphertext).kid, 'active')
  assertNotEquals(JSON.parse(first.ciphertext).n, JSON.parse(second.ciphertext).n)

  const decrypted = await decryptPoeToken(first.ciphertext, `${USER_ID}:access`, keyRing)
  assertEquals(decrypted.plaintext, 'access-secret')
  assertEquals(decrypted.needsRotation, false)
  await assertRejects(() => decryptPoeToken(first.ciphertext, `${USER_ID}:refresh`, keyRing))
})

Deno.test('old key-ring entries decrypt while only the active key encrypts', async () => {
  const oldConfig = await config('old')
  const rotatedConfig = await config('active')
  const oldCiphertext = await encryptPoeToken('refresh-secret', `${USER_ID}:refresh`, oldConfig)

  const decrypted = await decryptPoeToken(
    oldCiphertext.ciphertext,
    `${USER_ID}:refresh`,
    rotatedConfig,
  )
  assertEquals(decrypted.plaintext, 'refresh-secret')
  assertEquals(decrypted.keyId, 'old')
  assertEquals(decrypted.needsRotation, true)

  const newCiphertext = await encryptPoeToken('refresh-secret', `${USER_ID}:refresh`, rotatedConfig)
  assertEquals(newCiphertext.keyId, 'active')
})

Deno.test('key-ring configuration fails closed when missing or invalid', async () => {
  await assertRejects(() => createPoeTokenEncryptionConfig(undefined, undefined))
  await assertRejects(() =>
    createPoeTokenEncryptionConfig('active', JSON.stringify({ active: 'not-a-key' })),
  )
  await assertRejects(() =>
    createPoeTokenEncryptionConfig('missing', JSON.stringify({ active: encodeKey(1) })),
  )
})

Deno.test(
  'dual-read accepts legacy plaintext and emits ciphertext-only active-key storage',
  async () => {
    const keyRing = await config('active')
    const decodedLegacy = await decodePoeTokenStorage(legacyRow(), USER_ID, keyRing)
    assertEquals(decodedLegacy.source, 'plaintext')
    assertEquals(decodedLegacy.needsRewrite, true)
    assertEquals(decodedLegacy.tokens.refresh_token, 'legacy-refresh-token')

    const encrypted = await buildEncryptedPoeTokenStorage(USER_ID, decodedLegacy.tokens, keyRing)
    assertEquals(encrypted.access_token, null)
    assertEquals(encrypted.refresh_token, null)
    assertEquals(encrypted.token_encryption_key_id, 'active')
    assertEquals(
      encrypted.refresh_token_fingerprint,
      await fingerprintPoeRefreshToken('legacy-refresh-token'),
    )

    const decodedEncrypted = await decodePoeTokenStorage(
      { ...encrypted, updated_at: '2026-07-20T10:01:00.000Z' },
      USER_ID,
      keyRing,
    )
    assertEquals(decodedEncrypted.source, 'ciphertext')
    assertEquals(decodedEncrypted.needsRewrite, false)
    assertEquals(decodedEncrypted.tokens, decodedLegacy.tokens)
  },
)

Deno.test('lost opportunistic rewrite reloads the concurrent winner with both guards', async () => {
  const oldConfig = await config('old')
  const activeConfig = await config('active')
  const oldStorage = await buildEncryptedPoeTokenStorage(
    USER_ID,
    {
      access_token: 'old-access-token',
      refresh_token: 'shared-refresh-token',
      expires_at: '2030-01-01T00:00:00.000Z',
    },
    oldConfig,
  )
  const concurrentStorage = await buildEncryptedPoeTokenStorage(
    USER_ID,
    {
      access_token: 'concurrent-access-token',
      refresh_token: 'shared-refresh-token',
      expires_at: '2030-01-01T01:00:00.000Z',
    },
    activeConfig,
  )

  let loadCount = 0
  let rewriteCount = 0
  const resolved = await resolvePoeTokenStorage(USER_ID, activeConfig, {
    load: () => {
      loadCount += 1
      return Promise.resolve(
        loadCount === 1
          ? { ...oldStorage, updated_at: '2026-07-20T10:00:00.000Z' }
          : { ...concurrentStorage, updated_at: '2026-07-20T10:00:01.000Z' },
      )
    },
    rewrite: (_storage, guard) => {
      rewriteCount += 1
      assertEquals(guard.updatedAt, '2026-07-20T10:00:00.000Z')
      assertEquals(guard.refreshTokenFingerprint, oldStorage.refresh_token_fingerprint)
      return Promise.resolve(null)
    },
  })

  assertEquals(loadCount, 2)
  assertEquals(rewriteCount, 1)
  assertEquals(resolved.tokens.access_token, 'concurrent-access-token')
  assertEquals(resolved.tokens.expires_at, '2030-01-01T01:00:00.000Z')
})
