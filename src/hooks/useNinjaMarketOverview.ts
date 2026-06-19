import { useQuery } from '@tanstack/react-query'
import { fetchNinjaMarketOverview, type NinjaMarketSection } from '../lib/poe-ninja-client'
import type { PoeGame } from '../lib/poe-game'
export function useNinjaMarketOverview(league: string | null, game: PoeGame = 'poe1') {
  return useQuery<NinjaMarketSection[]>({
    queryKey: ['ninja-market-overview', game, league],
    queryFn: () => fetchNinjaMarketOverview(league!, game),
    enabled: !!league,
    staleTime: 30 * 60 * 1000,
  })
}
