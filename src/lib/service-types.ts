import { Coins, Map, Swords, Users, type LucideIcon } from 'lucide-react'
export type ServiceType = 'boss_carry' | 'map_carry' | 'five_way_host' | 'gold_rota'
export type ServiceAvailability = 'available' | 'busy' | 'offline'
export type ServiceVisibility = 'group_only' | 'public'

export interface ServiceTypeOption {
  id: ServiceType
  label: string
  shortLabel: string
  icon: LucideIcon
  colour: 'primary' | 'secondary' | 'success' | 'warning' | 'danger'
  whisperVerb: string
  description: string
}

export const SERVICE_TYPE_OPTIONS: ServiceTypeOption[] = [
  {
    id: 'boss_carry',
    label: 'Boss Carry',
    shortLabel: 'Boss',
    icon: Swords,
    colour: 'danger',
    whisperVerb: 'boss carry',
    description: 'Single-target boss kills with per-boss pricing.',
  },
  {
    id: 'map_carry',
    label: 'Map Carry',
    shortLabel: 'Map',
    icon: Map,
    colour: 'warning',
    whisperVerb: 'map carry',
    description: 'Valdo or general map completion carries with price ranges.',
  },
  {
    id: 'five_way_host',
    label: '5-Way Host',
    shortLabel: '5-Way',
    icon: Users,
    colour: 'primary',
    whisperVerb: '5 way',
    description: 'AFK 5-way runs with guaranteed kills and party composition.',
  },
  {
    id: 'gold_rota',
    label: 'Gold Rota',
    shortLabel: 'Gold',
    icon: Coins,
    colour: 'success',
    whisperVerb: 'gold rota',
    description: 'Gold-farming map rotas with guaranteed gold and party fill.',
  },
]

export function getServiceTypeOption(type: ServiceType): ServiceTypeOption {
  return SERVICE_TYPE_OPTIONS.find((option) => option.id === type) ?? SERVICE_TYPE_OPTIONS[0]
}

export interface AvailabilityOption {
  id: ServiceAvailability
  label: string
  chipColor: 'success' | 'warning' | 'default'
  dotClass: string
}

export const AVAILABILITY_OPTIONS: AvailabilityOption[] = [
  { id: 'available', label: 'Available', chipColor: 'success', dotClass: 'bg-success' },
  { id: 'busy', label: 'Busy', chipColor: 'warning', dotClass: 'bg-warning' },
  { id: 'offline', label: 'Offline', chipColor: 'default', dotClass: 'bg-default-400' },
]

export function getAvailabilityOption(status: ServiceAvailability): AvailabilityOption {
  return AVAILABILITY_OPTIONS.find((option) => option.id === status) ?? AVAILABILITY_OPTIONS[0]
}

export const REGION_OPTIONS = ['Any', 'EU', 'NA', 'SG', 'JP'] as const
export type Region = (typeof REGION_OPTIONS)[number]

export const SERVICE_TYPE_COLOUR_CLASSES: Record<ServiceTypeOption['colour'], string> = {
  primary: 'bg-primary/10 text-primary',
  secondary: 'bg-secondary/10 text-secondary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
}

type SelectionKeys = 'all' | Set<string | number>

export function firstSelectedKey(keys: SelectionKeys): string | null {
  if (keys === 'all') return null
  const [first] = Array.from(keys)
  return typeof first === 'string' ? first : null
}

export function regionFromSelection(keys: SelectionKeys): string {
  return firstSelectedKey(keys) ?? 'Any'
}

export function regionToQuery(region: string): string | null {
  return region && region !== 'Any' ? region : null
}

export type BossMapMode = 'my_map_my_loot' | 'your_map_your_loot' | 'both'

export const BOSS_MAP_MODE_LABELS: Record<BossMapMode, string> = {
  my_map_my_loot: 'My map · my loot',
  your_map_your_loot: 'Your map · your loot',
  both: 'Both map modes',
}

export interface BossCarryBoss {
  name: string
  price_divine: number | null
  note: string | null
}

export interface BossCarryDetails {
  map_mode: BossMapMode
  bosses: BossCarryBoss[]
}

export type MapCarryVariant = 'valdo' | 'general'

export interface MapCarryExtra {
  label: string
  price_divine: number | null
}

export interface MapCarryDetails {
  variant: MapCarryVariant
  price_non_void_min_divine: number | null
  price_non_void_max_divine: number | null
  price_void_min_divine: number | null
  price_void_max_divine: number | null
  extras: MapCarryExtra[]
  refund_policy: string | null
}

export interface PartySlot {
  current: number
  capacity: number
}

export interface FiveWayDetails {
  runs_per_bundle: number
  guaranteed_kills: number | null
  aurabot_resist_pct: number | null
  extra_guarantees: string[]
  party: {
    clients: PartySlot
    resetter: PartySlot
    aurabot: PartySlot
  }
}

export interface GoldRotaDetails {
  maps_per_run: string | null
  gold_guaranteed_millions: number | null
  party: PartySlot
  extra_info: string | null
  trade_only_with: string | null
}

export type ServiceDetails =
  | ({ service_type: 'boss_carry' } & BossCarryDetails)
  | ({ service_type: 'map_carry' } & MapCarryDetails)
  | ({ service_type: 'five_way_host' } & FiveWayDetails)
  | ({ service_type: 'gold_rota' } & GoldRotaDetails)

// ---- Safe coercion from untyped JSONB (what Supabase returns) ----

function toNumber(value: unknown): number | null {
  if (value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function toString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string')
}

function toPartySlot(value: unknown, defaultCapacity: number): PartySlot {
  if (Array.isArray(value) && value.length === 2) {
    return {
      current: toNumber(value[0]) ?? 0,
      capacity: toNumber(value[1]) ?? defaultCapacity,
    }
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    return {
      current: toNumber(obj.current) ?? 0,
      capacity: toNumber(obj.capacity) ?? defaultCapacity,
    }
  }
  return { current: 0, capacity: defaultCapacity }
}

export function normalizeServiceDetails(
  serviceType: ServiceType,
  raw: unknown,
): ServiceDetails {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>

  if (serviceType === 'boss_carry') {
    const rawBosses = Array.isArray(obj.bosses) ? obj.bosses : []
    return {
      service_type: 'boss_carry',
      map_mode: (obj.map_mode === 'your_map_your_loot' || obj.map_mode === 'both'
        ? obj.map_mode
        : 'my_map_my_loot') as BossMapMode,
      bosses: rawBosses.map((entry) => {
        const e = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>
        return {
          name: toString(e.name) ?? 'Unnamed boss',
          price_divine: toNumber(e.price_divine),
          note: toString(e.note),
        }
      }),
    }
  }

  if (serviceType === 'map_carry') {
    const rawExtras = Array.isArray(obj.extras) ? obj.extras : []
    return {
      service_type: 'map_carry',
      variant: obj.variant === 'general' ? 'general' : 'valdo',
      price_non_void_min_divine: toNumber(obj.price_non_void_min_divine),
      price_non_void_max_divine: toNumber(obj.price_non_void_max_divine),
      price_void_min_divine: toNumber(obj.price_void_min_divine),
      price_void_max_divine: toNumber(obj.price_void_max_divine),
      extras: rawExtras.map((entry) => {
        const e = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>
        return {
          label: toString(e.label) ?? 'Extra',
          price_divine: toNumber(e.price_divine),
        }
      }),
      refund_policy: toString(obj.refund_policy),
    }
  }

  if (serviceType === 'five_way_host') {
    const party = (obj.party && typeof obj.party === 'object' ? obj.party : {}) as Record<
      string,
      unknown
    >
    return {
      service_type: 'five_way_host',
      runs_per_bundle: toNumber(obj.runs_per_bundle) ?? 5,
      guaranteed_kills: toNumber(obj.guaranteed_kills),
      aurabot_resist_pct: toNumber(obj.aurabot_resist_pct),
      extra_guarantees: toStringArray(obj.extra_guarantees),
      party: {
        clients: toPartySlot(party.clients, 4),
        resetter: toPartySlot(party.resetter, 1),
        aurabot: toPartySlot(party.aurabot, 1),
      },
    }
  }

  // gold_rota
  return {
    service_type: 'gold_rota',
    maps_per_run: toString(obj.maps_per_run),
    gold_guaranteed_millions: toNumber(obj.gold_guaranteed_millions),
    party: toPartySlot(obj.party, 6),
    extra_info: toString(obj.extra_info),
    trade_only_with: toString(obj.trade_only_with),
  }
}

export function hasServiceDetailContent(details: ServiceDetails): boolean {
  switch (details.service_type) {
    case 'boss_carry':
      return details.bosses.some((boss) => Boolean(boss.note))
    case 'map_carry':
      return details.extras.length > 0
    case 'five_way_host':
    case 'gold_rota':
      return true
  }
}

export function buildDefaultDetails(serviceType: ServiceType): ServiceDetails {
  if (serviceType === 'boss_carry') {
    return { service_type: 'boss_carry', map_mode: 'my_map_my_loot', bosses: [] }
  }
  if (serviceType === 'map_carry') {
    return {
      service_type: 'map_carry',
      variant: 'valdo',
      price_non_void_min_divine: null,
      price_non_void_max_divine: null,
      price_void_min_divine: null,
      price_void_max_divine: null,
      extras: [],
      refund_policy: null,
    }
  }
  if (serviceType === 'five_way_host') {
    return {
      service_type: 'five_way_host',
      runs_per_bundle: 5,
      guaranteed_kills: null,
      aurabot_resist_pct: null,
      extra_guarantees: [],
      party: {
        clients: { current: 0, capacity: 4 },
        resetter: { current: 1, capacity: 1 },
        aurabot: { current: 1, capacity: 1 },
      },
    }
  }
  return {
    service_type: 'gold_rota',
    maps_per_run: null,
    gold_guaranteed_millions: null,
    party: { current: 0, capacity: 6 },
    extra_info: null,
    trade_only_with: null,
  }
}

// ---- Whisper template helpers ----

export function buildDefaultWhisperTemplate(
  ign: string,
  serviceType: ServiceType,
  title: string | null,
): string {
  const verb = getServiceTypeOption(serviceType).whisperVerb
  const suffix = title && title.trim().length > 0 ? ` — ${title.trim()}` : ''
  return `@${ign} hi wtb ${verb}${suffix}`
}

export function resolveWhisperTemplate(args: {
  ign: string
  serviceType: ServiceType
  title: string | null
  whisperTemplate: string | null
}): string {
  if (args.whisperTemplate && args.whisperTemplate.trim().length > 0) {
    return args.whisperTemplate.trim()
  }
  return buildDefaultWhisperTemplate(args.ign, args.serviceType, args.title)
}

// ---- Pricing formatting ----

export function formatDivineRange(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null
  if (min != null && max != null) {
    return min === max ? `${min}` : `${min}–${max}`
  }
  if (min != null) return `${min}+`
  return `up to ${max}`
}
