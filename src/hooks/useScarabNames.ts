import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../lib/queryKeys'
import { fetchNinjaExchangeEntries } from '../lib/poe-ninja-client'
import type { PoeGame } from '../lib/poe-game'
export interface ScarabEntry {
  name: string
  chaosValue: number
  icon: string | null
}

const FALLBACK_SCARAB_NAMES = [
  'Abyss Scarab',
  'Abyss Scarab of Edifice',
  'Ambush Scarab',
  'Breach Scarab of Instability',
  'Breach Scarab of Resonant Cascade',
  'Cartography Scarab',
  'Cartography Scarab of Escalation',
  'Cartography Scarab of the Multitude',
  'Divination Scarab',
  'Divination Scarab of Pilfering',
  'Essence Scarab',
  'Harbinger Scarab',
  'Horned Scarab of Bloodlines',
  'Legion Scarab',
  'Legion Scarab of Officers',
  'Scarab of Monstrous Lineage',
  'Scarab of Wisps',
  'Titanic Scarab',
] as const

function toScarabEntries(entries: Awaited<ReturnType<typeof fetchNinjaExchangeEntries>>): ScarabEntry[] {
  return entries.map((entry) => ({
    name: entry.name,
    chaosValue: entry.primaryValue,
    icon: entry.icon,
  }))
}

/**
 * Fetches scarab names, prices, and icons from poe.ninja exchange data for a league.
 */
export function useScarabData(league: string | null, game: PoeGame = 'poe1') {
  return useQuery<ScarabEntry[]>({
    queryKey: queryKeys.ninja.scarabs(game, league),
    staleTime: 1000 * 60 * 60,
    enabled: !!league && game === 'poe1',
    queryFn: async (): Promise<ScarabEntry[]> => {
      let scarabs = toScarabEntries(await fetchNinjaExchangeEntries(league!, 'Scarab', game).catch(() => []))

      if (scarabs.length === 0 && league !== 'Standard') {
        scarabs = toScarabEntries(
          await fetchNinjaExchangeEntries('Standard', 'Scarab', game).catch(() => []),
        )
      }

      if (scarabs.length === 0) {
        scarabs = FALLBACK_SCARAB_NAMES.map((name) => ({
          name,
          chaosValue: 0,
          icon: null,
        }))
      }

      return scarabs.sort((a, b) => a.name.localeCompare(b.name))
    },
  })
}
