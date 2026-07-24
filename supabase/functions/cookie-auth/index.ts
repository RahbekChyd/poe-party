import { corsHeaders, handleCors } from '../_shared/cors.ts'

const retiredHeaders = {
  ...corsHeaders,
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json',
}

/**
 * Cookie-derived application identities are intentionally retired.
 *
 * Local development may still proxy POESESSID directly through Vite when a
 * developer explicitly opts into that workflow, but a public Edge Function
 * must never mint a Supabase identity from an account name or shared password.
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
