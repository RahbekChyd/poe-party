import { createAdminClient } from './supabase-admin.ts'

const POE_TOKEN_URL = 'https://www.pathofexile.com/oauth/token'

interface StoredPoeTokens {
  access_token: string
  refresh_token: string
  expires_at: string
}

export async function getStoredPoeTokens(userId: string): Promise<StoredPoeTokens> {
  const adminClient = createAdminClient()
  const { data, error } = await adminClient
    .from('poe_oauth_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .single()

  if (error || !data) {
    throw new Error('Stored PoE OAuth tokens not found for user')
  }

  return data as StoredPoeTokens
}

export async function upsertStoredPoeTokens(
  userId: string,
  tokens: StoredPoeTokens,
) {
  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('poe_oauth_tokens')
    .upsert({
      user_id: userId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expires_at,
    })

  if (error) throw error

  await adminClient
    .from('users')
    .update({ poe_token_expires_at: tokens.expires_at })
    .eq('id', userId)
}

export async function ensureFreshPoeAccessToken(userId: string): Promise<string> {
  const stored = await getStoredPoeTokens(userId)
  const expiresAtMs = new Date(stored.expires_at).getTime()
  const needsRefresh = !Number.isFinite(expiresAtMs) || expiresAtMs - Date.now() < 5 * 60 * 1000

  if (!needsRefresh) return stored.access_token

  const clientId = Deno.env.get('POE_CLIENT_ID')!
  const clientSecret = Deno.env.get('POE_CLIENT_SECRET')!

  const tokenRes = await fetch(POE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: stored.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })

  if (!tokenRes.ok) {
    const detail = await tokenRes.text()
    throw new Error(`PoE token refresh failed: ${detail}`)
  }

  const refreshed = await tokenRes.json() as {
    access_token: string
    refresh_token?: string
    expires_in: number
  }

  const nextTokens: StoredPoeTokens = {
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token ?? stored.refresh_token,
    expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
  }

  await upsertStoredPoeTokens(userId, nextTokens)
  return nextTokens.access_token
}
