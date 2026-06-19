import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { queryKeys } from '../lib/queryKeys'
import type { PoeGame } from '../lib/poe-game'
import {
  normalizeServiceDetails,
  type ServiceAvailability,
  type ServiceDetails,
  type ServiceType,
} from '../lib/service-types'
export interface PublicServiceRow {
  id: string
  group_id: string
  group_name: string
  group_game: PoeGame
  group_league: string
  user_id: string
  owner_name: string
  service_type: ServiceType
  title: string
  description: string | null
  region: string | null
  price_divine: number | null
  price_min_divine: number | null
  price_max_divine: number | null
  poe_ign: string
  whisper_template: string | null
  availability: ServiceAvailability
  mod_exclusions: string[]
  details: ServiceDetails
  created_at: string
  updated_at: string
}

function toPoeGame(value: unknown): PoeGame {
  return value === 'poe2' ? 'poe2' : 'poe1'
}

function toServiceType(value: unknown): ServiceType {
  if (
    value === 'boss_carry' ||
    value === 'map_carry' ||
    value === 'five_way_host' ||
    value === 'gold_rota'
  ) {
    return value
  }
  return 'boss_carry'
}

function toAvailability(value: unknown): ServiceAvailability {
  if (value === 'busy' || value === 'offline') return value
  return 'available'
}

function toNumberOrNull(value: unknown): number | null {
  if (value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function normalizePublicServiceRow(row: Record<string, unknown>): PublicServiceRow {
  const serviceType = toServiceType(row.service_type)
  return {
    id: String(row.id),
    group_id: String(row.group_id),
    group_name: String(row.group_name ?? 'Unknown group'),
    group_game: toPoeGame(row.group_game),
    group_league: String(row.group_league ?? ''),
    user_id: String(row.user_id),
    owner_name: String(row.owner_name ?? 'Unknown'),
    service_type: serviceType,
    title: String(row.title ?? 'Untitled service'),
    description: typeof row.description === 'string' ? row.description : null,
    region: typeof row.region === 'string' ? row.region : null,
    price_divine: toNumberOrNull(row.price_divine),
    price_min_divine: toNumberOrNull(row.price_min_divine),
    price_max_divine: toNumberOrNull(row.price_max_divine),
    poe_ign: String(row.poe_ign ?? ''),
    whisper_template: typeof row.whisper_template === 'string' ? row.whisper_template : null,
    availability: toAvailability(row.availability),
    mod_exclusions: Array.isArray(row.mod_exclusions)
      ? row.mod_exclusions.filter((v): v is string => typeof v === 'string')
      : [],
    details: normalizeServiceDetails(serviceType, row.details),
    created_at: String(row.created_at ?? new Date(0).toISOString()),
    updated_at: String(row.updated_at ?? new Date(0).toISOString()),
  }
}

const SERVICE_STALE_TIME = 30_000

export function useGuestPublicServices(
  game: PoeGame,
  league: string | null,
  serviceType: ServiceType | null,
) {
  return useQuery({
    queryKey: queryKeys.preview.services(game, league, serviceType),
    enabled: !!league,
    staleTime: SERVICE_STALE_TIME,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_public_services_for_league', {
        p_game: game,
        p_league: league!,
        p_service_type: serviceType,
      })

      if (error) throw error
      return ((data ?? []) as Record<string, unknown>[]).map(normalizePublicServiceRow)
    },
  })
}
