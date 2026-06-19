import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { getPoeRealm, normalizePoeGame } from '../_shared/poe-game.ts'
import { getPoeServiceAccessToken } from '../_shared/poe-service-token.ts'

const POE_API_BASE = 'https://api.pathofexile.com'
const POE_WEBSITE_BASE = 'https://www.pathofexile.com'
const POE_SERVICE_SCOPE = 'service:leagues'

interface PoeLeague {
  id: string
  realm: string
  startAt?: string
  endAt?: string | null
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return 'Unknown error'
  }
}

function getUserAgent(): string {
  const clientId = Deno.env.get('POE_CLIENT_ID') ?? 'poe-party'
  const contact = Deno.env.get('POE_CONTACT') ?? 'support@poe-party.com'
  return `OAuth ${clientId}/1.0.0 (contact: ${contact})`
}

function normalizeLeagueResponse(payload: unknown): PoeLeague[] {
  if (Array.isArray(payload)) return payload as PoeLeague[]
  if (
    payload &&
    typeof payload === 'object' &&
    Array.isArray((payload as { leagues?: unknown }).leagues)
  ) {
    return (payload as { leagues: PoeLeague[] }).leagues
  }
  return []
}

async function fetchOfficialLeagues(game: 'poe1' | 'poe2'): Promise<PoeLeague[]> {
  const serviceToken = await getPoeServiceAccessToken([POE_SERVICE_SCOPE])
  const realm = getPoeRealm(game)
  const response = await fetch(
    `${POE_API_BASE}/league?type=main&realm=${encodeURIComponent(realm)}`,
    {
      headers: {
        Authorization: `Bearer ${serviceToken}`,
        'User-Agent': getUserAgent(),
      },
    },
  )

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Official PoE leagues request failed with ${response.status}: ${detail}`)
  }

  return normalizeLeagueResponse(await response.json())
}

async function fetchLegacyPoe1Leagues(): Promise<PoeLeague[]> {
  const response = await fetch(`${POE_WEBSITE_BASE}/api/leagues?type=main&realm=pc`, {
    headers: {
      'User-Agent': getUserAgent(),
      'X-Requested-With': 'XMLHttpRequest',
      Origin: POE_WEBSITE_BASE,
      Referer: `${POE_WEBSITE_BASE}/account/characters`,
    },
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Legacy PoE1 leagues request failed with ${response.status}: ${detail}`)
  }

  return normalizeLeagueResponse(await response.json())
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const body = (await req.json().catch(() => ({}))) as { game?: unknown }
    const game = normalizePoeGame(body.game)

    try {
      const leagues = await fetchOfficialLeagues(game)
      return new Response(JSON.stringify({ leagues, source: 'official' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } catch (error) {
      if (game === 'poe1') {
        const leagues = await fetchLegacyPoe1Leagues()
        return new Response(JSON.stringify({ leagues, source: 'legacy-poe1-fallback' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      throw error
    }
  } catch (error) {
    console.error('Public leagues error:', error)
    return new Response(
      JSON.stringify({
        error: 'Failed to load public leagues',
        detail: toErrorMessage(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
