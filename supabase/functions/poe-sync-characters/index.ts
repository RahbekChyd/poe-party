import { createAdminClient } from '../_shared/supabase-admin.ts'
import { PoeApiClient } from '../_shared/poe-api-client.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { ensureFreshPoeAccessToken } from '../_shared/poe-token-store.ts'
import { requireAuthenticatedUser } from '../_shared/request-auth.ts'
import { normalizeCharacterClassInfo } from '../_shared/poe-character-class.ts'
import { getPoeRealm, normalizePoeGame } from '../_shared/poe-game.ts'

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null) {
    const message = 'message' in error ? error.message : undefined
    if (typeof message === 'string' && message.length > 0) return message

    const code = 'code' in error ? error.code : undefined
    const details = 'details' in error ? error.details : undefined
    const hint = 'hint' in error ? error.hint : undefined

    try {
      return JSON.stringify({ message, code, details, hint })
    } catch {
      return String(error)
    }
  }
  return String(error)
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const authenticatedUser = await requireAuthenticatedUser(req)
    if (authenticatedUser instanceof Response) return authenticatedUser

    const { group_id, user_id } = await req.json() as {
      group_id: string
      user_id: string
    }

    if (!group_id || !user_id) {
      return new Response(JSON.stringify({ error: 'Missing required parameters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (authenticatedUser.id !== user_id) {
      return new Response(JSON.stringify({ error: 'Cannot sync another user' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const adminClient = createAdminClient()
    const [{ data: groupData, error: groupError }, { data: membership, error: membershipError }] =
      await Promise.all([
        adminClient.from('groups').select('game, league').eq('id', group_id).single(),
        adminClient
          .from('group_members')
          .select('role')
          .eq('group_id', group_id)
          .eq('user_id', user_id)
          .maybeSingle(),
      ])

    if (groupError) throw groupError
    if (membershipError) throw membershipError
    if (!membership) {
      return new Response(JSON.stringify({ error: 'Not a member of this group' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const game = normalizePoeGame(groupData?.game)
    const groupLeague = typeof groupData?.league === 'string' ? groupData.league : ''
    const accessToken = await ensureFreshPoeAccessToken(user_id)
    const poeClient = new PoeApiClient(accessToken)
    const { characters } = await poeClient.getCharacters(getPoeRealm(game))
    const groupCharacters = characters.filter((character) => character.league === groupLeague)

    if (groupCharacters.length > 0) {
      const { error: upsertError } = await adminClient.from('characters').upsert(
        groupCharacters.map((c) => {
          const normalized = normalizeCharacterClassInfo(game, c.class, c.ascendancyClass ?? 0)
          return {
            user_id,
            group_id,
            poe_character_id: c.id,
            name: c.name,
            league: c.league,
            class: normalized.className,
            ascendancy_class: normalized.ascendancyClass,
            level: c.level,
            experience: c.experience,
            is_active: c.current ?? false,
            raw_data: c,
            snapshotted_at: new Date().toISOString(),
          }
        }),
        { onConflict: 'user_id,group_id,poe_character_id' },
      )

      if (upsertError) throw upsertError
    }

    return new Response(
      JSON.stringify({ count: groupCharacters.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('Character sync error:', err)
    return new Response(JSON.stringify({
      error: 'Character sync failed',
      detail: toErrorMessage(err),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
