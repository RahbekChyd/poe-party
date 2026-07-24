import { PoeApiClient } from '../_shared/poe-api-client.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { ensureFreshPoeAccessToken } from '../_shared/poe-token-store.ts'
import { requireAuthenticatedUser } from '../_shared/request-auth.ts'

function parseHexColour(hex?: string): { r: number; g: number; b: number } {
  if (!hex || !/^[0-9a-fA-F]{6}$/.test(hex)) {
    return { r: 128, g: 128, b: 128 }
  }

  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  }
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const authenticatedUser = await requireAuthenticatedUser(req)
    if (authenticatedUser instanceof Response) return authenticatedUser

    const { user_id, league } = (await req.json()) as {
      user_id: string
      league: string
    }

    if (!user_id || !league) {
      return new Response(JSON.stringify({ error: 'Missing required parameters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (authenticatedUser.id !== user_id) {
      return new Response(JSON.stringify({ error: 'Cannot list stash tabs for another user' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const accessToken = await ensureFreshPoeAccessToken(user_id)
    const poeClient = new PoeApiClient(accessToken)
    const { stashes } = await poeClient.listStashes(league)
    const tabs = stashes
      .filter((stash) => !(stash as { hidden?: boolean }).hidden && stash.type !== 'Folder')
      .map((stash) => ({
        id: stash.id,
        parent: stash.parent ?? null,
        i: stash.index,
        n: stash.name,
        type: stash.type,
        colour: parseHexColour(stash.metadata?.colour),
      }))

    return new Response(JSON.stringify({ tabs }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('List stash tabs error:', err)
    return new Response(JSON.stringify({ error: 'Failed to list stash tabs' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
