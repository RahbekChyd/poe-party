
// Application-level types (not tied to DB schema or PoE API directly)

export type SnapshotStatus = 'up_to_date' | 'outdated' | 'none'

export interface MemberWithStatus {
  userId: string
  displayName: string
  poeAccountName: string
  avatarUrl?: string
  snapshotStatus: SnapshotStatus
  snapshotAge?: number // hours
  activeCharacterName?: string
  activeCharacterClass?: string
}

export interface GroupStats {
  totalValueChaos: number
  totalValueDivine: number
  memberCount: number
  activeSnapshotCount: number
  strategyCount: number
  assignedStrategyCount: number
}

export interface AnalysisMetricSnapshot {
  totalDps?: number | null
  combinedDps?: number | null
  totalEhp?: number | null
  life?: number | null
  mana?: number | null
  energyShield?: number | null
  armour?: number | null
  evasion?: number | null
  ward?: number | null
  fireResist?: number | null
  coldResist?: number | null
  lightningResist?: number | null
  chaosResist?: number | null
  [key: string]: number | string | boolean | null | undefined
}

export interface TargetStageRequirement {
  kind:
    | 'mandatory_unique'
    | 'minimum_links'
    | 'minimum_sockets'
    | 'resistance_cap'
    | 'attribute_floor'
    | 'custom_note'
  label: string
  slot?: string | null
  item_name?: string | null
  value?: number | null
  value_key?: string | null
  details?: string | null
}

export type RareSearchTargetKey =
  | 'life'
  | 'elementalRes'
  | 'chaosRes'
  | 'strength'
  | 'dexterity'
  | 'intelligence'
  | 'allAttributes'
  | 'movementSpeed'
  | 'attackSpeed'
  | 'critChance'
  | 'critMulti'
  | 'pdps'
  | 'edps'
  | 'weaponDps'
  | 'custom'

export interface UpgradeSearchLineConstraint {
  line_id: string
  target_key: RareSearchTargetKey
  enabled: boolean
  value: number | null
}

export interface UpgradeSearchSlotConstraint {
  disabled_target_keys: RareSearchTargetKey[]
  target_overrides?: Partial<Record<RareSearchTargetKey, number>>
  line_overrides?: UpgradeSearchLineConstraint[]
}

export interface UpgradeSearchConstraints {
  ignore_crafted_mods: boolean
  ignore_enchants: boolean
  ignore_quality: boolean
  ignore_corrupted_implicits: boolean
  property_percentile_floor: number
  slot_overrides: Record<string, UpgradeSearchSlotConstraint>
}

export type PartyBuildEntry =
  | { kind: 'pob_code'; pob_code: string; label?: string | null }
  | { kind: 'group_member'; build_target_id: string; label?: string | null }

export interface GroupPartyBuildTarget {
  id: string
  user_id: string
  name: string
  display_name: string | null
  poe_account_name: string | null
}

export type UpgradeAnalysisMode = 'quick' | 'thorough'

export interface ReservationAuditSuggestion {
  kind: 'gem_level'
  gem_name: string
  current_level: number | null
  suggested_level: number | null
  reason: string
}

export interface ReservationAuditSummary {
  status: 'fit' | 'blocked' | 'excess' | 'unknown'
  target_skill_set_id: string | null
  target_skill_set_title: string | null
  target_gems: string[]
  reserved_mana_delta: number | null
  blockers: string[]
  surplus_sources: string[]
  notes: string[]
  suggestions: ReservationAuditSuggestion[]
}

export interface PobLayoutItemSummary {
  itemId: string | null
  slot: string
  rarity: string | null
  name: string | null
  typeLine: string | null
  socketCount: number | null
  maxLinkCount: number | null
  rawText: string | null
}

export type PobClusterJewelSize = 'large' | 'medium' | 'small' | 'unknown'

export interface PobTreeSpecClusterJewelLayout {
  socketNodeId: number
  itemId: string | null
  size: PobClusterJewelSize
  name: string | null
  typeLine: string | null
}

export interface PobTreeSpecLayout {
  id: string
  legacyId?: string | null
  title: string
  url: string | null
  treeVersion: string | null
  classId: number | null
  ascendancyId: number | null
  secondaryAscendancyId: number | null
  hashes: number[]
  hashesEx: number[]
  masteryEffects: number[]
  modifiedNodeIds?: number[]
  clusterJewels: PobTreeSpecClusterJewelLayout[]
}

export interface PobSkillGemLayout {
  name: string
  level: number | null
  quality: string | null
  enabled: boolean | null
  /** True when the skill is granted by an item (e.g. Aspect of the Cat) rather than being a socketed gem. */
  isItemGranted: boolean
}

export interface PobSkillLinkGroupLayout {
  id: string
  label: string | null
  slot: string | null
  enabled: boolean | null
  linkCount: number
  gems: PobSkillGemLayout[]
}

export interface PobSkillSetLayout {
  id: string
  title: string
  gemNames: string[]
  gems: PobSkillGemLayout[]
  groups: PobSkillLinkGroupLayout[]
}

export interface PobConfigSetLayout {
  id: string
  title: string
}

export interface PobItemSetLayout {
  id: string
  title: string
  useSecondWeaponSet: boolean
  items: PobLayoutItemSummary[]
}

export interface PobImportMetadata {
  source_kind: 'pob_share_code' | 'pob_xml' | 'legacy_pob_code'
  class_name: string | null
  ascendancy_name: string | null
  target_version: string | null
  notes: string | null
  player_stats: AnalysisMetricSnapshot
  tree_specs: PobTreeSpecLayout[]
  active_tree_spec_id: string | null
  skill_sets: PobSkillSetLayout[]
  active_skill_set_id: string | null
  config_sets: PobConfigSetLayout[]
  active_config_set_id: string | null
  active_config_set_title: string | null
  item_sets: PobItemSetLayout[]
  active_item_set_id: string | null
}

export interface BuildTarget {
  id: string
  group_id: string
  user_id: string
  character_id: string | null
  created_by: string
  name: string
  source_kind: PobImportMetadata['source_kind']
  raw_import: string
  raw_xml: string | null
  import_metadata: PobImportMetadata
  compatibility_status: 'pending' | 'compatible' | 'partial' | 'unsupported'
  compatibility_notes: string | null
  is_selected: boolean
  selected_stage_id: string | null
  created_at: string
  updated_at: string
}

export interface BuildTargetStage {
  id: string
  build_target_id: string
  order_index: number
  label: string
  notes: string | null
  tree_spec_id: string | null
  tree_spec_title: string | null
  item_set_id: string | null
  item_set_title: string | null
  skill_set_id: string | null
  skill_set_title: string | null
  config_set_id: string | null
  config_set_title: string | null
  primary_offensive_metric: string
  target_metrics: AnalysisMetricSnapshot
  hard_requirements: TargetStageRequirement[]
  created_at: string
  updated_at: string
}

export interface UpgradeAnalysisRun {
  id: string
  group_id: string
  build_target_id: string
  target_stage_id: string | null
  target_user_id: string
  character_id: string | null
  queued_by: string
  budget_chaos: number
  analysis_mode: UpgradeAnalysisMode
  search_constraints: UpgradeSearchConstraints
  party_config: PartyBuildEntry[]
  input_hash: string
  status: 'queued' | 'running' | 'completed' | 'partial' | 'failed' | 'stale'
  stale_reason: string | null
  partial_reason: string | null
  error_detail: string | null
  summary: Record<string, unknown>
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface UpgradeRecommendationItem {
  id: string
  plan_id: string
  run_id: string
  slot: string | null
  source: 'owned' | 'market' | 'compare'
  item_name: string | null
  item_payload: Record<string, unknown>
  trade_link: string | null
  ask_price_chaos: number | null
  effective_price_chaos: number
  created_at: string
}

export interface UpgradeRecommendationPlan {
  id: string
  run_id: string
  group_id: string
  target_user_id: string
  target_stage_id: string | null
  category: 'unlock_next_stage' | 'best_single' | 'owned_now'
  kind: 'single' | 'bundle'
  title: string
  summary: string | null
  explanation: string | null
  effective_cost_chaos: number
  ask_price_chaos: number | null
  score: number
  stage_progress_score: number
  ranking_reason: Record<string, unknown>
  before_metrics: AnalysisMetricSnapshot
  after_metrics: AnalysisMetricSnapshot
  breaks_requirements: boolean
  section: 'primary' | 'overview'
  created_at: string
  items: UpgradeRecommendationItem[]
}

export interface GuestCharacterSummary {
  name: string
  class: string | null
  league: string | null
  level: number | null
  realm: string
}

export interface GuestUpgradeAnalysisRun {
  id: string
  normalized_account_name: string
  account_name: string
  character_name: string
  character_class: string | null
  character_ascendancy_class: number | null
  character_league: string | null
  character_level: number | null
  realm: string
  target_name: string
  source_kind: PobImportMetadata['source_kind']
  import_metadata: PobImportMetadata
  target_stage: Record<string, unknown>
  character_profile: Record<string, unknown>
  budget_chaos: number
  analysis_mode: UpgradeAnalysisMode
  search_constraints: UpgradeSearchConstraints
  party_config: PartyBuildEntry[]
  input_hash: string
  status: UpgradeAnalysisRun['status']
  stale_reason: string | null
  partial_reason: string | null
  error_detail: string | null
  summary: Record<string, unknown>
  started_at: string | null
  completed_at: string | null
  expires_at: string
  created_at: string
  updated_at: string
}

export type GuestUpgradeRecommendationItem = UpgradeRecommendationItem

export interface GuestUpgradeRecommendationPlan
  extends Omit<UpgradeRecommendationPlan, 'group_id' | 'target_user_id' | 'target_stage_id' | 'items'> {
  items: GuestUpgradeRecommendationItem[]
}

export type GearSlot =
  | 'Helm'
  | 'Chest'
  | 'Gloves'
  | 'Boots'
  | 'Weapon'
  | 'Offhand'
  | 'Ring'
  | 'Ring2'
  | 'Amulet'
  | 'Belt'
  | 'Flask'
  | 'Jewel'

export type ItemRarity =
  | 'Normal'
  | 'Magic'
  | 'Rare'
  | 'Unique'
  | 'Gem'
  | 'Currency'
  | 'Quest'
  | 'Divination'

export const FRAME_TYPE_TO_RARITY: Record<number, ItemRarity> = {
  0: 'Normal',
  1: 'Magic',
  2: 'Rare',
  3: 'Unique',
  4: 'Gem',
  5: 'Currency',
  6: 'Quest',
  7: 'Currency', // Microtransaction
  8: 'Divination',
  9: 'Quest',
  10: 'Currency',
}

export const RARITY_COLORS: Record<ItemRarity, string> = {
  Normal: '#c8c8c8',
  Magic: '#8888ff',
  Rare: '#ffff77',
  Unique: '#af6025',
  Gem: '#1aa29b',
  Currency: '#aa9e82',
  Quest: '#4ae63a',
  Divination: '#0ebaff',
}
