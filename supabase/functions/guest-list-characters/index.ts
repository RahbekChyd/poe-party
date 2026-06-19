import { corsHeaders, handleCors } from '../_shared/cors.ts'
import {
  fetchGuestCharacters,
  GuestPoePublicError,
  normalizeGuestAccountName,
} from '../_shared/guest-analysis.ts'

function errorResponse(error: unknown): Response {
  if (error instanceof GuestPoePublicError) {
    return new Response(JSON.stringify({ error: error.message, code: error.code }), {
      status: error.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  console.error('guest-list-characters error', error)
  return new Response(JSON.stringify({ error: 'Failed to list public characters' }), {
    status: 500,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const body = (await req.json()) as { account_name?: unknown }
    const { accountName } = normalizeGuestAccountName(body.account_name)
    const characters = await fetchGuestCharacters(accountName)

    if (characters.length === 0) {
      return new Response(
        JSON.stringify({
          error: 'No public PoE1 characters were found for that account.',
          code: 'no_public_characters',
        }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    return new Response(
      JSON.stringify({
        account_name: accountName,
        characters: characters.map((character) => ({
          name: character.name,
          class: character.class,
          league: character.league,
          level: character.level,
          realm: character.realm,
        })),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    return errorResponse(error)
  }
})
