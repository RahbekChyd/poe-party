
const PKCE_VERIFIER_LENGTH = 64

export const POE_OAUTH_STATE_KEY = 'poe_oauth_state'
export const POE_OAUTH_CODE_VERIFIER_KEY = 'poe_oauth_code_verifier'

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

export function generateOAuthState(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return toBase64Url(bytes)
}

export function generateCodeVerifier(): string {
  const bytes = new Uint8Array(PKCE_VERIFIER_LENGTH)
  crypto.getRandomValues(bytes)
  return toBase64Url(bytes)
}

export async function createCodeChallenge(codeVerifier: string): Promise<string> {
  const data = new TextEncoder().encode(codeVerifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return toBase64Url(new Uint8Array(digest))
}
