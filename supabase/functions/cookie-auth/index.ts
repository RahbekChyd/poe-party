import { corsHeaders, handleCors } from '../_shared/cors.ts'

const retiredHeaders = {
  ...corsHeaders,
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json',
}

/**
 * Cookie-derived application identities are intentionally retired.
 *
 * The former local POESESSID transport is also retired. This tombstone remains
 * so stale clients fail without minting an identity or accepting credentials.
 */
Deno.serve((req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  return new Response(
    JSON.stringify({
      error: 'Cookie-based authentication has been retired. Use Path of Exile OAuth.',
      code: 'cookie_auth_retired',
    }),
    { status: 410, headers: retiredHeaders },
  )
})
