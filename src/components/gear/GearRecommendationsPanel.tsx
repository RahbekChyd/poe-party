import {
  type Key,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useQuery } from '@tanstack/react-query'
import { Accordion } from '@heroui/react/accordion'
import { Button } from '@heroui/react/button'
import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { Dropdown } from '@heroui/react/dropdown'
import { Modal } from '@heroui/react/modal'
import { Spinner } from '@heroui/react/spinner'
import { ToggleButton } from '@heroui/react/toggle-button'
import { ToggleButtonGroup } from '@heroui/react/toggle-button-group'
import { ArrowRight, Check, ChevronDown, Circle, Info, Trash2 } from 'lucide-react'
import { useGroupStore } from '../../store/group-store'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { useGroupMembers, useMyGroupRole, useMyGroups } from '../../hooks/useGroups'
import { useMyCharacters } from '../../hooks/useCharacters'
import { useActiveCharacters } from '../../hooks/useSnapshots'
import { useCharacterProfiles, useSyncCharacterProfile } from '../../hooks/useCharacterProfiles'
import {
  type AnalysisRuntimeEstimate,
  useBuildTarget,
  useAnalysisRuntimeEstimate,
  useBuildTargetStages,
  useBuildTargets,
  useCancelUpgradeAnalysis,
  useCreateBuildTarget,
  useCreateBuildTargetStage,
  useDeleteBuildTarget,
  useGroupPartyBuildTargets,
  usePromoteUpgradeRecommendation,
  useQueueUpgradeAnalysis,
  useSetSelectedBuildTarget,
  useUpdateBuildTarget,
  useUpdateBuildTargetStage,
  useUpgradeAnalysisRuns,
  useUpgradeRecommendationPlans,
} from '../../hooks/useGearOptimizer'
import {
  deriveStageRequirementsFromSelection,
  filterMeaningfulStageRequirements,
  parsePobImport,
} from '../../lib/pob'
import {
  deriveNormalizedUpgradeSearchConstraints,
  formatRareSearchTargetValue,
  getRareStageSearchOptions,
  RARE_SEARCH_TARGET_LABELS,
  normalizeSearchConstraintSlot,
  normalizeUpgradeSearchConstraints,
  resolveRareStageSearchOptions,
  summarizeUpgradeSearchConstraints,
  type ResolvedRareStageSearchLineTarget,
  type ResolvedRareStageSearchOption,
} from '../../lib/gear-optimizer-search-constraints'
import gemColorLookup from '../../assets/poe_gem_color_lookup.json'
import { fetchNinjaSkillGemIcons, type NinjaSkillGemIcon } from '../../lib/poe-ninja-client'
import { useNinjaPrices } from '../../hooks/useNinjaPrices'
import { queryKeys } from '../../lib/queryKeys'
import { getPobConfigurationInsights } from '../../lib/upgrade-analysis-summary'
import {
  getComparePowerReport,
  normalizeCompareSlot,
  type ComparePowerRow,
} from '../../lib/compare-power-report'
import {
  getRetiredAnalysisEngineMessage,
  getUpgradeAnalysisEmptyPlansCopy,
  usesRetiredAnalysisEngine,
} from '../../lib/upgrade-analysis-run-state'
import {
  getRecommendationScoreBreakdown,
  rankRecommendationPlans,
  shouldShowRecommendationScore,
} from '../../lib/recommendation-score'
import { formatRelativeTimestamp, type CharacterProfileSnapshot } from '../../lib/character-profile'
import { formatCurrencyAmount } from '../../lib/utils'
import { asRecord, readString } from '../../lib/parse-helpers'
import { useCurrencyStore } from '../../store/currency-store'
import type {
  BuildTarget,
  BuildTargetStage,
  GroupPartyBuildTarget,
  PartyBuildEntry,
  UpgradeAnalysisMode,
  UpgradeAnalysisRun,
  UpgradeRecommendationPlan,
  UpgradeSearchConstraints,
  UpgradeSearchLineConstraint,
  UpgradeSearchSlotConstraint,
} from '../../types/app'
import { CardListSkeleton } from '../layout/Skeletons'
import { RecommendationItemRow } from './RecommendationItemRow'
import { RecommendationsInsightsRail } from '../analysis/RecommendationsInsightsRail'
import '../analysis/analysis-run.css'
import {
  FieldInput,
  FieldTextArea,
  ListBox,
  NativeCheckbox,
  SelectField,
} from '../ui/heroui-native'
import { HoverTooltip, type HoverTooltipPlacement } from '../ui/hover-tooltip'
import { QueryFreshnessNotice, QueryStatePanel } from '../ui/QueryStatePanel'
const FIXED_PRIMARY_METRIC = 'totalDps'

type TooltipPlacement = HoverTooltipPlacement

function Tooltip({
  children,
  content,
  placement = 'top',
}: {
  children: ReactNode
  content: ReactNode
  placement?: TooltipPlacement
}) {
  return (
    <HoverTooltip className="inline-flex" content={content} placement={placement}>
      {children}
    </HoverTooltip>
  )
}

function PendingButtonContent({
  children,
  isPending,
}: {
  children: ReactNode
  isPending: boolean
}) {
  return (
    <>
      {isPending ? <Spinner size="sm" /> : null}
      {children}
    </>
  )
}

function toStringKey(key: Key | null): string | null {
  return key == null ? null : String(key)
}

function AccordionPanelItem({
  children,
  id,
  subtitle,
  title,
}: {
  children: ReactNode
  id: string
  subtitle?: ReactNode
  title: ReactNode
}) {
  return (
    <Accordion.Item id={id}>
      <Accordion.Heading>
        <Accordion.Trigger>
          <span className="min-w-0 flex-1 text-left">
            <span className="block">{title}</span>
            {subtitle ? (
              <span className="text-muted mt-1 block text-xs font-normal">{subtitle}</span>
            ) : null}
          </span>
          <Accordion.Indicator>
            <ChevronDown size={16} />
          </Accordion.Indicator>
        </Accordion.Trigger>
      </Accordion.Heading>
      <Accordion.Panel>
        <Accordion.Body>{children}</Accordion.Body>
      </Accordion.Panel>
    </Accordion.Item>
  )
}

const RUN_STATUS_COLORS: Record<
  'queued' | 'running' | 'completed' | 'partial' | 'failed' | 'stale',
  'default' | 'warning' | 'success' | 'danger'
> = {
  queued: 'default',
  running: 'default',
  completed: 'success',
  partial: 'warning',
  failed: 'danger',
  stale: 'warning',
}

const DEFAULT_SETUP_LABEL = 'Current setup'
const DEFAULT_SEARCH_CONSTRAINTS = normalizeUpgradeSearchConstraints({
  ignore_crafted_mods: true,
  ignore_enchants: true,
  ignore_quality: true,
  ignore_corrupted_implicits: true,
  property_percentile_floor: 20,
  slot_overrides: {},
})
const CHARACTER_SELECTION_STORAGE_VERSION = 1
const PARTY_CONFIG_STORAGE_VERSION = 1
const ANALYSIS_PREFS_STORAGE_VERSION = 1
const DEFAULT_LIVE_MARKET_BUDGET_DIVINE = 5
const DEFAULT_LIVE_MARKET_BUDGET_CHAOS = '1000'

type StoredCharacterSelection = {
  version: number
  characterId: string
}

type StoredAnalysisPrefs = {
  version: number
  analysisMode: UpgradeAnalysisMode
  budgetChaos: string
  budgetCurrency?: 'chaos' | 'divine'
}

type RecommendationSectionKey = 'best_single' | 'uniques' | 'overview'

type RecommendationSection = {
  key: RecommendationSectionKey
  label: string
  plans: UpgradeRecommendationPlan[]
  scoreRanks: {
    overall: Map<string, number>
    dps: Map<string, number>
    ehp: Map<string, number>
    reservation: Map<string, number>
  }
}

type LoadoutOption = {
  key: string
  label: string
  treeSpecId: string | null
  itemSetId: string | null
  skillSetId: string | null
  configSetId: string | null
}

type RareTradeSearchSummary = {
  waiting_for_retry?: boolean
  retry_at?: string | null
  rate_limited?: boolean
  retry_after_ms?: number | null
  searched_slot_count?: number | null
}

type StoredPartyConfig = {
  version: number
  entries: PartyBuildEntry[]
}

type ResolvedGemVisual = {
  icon: string | null
  socketColor: string | null
}

const RECOMMENDATION_SECTION_LABELS: Record<RecommendationSectionKey, string> = {
  best_single: 'Rare upgrades',
  uniques: 'Uniques',
  overview: 'Target PoB item scores',
}

const COMPATIBILITY_COLORS: Record<
  'pending' | 'compatible' | 'partial' | 'unsupported',
  'default' | 'success' | 'warning' | 'danger'
> = {
  pending: 'default',
  compatible: 'success',
  partial: 'warning',
  unsupported: 'danger',
}

const ANALYSIS_MODE_OPTIONS: Array<{
  key: UpgradeAnalysisMode
  label: string
  description: string
}> = [
  {
    key: 'quick',
    label: 'Quick overview',
    description:
      'Exact PoB baseline and unique scoring, plus fast rare guidance. Budget and live-market tuning stay out of the way here.',
  },
  {
    key: 'thorough',
    label: 'Live market',
    description:
      'Uses your budget plus limited live rare search in the background, and can wait through trade cooldowns for real market candidates.',
  },
]

const STALE_REASON_LABELS: Record<string, string> = {
  'stage-mapping-updated': 'This analysis setup changed after the run was created.',
  'build-target-updated': 'The underlying imported build target changed after this run.',
  'character-profile-updated':
    'The current character snapshot no longer matches the one used for this run.',
  'stash-refreshed': 'The owned stash pool changed after this run.',
  'pricing-refreshed': 'Latest stash pricing changed after this run.',
  'budget-or-target-updated': 'The selected target or budget changed after this run.',
}

function formatMetricLabel(metricKey: string): string {
  switch (metricKey) {
    case 'totalDps':
      return 'Total DPS'
    case 'combinedDps':
      return 'Combined DPS'
    case 'totalEhp':
      return 'Total EHP'
    case 'life':
      return 'Life'
    case 'energyShield':
      return 'ES'
    case 'armour':
      return 'Armour'
    case 'evasion':
      return 'Evasion'
    case 'fireResist':
      return 'Fire res'
    case 'coldResist':
      return 'Cold res'
    case 'lightningResist':
      return 'Lightning res'
    case 'chaosResist':
      return 'Chaos res'
    default:
      return metricKey.replace(/([A-Z])/g, ' $1').replace(/^./, (match) => match.toUpperCase())
  }
}

function formatMetricValue(value: unknown): string {
  if (typeof value === 'number') {
    if (Math.abs(value) >= 1000) return Math.round(value).toLocaleString()
    if (Math.abs(value) >= 10) return value.toFixed(0)
    return value.toFixed(1)
  }
  return String(value)
}

function formatStaleReason(reason: string | null | undefined): string {
  if (!reason) return 'Inputs changed after this run.'
  return STALE_REASON_LABELS[reason] ?? reason.replace(/-/g, ' ')
}

/** Like the shared readNumber, but also coerces numeric strings. */
function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function getPlanStageOrderIndex(plan: UpgradeRecommendationPlan): number | null {
  const rankingReason = asRecord(plan.ranking_reason)
  const direct = readNumber(rankingReason.target_stage_order_index)
  if (direct != null) return direct

  const firstItem = plan.items[0]
  const itemPayload = asRecord(firstItem?.item_payload)
  return readNumber(itemPayload.target_stage_order_index)
}

function sortOverviewPlans(plans: UpgradeRecommendationPlan[]): UpgradeRecommendationPlan[] {
  return [...plans].sort((left, right) => {
    const leftIndex = getPlanStageOrderIndex(left)
    const rightIndex = getPlanStageOrderIndex(right)
    if (leftIndex != null || rightIndex != null) {
      return (leftIndex ?? Number.MAX_SAFE_INTEGER) - (rightIndex ?? Number.MAX_SAFE_INTEGER)
    }

    const leftSlot =
      readString(asRecord(left.ranking_reason).target_stage_slot) ?? left.items[0]?.slot ?? ''
    const rightSlot =
      readString(asRecord(right.ranking_reason).target_stage_slot) ?? right.items[0]?.slot ?? ''
    if (leftSlot !== rightSlot) {
      return leftSlot.localeCompare(rightSlot)
    }

    return right.score - left.score
  })
}

function sortPlansByOverallRank(
  plans: UpgradeRecommendationPlan[],
  overallRanks: Map<string, number>,
): UpgradeRecommendationPlan[] {
  const originalIndex = new Map(plans.map((plan, index) => [plan.id, index]))

  return [...plans].sort((left, right) => {
    const leftRank = overallRanks.get(left.id) ?? Number.MAX_SAFE_INTEGER
    const rightRank = overallRanks.get(right.id) ?? Number.MAX_SAFE_INTEGER
    if (leftRank !== rightRank) {
      return leftRank - rightRank
    }

    return (originalIndex.get(left.id) ?? 0) - (originalIndex.get(right.id) ?? 0)
  })
}

function isUniqueRecommendationPlan(plan: UpgradeRecommendationPlan): boolean {
  const itemBasedMatch = plan.items.some((item) => {
    const payload = asRecord(item.item_payload)
    const rarity = readString(payload.rarity)?.toLowerCase()
    if (rarity === 'unique') {
      return true
    }

    const candidateType = readString(payload.candidate_type)
    if (candidateType === 'market_unique') {
      return true
    }

    const tradeLinkKind = readString(payload.trade_link_kind)
    if (tradeLinkKind === 'name_search') {
      return true
    }

    const rawText = readString(payload.raw_text)
    return rawText?.split(/\r?\n/).some((line) => line.trim() === 'Rarity: Unique') ?? false
  })

  if (itemBasedMatch) {
    return true
  }

  return (
    plan.category === 'unlock_next_stage' &&
    plan.items.length > 0 &&
    plan.items.every((item) => !item.slot)
  )
}

function isTargetStageRareRecommendationPlan(plan: UpgradeRecommendationPlan): boolean {
  return plan.items.some((item) => {
    const payload = asRecord(item.item_payload)
    const candidateType = readString(payload.candidate_type)
    if (candidateType === 'target_stage_rare') {
      return true
    }

    const tradeLinkKind = readString(payload.trade_link_kind)
    return tradeLinkKind === 'template_exact_search'
  })
}

function getRecommendationItemActionType(
  item: UpgradeRecommendationPlan['items'][number],
): string | null {
  return readString(asRecord(item.item_payload).action_type)
}

function getRecommendationItemRarity(
  item: UpgradeRecommendationPlan['items'][number],
): string | null {
  const payload = asRecord(item.item_payload)
  const rarity = readString(payload.rarity)
  if (rarity) return rarity.toLowerCase()

  const rawText = readString(payload.raw_text)
  const rawRarity = rawText
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^Rarity:\s+/i.test(line))
  return (
    rawRarity
      ?.replace(/^Rarity:\s+/i, '')
      .trim()
      .toLowerCase() ?? null
  )
}

function isGearRecommendationPlan(plan: UpgradeRecommendationPlan): boolean {
  return plan.items.some((item) => {
    const actionType = getRecommendationItemActionType(item)
    return actionType == null || actionType === 'gear_item'
  })
}

function isRareGearRecommendationPlan(plan: UpgradeRecommendationPlan): boolean {
  if (!isGearRecommendationPlan(plan)) return false

  const hasCompareActionType = plan.items.some(
    (item) => getRecommendationItemActionType(item) != null,
  )
  if (hasCompareActionType) {
    return plan.items.some(
      (item) =>
        getRecommendationItemActionType(item) === 'gear_item' &&
        getRecommendationItemRarity(item) === 'rare',
    )
  }

  return !isUniqueRecommendationPlan(plan)
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes <= 0) return `${seconds}s`
  if (seconds === 0) return `${minutes}m`
  return `${minutes}m ${seconds}s`
}

function getLatestLiveRun(runs: UpgradeAnalysisRun[]): UpgradeAnalysisRun | null {
  return runs.find((run) => run.status === 'queued' || run.status === 'running') ?? null
}

function normalizeLoadoutLabel(value: string | null | undefined): string | null {
  const normalized = value?.replace(/\s+/g, ' ').trim()
  return normalized ? normalized : null
}

function normalizeLoadoutKey(value: string | null | undefined): string | null {
  const normalized = normalizeLoadoutLabel(value)
  return normalized ? normalized.toLowerCase() : null
}

function buildLoadoutOptions(
  metadata: BuildTarget['import_metadata'] | null | undefined,
): LoadoutOption[] {
  if (!metadata) return []

  const groups = [
    {
      field: 'treeSpecId' as const,
      entries: metadata.tree_specs.map((entry) => ({
        id: entry.id,
        label: normalizeLoadoutLabel(entry.title),
      })),
    },
    {
      field: 'itemSetId' as const,
      entries: metadata.item_sets.map((entry) => ({
        id: entry.id,
        label: normalizeLoadoutLabel(entry.title),
      })),
    },
    {
      field: 'skillSetId' as const,
      entries: metadata.skill_sets.map((entry) => ({
        id: entry.id,
        label: normalizeLoadoutLabel(entry.title),
      })),
    },
    {
      field: 'configSetId' as const,
      entries: metadata.config_sets.map((entry) => ({
        id: entry.id,
        label: normalizeLoadoutLabel(entry.title),
      })),
    },
  ]

  const activeGroups = groups.filter((group) => group.entries.length > 0)
  if (activeGroups.length === 0) return []

  const baseGroup = activeGroups[0]
  const groupMaps = Object.fromEntries(
    activeGroups.map((group) => [
      group.field,
      new Map(
        group.entries
          .map((entry) => {
            const key = normalizeLoadoutKey(entry.label)
            return key ? [key, entry.id] : null
          })
          .filter((entry): entry is [string, string] => entry != null),
      ),
    ]),
  ) as Record<'treeSpecId' | 'itemSetId' | 'skillSetId' | 'configSetId', Map<string, string>>

  const options: LoadoutOption[] = []
  const seen = new Set<string>()

  for (const entry of baseGroup.entries) {
    const key = normalizeLoadoutKey(entry.label)
    if (!key || seen.has(key)) continue

    const existsEverywhere = activeGroups.every((group) => groupMaps[group.field].has(key))
    if (!existsEverywhere) continue

    seen.add(key)
    options.push({
      key,
      label: entry.label ?? 'Loadout',
      treeSpecId: groupMaps.treeSpecId?.get(key) ?? null,
      itemSetId: groupMaps.itemSetId?.get(key) ?? null,
      skillSetId: groupMaps.skillSetId?.get(key) ?? null,
      configSetId: groupMaps.configSetId?.get(key) ?? null,
    })
  }

  return options
}

function normalizeOptionalLabel(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function normalizeStoredPartyEntry(value: unknown): PartyBuildEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const entry = value as Record<string, unknown>
  const label = normalizeOptionalLabel(entry.label)

  if (entry.kind === 'pob_code') {
    const pobCode = typeof entry.pob_code === 'string' ? entry.pob_code.trim() : ''
    if (!pobCode) return null
    return { kind: 'pob_code', pob_code: pobCode, label }
  }

  if (entry.kind === 'group_member') {
    const buildTargetId =
      typeof entry.build_target_id === 'string' ? entry.build_target_id.trim() : ''
    if (!buildTargetId) return null
    return { kind: 'group_member', build_target_id: buildTargetId, label }
  }

  return null
}

function normalizeStoredPartyConfig(value: unknown): PartyBuildEntry[] {
  const entries = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && !Array.isArray(value)
      ? ((value as Partial<StoredPartyConfig>).entries ?? [])
      : []

  return entries
    .map((entry) => normalizeStoredPartyEntry(entry))
    .filter((entry): entry is PartyBuildEntry => entry != null)
    .slice(0, 5)
}

function getPartyConfigStorageKey(
  groupId: string | null | undefined,
  userId: string | null | undefined,
  characterId: string | null | undefined,
): string | null {
  if (!groupId || !userId || !characterId) return null
  return `gear-optimizer-party-config:v${PARTY_CONFIG_STORAGE_VERSION}:${groupId}:${userId}:${characterId}`
}

function readStoredPartyConfig(key: string): PartyBuildEntry[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return []
    return normalizeStoredPartyConfig(JSON.parse(raw))
  } catch {
    return []
  }
}

function getSelectedCharacterStorageKey(
  groupId: string | null | undefined,
  userId: string | null | undefined,
): string | null {
  if (!groupId || !userId) return null
  return `gear-optimizer-selected-character:v${CHARACTER_SELECTION_STORAGE_VERSION}:${groupId}:${userId}`
}

function readStoredSelectedCharacterId(key: string): string | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null

    const parsed: StoredCharacterSelection = JSON.parse(raw)
    if (parsed.version !== CHARACTER_SELECTION_STORAGE_VERSION) return null

    const characterId = typeof parsed.characterId === 'string' ? parsed.characterId.trim() : ''
    return characterId || null
  } catch {
    return null
  }
}

function writeStoredSelectedCharacterId(key: string, characterId: string | null) {
  if (typeof window === 'undefined') return

  if (!characterId) {
    window.localStorage.removeItem(key)
    return
  }

  const payload: StoredCharacterSelection = {
    version: CHARACTER_SELECTION_STORAGE_VERSION,
    characterId,
  }
  window.localStorage.setItem(key, JSON.stringify(payload))
}

function writeStoredPartyConfig(key: string, entries: PartyBuildEntry[]) {
  if (typeof window === 'undefined') return

  if (entries.length === 0) {
    window.localStorage.removeItem(key)
    return
  }

  const payload: StoredPartyConfig = {
    version: PARTY_CONFIG_STORAGE_VERSION,
    entries,
  }
  window.localStorage.setItem(key, JSON.stringify(payload))
}

function getAnalysisPrefsStorageKey(
  groupId: string | null | undefined,
  userId: string | null | undefined,
  characterId: string | null | undefined,
): string | null {
  if (!groupId || !userId || !characterId) return null
  return `gear-optimizer-analysis-prefs:v${ANALYSIS_PREFS_STORAGE_VERSION}:${groupId}:${userId}:${characterId}`
}

function readStoredAnalysisPrefs(
  key: string,
  fallbackBudgetCurrency: 'chaos' | 'divine',
): {
  analysisMode: UpgradeAnalysisMode
  budgetChaos: string
  budgetCurrency: 'chaos' | 'divine'
} | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(key)
    if (!raw) return null
    const parsed: StoredAnalysisPrefs = JSON.parse(raw)
    if (parsed.version !== ANALYSIS_PREFS_STORAGE_VERSION) return null
    const mode = parsed.analysisMode === 'thorough' ? 'thorough' : 'quick'
    const budget =
      typeof parsed.budgetChaos === 'string' ? parsed.budgetChaos : DEFAULT_LIVE_MARKET_BUDGET_CHAOS
    const budgetCurrency =
      parsed.budgetCurrency === 'divine'
        ? 'divine'
        : parsed.budgetCurrency === 'chaos'
          ? 'chaos'
          : fallbackBudgetCurrency
    return { analysisMode: mode, budgetChaos: budget, budgetCurrency }
  } catch {
    return null
  }
}

function writeStoredAnalysisPrefs(
  key: string,
  analysisMode: UpgradeAnalysisMode,
  budgetChaos: string,
  budgetCurrency: 'chaos' | 'divine',
) {
  if (typeof window === 'undefined') return
  const payload: StoredAnalysisPrefs = {
    version: ANALYSIS_PREFS_STORAGE_VERSION,
    analysisMode,
    budgetChaos,
    budgetCurrency,
  }
  window.sessionStorage.setItem(key, JSON.stringify(payload))
}

function getGroupPartyBuildTargetLabel(
  target: GroupPartyBuildTarget | null | undefined,
): string | null {
  if (!target) return null
  const owner = target.display_name ?? target.poe_account_name ?? 'Unknown'
  return `${owner} — ${target.name}`
}

function normalizeGemNameForComparison(name: string | null | undefined): string | null {
  if (!name) return null

  const normalized = name
    .replace(/\s*\(Disabled by Default\)\s*$/i, '')
    .replace(/\s+Support\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized) return null
  if (/^-{2,}.+-{2,}$/.test(normalized)) return null

  return normalized.toLowerCase()
}

function buildGemVisualLookup(
  profile: CharacterProfileSnapshot | null | undefined,
  ninjaGems: NinjaSkillGemIcon[],
): Map<string, ResolvedGemVisual> {
  const lookup = new Map<string, ResolvedGemVisual>()
  const colorMap = gemColorLookup as Record<string, string>

  for (const gem of ninjaGems) {
    const key = normalizeGemNameForComparison(gem.name)
    if (!key) continue

    lookup.set(key, {
      icon: gem.icon,
      socketColor: colorMap[gem.name] ?? colorMap[key] ?? null,
    })
  }

  if (!profile) {
    return lookup
  }

  for (const item of profile.gear) {
    for (const gem of item.socketedItems) {
      const gemName = (gem.name.trim() || gem.typeLine.trim()).trim()
      const key = normalizeGemNameForComparison(gemName)
      if (!key) continue

      const existing = lookup.get(key)
      const normalizedName = gemName.replace(/\s+Support\s*$/i, '').trim()
      const socketColor =
        colorMap[gemName] ?? colorMap[normalizedName] ?? existing?.socketColor ?? null

      lookup.set(key, {
        icon: gem.icon ?? existing?.icon ?? null,
        socketColor,
      })
    }
  }

  return lookup
}

function getSocketTextColorClass(socketColor: string | null): string {
  const normalized = socketColor?.toUpperCase() ?? null
  switch (normalized) {
    case 'RED':
    case 'R':
    case 'STRENGTH':
      return 'text-[#e06a6a]'
    case 'GREEN':
    case 'G':
    case 'DEXTERITY':
      return 'text-[#46a239]'
    case 'BLUE':
    case 'B':
    case 'INTELLIGENCE':
      return 'text-[#8888ff]'
    case 'W':
      return 'text-[#f5f5f5]'
    case 'A':
    case 'ABYSS':
      return 'text-[#fcd34d]'
    default:
      return 'text-[#8888ff]'
  }
}

function getPartyConfigEntryLabel(
  entry: PartyBuildEntry,
  index: number,
  partyBuildTargets: GroupPartyBuildTarget[] | null | undefined,
): string {
  if (entry.label && entry.label.trim().length > 0) {
    return entry.label.trim()
  }

  if (entry.kind === 'group_member') {
    return (
      getGroupPartyBuildTargetLabel(
        partyBuildTargets?.find((target) => target.id === entry.build_target_id) ?? null,
      ) ?? `Group member ${index + 1}`
    )
  }

  return `Custom code ${index + 1}`
}

function getSetupDisplayLabel(label: string | null | undefined): string {
  return label?.trim() || DEFAULT_SETUP_LABEL
}

function stageMatchesSetup(
  stage: BuildTargetStage | null,
  setup: {
    treeSpecId: string | null
    itemSetId: string | null
    skillSetId: string | null
    configSetId: string | null
  },
): boolean {
  if (!stage) return false

  return (
    stage.tree_spec_id === setup.treeSpecId &&
    stage.item_set_id === setup.itemSetId &&
    stage.skill_set_id === setup.skillSetId &&
    stage.config_set_id === setup.configSetId &&
    stage.primary_offensive_metric === FIXED_PRIMARY_METRIC
  )
}

function createDraftQueuedRun(args: {
  groupId: string
  buildTargetId: string
  targetUserId: string
  characterId: string | null
  queuedBy: string
  budgetChaos: number
  analysisMode: UpgradeAnalysisMode
  targetStageId: string | null
  targetStageLabel: string | null
  searchConstraints: UpgradeSearchConstraints
}): UpgradeAnalysisRun {
  const nowIso = new Date().toISOString()
  return {
    id: `draft-${nowIso}`,
    group_id: args.groupId,
    build_target_id: args.buildTargetId,
    target_stage_id: args.targetStageId,
    target_user_id: args.targetUserId,
    character_id: args.characterId,
    queued_by: args.queuedBy,
    budget_chaos: args.budgetChaos,
    analysis_mode: args.analysisMode,
    search_constraints: args.searchConstraints,
    party_config: [],
    input_hash: '',
    status: 'queued',
    stale_reason: null,
    partial_reason: null,
    error_detail: null,
    summary: {
      queue_submission_pending: true,
      target_stage_label: args.targetStageLabel,
    },
    started_at: null,
    completed_at: null,
    created_at: nowIso,
    updated_at: nowIso,
  }
}

function getSearchSlotOverrideSignature(
  value: UpgradeSearchSlotConstraint | null | undefined,
): string {
  return JSON.stringify(value ?? { disabled_target_keys: [] })
}

function getChangedSearchConstraintSlots(
  baseConstraints: UpgradeSearchConstraints | null | undefined,
  nextConstraints: UpgradeSearchConstraints | null | undefined,
): string[] {
  const base = normalizeUpgradeSearchConstraints(baseConstraints)
  const next = normalizeUpgradeSearchConstraints(nextConstraints)
  const changed = new Set<string>()
  const slots = new Set([...Object.keys(base.slot_overrides), ...Object.keys(next.slot_overrides)])

  for (const slot of slots) {
    if (
      getSearchSlotOverrideSignature(base.slot_overrides[slot]) !==
      getSearchSlotOverrideSignature(next.slot_overrides[slot])
    ) {
      changed.add(slot)
    }
  }

  if (base.ignore_crafted_mods !== next.ignore_crafted_mods) {
    for (const slot of slots) {
      changed.add(slot)
    }
  }

  return [...changed].sort((left, right) => left.localeCompare(right))
}

function normalizePartyConfigForComparison(
  value: PartyBuildEntry[] | null | undefined,
): Array<
  { kind: 'pob_code'; pob_code: string } | { kind: 'group_member'; build_target_id: string }
> {
  const normalized: Array<
    { kind: 'pob_code'; pob_code: string } | { kind: 'group_member'; build_target_id: string }
  > = []

  for (const entry of Array.isArray(value) ? value : []) {
    if (!entry || typeof entry !== 'object') {
      continue
    }

    if (entry.kind === 'pob_code') {
      normalized.push({
        kind: 'pob_code',
        pob_code: entry.pob_code?.trim() ?? '',
      })
      continue
    }

    normalized.push({
      kind: 'group_member',
      build_target_id: entry.build_target_id,
    })
  }

  return normalized
}

function arePartyConfigsEquivalent(
  left: PartyBuildEntry[] | null | undefined,
  right: PartyBuildEntry[] | null | undefined,
): boolean {
  return (
    JSON.stringify(normalizePartyConfigForComparison(left)) ===
    JSON.stringify(normalizePartyConfigForComparison(right))
  )
}

function getSummaryText(
  summary: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = summary?.[key]
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function getSummaryNumber(
  summary: Record<string, unknown> | null | undefined,
  key: string,
): number | null {
  const value = summary?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function getSummaryList(
  summary: Record<string, unknown> | null | undefined,
  key: string,
): string[] {
  const value = summary?.[key]
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : []
}

function getRareTradeSearchSummary(
  summary: Record<string, unknown> | null | undefined,
): RareTradeSearchSummary | null {
  const value = summary?.rare_trade_search
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as RareTradeSearchSummary)
    : null
}

type RunPhaseId =
  | 'submitting'
  | 'queued'
  | 'loading_inputs'
  | 'fetching_market_uniques'
  | 'planning_live_rare_search'
  | 'searching_live_rares'
  | 'scoring_upgrades'
  | 'persisting_results'

const RUN_PHASE_ORDER_THOROUGH: RunPhaseId[] = [
  'loading_inputs',
  'fetching_market_uniques',
  'planning_live_rare_search',
  'searching_live_rares',
  'scoring_upgrades',
  'persisting_results',
]

const RUN_PHASE_ORDER_QUICK: RunPhaseId[] = [
  'loading_inputs',
  'fetching_market_uniques',
  'scoring_upgrades',
  'persisting_results',
]

const RUN_PHASE_LABELS: Record<RunPhaseId, string> = {
  submitting: 'Submitting',
  queued: 'Queued',
  loading_inputs: 'Loading build and character inputs',
  fetching_market_uniques: 'Fetching live unique prices',
  planning_live_rare_search: 'Scoring rare templates and planning live search',
  searching_live_rares: 'Searching live rare market for shortlisted slots',
  scoring_upgrades: 'Scoring final upgrades in PoB runtime',
  persisting_results: 'Saving recommendations',
}

function getCurrentRunPhaseId(
  run: UpgradeAnalysisRun | null | undefined,
): { id: RunPhaseId; startedAtMs: number | null } | null {
  if (!run) return null
  if (run.status === 'queued') {
    return { id: 'queued', startedAtMs: null }
  }
  if (run.status !== 'running') return null

  const rawPhase = run.summary?.current_phase
  if (rawPhase && typeof rawPhase === 'object' && !Array.isArray(rawPhase)) {
    const record = rawPhase as Record<string, unknown>
    const id = typeof record.id === 'string' ? (record.id as RunPhaseId) : null
    const startedAt = typeof record.started_at === 'string' ? Date.parse(record.started_at) : NaN
    if (id) {
      return {
        id,
        startedAtMs: Number.isFinite(startedAt) ? startedAt : null,
      }
    }
  }
  return null
}

function getRunPhaseTimeline(
  run: UpgradeAnalysisRun,
  currentPhaseId: RunPhaseId | null,
): Array<{ id: RunPhaseId; label: string; status: 'done' | 'active' | 'pending' }> {
  const order = run.analysis_mode === 'thorough' ? RUN_PHASE_ORDER_THOROUGH : RUN_PHASE_ORDER_QUICK
  const activeIndex =
    currentPhaseId && order.includes(currentPhaseId) ? order.indexOf(currentPhaseId) : -1
  return order.map((phaseId, index) => {
    let status: 'done' | 'active' | 'pending' = 'pending'
    if (activeIndex === -1) {
      status = 'pending'
    } else if (index < activeIndex) {
      status = 'done'
    } else if (index === activeIndex) {
      status = 'active'
    }
    return {
      id: phaseId,
      label: RUN_PHASE_LABELS[phaseId],
      status,
    }
  })
}

function formatElapsedSince(startedAt: string | null | undefined, nowMs: number): string | null {
  if (!startedAt) return null
  const startedMs = Date.parse(startedAt)
  if (!Number.isFinite(startedMs)) return null
  const elapsedMs = Math.max(0, nowMs - startedMs)
  return formatCountdown(elapsedMs)
}

function formatEstimatedDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—'
  if (seconds < 60) return `${Math.round(seconds)}s`

  const minutes = seconds / 60
  if (minutes < 10) {
    const wholeMinutes = Math.floor(minutes)
    const remainingSeconds = Math.round(seconds - wholeMinutes * 60)
    return remainingSeconds > 0 ? `${wholeMinutes}m ${remainingSeconds}s` : `${wholeMinutes}m`
  }

  return `${Math.round(minutes)}m`
}

function getRuntimeEstimateSourceLabel(source: AnalysisRuntimeEstimate['source']): string | null {
  switch (source) {
    case 'last_hour':
      return 'last hour'
    case 'last_24h':
      return 'last 24h'
    case 'last_7d':
      return 'last 7d'
    case 'last_30d':
      return 'last 30d'
    default:
      return null
  }
}

function formatRuntimeEstimateSummary(
  estimate: AnalysisRuntimeEstimate | null | undefined,
): string | null {
  if (!estimate) return null
  if (estimate.source === 'none' || estimate.median_seconds === null) {
    if (estimate.active_runs > 0) {
      return `${estimate.active_runs} active run${estimate.active_runs === 1 ? '' : 's'} right now`
    }
    return null
  }

  const duration = formatEstimatedDuration(estimate.median_seconds)
  const sourceLabel = getRuntimeEstimateSourceLabel(estimate.source)
  const activeRunsLabel =
    estimate.active_runs > 0
      ? ` · ${estimate.active_runs} active run${estimate.active_runs === 1 ? '' : 's'}`
      : ''

  return `Estimated runtime: ≈ ${duration}${sourceLabel ? ` based on ${sourceLabel}` : ''}${activeRunsLabel}`
}

function formatRuntimeEstimateChipLabel(
  estimate: AnalysisRuntimeEstimate | null | undefined,
): string | null {
  if (!estimate || estimate.source === 'none' || estimate.median_seconds === null) {
    return null
  }
  return `Est. ${formatEstimatedDuration(estimate.median_seconds)}`
}

function planNeedsMarketSearch(plan: UpgradeRecommendationPlan): boolean {
  return plan.items.some((item) => {
    const payload =
      item.item_payload &&
      typeof item.item_payload === 'object' &&
      !Array.isArray(item.item_payload)
        ? (item.item_payload as Record<string, unknown>)
        : {}

    return (
      payload.requires_search_iteration === true ||
      payload.estimated_price === true ||
      payload.candidate_type === 'target_stage_rare'
    )
  })
}

function getTradeRateLimitWaitInfo(
  run: UpgradeAnalysisRun | null | undefined,
  nowMs: number = Date.now(),
) {
  if (!run) return null

  const rareTradeSearch = getRareTradeSearchSummary(run.summary)

  if (run.status !== 'running' || rareTradeSearch?.waiting_for_retry !== true) {
    return null
  }

  const retryAt = typeof rareTradeSearch.retry_at === 'string' ? rareTradeSearch.retry_at : null
  if (!retryAt) {
    return null
  }

  const retryAtMs = Date.parse(retryAt)
  if (!Number.isFinite(retryAtMs)) {
    return null
  }

  return {
    retryAt,
    retryAtMs,
    remainingMs: Math.max(0, retryAtMs - nowMs),
  }
}

function getRunStatusCopy(run: UpgradeAnalysisRun, nowMs: number = Date.now()): string {
  switch (run.status) {
    case 'queued':
      if (run.summary?.queue_submission_pending === true) {
        return 'Submitting the run and preparing the worker handoff.'
      }
      return run.analysis_mode === 'thorough'
        ? 'Queued for a deeper live market pass.'
        : 'Queued and waiting for the worker to pick it up.'
    case 'running': {
      const waitInfo = getTradeRateLimitWaitInfo(run, nowMs)
      if (waitInfo) {
        return `Waiting for the trade API cooldown. The worker will resume automatically in about ${formatCountdown(waitInfo.remainingMs)}.`
      }
      const currentPhase = getCurrentRunPhaseId(run)
      if (currentPhase && currentPhase.id !== 'queued' && currentPhase.id !== 'submitting') {
        return `${RUN_PHASE_LABELS[currentPhase.id]}.`
      }
      if (run.analysis_mode === 'quick') {
        return 'The worker is running a quick overview pass with exact baseline and fast rare guidance.'
      }
      return 'The worker is analyzing upgrades for the selected setup right now.'
    }
    case 'completed':
      return 'This run matches the current inputs.'
    case 'partial': {
      if (usesRetiredAnalysisEngine(run)) {
        return 'This run was created by an older analysis engine and should be rerun.'
      }
      const exactPlanCount = getSummaryNumber(run.summary, 'exact_plan_count') ?? 0
      if (exactPlanCount > 0) {
        return 'Recommendations are available. This run is using the current exact-scoring feature set.'
      }
      return 'Recommendations are available, but the worker reported partial confidence.'
    }
    case 'failed':
      return 'This run failed before the recommendations could be stored.'
    case 'stale':
      return formatStaleReason(run.stale_reason)
    default:
      return 'Run status unknown.'
  }
}

function getRecommendationItemCompareSlot(item: {
  slot: string | null
  item_payload: Record<string, unknown>
}): string | null {
  return normalizeCompareSlot(
    readString(item.item_payload.target_stage_slot) ??
      readString(item.item_payload.slot) ??
      item.slot,
  )
}

function getAnalysisModeLabel(mode: UpgradeAnalysisMode): string {
  return mode === 'thorough' ? 'Live market' : 'Quick overview'
}

function getRunBudgetLabel(
  run: Pick<UpgradeAnalysisRun, 'analysis_mode' | 'budget_chaos'>,
  currencyDisplay: 'chaos' | 'divine',
  divinePrice: number,
): string {
  if (run.analysis_mode === 'quick') {
    return 'No budget cap'
  }

  return `Budget ${formatCurrencyAmount(run.budget_chaos, currencyDisplay, divinePrice)}`
}

function getDisplayedPartialReason(
  run: UpgradeAnalysisRun | null | undefined,
  nowMs: number = Date.now(),
): string | null {
  if (!run || run.status === 'failed') return null
  if (getTradeRateLimitWaitInfo(run, nowMs)) return null
  if (usesRetiredAnalysisEngine(run)) {
    return getRetiredAnalysisEngineMessage()
  }

  const rareTradeSearch = getRareTradeSearchSummary(run.summary)
  const runtimeReason =
    typeof run.partial_reason === 'string' && run.partial_reason.trim().length > 0
      ? run.partial_reason
      : null
  const exactPlanCount = getSummaryNumber(run.summary, 'exact_plan_count') ?? 0
  const exactUniqueEvaluated = getSummaryNumber(run.summary, 'exact_unique_evaluated_count') ?? 0
  const exactRareEvaluated = getSummaryNumber(run.summary, 'exact_rare_evaluated_count') ?? 0
  const exactStageTemplateRareEvaluated =
    getSummaryNumber(run.summary, 'exact_stage_template_rare_evaluated_count') ?? 0
  const exactMarketRareEvaluated =
    getSummaryNumber(run.summary, 'exact_market_rare_evaluated_count') ?? 0
  const exactMarketRarePlanCount =
    getSummaryNumber(run.summary, 'exact_market_rare_plan_count') ?? 0
  const exactStageTemplateRarePlanCount =
    getSummaryNumber(run.summary, 'exact_stage_template_rare_plan_count') ?? 0
  const rareCandidateCount = getSummaryNumber(run.summary, 'rare_candidate_count') ?? 0
  const rareTradeRateLimited = rareTradeSearch?.rate_limited === true
  const rareTradeRetryAfterMs =
    typeof rareTradeSearch?.retry_after_ms === 'number' &&
    Number.isFinite(rareTradeSearch.retry_after_ms)
      ? rareTradeSearch.retry_after_ms
      : null

  if (rareTradeRateLimited) {
    const retrySeconds = rareTradeRetryAfterMs
      ? Math.max(1, Math.round(rareTradeRetryAfterMs / 1000))
      : null
    const retryMinutes = retrySeconds != null ? Math.max(1, Math.ceil(retrySeconds / 60)) : null
    return `Live rare trade search hit the trade API rate limit${retryMinutes ? ` and should recover in about ${retryMinutes} minute${retryMinutes === 1 ? '' : 's'}` : ''}. Exact PoB baseline metrics were still available, and the runtime exact-scored ${exactUniqueEvaluated} target uniques plus ${exactStageTemplateRareEvaluated} setup-based rare templates internally, but no live rare candidates could be stored for this run.`
  }

  if (exactPlanCount > 0) {
    if (run.analysis_mode === 'quick') {
      return 'Quick overview uses exact PoB baseline and fast single-item scoring. Fresh live rare search is skipped in this mode.'
    }

    if (exactMarketRarePlanCount > 0) {
      return 'This run includes exact PoB-scored unique and live market rare single-item upgrades. Multi-item bundles and broader rare search are still pending.'
    }

    if (exactStageTemplateRarePlanCount > 0 || exactStageTemplateRareEvaluated > 0) {
      const searchedSlotCount =
        typeof rareTradeSearch?.searched_slot_count === 'number' &&
        Number.isFinite(rareTradeSearch.searched_slot_count)
          ? rareTradeSearch.searched_slot_count
          : 0
      if (searchedSlotCount > 0 && exactMarketRarePlanCount === 0) {
        return `Live rare search ran for ${searchedSlotCount} slot${searchedSlotCount === 1 ? '' : 's'} but found no constrained market matches. The rare rows shown below are target PoB template swaps, while Target PoB item scores shows the full exact-scored target setup.`
      }
      return 'This run includes exact PoB-scored unique upgrades plus exact rare refinement candidates based on the selected setup. Relax the rerun inputs for those rare slots to search the live market more broadly. Bundles and deeper rare search are still pending.'
    }

    if (rareCandidateCount > 0 || exactMarketRareEvaluated > 0) {
      return 'This run includes exact PoB-scored unique upgrades. Live rare search is active, but broader rare search and bundles are still pending.'
    }

    return 'This run includes exact PoB-scored unique upgrades. Broader live rare search and bundles are still pending.'
  }

  if (
    exactUniqueEvaluated > 0 ||
    exactRareEvaluated > 0 ||
    exactMarketRareEvaluated > 0 ||
    exactStageTemplateRareEvaluated > 0
  ) {
    if (run.analysis_mode === 'quick') {
      return 'Quick overview stayed fast by skipping fresh live rare search. Use Live market when you want budgeted live listings and prices.'
    }

    const rareLabel =
      exactMarketRareEvaluated > 0 || rareCandidateCount > 0
        ? `${Math.max(exactMarketRareEvaluated, exactRareEvaluated)} constrained live rare candidates`
        : `${Math.max(exactStageTemplateRareEvaluated, exactRareEvaluated)} setup-inspired rare candidates`

    return `Exact PoB baseline metrics were available, and the runtime exact-scored ${exactUniqueEvaluated} target uniques plus ${rareLabel}, but none of those exact candidates surfaced as stored recommendations. Try rerunning with broader live-market inputs for those rare slots.`
  }

  return runtimeReason
}

function summarizeCompatibility(metadataCounts: {
  treeCount: number
  itemCount: number
  skillCount: number
}) {
  if (
    metadataCounts.treeCount > 0 &&
    metadataCounts.itemCount > 0 &&
    metadataCounts.skillCount > 0
  ) {
    return { status: 'compatible' as const, notes: null }
  }

  if (
    metadataCounts.treeCount > 0 ||
    metadataCounts.itemCount > 0 ||
    metadataCounts.skillCount > 0
  ) {
    return {
      status: 'partial' as const,
      notes:
        'The import decoded, but some PoB layout groups were missing and the analyzer may fall back more often.',
    }
  }

  return {
    status: 'unsupported' as const,
    notes: 'The import decoded, but no usable tree, item, or skill layouts were found.',
  }
}

function roundSearchConstraintValue(value: number): number {
  return Math.round(value * 100) / 100
}

function searchConstraintValuesMatch(left: number, right: number): boolean {
  return Math.abs(left - right) <= 0.01
}

function getRareSearchTargetSummary(option: ResolvedRareStageSearchOption): string {
  const editableLineCount = option.sections.reduce(
    (count, section) => count + section.lines.filter((line) => !!line.target).length,
    0,
  )
  const activeTargets = option.targetKeys
    .map((key) => {
      const value = option.effectiveTargetValues[key] ?? 0
      const contributingLineCount = option.contributingLineCounts[key] ?? 0
      if (value <= 0 || contributingLineCount < 2) return null
      return `${RARE_SEARCH_TARGET_LABELS[key] ?? key} ${formatRareSearchTargetValue(value)}`
    })
    .filter((entry): entry is string => !!entry)

  const linePart =
    editableLineCount > 0
      ? `${editableLineCount} editable mod line${editableLineCount === 1 ? '' : 's'}`
      : null

  if (activeTargets.length === 0) {
    return linePart
      ? `Exact item modifiers are searched first. ${linePart} available for this slot.`
      : 'Exact item modifiers are searched first. No editable search controls are active for this slot.'
  }

  const targetsText =
    activeTargets.length <= 3
      ? `aggregate targets: ${activeTargets.join(', ')}`
      : `aggregate targets: ${activeTargets.slice(0, 3).join(', ')} and ${activeTargets.length - 3} more`

  return linePart
    ? `Exact item modifiers are searched first. ${linePart}, plus ${targetsText}.`
    : `Exact item modifiers are searched first. Editable ${targetsText}.`
}

function RareSearchItemEditor({
  option,
  onLineEnabledChange,
  onLineValueChange,
}: {
  option: ResolvedRareStageSearchOption
  onLineEnabledChange: (
    slot: string,
    target: ResolvedRareStageSearchLineTarget,
    enabled: boolean,
  ) => void
  onLineValueChange: (
    slot: string,
    target: ResolvedRareStageSearchLineTarget,
    value: number | null,
  ) => void
}) {
  const aggregateChipKeys = option.targetKeys.filter(
    (key) => (option.contributingLineCounts[key] ?? 0) >= 2,
  )
  const showChipRow = aggregateChipKeys.length > 0

  return (
    <div className="flex flex-col gap-3">
      {showChipRow ? (
        <div className="flex flex-wrap gap-2">
          {aggregateChipKeys.map((key) => {
            const currentValue = option.effectiveTargetValues[key] ?? 0
            const defaultValue =
              option.defaultActiveTargetValues[key] ?? option.defaultTargetValues[key] ?? 0
            const isDisabled = currentValue <= 0
            const isAdjusted =
              !isDisabled &&
              defaultValue > 0 &&
              !searchConstraintValuesMatch(currentValue, defaultValue)

            return (
              <Chip
                key={`${option.slot}-${key}`}
                size="sm"
                variant="soft"
                className={isAdjusted ? 'bg-info-soft text-info' : undefined}
              >
                {RARE_SEARCH_TARGET_LABELS[key] ?? key} {formatRareSearchTargetValue(currentValue)}
              </Chip>
            )
          })}
        </div>
      ) : null}

      <div className="rounded-large border-divider bg-content1 text-foreground wrap-anywhere border px-3 py-2">
        <div className="border-divider border-b pb-2 text-center">
          <p className="text-sm font-semibold text-[color:var(--foreground-strong)]">
            {option.title}
          </p>
          {option.subtitle ? (
            <p className="text-default-500 mt-1 text-xs">
              {option.subtitle}
            </p>
          ) : null}
        </div>

        {option.properties.length > 0 ? (
          <div className="border-divider border-b py-2 text-center">
            {option.properties.map((property, index) => (
              <p
                key={`${option.slot}-property-${property.name}-${index}`}
                className="text-xs leading-5 tabular-nums"
              >
                <span className="text-default-500">{property.name}:</span>{' '}
                <span className="text-[color:var(--foreground-strong)]">{property.values.join(', ')}</span>
              </p>
            ))}
          </div>
        ) : null}

        {option.requirements.length > 0 ? (
          <div className="border-divider border-b py-2 text-center">
            <p className="text-default-500 text-xs">Requires</p>
            {option.requirements.map((requirement, index) => (
              <p
                key={`${option.slot}-requirement-${requirement.name}-${index}`}
                className="text-xs leading-5 tabular-nums"
              >
                {requirement.name} {requirement.values.join(', ')}
              </p>
            ))}
          </div>
        ) : null}

        {option.sections.length > 0 ? (
          <div className="border-divider border-b">
            {option.sections.map((section, sectionIndex) => (
              <div
                key={`${option.slot}-${section.key}`}
                className={`${sectionIndex > 0 ? 'border-divider border-t' : ''} py-2`}
              >
                {section.title ? (
                  <p className="text-default-500 mb-2 text-center text-xs">
                    {section.title}
                  </p>
                ) : null}
                <div className="flex flex-col gap-2">
                  {section.lines.map((line) => {
                    if (!line.target) {
                      return (
                        <p
                          key={`${option.slot}-${line.id}`}
                          className={`text-center text-xs leading-5 tabular-nums ${line.lineClassName}`}
                        >
                          {line.text}
                        </p>
                      )
                    }

                    const lineTarget = line.target
                    const isDisabled = !lineTarget.enabled
                    return (
                      <div
                        key={`${option.slot}-${line.id}`}
                        className={`rounded-large border px-2 py-2 ${
                          isDisabled
                            ? 'border-divider bg-content1'
                            : 'border-divider bg-content2'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <NativeCheckbox
                            id={`line-target-${option.slot}-${line.id}`}
                            isSelected={lineTarget.enabled}
                            onChange={(value) =>
                              onLineEnabledChange(option.slot, lineTarget, value)
                            }
                          >
                            <span className="sr-only">
                              Toggle {lineTarget.label}{' '}
                              {lineTarget.supportsValueOverride ? 'target' : 'filter'}
                            </span>
                          </NativeCheckbox>
                          <div className="min-w-0 flex-1 text-center">
                            <p className={`text-xs leading-5 tabular-nums ${line.lineClassName}`}>{line.text}</p>
                            <p className="text-default-500 mt-1 text-xs">
                              {lineTarget.label}
                              {lineTarget.supportsValueOverride ? ' target' : ' filter'}
                              {lineTarget.targetMultiplier > 1 && lineTarget.summaryTargetKey
                                ? ` · counts as ${lineTarget.targetMultiplier}x`
                                : ''}
                            </p>
                            {!lineTarget.supportsValueOverride ? (
                              <p className="text-default-500 mt-1 text-xs">
                                Toggle this exact search filter on or off.
                              </p>
                            ) : null}
                          </div>
                          {lineTarget.supportsValueOverride ? (
                            <FieldInput
                              aria-label={`${lineTarget.label} target value`}
                              size="sm"
                              type="number"
                              min={0}
                              step={lineTarget.inputStep}
                              value={lineTarget.value == null ? '' : String(lineTarget.value)}
                              onValueChange={(value) =>
                                onLineValueChange(
                                  option.slot,
                                  lineTarget,
                                  value === ''
                                    ? null
                                    : Number.isFinite(Number(value))
                                      ? roundSearchConstraintValue(Number(value))
                                      : null,
                                )
                              }
                              isDisabled={isDisabled}
                              className="w-28 shrink-0"
                              endContent={
                                lineTarget.inputSuffix ? (
                                  <span className="text-default-400 text-xs">
                                    {lineTarget.inputSuffix}
                                  </span>
                                ) : null
                              }
                            />
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-default-500 py-3 text-center text-xs">No item details available.</div>
        )}

        {option.footerLines.length > 0 ? (
          <div className="text-default-500 pt-2 text-center text-xs tabular-nums">
            {option.footerLines.map((line) => (
              <p key={`${option.slot}-${line.text}`} className={line.className ?? undefined}>
                {line.text}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function RecommendationMetricStrip({ plan }: { plan: UpgradeRecommendationPlan }) {
  const keys = ['totalDps', 'combinedDps', 'totalEhp', 'life', 'energyShield', 'armour', 'evasion']
    .filter((key) => plan.before_metrics[key] != null || plan.after_metrics[key] != null)
    .slice(0, 4)

  if (!keys.length) return null

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {keys.map((key) => {
        const before = plan.before_metrics[key]
        const after = plan.after_metrics[key]
        return (
          <Chip key={key} size="sm" variant="soft">
            {formatMetricLabel(key)} {before != null ? formatMetricValue(before) : '—'}{' '}
            <ArrowRight size={12} className="mx-1 inline" />
            {after != null ? formatMetricValue(after) : '—'}
          </Chip>
        )
      })}
    </div>
  )
}

function RunActivityStrip({
  title,
  detail,
  waitLabel,
  estimatedLabel,
  onCancel,
  cancelLoading,
  timeline,
  elapsedLabel,
}: {
  title: string
  detail: string
  waitLabel?: string | null
  estimatedLabel?: string | null
  onCancel?: () => void
  cancelLoading?: boolean
  timeline?: Array<{ id: string; label: string; status: 'done' | 'active' | 'pending' }>
  elapsedLabel?: string | null
}) {
  return (
    <div className="analysis-run-progress">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 shrink-0" aria-hidden="true">
            <Spinner size="sm" color={waitLabel ? 'warning' : 'current'} className={waitLabel ? 'text-warning' : 'text-info'} />
          </div>
          <div className="min-w-0 wrap-anywhere">
            <p role="status" className="text-foreground text-sm font-semibold">{title}</p>
            <p className="text-default-500 mt-1 text-sm">{detail}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {elapsedLabel ? (
            <Chip size="sm" variant="soft">
              Elapsed {elapsedLabel}
            </Chip>
          ) : null}
          {estimatedLabel ? (
            <Chip size="sm" variant="soft">
              {estimatedLabel}
            </Chip>
          ) : null}
          {waitLabel ? (
            <Chip size="sm" variant="soft" color="warning">
              {waitLabel}
            </Chip>
          ) : null}
          {onCancel ? (
            <Button size="sm" variant="danger-soft" isPending={cancelLoading} onPress={onCancel}>
              {({ isPending }) => (
                <PendingButtonContent isPending={isPending}>Cancel</PendingButtonContent>
              )}
            </Button>
          ) : null}
        </div>
      </div>
      {timeline && timeline.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium">Run progress</summary>
          <ol className="mt-2 grid gap-x-4 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {timeline.map((step) => {
              const active = step.status === 'active'
              const StepIcon = step.status === 'done' ? Check : active ? ArrowRight : Circle
              const iconClass = step.status === 'done' ? 'text-success' : active ? 'text-info' : 'text-default-400'
              return (
                <li key={step.id} aria-current={active ? 'step' : undefined} className="flex items-center gap-2 text-xs">
                  <StepIcon size={12} className={`shrink-0 ${iconClass}`} aria-hidden="true" />
                  <span className={active ? 'text-foreground font-semibold' : 'text-default-500'}>
                    <span className="sr-only">{active ? 'In progress' : step.status === 'done' ? 'Completed' : 'Pending'}: </span>
                    {step.label}
                  </span>
                </li>
              )
            })}
          </ol>
        </details>
      ) : null}
    </div>
  )
}

function LiveRecommendationsSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <p role="status" className="text-default-500 text-sm">Loading recommendations…</p>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} aria-hidden="true" className="rounded-large border-divider overflow-hidden border">
          <div className="flex items-center gap-3 p-4">
            <div
              className="bg-default-100 h-11 w-11 shrink-0 animate-pulse rounded-lg"
              style={{ animationDelay: `${i * 60}ms` }}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div
                className="bg-default-100 h-3.5 animate-pulse rounded-full"
                style={{ width: `${40 + i * 14}%`, animationDelay: `${i * 60}ms` }}
              />
              <div
                className="bg-default-100 h-3 animate-pulse rounded-full"
                style={{ width: `${58 + i * 8}%`, animationDelay: `${i * 60 + 50}ms` }}
              />
              <div className="mt-0.5 flex gap-2">
                <div
                  className="bg-default-100 h-5 w-14 animate-pulse rounded-full"
                  style={{ animationDelay: `${i * 60 + 100}ms` }}
                />
                <div
                  className="bg-default-100 h-5 w-10 animate-pulse rounded-full"
                  style={{ animationDelay: `${i * 60 + 140}ms` }}
                />
              </div>
            </div>
            <div
              className="bg-default-100 h-8 w-20 shrink-0 animate-pulse rounded-lg"
              style={{ animationDelay: `${i * 60 + 50}ms` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export function StageSummaryCard({
  stage,
  isSelected,
  isDefault,
  onSelect,
  onDelete,
}: {
  stage: BuildTargetStage
  isSelected: boolean
  isDefault: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  const visibleRequirements = filterMeaningfulStageRequirements(stage.hard_requirements)

  return (
    <button
      type="button"
      className={`rounded-large w-full border p-3 text-left transition-colors ${
        isSelected
          ? 'border-highlight bg-selected'
          : 'border-divider bg-content1 hover:bg-default-50'
      }`}
      onClick={onSelect}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-foreground text-sm font-semibold">
              {stage.order_index}. {stage.label}
            </p>
            {isDefault ? (
              <Chip size="sm" variant="soft">
                Default
              </Chip>
            ) : null}
          </div>
          <p className="text-default-500 mt-1 text-xs">
            {stage.tree_spec_title ?? 'No tree'} · {stage.item_set_title ?? 'No item set'} ·{' '}
            {stage.skill_set_title ?? 'No skill set'}
          </p>
          {stage.notes ? <p className="text-default-600 mt-2 text-sm">{stage.notes}</p> : null}
        </div>
        <Button isIconOnly size="sm" variant="danger-soft" onPress={onDelete}>
          <Trash2 size={14} />
        </Button>
      </div>
      {visibleRequirements.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {visibleRequirements.slice(0, 4).map((requirement) => (
            <Chip key={`${stage.id}-${requirement.label}`} size="sm" variant="soft">
              {requirement.label}
            </Chip>
          ))}
          {visibleRequirements.length > 4 ? (
            <Chip size="sm" variant="soft">
              +{visibleRequirements.length - 4} more
            </Chip>
          ) : null}
        </div>
      ) : null}
    </button>
  )
}

export function GearRecommendationsPanel() {
  const activeGroupId = useGroupStore((state) => state.activeGroupId)
  const { data: currentUser } = useCurrentUser()
  const membersQuery = useGroupMembers(activeGroupId)
  const { data: members, isLoading: membersLoading } = membersQuery
  const { data: myGroups } = useMyGroups()
  const myRole = useMyGroupRole(activeGroupId)
  const { mutateAsync: createBuildTarget, isPending: importingTarget } = useCreateBuildTarget()
  const { mutate: setSelectedBuildTargetMutation, isPending: selectingTarget } =
    useSetSelectedBuildTarget()
  const { mutateAsync: updateBuildTarget } = useUpdateBuildTarget()
  const { mutate: deleteBuildTarget } = useDeleteBuildTarget()
  const { mutateAsync: createBuildTargetStage } = useCreateBuildTargetStage()
  const { mutateAsync: updateBuildTargetStage } = useUpdateBuildTargetStage()
  const { mutateAsync: queueUpgradeAnalysis } = useQueueUpgradeAnalysis()
  const { data: partyBuildTargets } = useGroupPartyBuildTargets(activeGroupId ?? null)
  const { mutateAsync: cancelUpgradeAnalysis, isPending: cancellingAnalysis } =
    useCancelUpgradeAnalysis()
  const { mutateAsync: syncCharacterProfile } = useSyncCharacterProfile()
  const { mutateAsync: promoteRecommendation, isPending: promotingRecommendation } =
    usePromoteUpgradeRecommendation()
  const currencyDisplay = useCurrencyStore((s) => s.display)

  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null)
  const [hasManuallySelectedCharacter, setHasManuallySelectedCharacter] = useState(false)
  const [selectedBuildTargetId, setSelectedBuildTargetId] = useState<string | null>(null)
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null)
  const [setupExpanded, setSetupExpanded] = useState(false)
  const [historyExpanded, setHistoryExpanded] = useState(false)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [pendingSelectedRunId, setPendingSelectedRunId] = useState<string | null>(null)
  const [pendingRunPreview, setPendingRunPreview] = useState<UpgradeAnalysisRun | null>(null)
  const [importName, setImportName] = useState('')
  const [importPayload, setImportPayload] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const [budgetChaos, setBudgetChaos] = useState(DEFAULT_LIVE_MARKET_BUDGET_CHAOS)
  const [budgetCurrency, setBudgetCurrency] = useState<'chaos' | 'divine'>('divine')
  const [analysisMode, setAnalysisMode] = useState<UpgradeAnalysisMode>('quick')
  const [stageTreeSpecId, setStageTreeSpecId] = useState<string | null>(null)
  const [stageItemSetId, setStageItemSetId] = useState<string | null>(null)
  const [stageSkillSetId, setStageSkillSetId] = useState<string | null>(null)
  const [stageConfigSetId, setStageConfigSetId] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [passiveTreeRefreshToken, setPassiveTreeRefreshToken] = useState(0)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [runTransitionLoading, setRunTransitionLoading] = useState(false)
  const [preRunSelectedRunId, setPreRunSelectedRunId] = useState<string | null>(null)
  const [partyConfig, setPartyConfig] = useState<PartyBuildEntry[]>([])
  const [partyConfigHydratedKey, setPartyConfigHydratedKey] = useState<string | null>(null)
  const [selectedCharacterStorageHydratedKey, setSelectedCharacterStorageHydratedKey] = useState<
    string | null
  >(null)
  const [analysisPrefsHydratedKey, setAnalysisPrefsHydratedKey] = useState<string | null>(null)
  const [partyCodeInput, setPartyCodeInput] = useState('')
  const [selectedPartyTargetId, setSelectedPartyTargetId] = useState<string>('')
  const [partyAddMode, setPartyAddMode] = useState<'group_member' | 'pob_code'>('group_member')
  const [draftSearchConstraints, setDraftSearchConstraints] = useState<UpgradeSearchConstraints>(
    DEFAULT_SEARCH_CONSTRAINTS,
  )
  const [partyBuffDetailOpen, setPartyBuffDetailOpen] = useState(false)
  const [configInsightDetailOpen, setConfigInsightDetailOpen] = useState(false)
  const [manualTuningDialogOpen, setManualTuningDialogOpen] = useState(false)
  const [analysisSubmitFlowPending, setAnalysisSubmitFlowPending] = useState(false)
  const submitFlowSequenceRef = useRef(0)
  const activeSubmitFlowIdRef = useRef<number | null>(null)

  const activeLeague =
    myGroups?.find((membership) => membership.group.id === activeGroupId)?.group.league ?? null
  const { data: ninjaData } = useNinjaPrices(activeLeague)
  const { data: ninjaGemIcons } = useQuery({
    queryKey: queryKeys.ninja.gemIcons,
    queryFn: () => fetchNinjaSkillGemIcons('poe1'),
    staleTime: 1000 * 60 * 60,
  })

  const divinePrice = ninjaData?.divinePrice ?? 0
  const targetUserId = currentUser?.id ?? null
  const currentMember = members?.find((member) => member.user.id === targetUserId) ?? null
  const { data: activeCharacters = [] } = useActiveCharacters(activeGroupId)
  const charactersQuery = useMyCharacters(activeGroupId, activeLeague)
  const { data: myCharacters = [], isLoading: myCharactersLoading } = charactersQuery
  const { data: characterProfiles = [] } = useCharacterProfiles(activeGroupId)
  const membersPageSelectedCharacterId =
    activeCharacters.find((character) => character.user_id === targetUserId)?.id ?? null
  const selectedCharacterStorageKey = useMemo(
    () => getSelectedCharacterStorageKey(activeGroupId, targetUserId),
    [activeGroupId, targetUserId],
  )

  useEffect(() => {
    setHasManuallySelectedCharacter(false)
  }, [activeGroupId, targetUserId])

  useEffect(() => {
    if (!selectedCharacterStorageKey) {
      setSelectedCharacterStorageHydratedKey(null)
      return
    }

    const storedCharacterId = readStoredSelectedCharacterId(selectedCharacterStorageKey)
    if (storedCharacterId) {
      setSelectedCharacterId(storedCharacterId)
      setHasManuallySelectedCharacter(true)
    }

    setSelectedCharacterStorageHydratedKey(selectedCharacterStorageKey)
  }, [selectedCharacterStorageKey])

  useEffect(() => {
    if (myCharactersLoading) {
      return
    }

    if (
      selectedCharacterStorageKey &&
      selectedCharacterStorageHydratedKey !== selectedCharacterStorageKey
    ) {
      return
    }

    if (!myCharacters.length) {
      setSelectedCharacterId(null)
      return
    }

    if (
      hasManuallySelectedCharacter &&
      selectedCharacterId &&
      myCharacters.some((character) => character.id === selectedCharacterId)
    ) {
      return
    }

    const preferredCharacterId =
      membersPageSelectedCharacterId ??
      myCharacters.find((character) => character.is_active)?.id ??
      myCharacters[0]?.id ??
      null

    if (!preferredCharacterId) {
      setSelectedCharacterId(null)
      return
    }

    if (
      selectedCharacterId &&
      myCharacters.some((character) => character.id === selectedCharacterId) &&
      selectedCharacterId === preferredCharacterId
    ) {
      return
    }

    setSelectedCharacterId(preferredCharacterId)
  }, [
    hasManuallySelectedCharacter,
    membersPageSelectedCharacterId,
    myCharacters,
    myCharactersLoading,
    selectedCharacterId,
    selectedCharacterStorageHydratedKey,
    selectedCharacterStorageKey,
  ])

  const selectedCharacter =
    myCharacters.find((character) => character.id === selectedCharacterId) ?? null
  const partyConfigStorageKey = useMemo(
    () => getPartyConfigStorageKey(activeGroupId, targetUserId, selectedCharacterId),
    [activeGroupId, selectedCharacterId, targetUserId],
  )
  const analysisPrefsStorageKey = useMemo(
    () => getAnalysisPrefsStorageKey(activeGroupId, targetUserId, selectedCharacterId),
    [activeGroupId, selectedCharacterId, targetUserId],
  )
  const selectedCharacterProfile = useMemo(
    () =>
      characterProfiles.find(
        (profile) =>
          profile.user_id === targetUserId && profile.character_id === selectedCharacter?.id,
      ) ?? null,
    [characterProfiles, selectedCharacter?.id, targetUserId],
  )
  const gemVisualLookup = useMemo(
    () => buildGemVisualLookup(selectedCharacterProfile, ninjaGemIcons ?? []),
    [ninjaGemIcons, selectedCharacterProfile],
  )
  const buildTargetsQuery = useBuildTargets(activeGroupId, targetUserId)
  const { data: buildTargets = [], isLoading: buildTargetsLoading } = buildTargetsQuery

  useEffect(() => {
    if (
      !selectedCharacterStorageKey ||
      selectedCharacterStorageHydratedKey !== selectedCharacterStorageKey
    ) {
      return
    }

    writeStoredSelectedCharacterId(selectedCharacterStorageKey, selectedCharacterId)
  }, [selectedCharacterId, selectedCharacterStorageHydratedKey, selectedCharacterStorageKey])

  useEffect(() => {
    if (!partyConfigStorageKey) {
      setPartyConfig([])
      setSelectedPartyTargetId('')
      setPartyConfigHydratedKey(null)
      return
    }

    const stored = readStoredPartyConfig(partyConfigStorageKey)
    setPartyConfig(stored)
    setSelectedPartyTargetId('')
    setPartyConfigHydratedKey(partyConfigStorageKey)
  }, [partyConfigStorageKey])

  useEffect(() => {
    if (!partyConfigStorageKey || partyConfigHydratedKey !== partyConfigStorageKey) {
      return
    }

    writeStoredPartyConfig(partyConfigStorageKey, partyConfig)
  }, [partyConfig, partyConfigHydratedKey, partyConfigStorageKey])

  // Hydrate analysis prefs (mode + budget) from session storage
  useEffect(() => {
    if (!analysisPrefsStorageKey) {
      setAnalysisPrefsHydratedKey(null)
      return
    }

    const stored = readStoredAnalysisPrefs(analysisPrefsStorageKey, currencyDisplay)
    if (stored) {
      setAnalysisMode(stored.analysisMode)
      setBudgetChaos(stored.budgetChaos)
      setBudgetCurrency(divinePrice > 0 ? stored.budgetCurrency : 'chaos')
    } else {
      setBudgetChaos(String(divinePrice > 0 ? Math.round(DEFAULT_LIVE_MARKET_BUDGET_DIVINE * divinePrice) : DEFAULT_LIVE_MARKET_BUDGET_CHAOS))
      setBudgetCurrency(divinePrice > 0 ? 'divine' : 'chaos')
    }
    setAnalysisPrefsHydratedKey(analysisPrefsStorageKey)
  }, [analysisPrefsStorageKey, currencyDisplay, divinePrice])

  // Persist analysis prefs to session storage on change
  useEffect(() => {
    if (!analysisPrefsStorageKey || analysisPrefsHydratedKey !== analysisPrefsStorageKey) {
      return
    }

    writeStoredAnalysisPrefs(analysisPrefsStorageKey, analysisMode, budgetChaos, budgetCurrency)
  }, [analysisMode, budgetChaos, budgetCurrency, analysisPrefsHydratedKey, analysisPrefsStorageKey])

  useEffect(() => {
    if (
      selectedPartyTargetId &&
      !(partyBuildTargets ?? []).some((target) => target.id === selectedPartyTargetId)
    ) {
      setSelectedPartyTargetId('')
    }
  }, [partyBuildTargets, selectedPartyTargetId])

  const visibleBuildTargets = useMemo(
    () =>
      buildTargets
        .filter((target) =>
          selectedCharacterId ? target.character_id === selectedCharacterId : false,
        )
        .sort((left, right) => {
          const rightTime = new Date(right.created_at).getTime()
          const leftTime = new Date(left.created_at).getTime()
          return rightTime - leftTime
        }),
    [buildTargets, selectedCharacterId],
  )

  useEffect(() => {
    if (!visibleBuildTargets.length) {
      setSelectedBuildTargetId(null)
      return
    }

    if (
      selectedBuildTargetId &&
      visibleBuildTargets.some((target) => target.id === selectedBuildTargetId)
    ) {
      return
    }

    const defaultTarget =
      visibleBuildTargets.find((target) => target.is_selected) ?? visibleBuildTargets[0]
    setSelectedBuildTargetId(defaultTarget.id)
  }, [selectedBuildTargetId, visibleBuildTargets])

  const selectedBuildTargetSummary =
    visibleBuildTargets.find((target) => target.id === selectedBuildTargetId) ?? null
  const { data: selectedBuildTargetDetail } = useBuildTarget(selectedBuildTargetSummary?.id ?? null)
  const selectedBuildTarget = selectedBuildTargetDetail ?? selectedBuildTargetSummary
  const { data: buildTargetStages = [] } = useBuildTargetStages(selectedBuildTarget?.id ?? null)

  useEffect(() => {
    if (!selectedBuildTarget) {
      setSelectedStageId(null)
      return
    }

    if (selectedStageId && buildTargetStages.some((stage) => stage.id === selectedStageId)) {
      return
    }

    setSelectedStageId(selectedBuildTarget.selected_stage_id ?? buildTargetStages[0]?.id ?? null)
  }, [buildTargetStages, selectedBuildTarget, selectedStageId])

  useEffect(() => {
    if (!selectedBuildTarget) {
      setStageTreeSpecId(null)
      setStageItemSetId(null)
      setStageSkillSetId(null)
      setStageConfigSetId(null)
      return
    }

    const loadedStage =
      buildTargetStages.find((stage) => stage.id === selectedStageId) ??
      buildTargetStages.find((stage) => stage.id === selectedBuildTarget.selected_stage_id) ??
      buildTargetStages[0] ??
      null
    const metadata = selectedBuildTarget.import_metadata
    setStageTreeSpecId(loadedStage?.tree_spec_id ?? metadata.tree_specs[0]?.id ?? null)
    setStageItemSetId(loadedStage?.item_set_id ?? metadata.item_sets[0]?.id ?? null)
    setStageSkillSetId(loadedStage?.skill_set_id ?? metadata.skill_sets[0]?.id ?? null)
    setStageConfigSetId(
      loadedStage?.config_set_id ??
        metadata.active_config_set_id ??
        metadata.config_sets[0]?.id ??
        null,
    )
  }, [buildTargetStages, selectedBuildTarget, selectedStageId])

  const {
    data: analysisRuns = [],
    isLoading: runsLoading,
    isError: runsFailed,
    refetch: retryRuns,
  } = useUpgradeAnalysisRuns(
    activeGroupId,
    targetUserId,
    selectedBuildTarget?.id ?? null,
  )
  const contextualPendingRunPreview = useMemo(() => {
    if (!pendingRunPreview) {
      return null
    }

    if (
      pendingRunPreview.group_id !== activeGroupId ||
      pendingRunPreview.target_user_id !== targetUserId ||
      pendingRunPreview.build_target_id !== selectedBuildTarget?.id
    ) {
      return null
    }

    return pendingRunPreview
  }, [activeGroupId, pendingRunPreview, selectedBuildTarget?.id, targetUserId])
  const displayedAnalysisRuns = useMemo(() => {
    if (!contextualPendingRunPreview) {
      return analysisRuns
    }

    if (analysisRuns.some((run) => run.id === contextualPendingRunPreview.id)) {
      return analysisRuns
    }

    return [contextualPendingRunPreview, ...analysisRuns]
  }, [analysisRuns, contextualPendingRunPreview])
  const latestLiveRun = useMemo(
    () => getLatestLiveRun(displayedAnalysisRuns),
    [displayedAnalysisRuns],
  )
  const latestCompletedRun = displayedAnalysisRuns.find((run) => run.status === 'completed')

  useEffect(() => {
    if (!displayedAnalysisRuns.length) {
      setSelectedRunId(null)
      setPendingSelectedRunId(null)
      setPendingRunPreview(null)
      return
    }

    const persistedPendingRun = contextualPendingRunPreview
      ? (analysisRuns.find((run) => run.id === contextualPendingRunPreview.id) ?? null)
      : null

    if (
      contextualPendingRunPreview &&
      persistedPendingRun &&
      persistedPendingRun.status !== 'queued' &&
      persistedPendingRun.status !== 'running'
    ) {
      setPendingRunPreview(null)
    }

    if (selectedRunId && displayedAnalysisRuns.some((run) => run.id === selectedRunId)) {
      if (pendingSelectedRunId === selectedRunId) {
        setPendingSelectedRunId(null)
      }
      return
    }

    if (pendingSelectedRunId && selectedRunId === pendingSelectedRunId) {
      return
    }

    setSelectedRunId(null)
  }, [
    analysisRuns,
    contextualPendingRunPreview,
    displayedAnalysisRuns,
    pendingSelectedRunId,
    selectedRunId,
  ])

  const selectedRun = displayedAnalysisRuns.find((run) => run.id === selectedRunId) ?? null
  const reservationAuditAnchorId = selectedRun ? `reservation-audit-${selectedRun.id}` : undefined
  const selectedRunIsLive = selectedRun?.status === 'queued' || selectedRun?.status === 'running'
  const runtimeEstimateMode = latestLiveRun?.analysis_mode ?? analysisMode
  const { data: runtimeEstimate } = useAnalysisRuntimeEstimate(runtimeEstimateMode)
  const {
    data: recommendationPlans = [],
    isLoading: recommendationsLoading,
    isError: recommendationsFailed,
    refetch: retryRecommendations,
  } =
    useUpgradeRecommendationPlans(
      selectedRunIsLive ? null : (selectedRun?.id ?? null),
      selectedRunIsLive ? null : (selectedRun?.status ?? null),
      selectedRunIsLive ? null : (selectedRun?.completed_at ?? null),
    )

  const selectedStage = buildTargetStages.find((stage) => stage.id === selectedStageId) ?? null
  const selectedStageTreeSpec = useMemo(
    () =>
      selectedBuildTarget?.import_metadata.tree_specs.find(
        (spec) => spec.id === selectedStage?.tree_spec_id,
      ) ?? null,
    [selectedBuildTarget, selectedStage?.tree_spec_id],
  )
  const selectedStageSkillSet = useMemo(
    () =>
      selectedBuildTarget?.import_metadata.skill_sets.find(
        (skillSet) => skillSet.id === selectedStage?.skill_set_id,
      ) ?? null,
    [selectedBuildTarget, selectedStage?.skill_set_id],
  )
  const draftStageTreeSpec = useMemo(
    () =>
      selectedBuildTarget?.import_metadata.tree_specs.find((spec) => spec.id === stageTreeSpecId) ??
      null,
    [selectedBuildTarget, stageTreeSpecId],
  )
  const draftStageSkillSet = useMemo(
    () =>
      selectedBuildTarget?.import_metadata.skill_sets.find(
        (skillSet) => skillSet.id === stageSkillSetId,
      ) ?? null,
    [selectedBuildTarget, stageSkillSetId],
  )
  const currentSetup = useMemo(
    () => ({
      treeSpecId: stageTreeSpecId,
      itemSetId: stageItemSetId,
      skillSetId: stageSkillSetId,
      configSetId: stageConfigSetId,
    }),
    [stageConfigSetId, stageItemSetId, stageSkillSetId, stageTreeSpecId],
  )
  const loadoutOptions = useMemo(
    () => buildLoadoutOptions(selectedBuildTarget?.import_metadata),
    [selectedBuildTarget?.import_metadata],
  )
  const selectedLoadoutKey = useMemo(
    () =>
      loadoutOptions.find(
        (option) =>
          option.treeSpecId === currentSetup.treeSpecId &&
          option.itemSetId === currentSetup.itemSetId &&
          option.skillSetId === currentSetup.skillSetId &&
          option.configSetId === currentSetup.configSetId,
      )?.key ?? null,
    [currentSetup, loadoutOptions],
  )
  const selectedLoadoutLabel = useMemo(
    () => loadoutOptions.find((option) => option.key === selectedLoadoutKey)?.label ?? null,
    [loadoutOptions, selectedLoadoutKey],
  )
  const hasUnsavedSetupChanges = !stageMatchesSetup(selectedStage, currentSetup)
  const inspectedTreeSpec = selectedStageTreeSpec ?? draftStageTreeSpec
  const inspectedSkillSet = selectedStageSkillSet ?? draftStageSkillSet
  const inspectedStageLabel = selectedLoadoutLabel ?? DEFAULT_SETUP_LABEL
  const isDraftStageTree =
    hasUnsavedSetupChanges && (!!draftStageTreeSpec || !!draftStageSkillSet || !!selectedStage)
  const draftRareSearchOptions = useMemo(
    () => getRareStageSearchOptions(selectedBuildTarget?.import_metadata, stageItemSetId),
    [selectedBuildTarget?.import_metadata, stageItemSetId],
  )
  const recommendedRareSlotKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const plan of recommendationPlans) {
      if (plan.section === 'overview') continue
      if (isUniqueRecommendationPlan(plan)) continue
      if (!isRareGearRecommendationPlan(plan)) continue
      for (const item of plan.items) {
        const actionType = getRecommendationItemActionType(item)
        if (actionType != null && actionType !== 'gear_item') continue
        if (getRecommendationItemRarity(item) !== 'rare') continue
        const normalizedSlot = normalizeSearchConstraintSlot(item.slot)
        if (normalizedSlot) keys.add(normalizedSlot)
      }
    }
    return keys
  }, [recommendationPlans])
  const recommendedDraftRareSearchOptions = useMemo(
    () =>
      recommendedRareSlotKeys.size === 0
        ? draftRareSearchOptions
        : draftRareSearchOptions.filter((option) => recommendedRareSlotKeys.has(option.slot)),
    [draftRareSearchOptions, recommendedRareSlotKeys],
  )
  const resolvedDraftRareSearchOptions = useMemo(
    () => resolveRareStageSearchOptions(recommendedDraftRareSearchOptions, draftSearchConstraints),
    [recommendedDraftRareSearchOptions, draftSearchConstraints],
  )
  const normalizedDraftSearchConstraints = useMemo(
    () =>
      deriveNormalizedUpgradeSearchConstraints(
        recommendedDraftRareSearchOptions,
        draftSearchConstraints,
      ),
    [recommendedDraftRareSearchOptions, draftSearchConstraints],
  )
  const normalizedBudgetChaos = useMemo(() => {
    const value = Number(budgetChaos || 0)
    if (!Number.isFinite(value)) return 0
    return Math.max(0, Math.round(value))
  }, [budgetChaos])
  const hasLiveRun = displayedAnalysisRuns.some(
    (run) => run.status === 'queued' || run.status === 'running',
  )

  useEffect(() => {
    if (!hasLiveRun) return
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [hasLiveRun])

  useEffect(() => {
    if (!selectedRunIsLive) {
      setRunTransitionLoading(false)
    }
  }, [selectedRunIsLive])

  useEffect(() => {
    setDraftSearchConstraints(DEFAULT_SEARCH_CONSTRAINTS)
  }, [selectedBuildTarget?.id])

  const selectedRunStage =
    buildTargetStages.find((stage) => stage.id === selectedRun?.target_stage_id) ?? null
  const selectedRunStageTreeSpec = useMemo(
    () =>
      selectedBuildTarget?.import_metadata.tree_specs.find(
        (spec) => spec.id === selectedRunStage?.tree_spec_id,
      ) ?? null,
    [selectedBuildTarget, selectedRunStage?.tree_spec_id],
  )
  const selectedRunStageSkillSet = useMemo(
    () =>
      selectedBuildTarget?.import_metadata.skill_sets.find(
        (skillSet) => skillSet.id === selectedRunStage?.skill_set_id,
      ) ?? null,
    [selectedBuildTarget, selectedRunStage?.skill_set_id],
  )
  const selectedRunStageLabel = getSetupDisplayLabel(
    selectedRunStage?.label ?? getSummaryText(selectedRun?.summary, 'target_stage_label'),
  )
  const recommendationStageLabel = selectedRun ? selectedRunStageLabel : inspectedStageLabel
  const recommendationStageTreeSpec = selectedRun ? selectedRunStageTreeSpec : inspectedTreeSpec
  const recommendationStageSkillSet = selectedRun ? selectedRunStageSkillSet : inspectedSkillSet
  const recommendationStageIsDraft = !selectedRun && isDraftStageTree
  const liveRunWaitInfo = getTradeRateLimitWaitInfo(latestLiveRun, nowMs)
  const runtimeEstimateSummary = formatRuntimeEstimateSummary(runtimeEstimate)
  const runtimeEstimateChipLabel =
    latestLiveRun?.analysis_mode === 'thorough'
      ? formatRuntimeEstimateChipLabel(runtimeEstimate)
      : null
  const selectedRunPlanCount = getSummaryNumber(selectedRun?.summary, 'generated_plan_count')
  const selectedRunBlockers = getSummaryList(selectedRun?.summary, 'blockers')
  const selectedRunAppliedPartyCount = getSummaryNumber(selectedRun?.summary, 'applied_party_count')
  const selectedRunConfigurationInsights = getPobConfigurationInsights(selectedRun?.summary)
  const selectedRunConfigSetTitle = getSummaryText(
    selectedRun?.summary,
    'resolved_config_set_title',
  )
  const selectedRunMainSkillName = getSummaryText(selectedRun?.summary, 'main_skill_name')
  const selectedRunMainSkillVisual = useMemo(() => {
    const key = normalizeGemNameForComparison(selectedRunMainSkillName)
    return key ? (gemVisualLookup.get(key) ?? null) : null
  }, [gemVisualLookup, selectedRunMainSkillName])
  const selectedRunComparePowerReport = useMemo(
    () => getComparePowerReport(selectedRun?.summary),
    [selectedRun?.summary],
  )
  const comparePowerItemRowsBySlot = useMemo(() => {
    const bySlot = new Map<string, ComparePowerRow>()
    for (const row of selectedRunComparePowerReport?.rows ?? []) {
      if (row.category !== 'item' && row.category !== 'jewel') continue
      const slot = normalizeCompareSlot(row.slot)
      if (!slot) continue
      const current = bySlot.get(slot)
      if (!current || Math.abs(row.impact) > Math.abs(current.impact)) {
        bySlot.set(slot, row)
      }
    }
    return bySlot
  }, [selectedRunComparePowerReport])
  const selectedRunHasConfigurationInsightButton =
    !!selectedRunConfigurationInsights || !!selectedRunConfigSetTitle
  const selectedRunEmptyPlansCopy = useMemo(
    () => getUpgradeAnalysisEmptyPlansCopy(selectedRun),
    [selectedRun],
  )
  const draftSearchConstraintChips = useMemo(
    () => summarizeUpgradeSearchConstraints(normalizedDraftSearchConstraints),
    [normalizedDraftSearchConstraints],
  )
  const selectedRunContextDetails = useMemo(() => {
    if (!selectedRun) return []

    const details: string[] = []
    if (selectedRun.analysis_mode === 'thorough') {
      details.push(getRunBudgetLabel(selectedRun, currencyDisplay, divinePrice))
    }
    if (selectedRunStageLabel !== DEFAULT_SETUP_LABEL) {
      details.push(selectedRunStageLabel)
    }
    return details
  }, [currencyDisplay, divinePrice, selectedRun, selectedRunStageLabel])
  const analysisActionPending = analysisSubmitFlowPending
  const draftCraftedLineState = useMemo(() => {
    let total = 0
    let disabled = 0
    for (const option of resolvedDraftRareSearchOptions) {
      for (const section of option.sections) {
        for (const line of section.lines) {
          const target = line.target
          if (!target || !target.isCrafted) continue
          total += 1
          if (target.enabled === false) disabled += 1
        }
      }
    }
    return { total, disabled, allDisabled: total > 0 && disabled === total }
  }, [resolvedDraftRareSearchOptions])
  const hasManualTuningOverrides = draftSearchConstraintChips.length > 0
  const allowTemplateRareFallbackInPrimary = selectedRun?.analysis_mode === 'thorough'

  const setupNotePlans = useMemo(
    () =>
      recommendationPlans.filter(
        (plan) =>
          plan.section !== 'overview' &&
          plan.kind === 'bundle' &&
          !isUniqueRecommendationPlan(plan),
      ),
    [recommendationPlans],
  )

  const recommendationSections = useMemo<RecommendationSection[]>(() => {
    const maxPrimaryRareRecommendations = 5
    const liveRareSinglePlans = recommendationPlans.filter(
      (plan) =>
        plan.section !== 'overview' &&
        plan.kind === 'single' &&
        isRareGearRecommendationPlan(plan) &&
        !isTargetStageRareRecommendationPlan(plan),
    )
    const templateRareFallbackPlans = recommendationPlans
      .filter(
        (plan) =>
          plan.section !== 'overview' &&
          plan.kind === 'single' &&
          isRareGearRecommendationPlan(plan) &&
          isTargetStageRareRecommendationPlan(plan) &&
          typeof plan.score === 'number' &&
          Number.isFinite(plan.score) &&
          plan.score > 0,
      )
      .sort((left, right) => right.score - left.score)
    const templateRareFallbackIds = new Set(liveRareSinglePlans.map((plan) => plan.id))
    const supplementedRareSinglePlans =
      allowTemplateRareFallbackInPrimary &&
      liveRareSinglePlans.length < maxPrimaryRareRecommendations
        ? [
            ...liveRareSinglePlans,
            ...templateRareFallbackPlans
              .filter((plan) => !templateRareFallbackIds.has(plan.id))
              .slice(0, Math.max(0, maxPrimaryRareRecommendations - liveRareSinglePlans.length)),
          ]
        : liveRareSinglePlans

    const sections: RecommendationSection[] = [
      {
        key: 'best_single',
        label: RECOMMENDATION_SECTION_LABELS.best_single,
        plans: supplementedRareSinglePlans,
        scoreRanks: {
          overall: new Map(),
          dps: new Map(),
          ehp: new Map(),
          reservation: new Map(),
        },
      },
      {
        key: 'uniques',
        label: RECOMMENDATION_SECTION_LABELS.uniques,
        plans: recommendationPlans.filter(
          (plan) =>
            plan.section !== 'overview' &&
            isGearRecommendationPlan(plan) &&
            isUniqueRecommendationPlan(plan),
        ),
        scoreRanks: {
          overall: new Map(),
          dps: new Map(),
          ehp: new Map(),
          reservation: new Map(),
        },
      },
    ]

    const overviewPlans = sortOverviewPlans(
      recommendationPlans.filter((plan) => plan.section === 'overview'),
    )
    if (overviewPlans.length > 0) {
      sections.push({
        key: 'overview',
        label: RECOMMENDATION_SECTION_LABELS.overview,
        plans: overviewPlans,
        scoreRanks: {
          overall: new Map(),
          dps: new Map(),
          ehp: new Map(),
          reservation: new Map(),
        },
      })
    }

    return sections
      .map((section) => {
        const scoreRanks = {
          overall: rankRecommendationPlans(section.plans, 'overall'),
          dps: rankRecommendationPlans(section.plans, 'dps'),
          ehp: rankRecommendationPlans(section.plans, 'ehp'),
          reservation: rankRecommendationPlans(section.plans, 'reservation'),
        }

        return {
          ...section,
          plans:
            section.key === 'overview'
              ? section.plans
              : sortPlansByOverallRank(section.plans, scoreRanks.overall),
          scoreRanks,
        }
      })
      .filter((section) => section.key === 'best_single' || section.plans.length > 0)
  }, [allowTemplateRareFallbackInPrimary, recommendationPlans])
  const bestSingleTemplateFallbackSummary = useMemo(() => {
    const bestSingleSection = recommendationSections.find(
      (section) => section.key === 'best_single',
    )
    if (!bestSingleSection || bestSingleSection.plans.length === 0) {
      return null
    }

    const templateCount = bestSingleSection.plans.filter((plan) =>
      isTargetStageRareRecommendationPlan(plan),
    ).length
    if (!allowTemplateRareFallbackInPrimary || templateCount === 0) {
      return null
    }

    return {
      templateCount,
      liveCount: bestSingleSection.plans.length - templateCount,
    }
  }, [allowTemplateRareFallbackInPrimary, recommendationSections])

  const canQueueRun = myRole === 'admin' || myRole === 'editor'
  const canPromote = canQueueRun

  function startAnalysisSubmitFlow() {
    const flowId = submitFlowSequenceRef.current + 1
    submitFlowSequenceRef.current = flowId
    activeSubmitFlowIdRef.current = flowId
    setAnalysisSubmitFlowPending(true)
    return flowId
  }

  function isAnalysisSubmitFlowActive(flowId: number) {
    return activeSubmitFlowIdRef.current === flowId
  }

  function finishAnalysisSubmitFlow(flowId: number) {
    if (!isAnalysisSubmitFlowActive(flowId)) return
    activeSubmitFlowIdRef.current = null
    setAnalysisSubmitFlowPending(false)
  }

  function cancelAnalysisSubmitFlow() {
    activeSubmitFlowIdRef.current = null
    setAnalysisSubmitFlowPending(false)
  }

  function chooseBuildTarget(target: Pick<BuildTarget, 'id' | 'group_id' | 'user_id'>) {
    setSelectedBuildTargetId(target.id)
    setSelectedBuildTargetMutation(target)
  }

  function updatePartyConfigEntry(
    index: number,
    updater: (entry: PartyBuildEntry) => PartyBuildEntry,
  ) {
    setPartyConfig((current) =>
      current.map((entry, entryIndex) => (entryIndex === index ? updater(entry) : entry)),
    )
  }

  function setPartyConfigEntryLabel(index: number, nextLabel: string) {
    updatePartyConfigEntry(index, (entry) => ({
      ...entry,
      label: nextLabel.trim() ? nextLabel : null,
    }))
  }

  async function handleImport(payloadOverride?: string, nameOverride?: string) {
    if (!activeGroupId || !targetUserId || !selectedCharacter) return

    const payload = (payloadOverride ?? importPayload).trim()
    if (!payload) {
      setImportError('Paste a PoB share code or XML export first.')
      return
    }

    setImportError(null)
    setActionMessage(null)

    try {
      const parsed = await parsePobImport(payload)
      const compatibility = summarizeCompatibility({
        treeCount: parsed.metadata.tree_specs.length,
        itemCount: parsed.metadata.item_sets.length,
        skillCount: parsed.metadata.skill_sets.length,
      })
      const created = await createBuildTarget({
        group_id: activeGroupId,
        user_id: targetUserId,
        character_id: selectedCharacter.id,
        name: nameOverride?.trim() || importName.trim() || `${selectedCharacter.name} target`,
        source_kind: parsed.source_kind,
        raw_import: payload,
        raw_xml: parsed.raw_xml,
        import_metadata: parsed.metadata,
        compatibility_status: compatibility.status,
        compatibility_notes: compatibility.notes,
      })

      chooseBuildTarget({ id: created.id, group_id: created.group_id, user_id: created.user_id })
      setImportPayload('')
      setImportName('')
      setActionMessage(
        'PoB target imported. Choose the tree, item set, skill set, and config, then run analysis.',
      )
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Failed to decode the PoB import.')
      setActionMessage(null)
    }
  }

  async function ensureAnalysisStage() {
    if (!selectedBuildTarget) {
      throw new Error('Select or import a target first.')
    }

    const metadata = selectedBuildTarget.import_metadata
    const treeSpec = metadata.tree_specs.find((entry) => entry.id === stageTreeSpecId) ?? null
    const itemSet = metadata.item_sets.find((entry) => entry.id === stageItemSetId) ?? null
    const skillSet = metadata.skill_sets.find((entry) => entry.id === stageSkillSetId) ?? null
    const configSet = metadata.config_sets.find((entry) => entry.id === stageConfigSetId) ?? null
    const matchingStage =
      buildTargetStages.find((stage) => stageMatchesSetup(stage, currentSetup)) ?? null
    const currentSetupStage =
      buildTargetStages.find(
        (stage) => getSetupDisplayLabel(stage.label) === DEFAULT_SETUP_LABEL,
      ) ?? null
    const selectedOrDefaultStage =
      buildTargetStages.find((stage) => stage.id === selectedStageId) ??
      buildTargetStages.find((stage) => stage.id === selectedBuildTarget.selected_stage_id) ??
      buildTargetStages[0] ??
      null

    const stagePayload = {
      label: matchingStage?.label ?? currentSetupStage?.label ?? DEFAULT_SETUP_LABEL,
      notes: matchingStage?.notes ?? currentSetupStage?.notes ?? null,
      tree_spec_id: treeSpec?.id ?? null,
      tree_spec_title: treeSpec?.title ?? null,
      item_set_id: itemSet?.id ?? null,
      item_set_title: itemSet?.title ?? null,
      skill_set_id: skillSet?.id ?? null,
      skill_set_title: skillSet?.title ?? null,
      config_set_id: configSet?.id ?? null,
      config_set_title: configSet?.title ?? null,
      primary_offensive_metric: FIXED_PRIMARY_METRIC,
      target_metrics: metadata.player_stats,
      hard_requirements: deriveStageRequirementsFromSelection(metadata, {
        item_set_id: itemSet?.id ?? null,
      }),
    } as const

    let persistedStage = matchingStage
    const nextOrderIndex =
      buildTargetStages.reduce((max, stage) => Math.max(max, stage.order_index), 0) + 1

    if (!persistedStage && !currentSetupStage) {
      persistedStage = await createBuildTargetStage({
        build_target_id: selectedBuildTarget.id,
        order_index: selectedOrDefaultStage?.order_index ?? nextOrderIndex,
        ...stagePayload,
      })
    } else if (!persistedStage && currentSetupStage) {
      persistedStage = await updateBuildTargetStage({
        id: currentSetupStage.id,
        build_target_id: selectedBuildTarget.id,
        ...stagePayload,
      })
    }

    if (!persistedStage) {
      throw new Error('The analysis setup could not be saved.')
    }

    if (selectedBuildTarget.selected_stage_id !== persistedStage.id) {
      await updateBuildTarget({
        id: selectedBuildTarget.id,
        group_id: selectedBuildTarget.group_id,
        user_id: selectedBuildTarget.user_id,
        selected_stage_id: persistedStage.id,
      })
    }

    setSelectedStageId(persistedStage.id)
    return persistedStage
  }

  function renderBudgetInput(className?: string) {
    return (
      <FieldInput
        label="Budget"
        type="number"
        endContent={
          <Dropdown>
            <Dropdown.Trigger
              aria-label="Select budget currency"
              className="text-default-400 hover:text-foreground rounded-small inline-flex cursor-pointer items-center gap-1 px-1 text-xs font-medium transition-colors"
            >
              {budgetCurrency}
              <ChevronDown size={12} />
            </Dropdown.Trigger>
            <Dropdown.Popover>
              <Dropdown.Menu
                aria-label="Budget currency"
                disallowEmptySelection
                selectionMode="single"
                selectedKeys={new Set([budgetCurrency])}
                onAction={(key) => {
                  setBudgetCurrency(key === 'divine' ? 'divine' : 'chaos')
                }}
              >
                <Dropdown.Item id="chaos" textValue="Chaos">
                  Chaos
                </Dropdown.Item>
                <Dropdown.Item id="divine" textValue="Divine" isDisabled={divinePrice <= 0}>
                  Divine
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        }
        value={
          budgetCurrency === 'divine' && divinePrice > 0
            ? String(
                budgetChaos === '' ? '' : Math.round((Number(budgetChaos) / divinePrice) * 10) / 10,
              )
            : budgetChaos
        }
        onValueChange={(v) => {
          if (budgetCurrency === 'divine' && divinePrice > 0) {
            setBudgetChaos(v === '' ? '' : String(Math.round(Number(v) * divinePrice)))
          } else {
            setBudgetChaos(v)
          }
        }}
        className={className}
      />
    )
  }

  function renderTradeSearchRelaxationControls() {
    return (
      <div className="rounded-medium border-default-200 bg-default-50 flex flex-col gap-2 border p-3">
        <p className="text-foreground text-xs font-semibold tracking-wide uppercase">
          Trade search relaxation
        </p>
        <p className="text-default-500 text-xs">
          Shrink the live-market query surface area to stay under trade API rate limits. Any
          candidate that comes back is still exact-scored in PoB.
        </p>
        <div className="mt-1 flex flex-col gap-3 md:flex-row md:items-start md:gap-24">
          <div className="flex flex-col gap-1.5">
            <NativeCheckbox
              id="ignore-crafted-mods"
              isSelected={normalizedDraftSearchConstraints.ignore_crafted_mods}
              onChange={setDraftIgnoreCraftedMods}
            >
              <span className="text-sm">Ignore crafted mods</span>
            </NativeCheckbox>
            <NativeCheckbox
              id="ignore-enchants"
              isSelected={normalizedDraftSearchConstraints.ignore_enchants}
              onChange={setDraftIgnoreEnchants}
            >
              <span className="text-sm">Ignore enchants</span>
            </NativeCheckbox>
            <NativeCheckbox
              id="ignore-quality"
              isSelected={normalizedDraftSearchConstraints.ignore_quality}
              onChange={setDraftIgnoreQuality}
            >
              <span className="text-sm">Ignore quality</span>
            </NativeCheckbox>
            <NativeCheckbox
              id="ignore-corrupted-implicits"
              isSelected={normalizedDraftSearchConstraints.ignore_corrupted_implicits}
              onChange={setDraftIgnoreCorruptedImplicits}
            >
              <span className="text-sm">Ignore corrupted implicits</span>
            </NativeCheckbox>
          </div>
          <FieldInput
            type="number"
            label={
              <div className="inline-flex items-center gap-1.5">
                <span>Relaxation percentage</span>
                <Tooltip
                  content={
                    <div className="max-w-[18rem] p-2 text-xs leading-5">
                      The first live rare search pass lowers every numeric value on the target PoB
                      item by this percentage. If no hits are found, later passes relax those same
                      numbers further while keeping the same modifier lines. Lower values are
                      stricter and often reduce live hits, sometimes all the way to zero.
                    </div>
                  }
                  placement="top"
                >
                  <button
                    type="button"
                    aria-label="Relaxation percentage help"
                    className="text-default-400 hover:text-default-600 inline-flex items-center justify-center rounded-full"
                  >
                    <Info size={13} />
                  </button>
                </Tooltip>
              </div>
            }
            description="Sets the first live-search baseline by lowering every numeric target value by this percent."
            size="sm"
            min={0}
            max={90}
            step={1}
            endContent={<span className="text-default-500 text-xs">%</span>}
            value={String(normalizedDraftSearchConstraints.property_percentile_floor)}
            onValueChange={setDraftPropertyPercentileFloor}
            className="max-w-56 md:min-w-56"
          />
        </div>
      </div>
    )
  }

  function renderManualTuningEditor() {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-default-500 text-sm">
            Start a fresh live-market pass from this setup. Use these controls when you want to
            steer the rare search before rerunning.
          </p>
          <p className="text-default-400 mt-2 text-xs">
            Any candidate that comes back is still exact-scored in PoB before it becomes a
            recommendation.
          </p>
        </div>

        {renderBudgetInput('max-w-56')}

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-default-500 text-sm">
              The worker keeps the same live-search modifier requirements and only relaxes the
              numeric thresholds further between passes when needed.
            </p>
          </div>
          <Button
            size="sm"
            variant="tertiary"
            onPress={resetDraftSearchConstraints}
            isDisabled={!hasManualTuningOverrides}
          >
            Reset overrides
          </Button>
        </div>

        <NativeCheckbox
          id="disable-crafted-lines"
          isSelected={draftCraftedLineState.allDisabled}
          isDisabled={draftCraftedLineState.total === 0}
          onChange={setDraftCraftedLinesDisabled}
        >
          <span className="text-sm">
            Uncheck all crafted mods{' '}
            {draftCraftedLineState.total > 0
              ? `(${draftCraftedLineState.disabled}/${draftCraftedLineState.total} disabled)`
              : ''}
          </span>
        </NativeCheckbox>

        {draftSearchConstraintChips.length ? (
          <div className="flex flex-wrap gap-2">
            {draftSearchConstraintChips.map((chip) => (
              <Chip key={chip} size="sm" variant="soft">
                {chip}
              </Chip>
            ))}
          </div>
        ) : null}

        {resolvedDraftRareSearchOptions.length === 0 ? (
          <p className="text-default-500 text-sm">
            The selected item set has no rare target items with editable search controls yet.
          </p>
        ) : (
          <Accordion variant="surface" allowsMultipleExpanded>
            {resolvedDraftRareSearchOptions.map((option) => (
              <AccordionPanelItem
                key={`${option.slot}-${option.typeLine}`}
                id={`rare-search-${option.slot}-${option.typeLine}`}
                title={`${option.slot}: ${option.typeLine}`}
                subtitle={getRareSearchTargetSummary(option)}
              >
                {option.sections.every((section) => section.lines.every((line) => !line.target)) ? (
                  <p className="text-default-500 text-sm">
                    This item does not expose editable search controls yet.
                  </p>
                ) : (
                  <RareSearchItemEditor
                    option={option}
                    onLineEnabledChange={setDraftSearchLineEnabled}
                    onLineValueChange={setDraftSearchLineValue}
                  />
                )}
              </AccordionPanelItem>
            ))}
          </Accordion>
        )}
      </div>
    )
  }

  async function handleQueueAnalysis(options?: {
    analysisModeOverride?: UpgradeAnalysisMode
    attemptIncrementalRerun?: boolean
  }) {
    if (!activeGroupId || !selectedBuildTarget || !canQueueRun || latestLiveRun || activeSubmitFlowIdRef.current !== null) return
    const submitFlowId = startAnalysisSubmitFlow()
    const effectiveAnalysisMode = options?.analysisModeOverride ?? analysisMode
    const effectiveBudgetChaos = effectiveAnalysisMode === 'thorough' ? normalizedBudgetChaos : 0
    const effectiveSearchConstraints =
      effectiveAnalysisMode === 'thorough'
        ? normalizedDraftSearchConstraints
        : DEFAULT_SEARCH_CONSTRAINTS

    setActionMessage(null)
    setPassiveTreeRefreshToken((current) => current + 1)
    setRunTransitionLoading(true)
    setPreRunSelectedRunId(selectedRunId)
    const previousRunId = selectedRunId

    // Create a preliminary draft immediately so the UI transitions before any async work.
    // This gives instant feedback — the config locks, the run strip appears, and
    // recommendations switch to skeleton as soon as the button is pressed.
    const prelimDraft = createDraftQueuedRun({
      groupId: activeGroupId,
      buildTargetId: selectedBuildTarget.id,
      targetUserId: targetUserId ?? selectedBuildTarget.user_id,
      characterId: selectedCharacter?.id ?? selectedBuildTarget.character_id ?? null,
      queuedBy: targetUserId ?? selectedBuildTarget.user_id,
      budgetChaos: effectiveBudgetChaos,
      analysisMode: effectiveAnalysisMode,
      targetStageId: selectedStageId,
      targetStageLabel: inspectedStageLabel,
      searchConstraints: effectiveSearchConstraints,
    })
    setPendingRunPreview(prelimDraft)
    setSelectedRunId(prelimDraft.id)
    let submittedDraftId = prelimDraft.id

    try {
      const syncCharacterId = selectedCharacter?.id ?? selectedBuildTarget.character_id ?? null
      await syncCharacterProfile({
        groupId: activeGroupId,
        characterId: syncCharacterId,
      }).catch(() => {})
      if (!isAnalysisSubmitFlowActive(submitFlowId)) return
      const targetStage = await ensureAnalysisStage()
      if (!isAnalysisSubmitFlowActive(submitFlowId)) return
      const draftRun = createDraftQueuedRun({
        groupId: activeGroupId,
        buildTargetId: selectedBuildTarget.id,
        targetUserId: targetUserId ?? selectedBuildTarget.user_id,
        characterId: selectedCharacter?.id ?? selectedBuildTarget.character_id ?? null,
        queuedBy: targetUserId ?? selectedBuildTarget.user_id,
        budgetChaos: effectiveBudgetChaos,
        analysisMode: effectiveAnalysisMode,
        targetStageId: targetStage.id,
        targetStageLabel: getSetupDisplayLabel(targetStage.label),
        searchConstraints: effectiveSearchConstraints,
      })

      setPendingSelectedRunId(draftRun.id)
      setPendingRunPreview(draftRun)
      setSelectedRunId((current) => current === prelimDraft.id ? draftRun.id : current)
      submittedDraftId = draftRun.id

      const incrementalChangedSlots =
        options?.attemptIncrementalRerun && selectedRun
          ? getChangedSearchConstraintSlots(
              selectedRun.search_constraints,
              effectiveSearchConstraints,
            )
          : []
      const currentCharacterId = selectedCharacter?.id ?? selectedBuildTarget.character_id ?? null
      const canUseIncrementalRerunBase =
        options?.attemptIncrementalRerun === true &&
        !!selectedRun &&
        incrementalChangedSlots.length > 0 &&
        selectedRun.status !== 'queued' &&
        selectedRun.status !== 'running' &&
        selectedRun.status !== 'failed' &&
        selectedRun.status !== 'stale' &&
        selectedRun.analysis_mode === 'thorough' &&
        selectedRun.build_target_id === selectedBuildTarget.id &&
        selectedRun.target_stage_id === targetStage.id &&
        selectedRun.character_id === currentCharacterId &&
        selectedRun.budget_chaos === effectiveBudgetChaos &&
        arePartyConfigsEquivalent(selectedRun.party_config, partyConfig)
      const rerunBaseRunId = canUseIncrementalRerunBase ? selectedRun!.id : null

      const result = await queueUpgradeAnalysis({
        group_id: activeGroupId,
        build_target_id: selectedBuildTarget.id,
        character_id: currentCharacterId,
        target_stage_id: targetStage.id,
        budget_chaos: effectiveBudgetChaos,
        analysis_mode: effectiveAnalysisMode,
        search_constraints: effectiveSearchConstraints,
        party_config: partyConfig.length > 0 ? partyConfig : undefined,
        rerun_base_run_id: rerunBaseRunId,
        rerun_changed_slots: rerunBaseRunId ? incrementalChangedSlots : undefined,
      })

      if (!isAnalysisSubmitFlowActive(submitFlowId)) {
        if (!result.reused && (result.run.status === 'queued' || result.run.status === 'running')) {
          try {
            await cancelUpgradeAnalysis({
              run_id: result.run.id,
              group_id: activeGroupId,
              target_user_id: targetUserId ?? selectedBuildTarget.user_id,
              build_target_id: selectedBuildTarget.id,
            })
          } catch {
            // Ignore late-cancel failures; the user already left this submit flow.
          }
        }
        return
      }

      setPendingSelectedRunId(result.run.id)
      setPendingRunPreview(result.run)
      setSelectedRunId((current) => current === draftRun.id ? result.run.id : current)
      setActionMessage(
        result.reused
          ? `Reused the latest cached ${getAnalysisModeLabel(result.run.analysis_mode).toLowerCase()} for these exact inputs.`
          : result.worker_notified
            ? `${getAnalysisModeLabel(result.run.analysis_mode)} queued and the worker was notified.`
            : `${getAnalysisModeLabel(result.run.analysis_mode)} queued.`,
      )
    } catch (error) {
      if (!isAnalysisSubmitFlowActive(submitFlowId)) return
      setRunTransitionLoading(false)
      setPendingSelectedRunId(null)
      setPendingRunPreview(null)
      setSelectedRunId((current) => current === submittedDraftId ? previousRunId : current)
      setActionMessage(error instanceof Error ? error.message : 'Failed to queue analysis run.')
    } finally {
      finishAnalysisSubmitFlow(submitFlowId)
    }
  }

  async function handleCancelRun() {
    setActionMessage(null)

    // Still in the submit flow (pre-persistence) — abort and restore previous state
    if (analysisActionPending || latestLiveRun?.summary?.queue_submission_pending === true) {
      cancelAnalysisSubmitFlow()
      setPendingRunPreview(null)
      setPendingSelectedRunId(null)
      setRunTransitionLoading(false)
      setSelectedRunId((current) => current === latestLiveRun?.id ? preRunSelectedRunId : current)
      return
    }

    if (!latestLiveRun || !activeGroupId || !selectedBuildTarget || !canQueueRun) return

    try {
      await cancelUpgradeAnalysis({
        run_id: latestLiveRun.id,
        group_id: activeGroupId,
        target_user_id: targetUserId ?? selectedBuildTarget.user_id,
        build_target_id: selectedBuildTarget.id,
      })
      setPendingRunPreview(null)
      setPendingSelectedRunId(null)
      setRunTransitionLoading(false)
      setSelectedRunId((current) => current === latestLiveRun.id ? preRunSelectedRunId : current)
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Failed to cancel the run.')
    }
  }

  function applyDraftSearchLineOverride(
    constraints: UpgradeSearchConstraints,
    slot: string,
    target: Pick<
      ResolvedRareStageSearchLineTarget,
      'lineId' | 'targetKey' | 'defaultValue' | 'supportsValueOverride'
    >,
    patch: Partial<Pick<UpgradeSearchLineConstraint, 'enabled' | 'value'>>,
  ): UpgradeSearchConstraints {
    const currentSlotOverride = constraints.slot_overrides[slot] ?? { disabled_target_keys: [] }
    const currentLineOverrides = currentSlotOverride.line_overrides ?? []
    const existingOverride =
      currentLineOverrides.find((entry) => entry.line_id === target.lineId) ?? null
    const nextValue =
      patch.value !== undefined
        ? patch.value == null
          ? null
          : Number.isFinite(patch.value)
            ? Math.max(0, roundSearchConstraintValue(patch.value))
            : null
        : (existingOverride?.value ?? null)
    const nextEnabled = patch.enabled ?? existingOverride?.enabled ?? true
    const shouldKeepOverride =
      nextEnabled === false ||
      (target.supportsValueOverride &&
        nextValue != null &&
        target.defaultValue != null &&
        !searchConstraintValuesMatch(nextValue, target.defaultValue))

    const nextLineOverrides = currentLineOverrides.filter(
      (entry) => entry.line_id !== target.lineId,
    )
    if (shouldKeepOverride) {
      nextLineOverrides.push({
        line_id: target.lineId,
        target_key: target.targetKey,
        enabled: nextEnabled,
        value: nextValue,
      })
    }

    const nextSlotOverrides = {
      ...constraints.slot_overrides,
      [slot]: {
        ...currentSlotOverride,
        ...(nextLineOverrides.length > 0 ? { line_overrides: nextLineOverrides } : {}),
      },
    }

    if (nextLineOverrides.length === 0) {
      delete nextSlotOverrides[slot].line_overrides
    }

    const nextSlotOverride = nextSlotOverrides[slot]
    if (
      nextSlotOverride.disabled_target_keys.length === 0 &&
      !nextSlotOverride.target_overrides &&
      !nextSlotOverride.line_overrides
    ) {
      delete nextSlotOverrides[slot]
    }

    return normalizeUpgradeSearchConstraints({
      ...constraints,
      slot_overrides: nextSlotOverrides,
    })
  }

  function setDraftSearchLineOverride(
    slot: string,
    target: Pick<
      ResolvedRareStageSearchLineTarget,
      'lineId' | 'targetKey' | 'defaultValue' | 'supportsValueOverride'
    >,
    patch: Partial<Pick<UpgradeSearchLineConstraint, 'enabled' | 'value'>>,
  ) {
    setDraftSearchConstraints((current) =>
      applyDraftSearchLineOverride(current, slot, target, patch),
    )
  }

  function setDraftSearchLineEnabled(
    slot: string,
    target: Pick<
      ResolvedRareStageSearchLineTarget,
      'lineId' | 'targetKey' | 'defaultValue' | 'supportsValueOverride'
    >,
    enabled: boolean,
  ) {
    setDraftSearchLineOverride(slot, target, { enabled })
  }

  function setDraftSearchLineValue(
    slot: string,
    target: Pick<
      ResolvedRareStageSearchLineTarget,
      'lineId' | 'targetKey' | 'defaultValue' | 'supportsValueOverride'
    >,
    value: number | null,
  ) {
    setDraftSearchLineOverride(slot, target, { value })
  }

  function setDraftCraftedLinesDisabled(disabled: boolean) {
    setDraftSearchConstraints((current) => {
      let next = current
      for (const option of recommendedDraftRareSearchOptions) {
        for (const section of option.sections) {
          for (const line of section.lines) {
            const target = line.target
            if (!target || !target.isCrafted) continue
            next = applyDraftSearchLineOverride(next, option.slot, target, {
              enabled: !disabled,
            })
          }
        }
      }
      return normalizeUpgradeSearchConstraints({
        ...next,
        ignore_crafted_mods: false,
      })
    })
  }

  function setDraftIgnoreCraftedMods(enabled: boolean) {
    setDraftSearchConstraints((current) =>
      normalizeUpgradeSearchConstraints({
        ...current,
        ignore_crafted_mods: enabled,
      }),
    )
  }

  function setDraftIgnoreEnchants(enabled: boolean) {
    setDraftSearchConstraints((current) =>
      normalizeUpgradeSearchConstraints({
        ...current,
        ignore_enchants: enabled,
      }),
    )
  }

  function setDraftIgnoreQuality(enabled: boolean) {
    setDraftSearchConstraints((current) =>
      normalizeUpgradeSearchConstraints({
        ...current,
        ignore_quality: enabled,
      }),
    )
  }

  function setDraftIgnoreCorruptedImplicits(enabled: boolean) {
    setDraftSearchConstraints((current) =>
      normalizeUpgradeSearchConstraints({
        ...current,
        ignore_corrupted_implicits: enabled,
      }),
    )
  }

  function setDraftPropertyPercentileFloor(rawValue: string) {
    const parsed = Number(rawValue)
    const clamped = Number.isFinite(parsed) ? Math.min(90, Math.max(0, Math.round(parsed))) : 0
    setDraftSearchConstraints((current) =>
      normalizeUpgradeSearchConstraints({
        ...current,
        property_percentile_floor: clamped,
      }),
    )
  }

  function resetDraftSearchConstraints() {
    setDraftSearchConstraints(DEFAULT_SEARCH_CONSTRAINTS)
  }

  function handleOpenManualTuningDialog() {
    setManualTuningDialogOpen(true)
  }

  function handleRerunWithManualTunings() {
    setManualTuningDialogOpen(false)
    setAnalysisMode('thorough')
    void handleQueueAnalysis({
      analysisModeOverride: 'thorough',
      attemptIncrementalRerun: true,
    })
  }

  async function handlePromote(planId: string) {
    try {
      const suggestion = await promoteRecommendation(planId)
      setActionMessage(`Added recommendation to gear planning for group ${suggestion.group_id}.`)
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Failed to promote recommendation.')
    }
  }

  const failedInputQuery = [membersQuery, charactersQuery].find(
    (query) => query.isError && query.data === undefined,
  )
  if (failedInputQuery) {
    return (
      <QueryStatePanel
        kind="error"
        title="Could not load analysis setup"
        description="Try loading your workspace and characters again."
        onRetry={failedInputQuery.refetch}
      />
    )
  }
  if (membersLoading || myCharactersLoading) {
    return <CardListSkeleton rows={4} />
  }

  const showSetup = setupExpanded || !selectedRun

  return (
    <div className="@container flex min-w-0 flex-col gap-5">
      {displayedAnalysisRuns.length > 0 || runsLoading || runsFailed ? (
        <section aria-labelledby="analysis-run-title" className="analysis-run-summary">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="analysis-run-title" className="text-foreground text-base font-semibold">Analysis run</h2>
              <p className="text-default-500 mt-1 text-sm wrap-anywhere">
                Setup: {[selectedCharacter?.name, selectedBuildTarget?.name, getAnalysisModeLabel(analysisMode),
                  analysisMode === 'thorough'
                    ? getRunBudgetLabel({ analysis_mode: analysisMode, budget_chaos: normalizedBudgetChaos }, currencyDisplay, divinePrice)
                    : null,
                ].filter(Boolean).join(' · ')}
              </p>
              {selectedRun ? (
                <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  {latestLiveRun?.id !== selectedRun.id ? (
                    <Chip size="sm" color={RUN_STATUS_COLORS[selectedRun.status]} variant="soft" className="capitalize">
                      {selectedRun.status}
                    </Chip>
                  ) : null}
                  <p className="text-default-600 min-w-0 text-sm wrap-anywhere">
                    {latestLiveRun && latestLiveRun.id !== selectedRun.id ? 'Viewing previous run · ' : ''}
                    {getAnalysisModeLabel(selectedRun.analysis_mode)}
                    {selectedRun.completed_at ? ' · ' + formatRelativeTimestamp(selectedRun.completed_at) : ''}
                    {selectedRunContextDetails.length ? ' · ' + selectedRunContextDetails.join(' · ') : ''}
                  </p>
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="tertiary"
                aria-controls="analysis-run-history"
                aria-expanded={historyExpanded}
                onPress={() => setHistoryExpanded((current) => !current)}
              >
                Run history
                <ChevronDown size={14} aria-hidden="true" className={historyExpanded ? 'rotate-180' : undefined} />
              </Button>
              {selectedRun ? (
                <Button
                  size="sm"
                  variant="tertiary"
                  aria-controls="analysis-setup"
                  aria-expanded={showSetup}
                  onPress={() => setSetupExpanded((current) => !current)}
                >
                  {showSetup ? 'Hide setup' : latestLiveRun ? 'View setup' : 'Edit setup'}
                </Button>
              ) : null}
            </div>
          </div>
          {latestLiveRun ? (
            <RunActivityStrip
              title={
                latestLiveRun.summary?.queue_submission_pending === true
                  ? 'Preparing your analysis'
                  : liveRunWaitInfo
                    ? 'Waiting for trade cooldown'
                    : latestLiveRun.status === 'queued'
                      ? 'Analysis queued'
                      : 'Analysis running'
              }
              detail={getRunStatusCopy(latestLiveRun, nowMs)}
              waitLabel={liveRunWaitInfo ? 'Resumes in ' + formatCountdown(liveRunWaitInfo.remainingMs) : null}
              timeline={
                latestLiveRun.status === 'running'
                  ? getRunPhaseTimeline(latestLiveRun, getCurrentRunPhaseId(latestLiveRun)?.id ?? null)
                  : undefined
              }
              elapsedLabel={latestLiveRun.status === 'running' && !liveRunWaitInfo ? formatElapsedSince(latestLiveRun.started_at, nowMs) : null}
              estimatedLabel={runtimeEstimateChipLabel}
              onCancel={canQueueRun ? () => void handleCancelRun() : undefined}
              cancelLoading={cancellingAnalysis}
            />
          ) : null}
          <div id="analysis-run-history" hidden={!historyExpanded} className="analysis-run-progress">
            {runsFailed ? (
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <p role="status" className="text-danger text-sm">Could not refresh run history.</p>
                <Button size="sm" variant="tertiary" onPress={() => void retryRuns()}>Try again</Button>
              </div>
            ) : null}
            {runsLoading ? (
              <p className="text-default-500 text-sm">Loading runs...</p>
            ) : displayedAnalysisRuns.length === 0 ? (
              runsFailed ? null : <p className="text-default-500 text-sm">No runs queued yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {displayedAnalysisRuns.map((run) => (
                  <button
                    key={run.id}
                    type="button"
                    aria-pressed={run.id === selectedRun?.id}
                    className={`rounded-large border p-3 text-left transition-colors ${
                      run.id === selectedRun?.id
                        ? 'border-highlight bg-selected'
                        : 'border-control bg-content1 hover:bg-content2'
                    }`}
                    onClick={() => setSelectedRunId(run.id)}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Chip
                          size="sm"
                          color={RUN_STATUS_COLORS[run.status]}
                          variant="soft"
                          className={run.status === 'running' ? 'bg-info-soft text-info' : undefined}
                        >
                          {run.status}
                        </Chip>
                        {latestCompletedRun?.id === run.id ? (
                          <Chip size="sm" variant="soft" color="success">
                            Latest completed
                          </Chip>
                        ) : null}
                        <Chip
                          size="sm"
                          variant="soft"
                        >
                          {run.analysis_mode === 'thorough' ? 'Live' : 'Quick'}
                        </Chip>
                      </div>
                      <span className="text-default-400 flex items-center gap-2 text-xs">
                        {formatRelativeTimestamp(run.created_at)}
                        {run.id === selectedRun?.id && <Check size={14} className="text-highlight" aria-hidden="true" />}
                      </span>
                    </div>
                    <p className="text-foreground mt-2 text-sm font-medium">
                      {getRunBudgetLabel(run, currencyDisplay, divinePrice)}
                    </p>
                    <p className="text-default-500 mt-1 text-xs">
                      {getRunStatusCopy(run, nowMs)}
                    </p>
                    {getDisplayedPartialReason(run, nowMs) ? (
                      <p className="text-default-500 mt-1 text-xs">
                        {getDisplayedPartialReason(run, nowMs)}
                      </p>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : null}
      {actionMessage ? <p role="status" className="text-default-600 text-sm wrap-anywhere">{actionMessage}</p> : null}
      <div
        id="analysis-setup"
        className={showSetup
          ? 'grid min-w-0 grid-cols-1 gap-5 @min-[48rem]:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]'
          : 'hidden'}
      >
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="gap-0 p-0">
            <Card.Header className="px-4 pt-4 pb-0">
              <div>
                <h2 className="text-foreground text-sm font-semibold">Import target PoB</h2>
                <p className="text-default-500 mt-1 text-sm">
                  Save a Path of Building target for this character.
                </p>
              </div>
            </Card.Header>
            <Card.Content className="gap-3 px-4 pt-3 pb-4">
              <FieldInput
                label="Target name"
                placeholder="e.g. Deadeye progression"
                value={importName}
                onValueChange={setImportName}
              />
              <FieldTextArea
                label="PoB share code or XML"
                minRows={6}
                placeholder="Paste a share code or exported XML"
                value={importPayload}
                onValueChange={setImportPayload}
              />
              {currentMember?.user.pob_code ? (
                <Button
                  variant="tertiary"
                  size="sm"
                  onPress={() =>
                    void handleImport(
                      currentMember.user.pob_code ?? '',
                      `${selectedCharacter?.name ?? 'Selected character'} main target`,
                    )
                  }
                >
                  Use saved PoB
                </Button>
              ) : null}
              {currentMember?.user.pob_support_code ? (
                <Button
                  variant="tertiary"
                  size="sm"
                  onPress={() =>
                    void handleImport(
                      currentMember.user.pob_support_code ?? '',
                      `${selectedCharacter?.name ?? 'Selected character'} support target`,
                    )
                  }
                >
                  Use saved support PoB
                </Button>
              ) : null}
              {importError ? <p className="text-danger text-sm">{importError}</p> : null}
              <Button
                isPending={importingTarget}
                isDisabled={!selectedCharacter}
                onPress={() => void handleImport()}
              >
                {({ isPending }) => (
                  <PendingButtonContent isPending={isPending}>
                    Import build target
                  </PendingButtonContent>
                )}
              </Button>
            </Card.Content>
          </Card>

          <Card className="gap-0 p-0">
            <Card.Header className="px-4 pt-4 pb-0">
              <div>
                <h2 className="text-foreground text-sm font-semibold">Imported targets</h2>
              </div>
            </Card.Header>
            <Card.Content className="gap-3 px-4 pt-3 pb-4">
              {buildTargetsQuery.isError && buildTargetsQuery.data ? (
                <QueryFreshnessNotice
                  refreshFailed
                  isRefreshing={buildTargetsQuery.isFetching}
                  onRetry={buildTargetsQuery.refetch}
                />
              ) : null}
              {buildTargetsQuery.isError && !buildTargetsQuery.data ? (
                <div className="flex flex-wrap items-center gap-2">
                  <p role="alert" className="text-danger text-sm">Could not load build targets.</p>
                  <Button size="sm" variant="tertiary" onPress={() => void buildTargetsQuery.refetch()}>
                    Try again
                  </Button>
                </div>
              ) : buildTargetsLoading ? (
                <p className="text-default-500 text-sm">Loading build targets...</p>
              ) : !selectedCharacter ? (
                <p className="text-default-500 text-sm">
                  Select one of your characters to load build targets.
                </p>
              ) : visibleBuildTargets.length === 0 ? (
                <p className="text-default-500 wrap-anywhere text-sm">
                  No build targets imported for {selectedCharacter.name} yet.
                </p>
              ) : (
                visibleBuildTargets.map((target) => (
                  <div
                    key={target.id}
                    className={`rounded-large border p-3 ${
                      target.is_selected ? 'border-highlight bg-selected' : 'border-divider bg-content1'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-foreground wrap-anywhere text-sm font-semibold">{target.name}</p>
                          {target.is_selected ? (
                            <Chip size="sm" variant="soft" className="text-highlight">
                              Selected
                            </Chip>
                          ) : null}
                        </div>
                        <p className="text-default-500 mt-1 text-xs">
                          {target.import_metadata.class_name ?? 'Unknown class'} ·{' '}
                          {target.import_metadata.ascendancy_name ?? 'Unknown ascendancy'} · imported{' '}
                          {formatRelativeTimestamp(target.created_at)}
                        </p>
                      </div>
                      <Chip
                        size="sm"
                        color={COMPATIBILITY_COLORS[target.compatibility_status]}
                        variant="soft"
                      >
                        {target.compatibility_status}
                      </Chip>
                    </div>
                    {target.compatibility_notes ? (
                      <p className="text-default-600 wrap-anywhere mt-2 text-sm">{target.compatibility_notes}</p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Chip size="sm" variant="soft">
                        {target.import_metadata.tree_specs.length} trees
                      </Chip>
                      <Chip size="sm" variant="soft">
                        {target.import_metadata.item_sets.length} item sets
                      </Chip>
                      <Chip size="sm" variant="soft">
                        {target.import_metadata.skill_sets.length} skill sets
                      </Chip>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="tertiary"
                        onPress={() => setSelectedBuildTargetId(target.id)}
                      >
                        Inspect
                      </Button>
                      {!target.is_selected ? (
                        <Button
                          size="sm"
                          variant="tertiary"
                          isPending={selectingTarget && target.id === selectedBuildTargetId}
                          onPress={() =>
                            chooseBuildTarget({
                              id: target.id,
                              group_id: target.group_id,
                              user_id: target.user_id,
                            })
                          }
                        >
                          {({ isPending }) => (
                            <PendingButtonContent isPending={isPending}>
                              Use target
                            </PendingButtonContent>
                          )}
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="danger-soft"
                        onPress={() =>
                          deleteBuildTarget({
                            id: target.id,
                            group_id: target.group_id,
                            user_id: target.user_id,
                          })
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </Card.Content>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card className="gap-0 p-0">
            <Card.Header className="px-4 pt-4 pb-0">
              <div className="flex flex-1 flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-foreground text-sm font-semibold">Analysis setup</h2>
                  <p className="text-default-500 mt-1 text-sm">
                    Choose the PoB layouts to compare.
                  </p>
                </div>
                {selectedBuildTarget ? (
                  <Chip size="sm" variant="soft" className="h-auto max-w-full whitespace-normal">
                    <span className="wrap-anywhere">{inspectedStageLabel}</span>
                  </Chip>
                ) : null}
              </div>
            </Card.Header>
            <Card.Content className="gap-4 px-4 pt-3 pb-4">
              {latestLiveRun ? (
                <p className="text-default-600 text-sm">Settings are locked during the active run.</p>
              ) : null}
              <div inert={!!latestLiveRun} className={latestLiveRun ? 'opacity-60' : undefined}>
                <div className="flex flex-col gap-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <SelectField
                      label="Character"
                      aria-label="Select character for optimization"
                      selectedKey={selectedCharacterId ?? null}
                      onSelectionChange={(key) => {
                        const value = toStringKey(key)
                        setHasManuallySelectedCharacter(true)
                        setSelectedCharacterId(value)
                        setActionMessage(null)
                      }}
                    >
                      {myCharacters.map((character) => (
                        <ListBox.Item
                          id={character.id}
                          key={character.id}
                          textValue={`${character.name} lvl ${character.level}`}
                        >
                          {character.name} lvl {character.level}
                        </ListBox.Item>
                      ))}
                    </SelectField>
                    <SelectField
                      label="Loadout"
                      aria-label="Select loadout"
                      selectedKey={selectedLoadoutKey ?? null}
                      isDisabled={!selectedBuildTarget || loadoutOptions.length === 0}
                      description={
                        loadoutOptions.length > 0
                          ? 'Selecting a loadout applies the matching tree, item set, skill set, and config.'
                          : 'Only shared names that exist across the setup selectors appear here.'
                      }
                      onSelectionChange={(key) => {
                        const value = toStringKey(key)
                        const loadout =
                          typeof value === 'string'
                            ? (loadoutOptions.find((option) => option.key === value) ?? null)
                            : null
                        if (!loadout) return
                        setStageTreeSpecId(loadout.treeSpecId)
                        setStageItemSetId(loadout.itemSetId)
                        setStageSkillSetId(loadout.skillSetId)
                        setStageConfigSetId(loadout.configSetId)
                        setActionMessage(null)
                      }}
                    >
                      {loadoutOptions.map((loadout) => (
                        <ListBox.Item id={loadout.key} key={loadout.key} textValue={loadout.label}>
                          {loadout.label}
                        </ListBox.Item>
                      ))}
                    </SelectField>
                  </div>
                  {!selectedBuildTarget ? (
                    <p className="text-default-500 text-sm">
                      Select or import a target for this character first.
                    </p>
                  ) : (
                    <>
                      <div className="grid gap-3 md:grid-cols-2">
                        <SelectField
                          label="Tree spec"
                          selectedKey={stageTreeSpecId ?? null}
                          onSelectionChange={(key) => {
                            setStageTreeSpecId(toStringKey(key))
                          }}
                        >
                          {selectedBuildTarget.import_metadata.tree_specs.map((spec) => (
                            <ListBox.Item id={spec.id} key={spec.id} textValue={spec.title}>
                              {spec.title}
                            </ListBox.Item>
                          ))}
                        </SelectField>
                        <SelectField
                          label="Item set"
                          selectedKey={stageItemSetId ?? null}
                          onSelectionChange={(key) => {
                            setStageItemSetId(toStringKey(key))
                          }}
                        >
                          {selectedBuildTarget.import_metadata.item_sets.map((itemSet) => (
                            <ListBox.Item
                              id={itemSet.id}
                              key={itemSet.id}
                              textValue={itemSet.title}
                            >
                              {itemSet.title}
                            </ListBox.Item>
                          ))}
                        </SelectField>
                        <SelectField
                          label="Skill set"
                          selectedKey={stageSkillSetId ?? null}
                          onSelectionChange={(key) => {
                            setStageSkillSetId(toStringKey(key))
                          }}
                        >
                          {selectedBuildTarget.import_metadata.skill_sets.map((skillSet) => (
                            <ListBox.Item
                              id={skillSet.id}
                              key={skillSet.id}
                              textValue={skillSet.title}
                            >
                              {skillSet.title}
                            </ListBox.Item>
                          ))}
                        </SelectField>
                        <SelectField
                          label="PoB config"
                          selectedKey={stageConfigSetId ?? null}
                          onSelectionChange={(key) => {
                            setStageConfigSetId(toStringKey(key))
                          }}
                        >
                          {selectedBuildTarget.import_metadata.config_sets.map((configSet) => (
                            <ListBox.Item
                              id={configSet.id}
                              key={configSet.id}
                              textValue={configSet.title}
                            >
                              {configSet.title}
                            </ListBox.Item>
                          ))}
                        </SelectField>
                      </div>
                      <ToggleButtonGroup
                        isDetached
                        fullWidth
                        selectionMode="single"
                        disallowEmptySelection
                        selectedKeys={new Set([analysisMode])}
                        onSelectionChange={(keys) => {
                          const [value] = Array.from(keys)
                          if (value === 'quick' || value === 'thorough') {
                            setAnalysisMode(value)
                          }
                        }}
                        aria-label="Analysis mode"
                        className="!grid w-full min-w-0 grid-cols-1 gap-3 @min-[63rem]:grid-cols-2"
                      >
                        {ANALYSIS_MODE_OPTIONS.map((option) => (
                          <ToggleButton
                            key={option.key}
                            id={option.key}
                            className="rounded-large border-control data-[selected=true]:border-highlight h-auto min-w-0 w-full justify-start border p-3 text-left whitespace-normal [--toggle-button-bg:var(--surface)] [--toggle-button-bg-hover:var(--surface-secondary)]"
                          >
                            <span className="flex w-full min-w-0 flex-col gap-2">
                              <span className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-foreground text-sm font-semibold">
                                  {option.label}
                                </span>
                                <Chip size="sm" variant="soft">
                                  {option.key === 'thorough' ? 'Minutes' : 'Fast'}
                                </Chip>
                              </span>
                              <span className="text-default-500 text-sm wrap-anywhere">{option.description}</span>
                            </span>
                          </ToggleButton>
                        ))}
                      </ToggleButtonGroup>
                      {analysisMode === 'thorough' ? renderBudgetInput('max-w-56') : null}
                      {analysisMode === 'thorough' ? renderTradeSearchRelaxationControls() : null}
                    </>
                  )}
                </div>
              </div>

              {selectedBuildTarget ? (
                <div className="flex flex-col gap-2">
                  <p className="text-default-500 text-xs font-semibold tracking-wide uppercase">
                    Party configuration{' '}
                    <span className="text-default-400 font-normal normal-case">(optional)</span>
                  </p>
                  <p className="text-default-400 text-xs">
                    Saved per character on this browser so your usual support setup comes back when
                    you switch characters.
                  </p>
                  {partyConfig.length > 0 && (
                    <div className="flex flex-col gap-2">
                      {partyConfig.map((entry, idx) => {
                        const sourceLabel =
                          entry.kind === 'group_member'
                            ? (getGroupPartyBuildTargetLabel(
                                (partyBuildTargets ?? []).find(
                                  (target) => target.id === entry.build_target_id,
                                ) ?? null,
                              ) ?? `Build target ${entry.build_target_id}`)
                            : 'Custom PoB support code'

                        return (
                          <div
                            key={`${entry.kind}-${idx}`}
                            className="rounded-large border-divider bg-content1 flex items-start gap-2 border p-3"
                          >
                            <div className="flex-1">
                              <FieldInput
                                size="sm"
                                label={`Label ${idx + 1}`}
                                value={getPartyConfigEntryLabel(entry, idx, partyBuildTargets)}
                                onValueChange={(value) => setPartyConfigEntryLabel(idx, value)}
                              />
                              <p className="text-default-500 mt-2 text-xs">
                                {entry.kind === 'group_member' ? 'Group member target' : 'PoB code'}
                                {' · '}
                                {sourceLabel}
                              </p>
                            </div>
                            <Button
                              isIconOnly
                              size="sm"
                              variant="danger-soft"
                              aria-label={`Remove party configuration ${idx + 1}`}
                              onPress={() =>
                                setPartyConfig((prev) =>
                                  prev.filter((_, entryIdx) => entryIdx !== idx),
                                )
                              }
                            >
                              <Trash2 size={16} />
                            </Button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {partyConfig.length < 5 && (
                    <div className="flex flex-col gap-2">
                      <ToggleButtonGroup
                        selectionMode="single"
                        disallowEmptySelection
                        size="sm"
                        className="w-fit"
                        selectedKeys={new Set([partyAddMode])}
                        onSelectionChange={(keys) => {
                          const [value] = Array.from(keys)
                          if (value === 'group_member') {
                            setPartyAddMode('group_member')
                            setPartyCodeInput('')
                          } else if (value === 'pob_code') {
                            setPartyAddMode('pob_code')
                            setSelectedPartyTargetId('')
                          }
                        }}
                      >
                        <ToggleButton id="group_member">Group member</ToggleButton>
                        <ToggleButton id="pob_code">
                          <ToggleButtonGroup.Separator />
                          Paste PoB code
                        </ToggleButton>
                      </ToggleButtonGroup>
                      {partyAddMode === 'group_member' ? (
                        (partyBuildTargets ?? []).length > 0 ? (
                          <div className="flex items-center gap-2">
                            <SelectField
                              label="Add group member"
                              selectedKey={selectedPartyTargetId || null}
                              onSelectionChange={(key) => {
                                setSelectedPartyTargetId(toStringKey(key) ?? '')
                              }}
                              className="flex-1"
                            >
                              {(partyBuildTargets ?? [])
                                .filter(
                                  (bt) =>
                                    !partyConfig.some(
                                      (e) =>
                                        e.kind === 'group_member' && e.build_target_id === bt.id,
                                    ),
                                )
                                .map((bt) => (
                                  <ListBox.Item
                                    id={bt.id}
                                    key={bt.id}
                                    textValue={`${bt.display_name ?? bt.poe_account_name ?? 'Unknown'} - ${bt.name}`}
                                  >
                                    {bt.display_name ?? bt.poe_account_name ?? 'Unknown'} —{' '}
                                    {bt.name}
                                  </ListBox.Item>
                                ))}
                            </SelectField>
                            <Button
                              size="sm"
                              variant="tertiary"
                              isDisabled={!selectedPartyTargetId}
                              onPress={() => {
                                const bt = (partyBuildTargets ?? []).find(
                                  (b) => b.id === selectedPartyTargetId,
                                )
                                if (!bt) return
                                const label = getGroupPartyBuildTargetLabel(bt)
                                setPartyConfig((prev) => [
                                  ...prev,
                                  { kind: 'group_member', build_target_id: bt.id, label },
                                ])
                                setSelectedPartyTargetId('')
                              }}
                            >
                              Add
                            </Button>
                          </div>
                        ) : (
                          <p className="text-default-400 text-xs">
                            No group members have saved a support PoB code yet. Ask them to add one
                            on the Members page.
                          </p>
                        )
                      ) : (
                        <div className="flex items-end gap-2">
                          <FieldTextArea
                            size="sm"
                            label="Paste PoB support code"
                            minRows={1}
                            value={partyCodeInput}
                            onValueChange={setPartyCodeInput}
                            className="flex-1"
                          />
                          <Button
                            size="sm"
                            variant="tertiary"
                            isDisabled={!partyCodeInput.trim()}
                            onPress={() => {
                              const code = partyCodeInput.trim()
                              if (!code) return
                              const n = partyConfig.filter((e) => e.kind === 'pob_code').length + 1
                              setPartyConfig((prev) => [
                                ...prev,
                                { kind: 'pob_code', pob_code: code, label: `Custom code ${n}` },
                              ])
                              setPartyCodeInput('')
                            }}
                          >
                            Add
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : null}

              {selectedBuildTarget ? (
                <div className="flex flex-col items-end gap-2">
                  <div className="flex w-full justify-end">
                    {!latestLiveRun ? (
                      <Button
                        className="w-full md:w-auto"
                        isDisabled={!canQueueRun}
                        isPending={analysisActionPending}
                        onPress={() => void handleQueueAnalysis()}
                      >
                        {({ isPending }) => (
                          <PendingButtonContent isPending={isPending}>
                            Run analysis
                          </PendingButtonContent>
                        )}
                      </Button>
                    ) : null}
                  </div>
                  {!selectedRunIsLive && runtimeEstimateSummary ? (
                    <p className="text-default-400 text-right text-xs leading-snug">
                      {runtimeEstimateSummary}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {!canQueueRun && selectedBuildTarget ? (
                <p className="text-default-500 text-sm">
                  Viewers can inspect results, but only editors or admins can queue new runs.
                </p>
              ) : null}
            </Card.Content>
          </Card>
        </div>
      </div>
        <Card role="region" aria-labelledby="analysis-recommendations" className="min-w-0 gap-0 p-0">
          <Card.Header className="px-4 pt-4 pb-0">
            <div className="flex flex-1 flex-wrap items-start justify-between gap-3">
              <div>
                <h2 id="analysis-recommendations" tabIndex={-1} className="text-foreground text-base font-semibold">
                  Recommendations
                </h2>
                <p className="text-default-500 mt-1 text-sm">
                  Review upgrades and send useful picks to Gear Planning.
                </p>
              </div>
              <div className="flex min-w-0 flex-wrap gap-2">
                {canQueueRun && selectedRun && selectedRun.analysis_mode === 'thorough' ? (
                  <Button
                    size="sm"
                    isDisabled={!selectedBuildTarget || !!latestLiveRun}
                    isPending={analysisActionPending}
                    onPress={handleOpenManualTuningDialog}
                  >
                    {({ isPending }) => (
                      <PendingButtonContent isPending={isPending}>
                        Rerun with adjustments
                      </PendingButtonContent>
                    )}
                  </Button>
                ) : null}
              </div>
            </div>
          </Card.Header>
          <Card.Content className="@container/recommendations px-4 pt-3 pb-4">
            {selectedRun && selectedRun.status !== 'failed' ? (
              <details className="border-divider mb-4 border-b pb-3">
                <summary className="cursor-pointer text-sm font-medium">Run details</summary>
                <div className="mt-4 flex flex-col gap-4">
                  {selectedRunMainSkillName ? (
                    <div className="inline-flex min-w-0 max-w-full flex-wrap items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
                      <span className="text-default-400 text-[11px] font-medium tracking-[0.14em] uppercase">
                        Main skill
                      </span>
                      {selectedRunMainSkillVisual?.icon ? (
                        <img
                          src={selectedRunMainSkillVisual.icon}
                          alt=""
                          className="h-4 w-4 rounded-full object-contain"
                        />
                      ) : (
                        <span className="bg-default-400/40 h-3 w-3 shrink-0 rounded-full" />
                      )}
                      <span
                        className={`wrap-anywhere text-xs font-medium ${getSocketTextColorClass(selectedRunMainSkillVisual?.socketColor ?? null)}`}
                      >
                        {selectedRunMainSkillName}
                      </span>
                    </div>
                  ) : null}
                  {(selectedRun.party_config.length > 0 &&
                    selectedRunAppliedPartyCount !== null) ||
                  selectedRunHasConfigurationInsightButton ? (
                    <div className="flex flex-wrap gap-2">
                      {selectedRun.party_config.length > 0 &&
                      selectedRunAppliedPartyCount !== null ? (
                        <Button
                          size="sm"
                          variant="tertiary"
                          onPress={() => setPartyBuffDetailOpen(true)}
                        >
                          {selectedRunAppliedPartyCount > 0
                            ? `Party buffs ${selectedRunAppliedPartyCount}/${selectedRun.party_config.length}`
                            : 'Party buffs: none applied'}
                        </Button>
                      ) : null}
                      {selectedRunHasConfigurationInsightButton ? (
                        <Button
                          size="sm"
                          variant="tertiary"
                          onPress={() => setConfigInsightDetailOpen(true)}
                        >
                          PoB configuration insights
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                  {selectedRun.status !== 'queued' && selectedRun.status !== 'running' ? (
                    <p className="text-default-500 text-sm">
                      {getRunStatusCopy(selectedRun, nowMs)}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {selectedRunPlanCount != null ? (
                      <Chip size="sm" variant="soft">
                        {selectedRunPlanCount} plans
                      </Chip>
                    ) : null}
                    {selectedRunBlockers.length ? (
                      <Chip size="sm" variant="soft" color="warning">
                        {selectedRunBlockers.length} blockers
                      </Chip>
                    ) : null}
                  </div>
                  {selectedRunBlockers.length ? (
                    <div className="rounded-large border-divider/70 bg-default-50/70 border p-3">
                      <p className="text-default-500 text-xs font-semibold tracking-wide uppercase">
                        Progress blockers
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {selectedRunBlockers.slice(0, 4).map((blocker) => (
                          <Chip key={blocker} size="sm" variant="soft" color="warning">
                            {blocker}
                          </Chip>
                        ))}
                        {selectedRunBlockers.length > 4 ? (
                          <Chip size="sm" variant="soft">
                            +{selectedRunBlockers.length - 4} more
                          </Chip>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  {getDisplayedPartialReason(selectedRun, nowMs) ? (
                    <p className="text-warning text-sm">
                      {(getSummaryNumber(selectedRun.summary, 'exact_plan_count') ?? 0) > 0
                        ? `Current scope: ${getDisplayedPartialReason(selectedRun, nowMs)}`
                        : `Partial confidence: ${getDisplayedPartialReason(selectedRun, nowMs)}`}
                    </p>
                  ) : null}
                </div>
              </details>
            ) : null}
            <div className="grid grid-cols-1 items-start gap-5 @min-[52rem]/recommendations:grid-cols-[minmax(0,1fr)_19rem]">
              <div className="flex min-w-0 flex-col gap-5">
                {!selectedRun ? (
                  <p className="text-default-500 text-sm">Run analysis or choose a run from history.</p>
                ) : selectedRunIsLive ? (
                  <LiveRecommendationsSkeleton />
                ) : recommendationsLoading && selectedRun.status !== 'failed' ? (
                  <LiveRecommendationsSkeleton />
                ) : selectedRun.status === 'failed' ? (
                  <div className="rounded-large border-danger/40 bg-danger-soft border p-4">
                    <div role="alert">
                      <p className="text-danger text-sm font-semibold">Exact analysis failed</p>
                      <p className="text-default-600 mt-1 text-sm">
                        Recommendations could not be generated. Try running the analysis again.
                      </p>
                    </div>
                    {canQueueRun ? (
                      <div className="mt-3">
                        <Button
                          size="sm"
                          isDisabled={!selectedBuildTarget || !!latestLiveRun}
                          isPending={analysisActionPending}
                          onPress={() => void handleQueueAnalysis()}
                        >
                          {({ isPending }) => (
                            <PendingButtonContent isPending={isPending}>
                              Run analysis
                            </PendingButtonContent>
                          )}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : recommendationsFailed && recommendationPlans.length === 0 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <p role="alert" className="text-danger text-sm">Could not load recommendations.</p>
                    <Button size="sm" variant="tertiary" onPress={() => void retryRecommendations()}>
                      Try again
                    </Button>
                  </div>
                ) : recommendationPlans.length === 0 ? (
                  <div className="rounded-large border-divider bg-default-50/60 border p-4">
                    <p className="text-foreground text-sm font-semibold">
                      {selectedRun.status === 'stale'
                        ? 'Only stale results exist right now'
                        : selectedRunEmptyPlansCopy.title}
                    </p>
                    <p className="text-default-600 mt-1 text-sm">
                      {selectedRun.status === 'stale'
                        ? `${formatStaleReason(selectedRun.stale_reason)} Run analysis again to generate updated recommendations.`
                        : selectedRunEmptyPlansCopy.description}
                    </p>
                    {selectedRun.status !== 'stale' && selectedRunEmptyPlansCopy.warning ? (
                      <p className="text-default-500 mt-2 text-xs">
                        Run warning: {selectedRunEmptyPlansCopy.warning}
                      </p>
                    ) : null}
                    {canQueueRun ? (
                      <div className="mt-3">
                        <Button
                          size="sm"
                          isPending={analysisActionPending}
                          onPress={() => void handleQueueAnalysis()}
                        >
                          {({ isPending }) => (
                            <PendingButtonContent isPending={isPending}>
                              Run analysis
                            </PendingButtonContent>
                          )}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <>
                    <QueryFreshnessNotice
                      refreshFailed={recommendationsFailed}
                      isRefreshing={false}
                      onRetry={retryRecommendations}
                    />
                    {selectedRun.status === 'stale' ? (
                      <div className="rounded-large border-warning/40 bg-warning/10 border p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-foreground text-sm font-semibold">
                              You are inspecting stale recommendations
                            </p>
                            <p className="text-default-600 mt-1 text-sm">
                              {formatStaleReason(selectedRun.stale_reason)} The plans below are
                              still visible for reference.
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {latestCompletedRun && latestCompletedRun.id !== selectedRun.id ? (
                              <Button
                                size="sm"
                                variant="tertiary"
                                onPress={() => setSelectedRunId(latestCompletedRun.id)}
                              >
                                View latest completed run
                              </Button>
                            ) : null}
                            {canQueueRun ? (
                              <Button
                                size="sm"
                                isPending={analysisActionPending}
                                onPress={() => void handleQueueAnalysis()}
                              >
                                {({ isPending }) => (
                                  <PendingButtonContent isPending={isPending}>
                                    Run analysis
                                  </PendingButtonContent>
                                )}
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ) : null}
                    {recommendationSections.length > 0 ? (
                      <details className="border-divider/70 rounded-lg border px-3 py-2">
                        <summary className="text-foreground cursor-pointer text-sm font-medium">
                          Scoring details
                        </summary>
                        <p className="text-default-600 mt-2 max-w-prose text-sm">
                          Compare scores within this run’s section. DPS and effective hit pool
                          show damage and defense per cost. Reservation shows how much an upgrade
                          helps fit the target skills. Check the individual scores and notes for
                          defensive or utility upgrades.
                        </p>
                      </details>
                    ) : null}
                    <div className="flex flex-col gap-5 sm:gap-6">
                      {setupNotePlans.length > 0 ? (
                        <div className="rounded-large border-info/40 bg-info-soft border p-4">
                          <p className="text-foreground text-sm font-semibold">Setup notes</p>
                          <p className="text-default-600 mt-1 text-sm">
                            These are broader setup prerequisites, bundles, or support fixes, not
                            the main item-by-item shopping lane.
                          </p>
                          <div className="mt-3 flex flex-col gap-3">
                            {setupNotePlans.map((plan) => (
                              <div
                                key={plan.id}
                                className="rounded-large border-divider/70 bg-content1/70 border p-3"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <Chip size="sm" variant="soft">
                                    {plan.kind === 'bundle' ? 'Bundle' : 'Setup'}
                                  </Chip>
                                  {plan.breaks_requirements ? (
                                    <Chip size="sm" variant="soft" color="danger">
                                      breaks requirements
                                    </Chip>
                                  ) : null}
                                </div>
                                <p className="text-foreground mt-2 text-sm font-semibold">
                                  {plan.title}
                                </p>
                                {plan.summary ? (
                                  <p className="text-default-600 mt-1 text-sm">{plan.summary}</p>
                                ) : null}
                                {plan.explanation ? (
                                  <p className="text-default-500 mt-1 text-sm">
                                    {plan.explanation}
                                  </p>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {recommendationSections.map((section) => {
                        const plans = section.plans

                        return (
                          <div key={section.key} className="flex flex-col gap-3">
                            {section.key === 'overview' ? (
                              <div className="border-divider mt-2 border-t pt-4">
                                <div className="flex items-center justify-between gap-3">
                                  <p className="text-foreground text-sm font-semibold">
                                    {section.label}
                                  </p>
                                  <Chip size="sm" variant="soft">
                                    {plans.reduce((count, plan) => count + plan.items.length, 0)}
                                  </Chip>
                                </div>
                                <p className="text-default-500 mt-1 text-xs">
                                  Every rare target item from the selected PoB is exact-scored
                                  here in slot order. No relaxation has been applied to items in
                                  this section.
                                </p>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-foreground text-sm font-semibold">
                                  {section.label}
                                </p>
                                <Chip size="sm" variant="soft">
                                  {plans.reduce((count, plan) => count + plan.items.length, 0)}
                                </Chip>
                              </div>
                            )}
                            {section.key === 'best_single' &&
                            bestSingleTemplateFallbackSummary ? (
                              <p className="text-default-500 text-xs">
                                {bestSingleTemplateFallbackSummary.liveCount > 0
                                  ? `Only ${bestSingleTemplateFallbackSummary.liveCount} live rare ${bestSingleTemplateFallbackSummary.liveCount === 1 ? 'listing survived' : 'listings survived'} the current constrained search, so the remaining ${bestSingleTemplateFallbackSummary.templateCount} ${bestSingleTemplateFallbackSummary.templateCount === 1 ? 'slot uses' : 'slots use'} top positive template swaps scored against your configured relaxation baseline. Use rerun to relax further.`
                                  : 'No live rare listings survived the current constrained search, so this section falls back to the top positive template swaps scored against your configured relaxation baseline. Use rerun to relax further.'}
                              </p>
                            ) : null}
                            {section.key === 'best_single' && plans.length === 0 ? (
                              <div className="rounded-large border-divider bg-default-50/60 border p-4">
                                <p className="text-default-500 text-sm">
                                  No rare upgrades found for this run. The search constraints may
                                  be too narrow, or no listings on trade matched the target slots.
                                  Try relaxing filters or rerunning analysis with a higher budget.
                                </p>
                              </div>
                            ) : null}
                            <div
                              role="group"
                              aria-label={section.label}
                              className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(min(100%,14rem),1fr))] gap-3"
                            >
                              {plans.map((plan, index) => {
                                const needsMarketSearch = planNeedsMarketSearch(plan)
                                const scoreBreakdown = getRecommendationScoreBreakdown(plan)
                                const overallRank =
                                  section.scoreRanks.overall.get(plan.id) ?? index + 1
                                const dpsRank = section.scoreRanks.dps.get(plan.id) ?? null
                                const ehpRank = section.scoreRanks.ehp.get(plan.id) ?? null
                                const reservationRank = shouldShowRecommendationScore(
                                  'reservation',
                                  scoreBreakdown.reservation,
                                )
                                  ? (section.scoreRanks.reservation.get(plan.id) ?? null)
                                  : null
                                const visibleReservationScore = shouldShowRecommendationScore(
                                  'reservation',
                                  scoreBreakdown.reservation,
                                )
                                  ? scoreBreakdown.reservation
                                  : null
                                const planPriceLabel = needsMarketSearch
                                  ? 'Needs market search'
                                  : formatCurrencyAmount(
                                      plan.effective_cost_chaos,
                                      currencyDisplay,
                                      divinePrice,
                                    )

                                return (
                                  <div key={plan.id} className="contents">
                                    <div className="hidden">
                                      <div>
                                        <div className="flex items-center gap-2">
                                          <p className="text-foreground text-sm font-semibold">
                                            {plan.title}
                                          </p>
                                          <Chip
                                            size="sm"
                                            variant="soft"
                                          >
                                            {plan.kind}
                                          </Chip>
                                          {needsMarketSearch ? (
                                            <Chip size="sm" variant="soft" color="warning">
                                              template rare
                                            </Chip>
                                          ) : null}
                                          {plan.breaks_requirements ? (
                                            <Chip size="sm" variant="soft" color="danger">
                                              breaks requirements
                                            </Chip>
                                          ) : null}
                                        </div>
                                        {plan.summary ? (
                                          <p className="text-default-600 mt-1 text-sm">
                                            {plan.summary}
                                          </p>
                                        ) : null}
                                        {plan.explanation ? (
                                          <p className="text-default-500 mt-2 text-sm">
                                            {plan.explanation}
                                          </p>
                                        ) : null}
                                      </div>
                                      <div className="text-right">
                                        <p className="text-foreground text-sm font-semibold">
                                          {planPriceLabel}
                                        </p>
                                        <p className="text-default-500 text-xs">
                                          optimizer {plan.score.toFixed(2)}
                                          {scoreBreakdown.dps != null
                                            ? ` | dps ${scoreBreakdown.dps.toFixed(2)}`
                                            : ''}
                                          {scoreBreakdown.ehp != null
                                            ? ` | ehp ${scoreBreakdown.ehp.toFixed(2)}`
                                            : ''}
                                          {visibleReservationScore != null
                                            ? ` | reservation ${visibleReservationScore.toFixed(2)}`
                                            : ''}
                                        </p>
                                        <p className="text-default-400 text-xs">
                                          optimizer rank {overallRank} of {plans.length}
                                          {dpsRank != null ? ` | dps ${dpsRank}` : ''}
                                          {ehpRank != null ? ` | ehp ${ehpRank}` : ''}
                                          {reservationRank != null
                                            ? ` | reservation ${reservationRank}`
                                            : ''}
                                        </p>
                                        <p className="text-default-400 text-xs">
                                          stage {plan.stage_progress_score.toFixed(2)}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="hidden">
                                      <RecommendationMetricStrip plan={plan} />
                                    </div>
                                    <div className="contents">
                                      {plan.items.map((item) => (
                                        <RecommendationItemRow
                                          key={item.id}
                                          item={item}
                                          plan={plan}
                                          scoreContext={{
                                            overallRank,
                                            dpsRank,
                                            ehpRank,
                                            reservationRank,
                                            total: plans.length,
                                            sectionLabel: section.label,
                                          }}
                                          divinePrice={divinePrice}
                                          analysisMode={selectedRun.analysis_mode}
                                          runIsStale={selectedRun.status === 'stale'}
                                          comparePowerRow={
                                            comparePowerItemRowsBySlot.get(
                                              getRecommendationItemCompareSlot(item) ?? '',
                                            ) ?? null
                                          }
                                          reservationAuditAnchorId={reservationAuditAnchorId}
                                          showRankBadge={section.key !== 'overview'}
                                          canPromote={canPromote}
                                          promotingRecommendation={promotingRecommendation}
                                          onPromote={() => void handlePromote(plan.id)}
                                        />
                                      ))}
                                    </div>
                                    {canPromote ? (
                                      <div className="hidden">
                                        {canPromote ? (
                                          <Button
                                            size="sm"
                                            isPending={promotingRecommendation}
                                            onPress={() => void handlePromote(plan.id)}
                                          >
                                            {({ isPending }) => (
                                              <PendingButtonContent isPending={isPending}>
                                                Add to gear queue
                                              </PendingButtonContent>
                                            )}
                                          </Button>
                                        ) : null}
                                      </div>
                                    ) : null}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
              <aside aria-label="Build insights" className="min-w-0">
                <RecommendationsInsightsRail
                  selectedCharacter={selectedCharacter}
                  selectedProfile={selectedCharacterProfile}
                  stageLabel={recommendationStageLabel}
                  stageTreeSpec={recommendationStageTreeSpec}
                  stageSkillSet={recommendationStageSkillSet}
                  isDraftStage={recommendationStageIsDraft}
                  selectedRun={selectedRun}
                  selectedRunIsLive={selectedRunIsLive}
                  passiveTreeRefreshToken={passiveTreeRefreshToken}
                  runTransitionLoading={runTransitionLoading}
                  reservationAuditAnchorId={reservationAuditAnchorId}
                />
              </aside>
            </div>
          </Card.Content>
        </Card>

      {selectedRun ? (
        <>
          <>
            <Modal.Backdrop
              isOpen={partyBuffDetailOpen}
              onOpenChange={(open) => {
                if (!open) setPartyBuffDetailOpen(false)
              }}
            >
              <Modal.Container>
                <Modal.Dialog className="max-h-[calc(100dvh-2rem)]">
                  <Modal.Header>
                    <Modal.Heading>Party buffs applied</Modal.Heading>
                  </Modal.Header>
                  <Modal.Body className="min-h-0 overflow-y-auto pb-5">
                    {(() => {
                      const effects = selectedRun.summary?.party_effects as
                        | {
                            auras?: Record<string, number>
                            links?: Record<string, number>
                            warcries?: Record<string, number>
                            curses?: Record<string, number>
                          }
                        | null
                        | undefined

                      if (!effects) {
                        return (
                          <p className="text-default-500 text-sm">
                            No party buff detail available for this run. Queue a new run to see buff
                            effects.
                          </p>
                        )
                      }

                      const sections: Array<{ label: string; entries: Record<string, number> }> = [
                        { label: 'Auras', entries: effects.auras ?? {} },
                        { label: 'Links', entries: effects.links ?? {} },
                        { label: 'Warcries', entries: effects.warcries ?? {} },
                        { label: 'Curses', entries: effects.curses ?? {} },
                      ].filter((s) => Object.keys(s.entries).length > 0)

                      if (sections.length === 0) {
                        return (
                          <p className="text-default-500 text-sm">
                            Party member was found but no buff effects were parsed. The support
                            build may have no active auras or links.
                          </p>
                        )
                      }

                      return (
                        <div className="flex flex-col gap-4">
                          {sections.map((section) => (
                            <div key={section.label}>
                              <p className="text-default-500 mb-2 text-xs font-semibold tracking-wide uppercase">
                                {section.label}
                              </p>
                              <div className="flex flex-col gap-1">
                                {Object.entries(section.entries)
                                  .sort(([a], [b]) => a.localeCompare(b))
                                  .map(([name, pct]) => (
                                    <div
                                      key={name}
                                      className="flex items-center justify-between gap-4"
                                    >
                                      <span className="text-foreground text-sm">{name}</span>
                                      <span className="text-default-500 shrink-0 text-sm">
                                        {pct}%
                                      </span>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          ))}
                          <p className="text-default-400 text-xs">
                            Effect percentages as computed by PoB for your build.
                          </p>
                        </div>
                      )
                    })()}
                  </Modal.Body>
                </Modal.Dialog>
              </Modal.Container>
            </Modal.Backdrop>
          </>

          <>
            <Modal.Backdrop
              isOpen={configInsightDetailOpen}
              onOpenChange={(open) => {
                if (!open) setConfigInsightDetailOpen(false)
              }}
            >
              <Modal.Container>
                <Modal.Dialog className="max-h-[calc(100dvh-2rem)]">
                  <Modal.Header>
                    <Modal.Heading>PoB configuration insights</Modal.Heading>
                  </Modal.Header>
                  <Modal.Body className="min-h-0 overflow-y-auto pb-5">
                    {(() => {
                      const configInsights = getPobConfigurationInsights(selectedRun.summary)
                      const configSetTitle =
                        configInsights?.set_title ??
                        getSummaryText(selectedRun.summary, 'resolved_config_set_title')
                      const sections = configInsights?.sections ?? []
                      const enabledCount =
                        configInsights?.enabled_count ??
                        sections.reduce((count, section) => count + section.entries.length, 0)

                      if (!configInsights && !configSetTitle) {
                        return (
                          <p className="text-default-500 text-sm">
                            No configuration detail is available for this run yet. Queue a fresh run
                            to capture PoB config toggles and values.
                          </p>
                        )
                      }

                      return (
                        <div className="flex flex-col gap-4">
                          <div className="rounded-large border-divider flex flex-col gap-1 border p-4">
                            <p className="text-default-500 text-xs font-semibold tracking-wide uppercase">
                              Active config set
                            </p>
                            <p className="text-foreground text-sm font-semibold">
                              {configSetTitle ?? 'Unknown config set'}
                            </p>
                            <p className="text-default-500 text-sm">
                              {enabledCount > 0
                                ? `${enabledCount} non-default PoB configuration value${enabledCount === 1 ? '' : 's'} captured for this run.`
                                : 'No non-default PoB configuration values were captured for this run.'}
                            </p>
                          </div>

                          {sections.length === 0 ? (
                            <p className="text-default-500 text-sm">
                              This run predates detailed configuration insight capture, or the
                              active config set matched PoB defaults.
                            </p>
                          ) : (
                            sections.map((section) => (
                              <div key={section.label}>
                                <p className="text-default-500 mb-2 text-xs font-semibold tracking-wide uppercase">
                                  {section.label}
                                </p>
                                <div className="flex flex-col gap-2">
                                  {section.entries.map((entry) => (
                                    <div
                                      key={`${section.label}-${entry.var}-${entry.source}`}
                                      className="rounded-large border-divider border p-3"
                                    >
                                      {entry.context_label ? (
                                        <p className="text-default-400 text-xs font-semibold tracking-wide uppercase">
                                          {entry.context_label}
                                        </p>
                                      ) : null}
                                      <p className="text-foreground mt-1 text-sm font-medium">
                                        {entry.label}
                                      </p>
                                      <p className="text-default-500 mt-1 text-sm break-words whitespace-pre-wrap">
                                        {entry.value}
                                      </p>
                                      {entry.source === 'placeholder' ? (
                                        <p className="text-default-400 mt-2 text-xs">
                                          Using the placeholder value stored by PoB for this field.
                                        </p>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )
                    })()}
                  </Modal.Body>
                </Modal.Dialog>
              </Modal.Container>
            </Modal.Backdrop>
          </>

          <>
            <Modal.Backdrop
              isOpen={manualTuningDialogOpen}
              onOpenChange={(open) => {
                if (!open) setManualTuningDialogOpen(false)
              }}
            >
              <Modal.Container>
                <Modal.Dialog className="max-h-[calc(100dvh-2rem)]">
                  <Modal.Header className="flex flex-col gap-1">
                    <Modal.Heading>Rerun analysis with manual tunings</Modal.Heading>
                    <span className="text-default-500 text-sm font-normal">
                      This launches a fresh live-market pass for {selectedRunStageLabel}.
                    </span>
                  </Modal.Header>
                  <Modal.Body className="min-h-0 overflow-y-auto pb-2">
                    {renderManualTuningEditor()}
                  </Modal.Body>
                  <Modal.Footer>
                    <Button
                      variant="tertiary"
                      onPress={() => setManualTuningDialogOpen(false)}
                      isDisabled={analysisActionPending}
                    >
                      Keep editing later
                    </Button>
                    <Button
                      isPending={analysisActionPending}
                      onPress={handleRerunWithManualTunings}
                    >
                      {({ isPending }) => (
                        <PendingButtonContent isPending={isPending}>Rerun</PendingButtonContent>
                      )}
                    </Button>
                  </Modal.Footer>
                </Modal.Dialog>
              </Modal.Container>
            </Modal.Backdrop>
          </>
        </>
      ) : null}
    </div>
  )
}
