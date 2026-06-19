/**
 * poe-oauth-callback Edge Function
 *
 * Handles the GGG OAuth2 authorization_code flow:
 * 1. Receives the authorization code from the browser
 * 2. Exchanges it for access + refresh tokens (server-side, keeps secret secure)
 * 3. Fetches the PoE account profile
 * 4. Creates or updates the Supabase user
 * 5. Stores PoE OAuth tokens server-side for later refresh and sync actions
 * 6. Returns a Supabase session to the client
 */
import { createAdminClient } from '../_shared/supabase-admin.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { upsertStoredPoeTokens } from '../_shared/poe-token-store.ts'

const POE_TOKEN_URL = 'https://www.pathofexile.com/oauth/token'
const SCOPES = [
  'account:characters',
  'account:stashes',
  'account:league_accounts',
  'account:leagues',
  'account:item_filter',
]

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const { code, state, code_verifier, redirect_to } = await req.json() as {
      code: string
      state: string
      code_verifier: string
      redirect_to?: string
    }

    if (!code || !state || !code_verifier) {
      return new Response(
        JSON.stringify({ error: 'Missing code, state, or code_verifier parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const clientId = Deno.env.get('POE_CLIENT_ID')!
    const clientSecret = Deno.env.get('POE_CLIENT_SECRET')!
    const redirectUri = Deno.env.get('POE_REDIRECT_URI')!

    // Exchange authorization code for tokens
    const tokenRes = await fetch(POE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
        scope: SCOPES.join(' '),
        code_verifier,
      }),
    })

    if (!tokenRes.ok) {
      const text = await tokenRes.text()
      console.error('Token exchange failed:', text)
      return new Response(
        JSON.stringify({ error: 'Token exchange failed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const tokens = await tokenRes.json() as {
      access_token: string
      refresh_token: string
      expires_in: number
      scope?: string
      username: string
      sub?: string
    }

    if (!tokens.username) {
      return new Response(
        JSON.stringify({ error: 'Token exchange did not return a username' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const adminClient = createAdminClient()

    // Check if user already exists by poe_account_name
    const { data: existingUser } = await adminClient
      .from('users')
      .select('id')
      .eq('poe_account_name', tokens.username)
      .single()

    let userId: string

    if (existingUser) {
      userId = existingUser.id
    } else {
      // Create Supabase auth user
      const { data: newAuthUser, error: authError } = await adminClient.auth.admin.createUser({
        email: `${tokens.username}@poe.invalid`,
        email_confirm: true,
        user_metadata: { poe_account_name: tokens.username, poe_account_sub: tokens.sub ?? null },
      })

      if (authError || !newAuthUser.user) {
        console.error('Failed to create auth user:', authError)
        return new Response(
          JSON.stringify({ error: 'Failed to create user' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      userId = newAuthUser.user.id

      // Create public user record
      await adminClient.from('users').insert({
        id: userId,
        poe_account_name: tokens.username,
      })
    }

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    await upsertStoredPoeTokens(userId, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
    })

    // Create a session for the user
    const { data: sessionData, error: sessionError } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email: `${tokens.username}@poe.invalid`,
      options: redirect_to ? { redirectTo: redirect_to } : undefined,
    })

    if (sessionError || !sessionData) {
      console.error('Failed to generate session link:', sessionError)
      return new Response(
        JSON.stringify({ error: 'Failed to create session' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({
        magic_link: sessionData.properties?.action_link,
        user: { id: userId, poe_account_name: tokens.username },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('OAuth callback error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
