/**
 * Refreshes the authenticated caller's GGG OAuth token when it is near expiry.
 * A caller can never select another user's token row.
 */
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { ensureFreshPoeTokens } from '../_shared/poe-token-store.ts'
import { requireAuthenticatedUser } from '../_shared/request-auth.ts'

const responseHeaders = {
  ...corsHeaders,
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json',
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

  const authenticatedUser = await requireAuthenticatedUser(req)
  if (authenticatedUser instanceof Response) return authenticatedUser

  try {
    let requestedUserId: unknown
    try {
      const body = (await req.json()) as { user_id?: unknown }
      requestedUserId = body.user_id
    } catch {
      requestedUserId = undefined
    }

    if (
      typeof requestedUserId === 'string' &&
      requestedUserId.length > 0 &&
      requestedUserId !== authenticatedUser.id
    ) {
      return new Response(JSON.stringify({ error: "Cannot refresh another user's token" }), {
        status: 403,
        headers: responseHeaders,
      })
    }

    const tokens = await ensureFreshPoeTokens(authenticatedUser.id)
    return new Response(JSON.stringify({ expires_at: tokens.expires_at }), {
      headers: responseHeaders,
    })
  } catch (error) {
    console.error('PoE token refresh failed', {
      name: error instanceof Error ? error.name : 'UnknownError',
    })
    return new Response(JSON.stringify({ error: 'Unable to refresh Path of Exile access' }), {
      status: 400,
      headers: responseHeaders,
    })
  }
})
