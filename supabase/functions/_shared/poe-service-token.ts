const POE_TOKEN_URL = 'https://www.pathofexile.com/oauth/token'
const SERVICE_TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000

interface CachedServiceToken {
  accessToken: string
  expiresAtMs: number
}

const serviceTokenCache = new Map<string, CachedServiceToken>()

export async function getPoeServiceAccessToken(scopes: string[]): Promise<string> {
  const normalizedScope = [...new Set(scopes.map((scope) => scope.trim()).filter(Boolean))]
    .sort()
    .join(' ')

  if (!normalizedScope) {
    throw new Error('At least one PoE service scope is required')
  }

  const cachedToken = serviceTokenCache.get(normalizedScope)
  if (cachedToken && cachedToken.expiresAtMs - Date.now() > SERVICE_TOKEN_REFRESH_BUFFER_MS) {
    return cachedToken.accessToken
  }

  const clientId = Deno.env.get('POE_CLIENT_ID')
  const clientSecret = Deno.env.get('POE_CLIENT_SECRET')

  if (!clientId || !clientSecret) {
    throw new Error('Missing PoE OAuth client credentials for service token')
  }

  const tokenRes = await fetch(POE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: normalizedScope,
    }),
  })

  if (!tokenRes.ok) {
    const detail = await tokenRes.text()
    throw new Error(`PoE service token request failed: ${detail}`)
  }

  const tokenData = (await tokenRes.json()) as {
    access_token?: string
    expires_in?: number
  }

  if (!tokenData.access_token || !Number.isFinite(tokenData.expires_in)) {
    throw new Error('PoE service token response was missing access token metadata')
  }

  const cachedServiceToken: CachedServiceToken = {
    accessToken: tokenData.access_token,
    expiresAtMs: Date.now() + Number(tokenData.expires_in) * 1000,
  }

  serviceTokenCache.set(normalizedScope, cachedServiceToken)
  return cachedServiceToken.accessToken
}
