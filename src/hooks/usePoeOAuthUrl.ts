import {
  createCodeChallenge,
  generateCodeVerifier,
  generateOAuthState,
  POE_OAUTH_CODE_VERIFIER_KEY,
  POE_OAUTH_STATE_KEY,
} from '../lib/poe-oauth'
import { POE_OAUTH_SCOPES } from '../lib/poe-oauth-scopes'
const POE_AUTH_BASE = 'https://www.pathofexile.com/oauth/authorize'
const DEFAULT_CLIENT_ID = 'poeparty'
const KNOWN_REDIRECT_URIS: Readonly<Record<string, string>> = {
  'https://poe-party.com': 'https://poe-party.com/auth/callback',
  'https://preview-poe-party.xyz': 'https://preview-poe-party.xyz/auth/callback',
}

function isLoopbackOrigin(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  } catch {
    return false
  }
}

export function usePoeOAuthUrl() {
  const getOAuthUrl = async (): Promise<string> => {
    const knownRedirectUri = KNOWN_REDIRECT_URIS[window.location.origin]
    const clientId =
      (import.meta.env.VITE_POE_CLIENT_ID as string | undefined) ??
      (knownRedirectUri ? DEFAULT_CLIENT_ID : undefined)
    const redirectUri =
      (import.meta.env.VITE_POE_REDIRECT_URI as string | undefined) ??
      knownRedirectUri

    if (!clientId || !redirectUri) {
      if (import.meta.env.DEV && isLoopbackOrigin(window.location.origin)) {
        const mockUrl = new URL('/auth/callback', window.location.origin)
        mockUrl.searchParams.set('mock', '1')
        return mockUrl.toString()
      }

      throw new Error('Path of Exile OAuth is not configured for this deployment')
    }

    const configuredRedirectUri = new URL(redirectUri)
    if (
      configuredRedirectUri.origin !== window.location.origin ||
      configuredRedirectUri.pathname !== '/auth/callback' ||
      configuredRedirectUri.search ||
      configuredRedirectUri.hash
    ) {
      throw new Error(
        'Open this deployment through its configured OAuth domain before connecting your account',
      )
    }

    const state = generateOAuthState()
    const codeVerifier = generateCodeVerifier()
    const codeChallenge = await createCodeChallenge(codeVerifier)

    // Store state and verifier for CSRF validation and PKCE exchange.
    sessionStorage.setItem(POE_OAUTH_STATE_KEY, state)
    sessionStorage.setItem(POE_OAUTH_CODE_VERIFIER_KEY, codeVerifier)

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      scope: POE_OAUTH_SCOPES.join(' '),
      state,
      redirect_uri: configuredRedirectUri.toString(),
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    })

    return `${POE_AUTH_BASE}?${params.toString()}`
  }

  return { getOAuthUrl }
}
