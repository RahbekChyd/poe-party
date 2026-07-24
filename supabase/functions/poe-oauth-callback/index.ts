/**
 * Exchanges a GGG OAuth authorization code and binds the resulting identity to
 * the provider's immutable UUID subject. Account names are display attributes,
 * never identity lookup keys.
 */
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import {
  parsePoeAccountSubject,
  requireEnvironmentValue,
  resolveOauthReturnUrl,
} from '../_shared/oauth-security.ts'
import { POE_OAUTH_SCOPES } from '../_shared/poe-oauth-scopes.ts'
import {
  assertPoeTokenEncryptionConfigured,
  upsertStoredPoeTokens,
} from '../_shared/poe-token-store.ts'
import { createAdminClient } from '../_shared/supabase-admin.ts'

const POE_TOKEN_URL = 'https://www.pathofexile.com/oauth/token'
const responseHeaders = {
  ...corsHeaders,
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json',
}

type OAuthRequest = {
  code?: unknown
  state?: unknown
  code_verifier?: unknown
  redirect_to?: unknown
}

type PoeTokenResponse = {
  access_token?: unknown
  refresh_token?: unknown
  expires_in?: unknown
  username?: unknown
  sub?: unknown
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders })
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...responseHeaders, Allow: 'POST' },
    })
  }

  try {
    let payload: OAuthRequest
    try {
      payload = (await req.json()) as OAuthRequest
    } catch {
      return jsonResponse({ error: 'Invalid JSON request body' }, 400)
    }

    const { code, state, code_verifier: codeVerifier, redirect_to: redirectTo } = payload
    if (!isNonEmptyString(code) || !isNonEmptyString(state) || !isNonEmptyString(codeVerifier)) {
      return jsonResponse({ error: 'Missing OAuth callback parameters' }, 400)
    }

    let allowedReturnUrl: string
    try {
      allowedReturnUrl = resolveOauthReturnUrl(redirectTo)
    } catch (error) {
      console.warn('Rejected OAuth return URL:', error instanceof Error ? error.message : 'invalid')
      return jsonResponse({ error: 'Invalid OAuth return URL' }, 400)
    }

    const clientId = requireEnvironmentValue('POE_CLIENT_ID')
    const clientSecret = requireEnvironmentValue('POE_CLIENT_SECRET')
    const redirectUri = requireEnvironmentValue('POE_REDIRECT_URI')
    await assertPoeTokenEncryptionConfigured()

    const tokenRes = await fetch(POE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code.trim(),
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
        scope: POE_OAUTH_SCOPES.join(' '),
        code_verifier: codeVerifier.trim(),
      }),
    })

    if (!tokenRes.ok) {
      console.warn('PoE OAuth token exchange rejected', { status: tokenRes.status })
      return jsonResponse({ error: 'OAuth authorization code was rejected or expired' }, 400)
    }

    let tokens: PoeTokenResponse
    try {
      tokens = (await tokenRes.json()) as PoeTokenResponse
    } catch {
      console.error('PoE OAuth token exchange returned invalid JSON')
      return jsonResponse({ error: 'OAuth provider returned an invalid response' }, 502)
    }

    const accountName = isNonEmptyString(tokens.username) ? tokens.username.trim() : null
    const subject = parsePoeAccountSubject(tokens.sub)
    const expiresIn = typeof tokens.expires_in === 'number' ? tokens.expires_in : Number.NaN
    if (
      !accountName ||
      !subject ||
      !isNonEmptyString(tokens.access_token) ||
      !isNonEmptyString(tokens.refresh_token) ||
      !Number.isFinite(expiresIn) ||
      expiresIn <= 0
    ) {
      console.error('PoE OAuth token exchange omitted required identity or token fields')
      return jsonResponse({ error: 'OAuth provider returned an incomplete response' }, 502)
    }

    const adminClient = createAdminClient()
    const { data: subjectUser, error: subjectLookupError } = await adminClient
      .from('users')
      .select('id, poe_account_name')
      .eq('poe_account_sub', subject)
      .maybeSingle()

    if (subjectLookupError) {
      console.error('OAuth subject lookup failed', { code: subjectLookupError.code })
      return jsonResponse({ error: 'Unable to complete sign-in' }, 500)
    }

    let userId: string
    let authEmail: string

    if (subjectUser) {
      userId = subjectUser.id

      if (subjectUser.poe_account_name !== accountName) {
        const { data: nameConflict, error: nameConflictError } = await adminClient
          .from('users')
          .select('id')
          .eq('poe_account_name', accountName)
          .neq('id', userId)
          .maybeSingle()

        if (nameConflictError) {
          console.error('OAuth account-name conflict check failed', {
            code: nameConflictError.code,
          })
          return jsonResponse({ error: 'Unable to complete sign-in' }, 500)
        }
        if (nameConflict) {
          return jsonResponse(
            {
              error: 'This Path of Exile account requires a manual identity migration',
              code: 'oauth_identity_migration_required',
            },
            409,
          )
        }

        const { error: renameError } = await adminClient
          .from('users')
          .update({ poe_account_name: accountName })
          .eq('id', userId)
        if (renameError) {
          console.error('Verified OAuth account-name update failed', { code: renameError.code })
          return jsonResponse({ error: 'Unable to complete sign-in' }, 500)
        }
      }

      const { data: authUserData, error: authUserError } =
        await adminClient.auth.admin.getUserById(userId)
      if (authUserError || !authUserData.user?.email) {
        console.error('OAuth identity has no matching auth user')
        return jsonResponse({ error: 'Unable to complete sign-in' }, 500)
      }
      authEmail = authUserData.user.email

      const { error: authMetadataError } = await adminClient.auth.admin.updateUserById(userId, {
        app_metadata: {
          ...authUserData.user.app_metadata,
          poe_account_sub: subject,
          identity_provider: 'pathofexile',
        },
        user_metadata: {
          ...authUserData.user.user_metadata,
          poe_account_name: accountName,
        },
      })
      if (authMetadataError) {
        console.error('OAuth auth metadata update failed')
        return jsonResponse({ error: 'Unable to complete sign-in' }, 500)
      }
    } else {
      const { data: legacyNameUser, error: legacyLookupError } = await adminClient
        .from('users')
        .select('id')
        .eq('poe_account_name', accountName)
        .maybeSingle()

      if (legacyLookupError) {
        console.error('Legacy OAuth identity lookup failed', { code: legacyLookupError.code })
        return jsonResponse({ error: 'Unable to complete sign-in' }, 500)
      }
      if (legacyNameUser) {
        return jsonResponse(
          {
            error: 'This Path of Exile account requires a manual identity migration',
            code: 'oauth_identity_migration_required',
          },
          409,
        )
      }

      authEmail = `${subject}@oauth.poe.invalid`
      const { data: newAuthUser, error: authError } = await adminClient.auth.admin.createUser({
        email: authEmail,
        email_confirm: true,
        app_metadata: {
          poe_account_sub: subject,
          identity_provider: 'pathofexile',
        },
        user_metadata: { poe_account_name: accountName },
      })

      if (authError || !newAuthUser.user) {
        console.error('OAuth auth-user creation failed')
        return jsonResponse({ error: 'Unable to create account' }, 500)
      }

      userId = newAuthUser.user.id
      const { error: profileError } = await adminClient.from('users').insert({
        id: userId,
        poe_account_name: accountName,
        poe_account_sub: subject,
      })

      if (profileError) {
        console.error('OAuth profile creation failed', { code: profileError.code })
        const { error: cleanupError } = await adminClient.auth.admin.deleteUser(userId)
        if (cleanupError) console.error('OAuth orphaned auth-user cleanup failed')
        return jsonResponse(
          profileError.code === '23505'
            ? {
                error: 'This Path of Exile account requires a manual identity migration',
                code: 'oauth_identity_migration_required',
              }
            : { error: 'Unable to create account' },
          profileError.code === '23505' ? 409 : 500,
        )
      }
    }

    await upsertStoredPoeTokens(userId, {
      access_token: tokens.access_token.trim(),
      refresh_token: tokens.refresh_token.trim(),
      expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    })

    const { data: sessionData, error: sessionError } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email: authEmail,
      options: { redirectTo: allowedReturnUrl },
    })

    const magicLink = sessionData?.properties?.action_link
    if (sessionError || !magicLink) {
      console.error('OAuth session-link generation failed')
      return jsonResponse({ error: 'Unable to create session' }, 500)
    }

    return jsonResponse({
      magic_link: magicLink,
      user: { id: userId, poe_account_name: accountName },
    })
  } catch (error) {
    console.error('OAuth callback failed', {
      name: error instanceof Error ? error.name : 'UnknownError',
    })
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})
