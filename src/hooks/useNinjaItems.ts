import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../lib/queryKeys'
import type { PoeGame } from '../lib/poe-game'
export interface NinjaItemEntry {
  name: string
  icon: string
  baseType: string
  chaosValue: number
}

interface NinjaItemLine {
  name: string
  icon: string
  baseType: string
  chaosValue: number
}

const ITEM_TYPES = [
  'UniqueWeapon',
  'UniqueArmour',
  'UniqueAccessory',
  'UniqueFlask',
  'UniqueJewel',
] as const

async function fetchType(type: string): Promise<NinjaItemLine[]> {
  const res = await fetch(
    `/api/ninja/poe1/api/economy/stash/current/item/overview?league=Standard&type=${type}`,
    { headers: { Accept: 'application/json' } },
  )
  if (!res.ok) return []
  const data = (await res.json()) as { lines: NinjaItemLine[] }
  return data.lines
}

/**
 * Fetches all unique equipment items from poe.ninja (weapons, armour,
 * accessories, flasks, jewels). Returns name, icon URL, base type, and
 * chaos value. Cached for 1 hour.
 */
export function useNinjaItems(game: PoeGame = 'poe1') {
  return useQuery<NinjaItemEntry[]>({
    queryKey: [...queryKeys.ninjaItems(game)],
    staleTime: 1000 * 60 * 60,
    enabled: game === 'poe1',
    queryFn: async () => {
      const results = await Promise.all(ITEM_TYPES.map(fetchType))
      const seen = new Set<string>()
      const items: NinjaItemEntry[] = []

      for (const lines of results) {
        for (const l of lines) {
          if (seen.has(l.name)) continue
          seen.add(l.name)
          items.push({
            name: l.name,
            icon: l.icon,
            baseType: l.baseType,
            chaosValue: l.chaosValue,
          })
        }
      }

      return items.sort((a, b) => a.name.localeCompare(b.name))
    },
  })
}
