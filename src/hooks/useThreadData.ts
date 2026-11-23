import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../lib/queryKeys'
import { fetchNinjaEconomyLeagueIds, fetchNinjaExchangeEntries } from '../lib/poe-ninja-client'
import { THREAD_CATALOG } from '../lib/strategy-threads'
import type { PoeGame } from '../lib/poe-game'

export interface ThreadEntry {
  name: string
  chaosValue: number | null
  icon: string | null
}

export interface ThreadMarket {
  data: ThreadEntry[]
  marketLeague: string | null
  status: 'idle' | 'loading' | 'unavailable' | 'error' | 'ready'
  retry: () => void
}

export function useNinjaEconomyLeague(league: string | null, game: PoeGame) {
  const query = useQuery({
    queryKey: queryKeys.ninja.economyLeagues(game),
    staleTime: 1000 * 60 * 60,
    enabled: !!league,
    queryFn: () => fetchNinjaEconomyLeagueIds(game),
  })
  const marketLeague = league && query.data?.includes(league) ? league : null

  return { marketLeague, query }
}

/** Artwork and selections remain available independently of exact-league quotes. */
export function useThreadData(league: string | null, game: PoeGame = 'poe1'): ThreadMarket {
  const { marketLeague, query: leagueQuery } = useNinjaEconomyLeague(game === 'poe1' ? league : null, game)
  const quotes = useQuery({
    queryKey: queryKeys.ninja.threads(game, marketLeague),
    staleTime: 1000 * 60 * 60,
    enabled: !!marketLeague,
    queryFn: () => fetchNinjaExchangeEntries(marketLeague!, 'Thread', game),
  })
  const data = useMemo(() => {
    if (game !== 'poe1') return []
    const prices = new Map(quotes.data?.map((entry) => [entry.name, entry.primaryValue]))
    return THREAD_CATALOG.map((entry) => ({
      ...entry,
      chaosValue: prices.get(entry.name) ?? null,
    }))
  }, [game, quotes.data])

  let status: ThreadMarket['status'] = 'idle'
  if (game === 'poe1' && league) {
    if (leagueQuery.isLoading || (marketLeague && quotes.isLoading)) status = 'loading'
    else if ((leagueQuery.isError && !leagueQuery.data) || (marketLeague && quotes.isError)) status = 'error'
    else if (data.some((entry) => entry.chaosValue != null)) status = 'ready'
    else status = 'unavailable'
  }

  return {
    data,
    marketLeague,
    status,
    retry: () => {
      if (marketLeague) void quotes.refetch()
      else if (league && game === 'poe1') void leagueQuery.refetch()
    },
  }
}
