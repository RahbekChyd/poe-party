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
  redirect_uri?: unknown
  /** @deprecated Kept temporarily for callbacks started by an older frontend build. */
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

    const {
      code,
      state,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
      redirect_to: legacyRedirectTo,
    } = payload
    if (!isNonEmptyString(code) || !isNonEmptyString(state) || !isNonEmptyString(codeVerifier)) {
      return jsonResponse({ error: 'Missing OAuth callback parameters' }, 400)
    }

    let allowedReturnUrl: string
    try {
      allowedReturnUrl = resolveOauthReturnUrl(redirectUri ?? legacyRedirectTo)
    } catch (error) {
      console.warn('Rejected OAuth return URL:', error instanceof Error ? error.message : 'invalid')
      return jsonResponse({ error: 'Invalid OAuth return URL' }, 400)
    }

    const clientId = requireEnvironmentValue('POE_CLIENT_ID')
    const clientSecret = requireEnvironmentValue('POE_CLIENT_SECRET')
    await assertPoeTokenEncryptionConfigured()

    const tokenRes = await fetch(POE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code.trim(),
        // The authorization code must be exchanged with the exact URI used to
        // start the flow. It has already passed the server-side exact allowlist,
        // which lets production and the stable Vercel preview callback coexist.
        redirect_uri: allowedReturnUrl,
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
    const expiresAtMs = Date.now() + expiresIn * 1000
    if (
      !accountName ||
      !subject ||
      !isNonEmptyString(tokens.access_token) ||
      !isNonEmptyString(tokens.refresh_token) ||
      !Number.isFinite(expiresIn) ||
      expiresIn <= 0 ||
      !Number.isFinite(expiresAtMs) ||
      expiresAtMs >= 8640000000000000
    ) {
      console.error('PoE OAuth token exchange omitted required identity or token fields')
      return jsonResponse({ error: 'OAuth provider returned an incomplete response' }, 502)
    }

    const adminClient = createAdminClient()
    const findSubjectUser = () => adminClient
      .from('users')
      .select('id, poe_account_name')
      .eq('poe_account_sub', subject)
      .maybeSingle()
    const subjectLookup = await findSubjectUser()
    let subjectUser = subjectLookup.data

    if (subjectLookup.error) {
      console.error('OAuth subject lookup failed', { code: subjectLookup.error.code })
      return jsonResponse({ error: 'Unable to complete sign-in' }, 500)
    }

    let isNewProfile = false
    const concurrentSignIn = () => jsonResponse({
      error: 'Another sign-in may still be completing. Please start a fresh sign-in.',
      code: 'oauth_sign_in_conflict',
    }, 409)

    if (!subjectUser) {
      const newAuthEmail = `${subject}@oauth.poe.invalid`
      const { data: newAuthUser, error: authError } = await adminClient.auth.admin.createUser({
        email: newAuthEmail,
        email_confirm: true,
        app_metadata: {
          poe_account_sub: subject,
          identity_provider: 'pathofexile',
        },
        user_metadata: { poe_account_name: accountName },
      })

      if (authError || !newAuthUser.user) {
        // A concurrent callback may have completed the same immutable identity.
        // Never fall back to an account-name lookup or reuse a name's old Auth ID.
        const winner = await findSubjectUser()
        if (winner.error) {
          console.error('OAuth concurrent subject lookup failed', { code: winner.error.code })
          return jsonResponse({ error: 'Unable to complete sign-in' }, 500)
        }
        subjectUser = winner.data
        if (!subjectUser) {
          console.error('OAuth auth-user creation failed')
          return authError?.code === 'email_exists' || authError?.code === 'user_already_exists'
            ? concurrentSignIn()
            : jsonResponse({ error: 'Unable to create account' }, 500)
        }
      } else {
        const createdAuthId = newAuthUser.user.id
        const { error: profileError } = await adminClient.from('users').insert({
          id: createdAuthId,
          poe_account_name: accountName,
          poe_account_sub: subject,
        })

        if (profileError) {
          // Resolve a duplicate/uncertain insert only by the provider UUID. The
          // winning profile may be this request's successful-but-lost insert.
          const winner = await findSubjectUser()
          if (winner.error) {
            console.error('OAuth profile outcome is uncertain', { code: winner.error.code })
            return jsonResponse({ error: 'Unable to complete sign-in' }, 500)
          }
          subjectUser = winner.data
          if (subjectUser?.id === createdAuthId) {
            isNewProfile = true
          } else {
            // Cleanup requires a definitive constraint rejection and a newly
            // created, profileless Auth ID. An uncertain insert can still commit
            // after an empty readback, so never cascade-delete it.
            const { data: createdProfile, error: cleanupCheckError } = await adminClient
              .from('users').select('id').eq('id', createdAuthId).maybeSingle()
            if (profileError.code === '23505' && !cleanupCheckError && !createdProfile) {
              const { error: cleanupError } = await adminClient.auth.admin.deleteUser(createdAuthId)
              if (cleanupError) console.error('OAuth orphaned auth-user cleanup failed')
            }
            if (!subjectUser) {
              console.error('OAuth profile creation failed', { code: profileError.code })
              return profileError.code === '23505'
                ? concurrentSignIn()
                : jsonResponse({ error: 'Unable to create account' }, 500)
            }
          }
        } else {
          subjectUser = { id: createdAuthId, poe_account_name: accountName }
          isNewProfile = true
        }
      }
    }

    const userId = subjectUser.id
    const { data: authUserData, error: authUserError } =
      await adminClient.auth.admin.getUserById(userId)
    if (authUserError || authUserData.user?.id !== userId || !authUserData.user.email) {
      console.error('OAuth identity has no matching auth user')
      return jsonResponse({ error: 'Unable to complete sign-in' }, 500)
    }
    const trustedSubject = authUserData.user.app_metadata?.poe_account_sub
    if (trustedSubject !== undefined && trustedSubject !== null &&
      parsePoeAccountSubject(trustedSubject) !== subject) {
      console.error('OAuth server-controlled identity conflicts with the profile')
      return jsonResponse({ error: 'Unable to safely verify this account', code: 'oauth_identity_conflict' }, 409)
    }
    const authEmail = authUserData.user.email

    // Display-name reuse or an older cached name cannot block a verified UUID.
    if (subjectUser.poe_account_name !== accountName) {
      const { error: renameError } = await adminClient.from('users')
        .update({ poe_account_name: accountName }).eq('id', userId).eq('poe_account_sub', subject)
      if (renameError) {
        console.error('Verified OAuth account-name update failed', { code: renameError.code })
        return jsonResponse({ error: 'Unable to complete sign-in' }, 500)
      }
    }

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

    await upsertStoredPoeTokens(userId, {
      access_token: tokens.access_token.trim(),
      refresh_token: tokens.refresh_token.trim(),
      expires_at: new Date(expiresAtMs).toISOString(),
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
      is_new_profile: isNewProfile,
    })
  } catch (error) {
    console.error('OAuth callback failed', {
      name: error instanceof Error ? error.name : 'UnknownError',
    })
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})
