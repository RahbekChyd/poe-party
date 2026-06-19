import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { queryKeys } from '../lib/queryKeys'
import { useMyProfile } from './useCurrentUser'
import { getPoeGameCapabilities, type PoeGame } from '../lib/poe-game'
interface PoeApiLeague {
  id: string
  realm: string
  startAt?: string
  endAt?: string | null
}

export interface PoeLeagueOption {
  id: string
  label: string
  group: 'current' | 'recent' | 'permanent'
}

const PERMANENT_IDS = new Set(['Standard', 'Hardcore', 'SSF Standard', 'SSF Hardcore'])

async function fetchPoeLeagues(game: PoeGame): Promise<PoeLeagueOption[]> {
  const { data, error } = await supabase.functions.invoke('poe-public-leagues', {
    body: { game },
  })
  if (error) throw error

  const leagues = Array.isArray(data?.leagues) ? (data.leagues as PoeApiLeague[]) : []
  const now = Date.now()

  const permanent = leagues.filter((league) => PERMANENT_IDS.has(league.id))
  const temp = leagues.filter((league) => !PERMANENT_IDS.has(league.id))

  temp.sort(
    (left, right) =>
      new Date(right.startAt ?? 0).getTime() - new Date(left.startAt ?? 0).getTime(),
  )

  const current = temp.filter((league) => !league.endAt || new Date(league.endAt).getTime() > now)
  const past = temp.filter((league) => !!league.endAt && new Date(league.endAt).getTime() <= now)

  return [
    ...current.map((league) => ({ id: league.id, label: league.id, group: 'current' as const })),
    ...past
      .slice(0, 1)
      .map((league) => ({ id: league.id, label: league.id, group: 'recent' as const })),
    ...permanent
      .filter((league) => league.id === 'Standard' || league.id === 'Hardcore')
      .map((league) => ({ id: league.id, label: league.id, group: 'permanent' as const })),
  ]
}

async function fetchAccountLeagues(): Promise<PoeLeagueOption[]> {
  const { data, error } = await supabase.functions.invoke('poe-account-leagues')
  if (error) throw error

  const leagues = Array.isArray(data?.leagues) ? (data.leagues as PoeApiLeague[]) : []
  const now = Date.now()

  const permanent = leagues.filter((league) => PERMANENT_IDS.has(league.id))
  const temp = leagues.filter((league) => !PERMANENT_IDS.has(league.id))

  temp.sort(
    (left, right) =>
      new Date(right.startAt ?? 0).getTime() - new Date(left.startAt ?? 0).getTime(),
  )

  const current = temp.filter((league) => !league.endAt || new Date(league.endAt).getTime() > now)
  const past = temp.filter((league) => !!league.endAt && new Date(league.endAt).getTime() <= now)

  return [
    ...current.map((league) => ({ id: league.id, label: league.id, group: 'current' as const })),
    ...past
      .slice(0, 1)
      .map((league) => ({ id: league.id, label: league.id, group: 'recent' as const })),
    ...permanent.map((league) => ({
      id: league.id,
      label: league.id,
      group: 'permanent' as const,
    })),
  ]
}

async function fetchPreferredLeagues(game: PoeGame, hasOAuthAccess: boolean): Promise<PoeLeagueOption[]> {
  const capabilities = getPoeGameCapabilities(game)

  if (!capabilities.supportsAccountLeagues || !hasOAuthAccess) {
    return fetchPoeLeagues(game)
  }

  try {
    const accountLeagues = await fetchAccountLeagues()
    if (accountLeagues.length > 0) {
      return accountLeagues
    }
  } catch (error) {
    console.warn('Falling back to public leagues list:', error)
  }

  return fetchPoeLeagues(game)
}

export function usePoeLeagues(game: PoeGame = 'poe1') {
  const { data: profile } = useMyProfile()
  const hasOAuthAccess = !!profile?.poe_token_expires_at
  const capabilities = getPoeGameCapabilities(game)
  const source: 'account' | 'public' =
    hasOAuthAccess && capabilities.supportsAccountLeagues ? 'account' : 'public'

  return useQuery({
    queryKey: [...queryKeys.poe.leagues(game, source)],
    queryFn: () => fetchPreferredLeagues(game, hasOAuthAccess),
    staleTime: 1000 * 60 * 30,
    retry: 1,
  })
}
