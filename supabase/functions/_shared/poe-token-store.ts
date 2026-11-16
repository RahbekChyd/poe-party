import { requireEnvironmentValue } from './oauth-security.ts'
import { getPoeTokenEncryptionConfig } from './poe-token-crypto.ts'
import {
  buildEncryptedPoeTokenStorage,
  decodePoeTokenStorage,
  resolvePoeTokenStorage,
  type StoredPoeTokens,
} from './poe-token-storage.ts'
import { createAdminClient } from './supabase-admin.ts'

export type { StoredPoeTokens } from './poe-token-storage.ts'

const POE_TOKEN_URL = 'https://www.pathofexile.com/oauth/token'
const REFRESH_WINDOW_MS = 5 * 60 * 1000
const TOKEN_SELECT = [
  'access_token',
  'refresh_token',
  'access_token_ciphertext',
  'refresh_token_ciphertext',
  'token_ciphertext_version',
  'token_encryption_key_id',
  'refresh_token_fingerprint',
  'expires_at',
  'updated_at',
].join(', ')

const refreshFlights = new Map<string, Promise<StoredPoeTokens>>()

function isUsableTokenPayload(value: unknown): value is {
  access_token: string
  refresh_token?: string
  expires_in: number
} {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    typeof record.access_token === 'string' &&
    record.access_token.length > 0 &&
    (record.refresh_token === undefined ||
      (typeof record.refresh_token === 'string' && record.refresh_token.length > 0)) &&
    typeof record.expires_in === 'number' &&
    Number.isFinite(record.expires_in) &&
    record.expires_in > 0
  )
}

function needsRefresh(tokens: StoredPoeTokens): boolean {
  const expiresAtMs = new Date(tokens.expires_at).getTime()
  return !Number.isFinite(expiresAtMs) || expiresAtMs - Date.now() < REFRESH_WINDOW_MS
}

export async function assertPoeTokenEncryptionConfigured(): Promise<void> {
  await getPoeTokenEncryptionConfig()
}

async function loadStoredPoeTokenSnapshot(userId: string) {
  const config = await getPoeTokenEncryptionConfig()
  const adminClient = createAdminClient()

  return await resolvePoeTokenStorage(userId, config, {
    load: async () => {
      const { data, error } = await adminClient
        .from('poe_oauth_tokens')
        .select(TOKEN_SELECT)
        .eq('user_id', userId)
        .single()

      if (error || !data) {
        throw new Error('Stored PoE OAuth tokens not found for user')
      }
      return data
    },
    rewrite: async (encryptedStorage, guard) => {
      const update = adminClient
        .from('poe_oauth_tokens')
        .update(encryptedStorage)
        .eq('user_id', userId)
        .eq('updated_at', guard.updatedAt)
      const guardedUpdate = guard.refreshTokenFingerprint
        ? update.eq('refresh_token_fingerprint', guard.refreshTokenFingerprint)
        : update
      const { data, error } = await guardedUpdate.select(TOKEN_SELECT).maybeSingle()

      if (error) {
        console.warn('PoE token storage upgrade failed', { code: error.code })
        throw new Error('Unable to upgrade stored PoE OAuth tokens')
      }
      return data
    },
  })
}

export async function getStoredPoeTokens(userId: string): Promise<StoredPoeTokens> {
  return (await loadStoredPoeTokenSnapshot(userId)).tokens
}

async function updateCachedExpiry(userId: string, expiresAt: string): Promise<void> {
  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('users')
    .update({ poe_token_expires_at: expiresAt })
    .eq('id', userId)

  if (error) {
    console.warn('PoE token-expiry cache update failed', { code: error.code })
  }
}

export async function upsertStoredPoeTokens(
  userId: string,
  tokens: StoredPoeTokens,
): Promise<void> {
  const config = await getPoeTokenEncryptionConfig()
  const encryptedStorage = await buildEncryptedPoeTokenStorage(userId, tokens, config)
  const adminClient = createAdminClient()
  const { error } = await adminClient.from('poe_oauth_tokens').upsert({
    user_id: userId,
    ...encryptedStorage,
  })

  if (error) throw new Error('Unable to store PoE OAuth tokens')
  await updateCachedExpiry(userId, tokens.expires_at)
}

async function persistRotatedTokens(
  userId: string,
  expectedRefreshTokenFingerprint: string,
  expectedUpdatedAt: string,
  tokens: StoredPoeTokens,
): Promise<StoredPoeTokens> {
  const config = await getPoeTokenEncryptionConfig()
  const encryptedStorage = await buildEncryptedPoeTokenStorage(userId, tokens, config)
  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from('poe_oauth_tokens')
    .update(encryptedStorage)
    .eq('user_id', userId)
    .eq('refresh_token_fingerprint', expectedRefreshTokenFingerprint)
    .eq('updated_at', expectedUpdatedAt)
    .select(TOKEN_SELECT)
    .maybeSingle()

  if (error) throw new Error('Unable to store refreshed PoE OAuth tokens')

  // Another isolate may have completed a rotation first. Its fingerprint wins;
  // randomized AES-GCM ciphertext is intentionally never used for equality.
  if (!data) return await getStoredPoeTokens(userId)

  const persisted = await decodePoeTokenStorage(data, userId, config)
  await updateCachedExpiry(userId, tokens.expires_at)
  return persisted.tokens
}

async function refreshTokens(userId: string): Promise<StoredPoeTokens> {
  const stored = await loadStoredPoeTokenSnapshot(userId)
  if (!needsRefresh(stored.tokens)) return stored.tokens

  const clientId = requireEnvironmentValue('POE_CLIENT_ID')
  const clientSecret = requireEnvironmentValue('POE_CLIENT_SECRET')
  const tokenRes = await fetch(POE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: stored.tokens.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })

  if (!tokenRes.ok) {
    // Refresh tokens rotate immediately. If another isolate won the race, use
    // the row with the changed fingerprint instead of surfacing a false error.
    const latest = await loadStoredPoeTokenSnapshot(userId)
    if (latest.refreshTokenFingerprint !== stored.refreshTokenFingerprint) {
      return latest.tokens
    }

    console.warn('PoE OAuth token refresh rejected', { status: tokenRes.status })
    throw new Error('PoE OAuth token refresh failed')
  }

  let refreshed: unknown
  try {
    refreshed = await tokenRes.json()
  } catch {
    console.error('PoE OAuth token refresh returned invalid JSON')
    throw new Error('PoE OAuth token refresh failed')
  }

  if (!isUsableTokenPayload(refreshed)) {
    console.error('PoE OAuth token refresh omitted required fields')
    throw new Error('PoE OAuth token refresh failed')
  }

  return await persistRotatedTokens(userId, stored.refreshTokenFingerprint, stored.row.updated_at, {
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token ?? stored.tokens.refresh_token,
    expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
  })
}

export async function ensureFreshPoeTokens(userId: string): Promise<StoredPoeTokens> {
  const existingFlight = refreshFlights.get(userId)
  if (existingFlight) return await existingFlight

  const flight = refreshTokens(userId)
  refreshFlights.set(userId, flight)

  try {
    return await flight
  } finally {
    if (refreshFlights.get(userId) === flight) refreshFlights.delete(userId)
  }
}

export async function ensureFreshPoeAccessToken(userId: string): Promise<string> {
  return (await ensureFreshPoeTokens(userId)).access_token
}
