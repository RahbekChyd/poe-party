import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../lib/queryKeys'
import { fetchNinjaExchangeEntries } from '../lib/poe-ninja-client'
import { THREAD_NAMES } from '../lib/strategy-threads'
import type { PoeGame } from '../lib/poe-game'

export interface ThreadEntry {
  name: string
  chaosValue: number | null
  icon: string | null
}

/** Catalog remains usable without market data; never borrow another league's prices. */
export function useThreadData(league: string | null, game: PoeGame = 'poe1') {
  return useQuery<ThreadEntry[]>({
    queryKey: queryKeys.ninja.threads(game, league),
    staleTime: 1000 * 60 * 60,
    enabled: !!league && game === 'poe1',
    queryFn: async () => {
      const entries = await fetchNinjaExchangeEntries(league!, 'Thread', game).catch(() => [])
      const byName = new Map(entries.map((entry) => [entry.name, entry]))
      return THREAD_NAMES.map((name) => ({
        name,
        chaosValue: byName.get(name)?.primaryValue ?? null,
        icon: byName.get(name)?.icon ?? null,
      }))
    },
  })
}
