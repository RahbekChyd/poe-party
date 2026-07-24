import {
  decryptPoeToken,
  encryptPoeToken,
  fingerprintPoeRefreshToken,
  type PoeTokenEncryptionConfig,
} from './poe-token-crypto.ts'

export type StoredPoeTokens = {
  access_token: string
  refresh_token: string
  expires_at: string
}

export type PoeTokenStorageRow = {
  access_token: string | null
  refresh_token: string | null
  access_token_ciphertext: string | null
  refresh_token_ciphertext: string | null
  token_ciphertext_version: number | null
  token_encryption_key_id: string | null
  refresh_token_fingerprint: string | null
  expires_at: string
  updated_at: string
}

export type EncryptedPoeTokenStorage = {
  access_token: null
  refresh_token: null
  access_token_ciphertext: string
  refresh_token_ciphertext: string
  token_ciphertext_version: number
  token_encryption_key_id: string
  refresh_token_fingerprint: string
  expires_at: string
}

export type DecodedPoeTokenStorage = {
  tokens: StoredPoeTokens
  row: PoeTokenStorageRow
  refreshTokenFingerprint: string
  source: 'plaintext' | 'ciphertext'
  needsRewrite: boolean
}

export type PoeTokenRewriteGuard = {
  updatedAt: string
  refreshTokenFingerprint: string | null
}

export type PoeTokenStorageResolver = {
  load: () => Promise<unknown>
  rewrite: (
    storage: EncryptedPoeTokenStorage,
    guard: PoeTokenRewriteGuard,
  ) => Promise<unknown | null>
}

function tokenContext(userId: string, kind: 'access' | 'refresh'): string {
  if (!userId) throw new Error('PoE token owner is required')
  return `${userId}:${kind}`
}

function nullableString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') throw new Error('Invalid PoE token storage row')
  return value
}

function nullableInteger(record: Record<string, unknown>, key: string): number | null {
  const value = record[key]
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error('Invalid PoE token storage row')
  }
  return value
}

export function parsePoeTokenStorageRow(value: unknown): PoeTokenStorageRow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid PoE token storage row')
  }
  const record = value as Record<string, unknown>
  if (typeof record.expires_at !== 'string' || typeof record.updated_at !== 'string') {
    throw new Error('Invalid PoE token storage row')
  }

  return {
    access_token: nullableString(record, 'access_token'),
    refresh_token: nullableString(record, 'refresh_token'),
    access_token_ciphertext: nullableString(record, 'access_token_ciphertext'),
    refresh_token_ciphertext: nullableString(record, 'refresh_token_ciphertext'),
    token_ciphertext_version: nullableInteger(record, 'token_ciphertext_version'),
    token_encryption_key_id: nullableString(record, 'token_encryption_key_id'),
    refresh_token_fingerprint: nullableString(record, 'refresh_token_fingerprint'),
    expires_at: record.expires_at,
    updated_at: record.updated_at,
  }
}

export async function buildEncryptedPoeTokenStorage(
  userId: string,
  tokens: StoredPoeTokens,
  config: PoeTokenEncryptionConfig,
): Promise<EncryptedPoeTokenStorage> {
  if (!tokens.access_token || !tokens.refresh_token || !tokens.expires_at) {
    throw new Error('Cannot store incomplete PoE OAuth tokens')
  }

  const [access, refresh, refreshTokenFingerprint] = await Promise.all([
    encryptPoeToken(tokens.access_token, tokenContext(userId, 'access'), config),
    encryptPoeToken(tokens.refresh_token, tokenContext(userId, 'refresh'), config),
    fingerprintPoeRefreshToken(tokens.refresh_token),
  ])

  if (access.version !== refresh.version || access.keyId !== refresh.keyId) {
    throw new Error('PoE token encryption metadata is inconsistent')
  }

  return {
    access_token: null,
    refresh_token: null,
    access_token_ciphertext: access.ciphertext,
    refresh_token_ciphertext: refresh.ciphertext,
    token_ciphertext_version: access.version,
    token_encryption_key_id: access.keyId,
    refresh_token_fingerprint: refreshTokenFingerprint,
    expires_at: tokens.expires_at,
  }
}

export async function decodePoeTokenStorage(
  value: unknown,
  userId: string,
  config: PoeTokenEncryptionConfig,
): Promise<DecodedPoeTokenStorage> {
  const row = parsePoeTokenStorageRow(value)

  // During a mixed-version rollout, an older function can write plaintext onto
  // a row that already has ciphertext. Prefer that newer plaintext and replace
  // the entire row with active-key ciphertext using an updated_at guard.
  if (row.access_token !== null || row.refresh_token !== null) {
    if (!row.access_token || !row.refresh_token) {
      throw new Error('PoE token storage contains an incomplete plaintext pair')
    }
    const refreshTokenFingerprint = await fingerprintPoeRefreshToken(row.refresh_token)
    return {
      tokens: {
        access_token: row.access_token,
        refresh_token: row.refresh_token,
        expires_at: row.expires_at,
      },
      row,
      refreshTokenFingerprint,
      source: 'plaintext',
      needsRewrite: true,
    }
  }

  if (!row.access_token_ciphertext || !row.refresh_token_ciphertext) {
    throw new Error('PoE token storage contains no complete token pair')
  }
  if (
    row.token_ciphertext_version === null ||
    !row.token_encryption_key_id ||
    !row.refresh_token_fingerprint
  ) {
    throw new Error('PoE token storage is missing encryption metadata')
  }

  const [access, refresh] = await Promise.all([
    decryptPoeToken(row.access_token_ciphertext, tokenContext(userId, 'access'), config),
    decryptPoeToken(row.refresh_token_ciphertext, tokenContext(userId, 'refresh'), config),
  ])
  if (
    access.version !== row.token_ciphertext_version ||
    refresh.version !== row.token_ciphertext_version ||
    access.keyId !== row.token_encryption_key_id ||
    refresh.keyId !== row.token_encryption_key_id
  ) {
    throw new Error('PoE token ciphertext metadata does not match its envelope')
  }

  const refreshTokenFingerprint = await fingerprintPoeRefreshToken(refresh.plaintext)
  if (refreshTokenFingerprint !== row.refresh_token_fingerprint) {
    throw new Error('PoE refresh-token fingerprint does not match ciphertext')
  }

  return {
    tokens: {
      access_token: access.plaintext,
      refresh_token: refresh.plaintext,
      expires_at: row.expires_at,
    },
    row,
    refreshTokenFingerprint,
    source: 'ciphertext',
    needsRewrite: access.needsRotation || refresh.needsRotation,
  }
}

export async function resolvePoeTokenStorage(
  userId: string,
  config: PoeTokenEncryptionConfig,
  resolver: PoeTokenStorageResolver,
): Promise<DecodedPoeTokenStorage> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const decoded = await decodePoeTokenStorage(await resolver.load(), userId, config)
    if (!decoded.needsRewrite) return decoded

    const encryptedStorage = await buildEncryptedPoeTokenStorage(userId, decoded.tokens, config)
    const rewritten = await resolver.rewrite(encryptedStorage, {
      updatedAt: decoded.row.updated_at,
      refreshTokenFingerprint:
        decoded.source === 'ciphertext' ? decoded.refreshTokenFingerprint : null,
    })
    if (rewritten) return await decodePoeTokenStorage(rewritten, userId, config)
  }

  throw new Error('PoE OAuth token storage changed repeatedly during upgrade')
}
