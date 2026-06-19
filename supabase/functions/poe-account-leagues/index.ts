import { PoeApiClient } from '../_shared/poe-api-client.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { ensureFreshPoeAccessToken } from '../_shared/poe-token-store.ts'
import { requireAuthenticatedUser } from '../_shared/request-auth.ts'

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const authenticatedUser = await requireAuthenticatedUser(req)
    if (authenticatedUser instanceof Response) return authenticatedUser

    const accessToken = await ensureFreshPoeAccessToken(authenticatedUser.id)
    const poeClient = new PoeApiClient(accessToken)
    const { leagues } = await poeClient.getAccountLeagues()

    return new Response(JSON.stringify({ leagues }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Account leagues error:', err)
    return new Response(JSON.stringify({ error: 'Failed to load account leagues' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
