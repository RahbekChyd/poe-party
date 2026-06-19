import type { GearImportance, GearStatus } from '../hooks/useGear'
import type { GroupRole } from '../hooks/useGroups'
export interface PreviewMember {
  id: string
  display_name: string
  poe_account_name: string
  avatar_color: string
  role: GroupRole
  character_name: string
  class: string
  ascendancy_class: number
  level: number
  snapshot_age_label: string
  wealth_chaos: number
  tabs: { name: string; value: number }[]
  focus: string
  build_notes: string[]
  visibility: 'group_only' | 'public'
  pob_code: string
  pob_support_code?: string
}

export interface PreviewStrategy {
  id: string
  name: string
  description: string
  difficulty: 'easy' | 'normal' | 'hard'
  map_cost: number
  benchmark_chaos_per_hour: number
  is_active: boolean
}

export interface PreviewGearSuggestion {
  id: string
  item_name: string
  notes: string
  importance: GearImportance
  status: GearStatus
  target_user_id: string
  suggester_user_id: string
  item_trade_link: string | null
}

export interface PreviewHistoryPoint {
  created_at: string
  total_wealth_chaos: number
}

export const previewMembers: PreviewMember[] = [
  {
    id: 'preview-1',
    display_name: 'Iris Vale',
    poe_account_name: 'IrisVale',
    avatar_color: '#f97316',
    role: 'admin',
    character_name: 'Iris_Tornado',
    class: 'Ranger',
    ascendancy_class: 2,
    level: 98,
    snapshot_age_label: '18m ago',
    wealth_chaos: 6480,
    tabs: [
      { name: 'Currency', value: 2410 },
      { name: 'Scarabs', value: 1950 },
      { name: 'Fragments', value: 2120 },
    ],
    focus: '',
    build_notes: [
    ],
    visibility: 'public',
    pob_code: 'iris-deadeye-main',
    pob_support_code: 'iris-deadeye-auras',
  },
  {
    id: 'preview-2',
    display_name: 'Rowan Pyre',
    poe_account_name: 'RowanPyre',
    avatar_color: '#14b8a6',
    role: 'editor',
    character_name: 'Rowan_Spin',
    class: 'Duelist',
    ascendancy_class: 1,
    level: 97,
    snapshot_age_label: '43m ago',
    wealth_chaos: 5170,
    tabs: [
      { name: 'Maps', value: 2140 },
      { name: 'Uniques', value: 1630 },
      { name: 'Overflow', value: 1400 },
    ],
    focus: '',
    build_notes: [
    ],
    visibility: 'group_only',
    pob_code: 'rowan-slayer-main',
  },
  {
    id: 'preview-3',
    display_name: 'Tarin Ash',
    poe_account_name: 'TarinAsh',
    avatar_color: '#60a5fa',
    role: 'editor',
    character_name: 'Tarin_Totems',
    class: 'Templar',
    ascendancy_class: 2,
    level: 96,
    snapshot_age_label: '1h ago',
    wealth_chaos: 3915,
    tabs: [
      { name: 'Essence', value: 1280 },
      { name: 'Fossils', value: 960 },
      { name: 'Boss Drops', value: 1675 },
    ],
    focus: '',
    build_notes: [
    ],
    visibility: 'group_only',
    pob_code: 'tarin-hiero-main',
    pob_support_code: 'tarin-hiero-support',
  },
  {
    id: 'preview-4',
    display_name: 'Sel Vesper',
    poe_account_name: 'SelVesper',
    avatar_color: '#a78bfa',
    role: 'viewer',
    character_name: 'Sel_Aegis',
    class: 'Witch',
    ascendancy_class: 1,
    level: 95,
    snapshot_age_label: '2h ago',
    wealth_chaos: 2820,
    tabs: [
      { name: 'Flasks', value: 540 },
      { name: 'Catalysts', value: 760 },
      { name: 'Jewels', value: 1520 },
    ],
    focus: 'Keeps aura coverage and utility notes visible for the whole team.',
    build_notes: [
      'Uses member page notes to track support swaps before invitations.',
      'Often reads strategy pages without editing them.',
      'Current priority: mana reservation quality and jewel cleanup.',
    ],
    visibility: 'public',
    pob_code: 'sel-necro-main',
  },
]

export const previewHistory: PreviewHistoryPoint[] = [
  { created_at: '2026-03-12T18:00:00Z', total_wealth_chaos: 10420 },
  { created_at: '2026-03-13T12:00:00Z', total_wealth_chaos: 11860 },
  { created_at: '2026-03-14T09:00:00Z', total_wealth_chaos: 13425 },
  { created_at: '2026-03-15T19:00:00Z', total_wealth_chaos: 15210 },
  { created_at: '2026-03-17T08:30:00Z', total_wealth_chaos: 17180 },
  { created_at: '2026-03-18T22:15:00Z', total_wealth_chaos: 18385 },
]

export const previewStrategies: PreviewStrategy[] = [
  {
    id: 'preview-strategy-1',
    name: 'Breach Beacon Loop',
    description: 'Fast breach sustain plan with benchmark tracking for short mapping sessions.',
    difficulty: 'normal',
    map_cost: 24,
    benchmark_chaos_per_hour: 1480,
    is_active: true,
  },
  {
    id: 'preview-strategy-2',
    name: 'Invitation Relay',
    description: 'Boss-oriented setup with a slower pace but better fragment conversion.',
    difficulty: 'hard',
    map_cost: 41,
    benchmark_chaos_per_hour: 1825,
    is_active: false,
  },
]

export const previewGearSuggestions: PreviewGearSuggestion[] = [
  {
    id: 'preview-gear-1',
    item_name: 'Headhunter',
    notes: 'Blast!',
    importance: 'high',
    status: 'open',
    target_user_id: 'preview-1',
    suggester_user_id: 'preview-2',
    item_trade_link: null,
  },
  {
    id: 'preview-gear-2',
    item_name: 'Watcher\'s Eye',
    notes: 'Fairly cheap upgrade',
    importance: 'medium',
    status: 'acknowledged',
    target_user_id: 'preview-4',
    suggester_user_id: 'preview-3',
    item_trade_link: null,
  },
  {
    id: 'preview-gear-3',
    item_name: 'Progenesis',
    notes: 'Tanky boy',
    importance: 'high',
    status: 'implemented',
    target_user_id: 'preview-2',
    suggester_user_id: 'preview-1',
    item_trade_link: null,
  },
]

export const previewWorkspace = {
  label: 'Example party workspace',
  total_wealth_chaos: previewMembers.reduce((sum, member) => sum + member.wealth_chaos, 0),
  synced_members: previewMembers.length,
  open_gear_items: previewGearSuggestions.filter((suggestion) => suggestion.status !== 'implemented')
    .length,
  active_strategy_count: previewStrategies.length,
}
