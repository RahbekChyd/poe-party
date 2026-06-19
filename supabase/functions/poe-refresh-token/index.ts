/**
 * poe-refresh-token Edge Function
 *
 * Refreshes an expired GGG access token using the stored refresh token.
 * Called automatically when the stored token is near expiry.
 */

import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { getStoredPoeTokens, upsertStoredPoeTokens } from '../_shared/poe-token-store.ts'

const POE_TOKEN_URL = 'https://www.pathofexile.com/oauth/token'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const { user_id } = await req.json() as { user_id: string }

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: 'Missing user_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const storedTokens = await getStoredPoeTokens(user_id)
    const refreshToken = storedTokens.refresh_token
    const clientId = Deno.env.get('POE_CLIENT_ID')!
    const clientSecret = Deno.env.get('POE_CLIENT_SECRET')!

    const tokenRes = await fetch(POE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    })

    if (!tokenRes.ok) {
      const text = await tokenRes.text()
      console.error('Token refresh failed:', text)
      return new Response(
        JSON.stringify({ error: 'Token refresh failed', detail: text }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const tokens = await tokenRes.json() as {
      access_token: string
      refresh_token: string
      expires_in: number
    }

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    await upsertStoredPoeTokens(user_id, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
    })

    return new Response(
      JSON.stringify({ expires_at: expiresAt }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('Token refresh error:', err)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
