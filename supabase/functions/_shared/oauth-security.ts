const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function normalizeCallbackUrl(raw: string): string | null {
  try {
    const url = new URL(raw)
    const isLoopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    const hasSafeProtocol = url.protocol === 'https:' || (isLoopback && url.protocol === 'http:')

    if (
      !hasSafeProtocol ||
      url.username ||
      url.password ||
      url.pathname !== '/auth/callback' ||
      url.search ||
      url.hash
    ) {
      return null
    }

    return url.toString()
  } catch {
    return null
  }
}

export function requireEnvironmentValue(name: string): string {
  const value = Deno.env.get(name)?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

export function parsePoeAccountSubject(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return UUID_PATTERN.test(normalized) ? normalized : null
}

/** Only call after validating a successful provider token response. */
export function buildOAuthIdentityMigrationError(verifiedSubject: string) {
  const subject = parsePoeAccountSubject(verifiedSubject)
  if (!subject) throw new Error('A verified PoE UUID is required for identity recovery')
  return {
    error: 'This Path of Exile account requires a manual identity migration',
    code: 'oauth_identity_migration_required',
    // This is the caller's own provider identity, not proof of old-profile ownership.
    // Private operators can use it during separately reviewed reconciliation.
    verified_poe_account_sub: subject,
  }
}

export function resolveOauthReturnUrl(requestedUrl: unknown): string {
  if (typeof requestedUrl !== 'string') {
    throw new Error('OAuth return URL is required')
  }

  const normalizedRequested = normalizeCallbackUrl(requestedUrl.trim())
  if (!normalizedRequested) throw new Error('OAuth return URL is invalid')

  const configuredUrls = [
    Deno.env.get('POE_REDIRECT_URI') ?? '',
    ...(Deno.env.get('POE_ALLOWED_RETURN_URLS') ?? '').split(','),
  ]
    .map((value) => normalizeCallbackUrl(value.trim()))
    .filter((value): value is string => Boolean(value))

  if (configuredUrls.length === 0) {
    throw new Error('No OAuth return URLs are configured')
  }

  if (!new Set(configuredUrls).has(normalizedRequested)) {
    throw new Error('OAuth return URL is not allowed')
  }

  return normalizedRequested
}
