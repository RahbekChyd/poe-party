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
const DEFAULT_REDIRECT_URI = 'https://poe-party.com/auth/callback'

export function usePoeOAuthUrl() {
  const getOAuthUrl = async (): Promise<string> => {
    const isProductionOrigin = window.location.origin === 'https://poe-party.com'
    const clientId =
      (import.meta.env.VITE_POE_CLIENT_ID as string | undefined) ??
      (isProductionOrigin ? DEFAULT_CLIENT_ID : undefined)
    const redirectUri =
      (import.meta.env.VITE_POE_REDIRECT_URI as string | undefined) ??
      (isProductionOrigin ? DEFAULT_REDIRECT_URI : undefined)

    if (!clientId || !redirectUri) {
      // In dev/mock mode, redirect to our mock callback
      const mockUrl = new URL('/auth/callback', window.location.origin)
      mockUrl.searchParams.set('mock', '1')
      return mockUrl.toString()
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
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    })

    return `${POE_AUTH_BASE}?${params.toString()}`
  }

  return { getOAuthUrl }
}
