import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../lib/queryKeys'
import { fetchAllNinjaPrices, type NinjaPriceMap } from '../lib/poe-ninja-client'
import type { PoeGame } from '../lib/poe-game'
/**
 * Shared hook for fetching poe.ninja exchange prices for a league.
 * Cached for 30 minutes. All components that need the divine price
 * or currency price map should use this instead of inline useQuery calls.
 */
export function useNinjaPrices(league: string | null, game: PoeGame = 'poe1') {
  return useQuery<NinjaPriceMap>({
    queryKey: [...queryKeys.ninja.prices(game, league)],
    queryFn: () => fetchAllNinjaPrices(league!, game),
    staleTime: 30 * 60 * 1000,
    enabled: !!league,
  })
}
