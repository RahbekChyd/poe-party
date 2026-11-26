import { type Key, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Link, getRouteApi } from '@tanstack/react-router'
import { z } from 'zod'
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
import { ArrowLeft, ArrowRight, Check, ChevronDown, Circle, Info, Trash2, X } from 'lucide-react'
import { useCurrentUser, useMyProfile } from '../../hooks/useCurrentUser'
import { useActiveGroupContext, useGroupMembers, useMyGroupRole } from '../../hooks/useGroups'
import { useMyCharacters, type MyCharacter } from '../../hooks/useCharacters'
import { useActiveCharacters } from '../../hooks/useSnapshots'
import { useCharacterProfiles, useSyncCharacterProfile } from '../../hooks/useCharacterProfiles'
import {
  type AnalysisRuntimeEstimate,
  useBuildTarget,
  useMyAnalysisRun,
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
import { FREE_DAILY_UPGRADE_ANALYSIS_LIMIT, hasActiveProAccess } from '../../lib/billing'
import {
  deriveStageRequirementsFromSelection,
  findPobTreeSpec,
  findResolvedPobTreeSpec,
  parsePobImport,
} from '../../lib/pob'
import {
  findPobLayout,
  getAnalysisPobLayoutLabels,
  getAnalysisPobResultLayoutLabels,
  resolveAnalysisPobSetup,
} from '../../lib/analysis-pob-setup'
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
import type { CharacterProfileSnapshot } from '../../lib/character-profile'
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
import { AnalysisPobSetupFields } from '../analysis/AnalysisPobSetupFields'
import { AnalysisPobImportFields } from '../analysis/AnalysisPobImportFields'
import { AnalysisPobResultLayouts } from '../analysis/AnalysisPobResultLayouts'
import { AnalysisWizard } from '../analysis/AnalysisWizard'
import { AnalysisRunProgress } from '../analysis/AnalysisRunProgress'
import { useCharacterSyncFlow } from '../../hooks/useCharacterSyncFlow'
import { useMarkAnalysisOpened } from '../../hooks/useAnalysisNotifications'
import {
  formatCountdown,
  formatElapsedSince,
  getAnalysisPhaseLabel,
  getRunPhaseTimeline,
} from '../../lib/analysis-progress'
import { DashboardPage, DashboardPageHeader } from '../ui/dashboard'
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

    const existsEverywhere = activeGroups.every(
      (group) => group.entries.filter(({ label }) => normalizeLoadoutKey(label) === key).length === 1,
    )
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

      <div className="rounded-large border-divider bg-content1 text-foreground border px-3 py-2 wrap-anywhere">
        <div className="border-divider border-b pb-2 text-center">
          <p className="text-sm font-semibold text-[color:var(--foreground-strong)]">
            {option.title}
          </p>
          {option.subtitle ? (
            <p className="text-default-500 mt-1 text-xs">{option.subtitle}</p>
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
                <span className="text-[color:var(--foreground-strong)]">
                  {property.values.join(', ')}
                </span>
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
                  <p className="text-default-500 mb-2 text-center text-xs">{section.title}</p>
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
                          isDisabled ? 'border-divider bg-content1' : 'border-divider bg-content2'
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
                            <p className={`text-xs leading-5 tabular-nums ${line.lineClassName}`}>
                              {line.text}
                            </p>
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
          <div className="text-default-500 py-3 text-center text-xs">
            No item details available.
          </div>
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

const newAnalysisRoute = getRouteApi('/dashboard/analysis/new')
const analysisRunRoute = getRouteApi('/dashboard/analysis/runs/$runId')

const wizardSteps = ['Character', 'PoB target', 'PoB setup', 'Analysis options', 'Review'] as const
const wizardHeadings = [
  'Choose a character',
  'Choose a PoB target',
  'Confirm PoB setup',
  'Choose analysis options',
  'Review analysis',
] as const
const wizardDescriptions = [
  'Choose the character whose gear and passive tree you want to compare.',
  'Choose a saved build or import the PoB you want to work toward.',
  'Check which layouts from the target build the analysis should use.',
  'Choose how the optimizer should look for upgrades.',
  'Check the inputs before starting your run.',
] as const

function AnalysisBackLink() {
  return (
    <Link to="/dashboard/analysis" className="button button--sm button--tertiary">
      <ArrowLeft size={15} aria-hidden="true" />
      Run history
    </Link>
  )
}

export function NewAnalysisPage() {
  const { fromRun } = newAnalysisRoute.useSearch()
  const { group, capabilities } = useActiveGroupContext()
  const { data: user } = useCurrentUser()
  const role = useMyGroupRole(group?.id ?? null)
  const canQueue = role === 'admin' || role === 'editor'
  const sourceRun = useMyAnalysisRun(
    capabilities?.supportsOptimizer && canQueue ? (group?.id ?? null) : null,
    user?.id ?? null,
    fromRun ?? null,
  )
  return (
    <DashboardPage>
      <DashboardPageHeader title="New analysis" backLink={<AnalysisBackLink />} />
      {!group || !user || (capabilities?.supportsOptimizer && !role) ? (
        <CardListSkeleton rows={1} />
      ) : !capabilities?.supportsOptimizer ? (
        <p className="text-default-600 text-sm">
          Analysis is available in Path of Exile 1 workspaces.
        </p>
      ) : !canQueue ? (
        <p className="text-default-600 text-sm">
          Ask a workspace editor or admin to start a new analysis.
        </p>
      ) : fromRun && sourceRun.isLoading ? (
        <CardListSkeleton rows={1} />
      ) : fromRun && sourceRun.isError ? (
        <QueryStatePanel
          kind="error"
          title="Could not load the previous run"
          description="Try again to start from the saved inputs."
          onRetry={sourceRun.refetch}
        />
      ) : (
        <>
          {fromRun && !sourceRun.data ? (
            <p role="status" className="text-default-600 text-sm">
              The previous run is unavailable. Choose the inputs for a new analysis.
            </p>
          ) : null}
          <SignedInAnalysisWizard
            key={group.id + ':' + user.id + ':' + (fromRun ?? 'new')}
            sourceRun={sourceRun.data ?? null}
          />
        </>
      )}
    </DashboardPage>
  )
}

function SignedInAnalysisWizard({ sourceRun }: { sourceRun: UpgradeAnalysisRun | null }) {
  const navigate = newAnalysisRoute.useNavigate()
  const { group } = useActiveGroupContext()
  const activeGroupId = group?.id ?? null
  const activeLeague = group?.league ?? null
  const { data: currentUser } = useCurrentUser()
  const { data: profile } = useMyProfile()
  const targetUserId = currentUser?.id ?? null
  const membersQuery = useGroupMembers(activeGroupId)
  const currentMember = membersQuery.data?.find((member) => member.user.id === targetUserId)
  const { triggerSync, isBusy: syncingCharacters, canSync } = useCharacterSyncFlow(activeGroupId)
  const { mutateAsync: createBuildTarget } = useCreateBuildTarget()
  const { mutate: setSelectedBuildTargetMutation } = useSetSelectedBuildTarget()
  const { mutateAsync: updateBuildTarget } = useUpdateBuildTarget()
  const { mutate: deleteBuildTarget, isPending: deletingTarget } = useDeleteBuildTarget()
  const { mutateAsync: createBuildTargetStage } = useCreateBuildTargetStage()
  const { mutateAsync: updateBuildTargetStage } = useUpdateBuildTargetStage()
  const { mutateAsync: queueUpgradeAnalysis } = useQueueUpgradeAnalysis()
  const { data: partyBuildTargets } = useGroupPartyBuildTargets(activeGroupId ?? null)
  const { mutateAsync: syncCharacterProfile } = useSyncCharacterProfile()
  const currencyDisplay = useCurrencyStore((s) => s.display)

  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null)
  const [hasManuallySelectedCharacter, setHasManuallySelectedCharacter] = useState(false)
  const [selectedBuildTargetId, setSelectedBuildTargetId] = useState<string | null>(null)
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null)
  const [importName, setImportName] = useState('')
  const [importPayload, setImportPayload] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const [targetPath, setTargetPath] = useState<'saved' | 'import' | null>(null)
  const lastImport = useRef<{ id: string; payload: string; name: string } | null>(null)
  const [budgetChaos, setBudgetChaos] = useState(DEFAULT_LIVE_MARKET_BUDGET_CHAOS)
  const [budgetCurrency, setBudgetCurrency] = useState<'chaos' | 'divine'>('divine')
  const [analysisMode, setAnalysisMode] = useState<UpgradeAnalysisMode>('quick')
  const [stageTreeSpecId, setStageTreeSpecId] = useState<string | null>(null)
  const [stageItemSetId, setStageItemSetId] = useState<string | null>(null)
  const [stageSkillSetId, setStageSkillSetId] = useState<string | null>(null)
  const [stageConfigSetId, setStageConfigSetId] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
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

  const [step, setStep] = useState(0)
  const [submissionPhase, setSubmissionPhase] = useState<string | null>(null)
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const [removeTargetId, setRemoveTargetId] = useState<string | null>(null)
  const removeTargetTrigger = useRef<HTMLButtonElement>(null)
  const [importingTarget, setImportingTarget] = useState(false)
  const submitGuard = useRef(false)
  const importGuard = useRef(false)
  const mounted = useRef(false)
  const seededRunDefaults = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const analysisActionPending = submissionPhase !== null
  const { data: ninjaData } = useNinjaPrices(activeLeague)
  const divinePrice = ninjaData?.divinePrice ?? 0
  const { data: activeCharacters = [] } = useActiveCharacters(activeGroupId)
  const charactersQuery = useMyCharacters(activeGroupId, activeLeague)
  const { data: myCharacters = [], isLoading: myCharactersLoading } = charactersQuery
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

    const storedCharacterId =
      sourceRun?.character_id ?? readStoredSelectedCharacterId(selectedCharacterStorageKey)
    if (storedCharacterId) {
      setSelectedCharacterId(storedCharacterId)
      setHasManuallySelectedCharacter(true)
    }

    setSelectedCharacterStorageHydratedKey(selectedCharacterStorageKey)
  }, [selectedCharacterStorageKey, sourceRun?.character_id])

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

    if (partyConfigHydratedKey === partyConfigStorageKey) return
    const stored =
      sourceRun && selectedCharacterId === sourceRun.character_id
        ? sourceRun.party_config
        : readStoredPartyConfig(partyConfigStorageKey)
    setPartyConfig(stored)
    setSelectedPartyTargetId('')
    setPartyConfigHydratedKey(partyConfigStorageKey)
  }, [partyConfigHydratedKey, partyConfigStorageKey, selectedCharacterId, sourceRun])

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

    if (analysisPrefsHydratedKey === analysisPrefsStorageKey) return
    const stored =
      sourceRun && selectedCharacterId === sourceRun.character_id
        ? {
            analysisMode: sourceRun.analysis_mode,
            budgetChaos: String(sourceRun.budget_chaos),
            budgetCurrency: currencyDisplay,
          }
        : readStoredAnalysisPrefs(analysisPrefsStorageKey, currencyDisplay)
    if (stored) {
      setAnalysisMode(stored.analysisMode)
      setBudgetChaos(stored.budgetChaos)
      setBudgetCurrency(divinePrice > 0 ? stored.budgetCurrency : 'chaos')
    } else {
      setAnalysisMode('quick')
      setBudgetChaos(
        String(
          divinePrice > 0
            ? Math.round(DEFAULT_LIVE_MARKET_BUDGET_DIVINE * divinePrice)
            : DEFAULT_LIVE_MARKET_BUDGET_CHAOS,
        ),
      )
      setBudgetCurrency(divinePrice > 0 ? 'divine' : 'chaos')
    }
    setAnalysisPrefsHydratedKey(analysisPrefsStorageKey)
  }, [
    analysisPrefsHydratedKey,
    analysisPrefsStorageKey,
    currencyDisplay,
    divinePrice,
    selectedCharacterId,
    sourceRun,
  ])

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
  const isImportPath =
    targetPath === 'import' || (!buildTargetsLoading && visibleBuildTargets.length === 0)

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
      visibleBuildTargets.find((target) => target.id === sourceRun?.build_target_id) ??
      visibleBuildTargets.find((target) => target.is_selected) ??
      visibleBuildTargets[0]
    setSelectedBuildTargetId(defaultTarget.id)
  }, [selectedBuildTargetId, sourceRun?.build_target_id, visibleBuildTargets])

  const selectedBuildTargetSummary =
    visibleBuildTargets.find((target) => target.id === selectedBuildTargetId) ?? null
  const buildTargetQuery = useBuildTarget(selectedBuildTargetSummary?.id ?? null)
  const selectedBuildTarget = buildTargetQuery.data ?? selectedBuildTargetSummary

  const stagesQuery = useBuildTargetStages(selectedBuildTarget?.id ?? null)
  const buildTargetStages = useMemo(() => stagesQuery.data ?? [], [stagesQuery.data])
  const [hydratedSetupTargetId, setHydratedSetupTargetId] = useState<string | null>(null)
  useEffect(() => {
    if (
      !selectedBuildTarget ||
      buildTargetQuery.isPending ||
      stagesQuery.isPending ||
      stagesQuery.isError
    )
      return
    if (hydratedSetupTargetId === selectedBuildTarget.id) return

    const metadata = selectedBuildTarget.import_metadata
    const rerun = sourceRun?.build_target_id === selectedBuildTarget.id ? sourceRun : null
    const sourceStage = buildTargetStages.find((stage) => stage.id === rerun?.target_stage_id)
    const savedStage =
      buildTargetStages.find((stage) => stage.id === selectedBuildTarget.selected_stage_id) ??
      buildTargetStages[0]
    setSelectedStageId((sourceStage ?? savedStage)?.id ?? null)
    const setup = resolveAnalysisPobSetup(metadata, rerun?.summary, sourceStage, savedStage)
    setStageTreeSpecId(setup.treeSpecId)
    setStageItemSetId(setup.itemSetId)
    setStageSkillSetId(setup.skillSetId)
    setStageConfigSetId(setup.configSetId)
    setDraftSearchConstraints(rerun?.search_constraints ?? DEFAULT_SEARCH_CONSTRAINTS)
    setHydratedSetupTargetId(selectedBuildTarget.id)
    if (rerun && !seededRunDefaults.current) {
      seededRunDefaults.current = true
      setStep(2)
    }
  }, [
    buildTargetStages,
    buildTargetQuery.isPending,
    hydratedSetupTargetId,
    selectedBuildTarget,
    sourceRun,
    stagesQuery.isError,
    stagesQuery.isPending,
  ])

  const targetRunsQuery = useUpgradeAnalysisRuns(
    activeGroupId,
    targetUserId,
    selectedBuildTarget?.id ?? null,
  )
  const latestLiveRun = getLatestLiveRun(targetRunsQuery.data ?? [])
  const targetRunsUnavailable = targetRunsQuery.isError && targetRunsQuery.data === undefined
  const { data: runtimeEstimate } = useAnalysisRuntimeEstimate(analysisMode)
  const runtimeEstimateSummary = formatRuntimeEstimateSummary(runtimeEstimate)
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
  const draftRareSearchOptions = useMemo(
    () => getRareStageSearchOptions(selectedBuildTarget?.import_metadata, stageItemSetId),
    [selectedBuildTarget?.import_metadata, stageItemSetId],
  )

  const { data: sourcePlans } = useUpgradeRecommendationPlans(
    sourceRun?.status === 'completed' || sourceRun?.status === 'partial' ? sourceRun.id : null,
    sourceRun?.status ?? null,
    sourceRun?.completed_at,
  )
  const recommendedRareSlotKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const plan of sourcePlans ?? []) {
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
  }, [sourcePlans])
  const recommendedDraftRareSearchOptions = useMemo(
    () =>
      sourceRun?.build_target_id !== selectedBuildTarget?.id || recommendedRareSlotKeys.size === 0
        ? draftRareSearchOptions
        : draftRareSearchOptions.filter((option) => recommendedRareSlotKeys.has(option.slot)),
    [
      draftRareSearchOptions,
      recommendedRareSlotKeys,
      selectedBuildTarget?.id,
      sourceRun?.build_target_id,
    ],
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
  const draftSearchConstraintChips = useMemo(
    () => summarizeUpgradeSearchConstraints(normalizedDraftSearchConstraints),
    [normalizedDraftSearchConstraints],
  )
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
  function chooseBuildTarget(target: Pick<BuildTarget, 'id' | 'group_id' | 'user_id'>) {
    setSelectedBuildTargetId(target.id)
    setSelectedBuildTargetMutation(target, {
      onError: () =>
        setActionMessage(
          'Could not save this as your default target. You can still use it in this run.',
        ),
    })
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

  async function handleImport() {
    if (!activeGroupId || !targetUserId || !selectedCharacter || importGuard.current) return

    const payload = importPayload.trim()
    if (!payload) {
      setImportError('Paste a PoB share code or XML export first.')
      return
    }

    setImportError(null)
    setActionMessage(null)
    const name = importName.trim() || `${selectedCharacter.name} target`
    const previous = lastImport.current
    const existing = previous?.payload === payload && previous.name === name
      ? visibleBuildTargets.find((target) => target.id === previous.id)
      : null
    if (existing) {
      if (selectedBuildTargetId !== existing.id) chooseBuildTarget(existing)
      setStep(2)
      return
    }

    importGuard.current = true
    setImportingTarget(true)

    try {
      const parsed = await parsePobImport(payload)
      if (!mounted.current) return
      const compatibility = summarizeCompatibility({
        treeCount: parsed.metadata.tree_specs.length,
        itemCount: parsed.metadata.item_sets.length,
        skillCount: parsed.metadata.skill_sets.length,
      })
      if (compatibility.status === 'unsupported') throw new Error(compatibility.notes)
      const created = await createBuildTarget({
        group_id: activeGroupId,
        user_id: targetUserId,
        character_id: selectedCharacter.id,
        name,
        source_kind: parsed.source_kind,
        raw_import: payload,
        raw_xml: parsed.raw_xml,
        import_metadata: parsed.metadata,
        compatibility_status: compatibility.status,
        compatibility_notes: compatibility.notes,
      })

      if (!mounted.current) return
      lastImport.current = { id: created.id, payload, name }
      chooseBuildTarget({ id: created.id, group_id: created.group_id, user_id: created.user_id })
      setTargetPath('import')
      setStep(2)
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Failed to decode the PoB import.')
      setActionMessage(null)
    } finally {
      importGuard.current = false
      if (mounted.current) setImportingTarget(false)
    }
  }

  async function ensureAnalysisStage() {
    if (!selectedBuildTarget) {
      throw new Error('Select or import a target first.')
    }

    const metadata = selectedBuildTarget.import_metadata
    const treeSpec = findPobTreeSpec(metadata.tree_specs, stageTreeSpecId)
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

  async function handleQueueAnalysis() {
    if (
      !activeGroupId ||
      !selectedBuildTarget ||
      !selectedCharacter ||
      latestLiveRun ||
      submitGuard.current
    )
      return
    submitGuard.current = true
    setSubmissionError(null)
    setSubmissionPhase('Syncing character')
    const effectiveBudgetChaos = analysisMode === 'thorough' ? normalizedBudgetChaos : 0
    const effectiveSearchConstraints =
      analysisMode === 'thorough' ? normalizedDraftSearchConstraints : DEFAULT_SEARCH_CONSTRAINTS

    try {
      await syncCharacterProfile({
        groupId: activeGroupId,
        characterId: selectedCharacter.id,
      }).catch(() => {})
      if (!mounted.current) return
      setSubmissionPhase('Saving PoB setup')
      const targetStage = await ensureAnalysisStage()
      if (!mounted.current) return

      const changedSlots = sourceRun
        ? getChangedSearchConstraintSlots(sourceRun.search_constraints, effectiveSearchConstraints)
        : []
      const rerunBaseRunId =
        sourceRun &&
        analysisMode === 'thorough' &&
        (sourceRun.status === 'completed' || sourceRun.status === 'partial') &&
        sourceRun.analysis_mode === 'thorough' &&
        sourceRun.build_target_id === selectedBuildTarget.id &&
        sourceRun.target_stage_id === targetStage.id &&
        sourceRun.character_id === selectedCharacter.id &&
        sourceRun.budget_chaos === effectiveBudgetChaos &&
        changedSlots.length > 0 &&
        arePartyConfigsEquivalent(sourceRun.party_config, partyConfig)
          ? sourceRun.id
          : undefined

      setSubmissionPhase('Starting analysis')
      const { run } = await queueUpgradeAnalysis({
        group_id: activeGroupId,
        build_target_id: selectedBuildTarget.id,
        character_id: selectedCharacter.id,
        target_stage_id: targetStage.id,
        budget_chaos: effectiveBudgetChaos,
        analysis_mode: analysisMode,
        search_constraints: effectiveSearchConstraints,
        party_config: partyConfig.length ? partyConfig : undefined,
        rerun_base_run_id: rerunBaseRunId,
        rerun_changed_slots: rerunBaseRunId ? changedSlots : undefined,
      })
      if (mounted.current) {
        await navigate({
          to: '/dashboard/analysis/runs/$runId',
          params: { runId: run.id },
          replace: true,
        })
      }
    } catch (error) {
      if (mounted.current) {
        setSubmissionError(
          error instanceof Error ? error.message : 'Could not start analysis. Try again.',
        )
      }
    } finally {
      submitGuard.current = false
      if (mounted.current) setSubmissionPhase(null)
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
  if (membersQuery.isLoading || myCharactersLoading) {
    return <CardListSkeleton rows={4} />
  }

  const isReview = step === wizardSteps.length - 1
  const setupReady =
    !!selectedBuildTarget &&
    hydratedSetupTargetId === selectedBuildTarget.id &&
    !stagesQuery.isError
  const mayContinue =
    step === 0
      ? !!selectedCharacter
      : step === 1
        ? isImportPath
          ? !!selectedCharacter && !!importPayload.trim()
          : !!selectedBuildTarget && selectedBuildTarget.compatibility_status !== 'unsupported'
        : setupReady &&
          (step < 3 ||
            analysisMode === 'quick' ||
            (budgetChaos.trim() !== '' &&
              Number.isFinite(Number(budgetChaos)) &&
              Number(budgetChaos) >= 0))
  const reviewRows = [
    { label: 'Character', value: selectedCharacter?.name },
    { label: 'PoB target', value: selectedBuildTarget?.name },
    ...(selectedBuildTarget ? getAnalysisPobLayoutLabels(selectedBuildTarget.import_metadata, currentSetup) : []),
    {
      label: 'Analysis options',
      value: [
        getAnalysisModeLabel(analysisMode),
        analysisMode === 'thorough'
          ? formatCurrencyAmount(normalizedBudgetChaos, budgetCurrency, divinePrice)
          : null,
        partyConfig.length
          ? partyConfig.length + (partyConfig.length === 1 ? ' party build' : ' party builds')
          : null,
      ]
        .filter(Boolean)
        .join(' · '),
    },
  ]

  return (
    <AnalysisWizard
      steps={wizardSteps}
      activeStep={step}
      focusOnMount
      title={wizardHeadings[step]}
      description={wizardDescriptions[step]}
      backAction={
        step > 0 ? (
          <Button
            variant="secondary"
            isDisabled={analysisActionPending || importingTarget || deletingTarget}
            onPress={() => setStep(step - 1)}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Back
          </Button>
        ) : null
      }
      primaryAction={
        <Button
          isDisabled={
            !mayContinue ||
            deletingTarget ||
            (isReview && (targetRunsQuery.isPending || targetRunsUnavailable || !!latestLiveRun))
          }
          isPending={analysisActionPending || (step === 1 && importingTarget)}
          onPress={() => {
            if (isReview) void handleQueueAnalysis()
            else if (step === 1 && isImportPath) void handleImport()
            else {
              if (step === 0) setHasManuallySelectedCharacter(true)
              setStep(step + 1)
            }
          }}
        >
          {({ isPending }) => (
            <PendingButtonContent isPending={isPending}>
              {isReview ? 'Start analysis' : step === 1 && isImportPath ? 'Read PoB and continue' : 'Continue'}
              {!isPending && !isReview ? <ArrowRight size={16} aria-hidden="true" /> : null}
            </PendingButtonContent>
          )}
        </Button>
      }
    >
      {step === 0 ? (
        myCharacters.length ? (
          <SelectField
            label="Character"
            aria-label="Select character for optimization"
            selectedKey={selectedCharacterId ?? null}
            onSelectionChange={(key) => {
              const value = toStringKey(key)
              setHasManuallySelectedCharacter(true)
              setSelectedCharacterId(value)
              setImportName('')
              setImportPayload('')
              setImportError(null)
              setTargetPath(null)
              setRemoveTargetId(null)
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
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-default-600 text-sm">Sync your PoE characters to get started.</p>
            <Button
              variant="secondary"
              isPending={syncingCharacters}
              isDisabled={!activeGroupId || !canSync}
              onPress={() => {
                if (activeGroupId) void triggerSync(activeGroupId)
              }}
            >
              Sync characters
            </Button>
          </div>
        )
      ) : null}
      {step === 1 ? (
        <div className="grid gap-4">
          {buildTargetsQuery.isError && !buildTargetsQuery.data && targetPath !== 'import' ? (
            <QueryStatePanel
              kind="error"
              title="Could not load saved targets"
              description="Retry to see the PoB targets for this character."
              onRetry={buildTargetsQuery.refetch}
            />
          ) : null}
          {isImportPath ? (
            <>
              {visibleBuildTargets.length > 0 ? (
                <Button
                  size="sm"
                  variant="tertiary"
                  className="justify-self-start"
                  onPress={() => setTargetPath('saved')}
                  isDisabled={importingTarget}
                >
                  Use a saved target
                </Button>
              ) : null}
              <AnalysisPobImportFields
                value={importPayload}
                onValueChange={(value) => {
                  setImportPayload(value)
                  setImportError(null)
                }}
                name={importName}
                onNameChange={setImportName}
                isPending={importingTarget}
                error={importError}
                savedSources={
                  currentMember?.user.pob_code || currentMember?.user.pob_support_code ? (
                    <>
                      {currentMember.user.pob_code ? (
                        <Button
                          size="sm"
                          variant="tertiary"
                          isDisabled={importingTarget}
                          onPress={() => {
                            setImportPayload(currentMember.user.pob_code ?? '')
                            setImportName(`${selectedCharacter?.name ?? 'Character'} main target`)
                            setImportError(null)
                          }}
                        >
                          Use saved main PoB
                        </Button>
                      ) : null}
                      {currentMember.user.pob_support_code ? (
                        <Button
                          size="sm"
                          variant="tertiary"
                          isDisabled={importingTarget}
                          onPress={() => {
                            setImportPayload(currentMember.user.pob_support_code ?? '')
                            setImportName(`${selectedCharacter?.name ?? 'Character'} support target`)
                            setImportError(null)
                          }}
                        >
                          Use saved support PoB
                        </Button>
                      ) : null}
                    </>
                  ) : null
                }
              />
            </>
          ) : (
            <>
              {buildTargetsLoading ? (
                <p role="status" className="text-default-600 text-sm">Loading saved targets…</p>
              ) : null}
              {visibleBuildTargets.length ? (
                <fieldset className="grid min-w-0 gap-2">
                  <legend className="text-foreground mb-2 text-sm font-medium">Saved PoB targets</legend>
                  {visibleBuildTargets.map((target) => {
                    const confirmingRemoval = removeTargetId === target.id
                    return (
                      <div
                        key={target.id}
                        className="border-control has-checked:bg-selected min-w-0 rounded-lg border"
                      >
                        <div className="flex items-center gap-1 pr-1">
                          <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 py-2.5 pr-1 pl-3">
                            <input
                              className="mt-0.5 size-4 shrink-0 accent-accent"
                              type="radio"
                              name="saved-pob-target"
                              value={target.id}
                              checked={selectedBuildTargetId === target.id}
                              disabled={deletingTarget}
                              onChange={() => {
                                setRemoveTargetId(null)
                                chooseBuildTarget(target)
                              }}
                            />
                            <span className="min-w-0 text-sm">
                              <span className="text-foreground block font-medium wrap-anywhere">
                                {target.name}
                              </span>
                              {target.compatibility_status !== 'compatible' ? (
                                <span className="text-default-600 mt-1 block wrap-anywhere">
                                  {target.compatibility_notes ?? target.compatibility_status}
                                </span>
                              ) : null}
                            </span>
                          </label>
                          <Button
                            ref={confirmingRemoval ? removeTargetTrigger : undefined}
                            isIconOnly
                            variant="ghost"
                            className="text-default-500 size-11 shrink-0"
                            aria-label={`Remove ${target.name}`}
                            aria-expanded={confirmingRemoval}
                            aria-controls={confirmingRemoval ? `confirm-remove-${target.id}` : undefined}
                            isDisabled={deletingTarget}
                            onPress={() => setRemoveTargetId(confirmingRemoval ? null : target.id)}
                          >
                            <X size={16} aria-hidden="true" />
                          </Button>
                        </div>
                        {confirmingRemoval ? (
                          <div
                            id={`confirm-remove-${target.id}`}
                            className="border-divider flex flex-wrap items-center gap-2 border-t px-3 py-2"
                          >
                            <p className="text-default-600 text-sm">
                              Removing this target also removes its saved runs.
                            </p>
                            <Button
                              size="sm"
                              variant="tertiary"
                              isDisabled={deletingTarget}
                              onPress={() => {
                                removeTargetTrigger.current?.focus()
                                setRemoveTargetId(null)
                              }}
                            >
                              Keep target
                            </Button>
                            <Button
                              size="sm"
                              variant="danger-soft"
                              isPending={deletingTarget}
                              onPress={() => {
                                deleteBuildTarget(target, {
                                  onSuccess: () => setRemoveTargetId(null),
                                  onError: () =>
                                    setActionMessage('Could not remove the target. Try again.'),
                                })
                              }}
                            >
                              Remove target
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </fieldset>
              ) : null}
              <Button
                variant="secondary"
                className="justify-self-start"
                isDisabled={deletingTarget}
                onPress={() => {
                  setRemoveTargetId(null)
                  setTargetPath('import')
                }}
              >
                Import a PoB target
              </Button>
            </>
          )}
        </div>
      ) : null}
      {step === 2 ? (
        stagesQuery.isError ? (
          <QueryStatePanel
            kind="error"
            title="Could not load PoB setup"
            description="Try again to load the saved layout selections."
            onRetry={stagesQuery.refetch}
          />
        ) : selectedBuildTarget && setupReady ? (
          <div className="grid gap-4">
            <p className="text-foreground text-sm font-medium wrap-anywhere">
              {selectedBuildTarget.name}
            </p>
            {loadoutOptions.length > 0 ? (
              <SelectField
                label="Loadout"
                aria-label="Select loadout"
                selectedKey={selectedLoadoutKey ?? null}
                description="Apply the tree, item set, skill set, and configuration that share this name."
                onSelectionChange={(key) => {
                  const loadout = loadoutOptions.find((option) => option.key === toStringKey(key))
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
            ) : null}
            <AnalysisPobSetupFields
              metadata={selectedBuildTarget.import_metadata}
              selection={currentSetup}
              onSelectionChange={(field, value) => {
                const setSelection = {
                  treeSpecId: setStageTreeSpecId,
                  itemSetId: setStageItemSetId,
                  skillSetId: setStageSkillSetId,
                  configSetId: setStageConfigSetId,
                }
                setSelection[field](value)
              }}
            />
          </div>
        ) : (
          <p role="status" className="text-default-600 text-sm">
            Loading PoB setup…
          </p>
        )
      ) : null}
      {step === 3 ? (
        <div className="grid gap-5">
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
                className="rounded-large border-control data-[selected=true]:border-highlight h-auto w-full min-w-0 justify-start border p-3 text-left whitespace-normal [--toggle-button-bg-hover:var(--surface-secondary)] [--toggle-button-bg:var(--surface)]"
              >
                <span className="flex w-full min-w-0 flex-col gap-2">
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-foreground text-sm font-semibold">{option.label}</span>
                    <Chip size="sm" variant="soft">
                      {option.key === 'thorough' ? 'Minutes' : 'Fast'}
                    </Chip>
                  </span>
                  <span className="text-default-500 text-sm wrap-anywhere">
                    {option.description}
                  </span>
                </span>
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          {analysisMode === 'thorough' ? (
            <>
              {renderBudgetInput('max-w-56')}
              {renderTradeSearchRelaxationControls()}
              <details className="border-divider rounded-xl border p-4">
                <summary className="text-foreground cursor-pointer text-sm font-medium">
                  Tune trade search by item slot
                </summary>
                <div className="mt-4">{renderManualTuningEditor()}</div>
              </details>
            </>
          ) : null}
          <div className="border-divider border-t pt-5">
            <div className="flex flex-col gap-2">
              <p className="text-default-500 text-xs font-semibold tracking-wide uppercase">
                Party configuration{' '}
                <span className="text-default-400 font-normal normal-case">(optional)</span>
              </p>
              <p className="text-default-400 text-xs">
                Saved per character on this browser so your usual support setup comes back when you
                switch characters.
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
                            setPartyConfig((prev) => prev.filter((_, entryIdx) => entryIdx !== idx))
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
                                  (e) => e.kind === 'group_member' && e.build_target_id === bt.id,
                                ),
                            )
                            .map((bt) => (
                              <ListBox.Item
                                id={bt.id}
                                key={bt.id}
                                textValue={`${bt.display_name ?? bt.poe_account_name ?? 'Unknown'} - ${bt.name}`}
                              >
                                {bt.display_name ?? bt.poe_account_name ?? 'Unknown'} — {bt.name}
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
                        No group members have saved a support PoB code yet. Ask them to add one on
                        the Members page.
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
          </div>
        </div>
      ) : null}
      {isReview ? (
        <div className="grid gap-4">
          <dl className="border-divider divide-divider divide-y rounded-xl border px-4">
            {reviewRows.map(({ label, value }, index) => (
              <div
                key={label}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-3"
              >
                <dt className="text-default-600 text-sm">{label}</dt>
                <dd className="text-foreground col-start-1 text-sm font-medium wrap-anywhere">
                  {value ?? 'Unavailable'}
                </dd>
                <dd className="col-start-2 row-span-2 row-start-1">
                  <Button
                    size="sm"
                    variant="tertiary"
                    aria-label={'Edit ' + label}
                    isDisabled={analysisActionPending}
                    onPress={() => setStep(index)}
                  >
                    Edit
                  </Button>
                </dd>
              </div>
            ))}
          </dl>
          {runtimeEstimateSummary ? (
            <p className="text-default-600 text-sm">{runtimeEstimateSummary}</p>
          ) : null}
          {profile && !hasActiveProAccess(profile) ? (
            <p className="text-default-600 text-sm">
              Community includes {FREE_DAILY_UPGRADE_ANALYSIS_LIMIT} new analyses per UTC day to
              keep computing costs manageable.{' '}
              <Link to="/dashboard/support" className="text-brand-readable underline underline-offset-2">
                Optional Supporter access
              </Link>{' '}
              helps cover the cost of additional runs.
            </p>
          ) : null}
          {latestLiveRun ? (
            <p className="text-default-600 text-sm">
              This target already has an active run.{' '}
              <Link
                to="/dashboard/analysis/runs/$runId"
                params={{ runId: latestLiveRun.id }}
                className="text-brand-readable hover:underline"
              >
                View active run
              </Link>
            </p>
          ) : null}
          {targetRunsQuery.isPending ? (
            <p role="status" className="text-default-600 text-sm">
              Checking for an active run…
            </p>
          ) : null}
          {targetRunsUnavailable ? (
            <div className="flex flex-wrap items-center gap-2">
              <p role="alert" className="text-danger text-sm">
                Could not check for an active run.
              </p>
              <Button variant="tertiary" size="sm" onPress={() => void targetRunsQuery.refetch()}>
                Try again
              </Button>
            </div>
          ) : null}
          {submissionPhase ? (
            <p role="status" className="text-default-600 text-sm">
              {submissionPhase}…
            </p>
          ) : null}
          {submissionError ? (
            <p role="alert" className="text-danger text-sm wrap-anywhere">
              {submissionError}
            </p>
          ) : null}
        </div>
      ) : null}
      {actionMessage ? (
        <p role="status" className="text-default-600 mt-3 text-sm wrap-anywhere">
          {actionMessage}
        </p>
      ) : null}
    </AnalysisWizard>
  )
}

function statusLabel(run: UpgradeAnalysisRun) {
  if (run.stale_reason === 'user-cancelled') return 'Cancelled'
  if (run.status === 'stale') return 'Historical'
  if (run.status === 'completed') return 'Completed'
  if (run.status === 'partial') return 'Partial results'
  return run.status === 'failed' ? 'Failed' : run.status === 'queued' ? 'Queued' : 'Running'
}

function RerunLink({ runId, children }: { runId: string; children: ReactNode }) {
  return (
    <Link
      to="/dashboard/analysis/new"
      search={{ fromRun: runId }}
      className="button button--sm button--secondary"
    >
      {children}
    </Link>
  )
}

export function AnalysisRunPage() {
  const { runId } = analysisRunRoute.useParams()
  const { group, capabilities } = useActiveGroupContext()
  const { data: user } = useCurrentUser()
  const groupId = capabilities?.supportsOptimizer ? (group?.id ?? null) : null
  const userId = user?.id ?? null
  const runQuery = useMyAnalysisRun(
    groupId,
    userId,
    z.guid().safeParse(runId).success ? runId : null,
  )
  const run = runQuery.data
  const scopedGroupId = run ? groupId : null
  const { data: characters } = useMyCharacters(scopedGroupId, group?.league)
  const { data: targets } = useBuildTargets(scopedGroupId, userId)
  const character = characters?.find((entry) => entry.id === run?.character_id) ?? null
  const target = targets?.find((entry) => entry.id === run?.build_target_id) ?? null
  const role = useMyGroupRole(groupId)
  const canQueue = role === 'admin' || role === 'editor'
  const headingRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    headingRef.current?.focus()
  }, [runId])

  return (
    <DashboardPage>
      <DashboardPageHeader
        title={
          <span ref={headingRef} tabIndex={-1} className="focus:outline-none">
            Analysis run
          </span>
        }
        backLink={<AnalysisBackLink />}
        description={
          run
            ? [character?.name ?? 'Character', target?.name ?? 'PoB target'].join(' compared with ')
            : undefined
        }
        metadata={
          run ? (
            <>
              <Chip
                size="sm"
                variant="soft"
                color={
                  run.status === 'completed'
                    ? 'success'
                    : run.status === 'failed'
                      ? 'danger'
                      : run.status === 'partial' || run.status === 'stale'
                        ? 'warning'
                        : 'default'
                }
              >
                {statusLabel(run)}
              </Chip>
              <span className="text-default-600 text-sm">
                {getAnalysisModeLabel(run.analysis_mode)}
              </span>
            </>
          ) : undefined
        }
      />
      {!group || !user || runQuery.isLoading ? (
        <CardListSkeleton rows={1} />
      ) : runQuery.isError && !run ? (
        <QueryStatePanel
          kind="error"
          title="Could not load analysis"
          description="Try again to check this run’s status."
          onRetry={runQuery.refetch}
        />
      ) : !run || !groupId || !userId ? (
        <QueryStatePanel
          kind="empty"
          title="Analysis run unavailable"
          description="This run is no longer available in the current workspace."
        />
      ) : (
        <>
          {runQuery.isError ? (
            <QueryFreshnessNotice
              refreshFailed
              isRefreshing={runQuery.isFetching}
              onRetry={runQuery.refetch}
            />
          ) : null}
          {run.status === 'queued' || run.status === 'running' ? (
            <SignedInRunProgress
              key={run.id}
              run={run}
              canCancel={run.queued_by === userId}
              refresh={runQuery.refetch}
            />
          ) : run.status === 'failed' ||
            run.stale_reason === 'user-cancelled' ||
            (run.status === 'stale' && !run.completed_at) ? (
            <div className="border-divider bg-surface grid max-w-2xl justify-items-start gap-3 rounded-xl border p-5">
              <div role={run.status === 'failed' ? 'alert' : undefined}>
                <h2 className="text-foreground font-semibold">
                  {run.status === 'failed'
                    ? 'Analysis failed'
                    : run.stale_reason === 'user-cancelled'
                      ? 'Analysis cancelled'
                      : 'Analysis ended before results were ready'}
                </h2>
                <p className="text-default-600 mt-1 text-sm">
                  {run.status === 'failed'
                    ? 'Recommendations could not be generated. Review your inputs and try again.'
                    : run.stale_reason === 'user-cancelled'
                      ? 'This run was cancelled before it finished.'
                      : formatStaleReason(run.stale_reason)}
                </p>
              </div>
              {canQueue ? <RerunLink runId={run.id}>Try again</RerunLink> : null}
            </div>
          ) : (
            <AnalysisRunResults
              key={run.id}
              selectedRun={run}
              target={target}
              selectedCharacter={character}
              league={group.league}
              canPromote={canQueue}
            />
          )}
        </>
      )}
    </DashboardPage>
  )
}

function SignedInRunProgress({
  run,
  canCancel,
  refresh,
}: {
  run: UpgradeAnalysisRun
  canCancel: boolean
  refresh: () => Promise<unknown>
}) {
  const [now, setNow] = useState(Date.now)
  const [error, setError] = useState<string | null>(null)
  const { mutateAsync: cancelRun, isPending: cancelling } = useCancelUpgradeAnalysis()
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  const wait = getTradeRateLimitWaitInfo(run, now)
  const timeline = getRunPhaseTimeline(run)
  async function handleCancel() {
    setError(null)
    try {
      await cancelRun({
        run_id: run.id,
        group_id: run.group_id,
        target_user_id: run.target_user_id,
        build_target_id: run.build_target_id,
      })
    } catch {
      setError('Could not cancel this run. Check its current status and try again.')
      void refresh()
    }
  }

  return (
    <div className="grid gap-3">
      <AnalysisRunProgress
        status={run.status === 'queued' ? 'queued' : 'running'}
        phase={
          wait ? 'Waiting for trade cooldown' : (getAnalysisPhaseLabel(run.summary) ?? undefined)
        }
        elapsed={formatElapsedSince(run.started_at ?? run.created_at, now) ?? undefined}
        statusDetail={
          wait
            ? 'Resumes automatically in about ' + formatCountdown(wait.remainingMs) + '.'
            : undefined
        }
        returnNote="You can leave this page. The top bar will let you know when your analysis is ready."
        actions={
          canCancel ? (
            <Button
              size="sm"
              variant="danger-soft"
              isPending={cancelling}
              onPress={() => void handleCancel()}
            >
              Cancel run
            </Button>
          ) : undefined
        }
        timeline={
          run.status === 'running' && timeline.some((entry) => entry.status !== 'pending') ? (
            <details>
              <summary className="text-default-600 cursor-pointer text-sm font-medium">
                Run progress
              </summary>
              <ol className="mt-3 grid gap-2">
                {timeline.map((entry) => {
                  const Icon =
                    entry.status === 'done'
                      ? Check
                      : entry.status === 'active'
                        ? ArrowRight
                        : Circle
                  return (
                    <li
                      key={entry.id}
                      aria-current={entry.status === 'active' ? 'step' : undefined}
                      className="text-default-600 flex items-center gap-2 text-sm"
                    >
                      <Icon size={14} aria-hidden="true" />
                      <span className="sr-only">
                        {entry.status === 'done'
                          ? 'Completed: '
                          : entry.status === 'active'
                            ? 'In progress: '
                            : 'Pending: '}
                      </span>
                      {entry.label}
                    </li>
                  )
                })}
              </ol>
            </details>
          ) : undefined
        }
      />
      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function AnalysisRunResults({
  selectedRun,
  target,
  selectedCharacter,
  league,
  canPromote,
}: {
  selectedRun: UpgradeAnalysisRun
  target: BuildTarget | null
  selectedCharacter: MyCharacter | null
  league: string | null
  canPromote: boolean
}) {
  const [partyBuffDetailOpen, setPartyBuffDetailOpen] = useState(false)
  const [configInsightDetailOpen, setConfigInsightDetailOpen] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const currencyDisplay = useCurrencyStore((state) => state.display)
  const { data: ninjaData } = useNinjaPrices(league)
  const divinePrice = ninjaData?.divinePrice ?? 0
  const { data: detailedTarget } = useBuildTarget(selectedRun.build_target_id)
  const runTarget = detailedTarget ?? target
  const { data: buildTargetStages } = useBuildTargetStages(selectedRun.build_target_id)
  const { data: characterProfiles } = useCharacterProfiles(selectedRun.group_id)
  const selectedCharacterProfile =
    characterProfiles?.find(
      (profile) =>
        profile.user_id === selectedRun.target_user_id &&
        profile.character_id === selectedRun.character_id,
    ) ?? null
  const { mutateAsync: promoteRecommendation, isPending: promotingRecommendation } =
    usePromoteUpgradeRecommendation()
  const plansQuery = useUpgradeRecommendationPlans(
    selectedRun.id,
    selectedRun.status,
    selectedRun.completed_at,
  )
  const recommendationPlans = useMemo(() => plansQuery.data ?? [], [plansQuery.data])
  const retryRecommendations = plansQuery.refetch
  const recommendationsFailed = plansQuery.isError
  const markOpened = useMarkAnalysisOpened(selectedRun.group_id, selectedRun.target_user_id)
  const selectedRunPlanCount = getSummaryNumber(selectedRun.summary, 'generated_plan_count')
  const selectedRunBlockers = getSummaryList(selectedRun.summary, 'blockers')
  const selectedRunAppliedPartyCount = getSummaryNumber(selectedRun.summary, 'applied_party_count')
  const completionTime = selectedRun.completed_at ? Date.parse(selectedRun.completed_at) : NaN
  const [retryWindowEnded, setRetryWindowEnded] = useState(false)
  const awaitingSavedPlans =
    !recommendationsFailed &&
    selectedRun.status !== 'stale' &&
    selectedRunPlanCount !== 0 &&
    recommendationPlans.length === 0 &&
    Date.now() - completionTime < 30_000
  useEffect(() => {
    if (!awaitingSavedPlans) return
    const timer = window.setTimeout(
      () => setRetryWindowEnded(true),
      Math.max(0, completionTime + 30_000 - Date.now()),
    )
    return () => window.clearTimeout(timer)
  }, [awaitingSavedPlans, completionTime])
  const pendingPlans = plansQuery.isPending || (awaitingSavedPlans && !retryWindowEnded)
  useEffect(() => {
    if (!pendingPlans && !recommendationsFailed) markOpened(selectedRun.id)
  }, [markOpened, pendingPlans, recommendationsFailed, selectedRun.id])

  const reservationAuditAnchorId = 'reservation-audit-' + selectedRun.id
  const selectedRunStage = buildTargetStages?.find(
    (stage) => stage.id === selectedRun.target_stage_id,
  )
  const runTrees = runTarget?.import_metadata.tree_specs ?? []
  const recordedTreeSpec = findResolvedPobTreeSpec(runTrees, selectedRun.summary.resolved_tree_spec_id)
  const savedStage =
    selectedRunStage ?? buildTargetStages?.find((stage) => stage.id === runTarget?.selected_stage_id)
  const recommendationStageTreeSpec =
    recordedTreeSpec ??
    findPobTreeSpec(runTrees, savedStage?.tree_spec_id) ??
    findPobTreeSpec(runTrees, runTarget?.import_metadata.active_tree_spec_id) ??
    runTrees[0] ??
    null
  const recommendationStageSkillSet = findPobLayout(
    runTarget?.import_metadata.skill_sets ?? [],
    selectedRun.summary.resolved_skill_set_id,
    selectedRunStage?.skill_set_id,
  )
  const layoutRows = getAnalysisPobResultLayoutLabels(
    runTarget?.import_metadata,
    selectedRun.summary,
    selectedRunStage,
  )
  const recommendationStageLabel = getSetupDisplayLabel(
    getSummaryText(selectedRun.summary, 'target_stage_label') ?? selectedRunStage?.label,
  )
  const { data: ninjaGemIcons } = useQuery({
    queryKey: queryKeys.ninja.gemIcons,
    queryFn: () => fetchNinjaSkillGemIcons('poe1'),
    staleTime: 1000 * 60 * 60,
  })
  const gemVisualLookup = useMemo(
    () => buildGemVisualLookup(selectedCharacterProfile, ninjaGemIcons ?? []),
    [ninjaGemIcons, selectedCharacterProfile],
  )
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
  async function handlePromote(planId: string) {
    try {
      await promoteRecommendation(planId)
      setActionMessage('Recommendation added to Gear Planning.')
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Failed to promote recommendation.')
    }
  }

  if (pendingPlans) {
    return <AnalysisRunProgress status="finalizing" />
  }
  if (recommendationsFailed && !recommendationPlans.length) {
    return (
      <QueryStatePanel
        kind="error"
        title="Could not load recommendations"
        description="Try again to open the saved results."
        onRetry={retryRecommendations}
      />
    )
  }

  return (
    <div className="grid min-w-0 gap-4">
      <p className="sr-only" role="status">
        {selectedRun.status === 'partial' ? 'Partial analysis ready' : 'Analysis results ready'}
      </p>
      {actionMessage ? (
        <p role="status" className="text-default-600 text-sm">
          {actionMessage}
        </p>
      ) : null}
      <Card role="region" aria-labelledby="analysis-recommendations" className="min-w-0 gap-0 p-0">
        <Card.Header className="px-4 pt-4 pb-0">
          <div className="flex flex-1 flex-wrap items-start justify-between gap-3">
            <div>
              <h2
                id="analysis-recommendations"
                tabIndex={-1}
                className="text-foreground text-base font-semibold"
              >
                Recommendations
              </h2>
              <p className="text-default-500 mt-1 text-sm">
                Review upgrades and send useful picks to Gear Planning.
              </p>
            </div>
            <div className="flex min-w-0 flex-wrap gap-2">
              {canPromote &&
              (selectedRun.analysis_mode === 'thorough' || selectedRun.status === 'stale') ? (
                <RerunLink runId={selectedRun.id}>Rerun with adjustments</RerunLink>
              ) : null}
            </div>
          </div>
        </Card.Header>
        <Card.Content className="@container/recommendations px-4 pt-3 pb-4">
          {
            <details className="border-divider mb-4 border-b pb-3">
              <summary className="cursor-pointer text-sm font-medium">Run details</summary>
              <div className="mt-4 flex flex-col gap-4">
                <AnalysisPobResultLayouts rows={layoutRows} />
                {selectedRunMainSkillName ? (
                  <div className="inline-flex max-w-full min-w-0 flex-wrap items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
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
                      className={`text-xs font-medium wrap-anywhere ${getSocketTextColorClass(selectedRunMainSkillVisual?.socketColor ?? null)}`}
                    >
                      {selectedRunMainSkillName}
                    </span>
                  </div>
                ) : null}
                {(selectedRun.party_config.length > 0 && selectedRunAppliedPartyCount !== null) ||
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
                {getDisplayedPartialReason(selectedRun) ? (
                  <p className="text-warning text-sm">
                    {(getSummaryNumber(selectedRun.summary, 'exact_plan_count') ?? 0) > 0
                      ? `Current scope: ${getDisplayedPartialReason(selectedRun)}`
                      : `Partial confidence: ${getDisplayedPartialReason(selectedRun)}`}
                  </p>
                ) : null}
              </div>
            </details>
          }
          <div className="grid grid-cols-1 items-start gap-5 @min-[52rem]/recommendations:grid-cols-[minmax(0,1fr)_19rem]">
            <div className="flex min-w-0 flex-col gap-5">
              {recommendationPlans.length === 0 ? (
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
                  {canPromote ? <RerunLink runId={selectedRun.id}>Run again</RerunLink> : null}
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
                            Historical recommendations
                          </p>
                          <p className="text-default-600 mt-1 text-sm">
                            {formatStaleReason(selectedRun.stale_reason)} The plans below are still
                            visible for reference.
                          </p>
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
                        Compare scores within this run’s section. DPS and effective hit pool show
                        damage and defense per cost. Reservation shows how much an upgrade helps fit
                        the target skills. Check the individual scores and notes for defensive or
                        utility upgrades.
                      </p>
                    </details>
                  ) : null}
                  <div className="flex flex-col gap-5 sm:gap-6">
                    {setupNotePlans.length > 0 ? (
                      <div className="rounded-large border-info/40 bg-info-soft border p-4">
                        <p className="text-foreground text-sm font-semibold">Setup notes</p>
                        <p className="text-default-600 mt-1 text-sm">
                          These are broader setup prerequisites, bundles, or support fixes, not the
                          main item-by-item shopping lane.
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
                                <p className="text-default-500 mt-1 text-sm">{plan.explanation}</p>
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
                                Every rare target item from the selected PoB is exact-scored here in
                                slot order. No relaxation has been applied to items in this section.
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
                          {section.key === 'best_single' && bestSingleTemplateFallbackSummary ? (
                            <p className="text-default-500 text-xs">
                              {bestSingleTemplateFallbackSummary.liveCount > 0
                                ? `Only ${bestSingleTemplateFallbackSummary.liveCount} live rare ${bestSingleTemplateFallbackSummary.liveCount === 1 ? 'listing survived' : 'listings survived'} the current constrained search, so the remaining ${bestSingleTemplateFallbackSummary.templateCount} ${bestSingleTemplateFallbackSummary.templateCount === 1 ? 'slot uses' : 'slots use'} top positive template swaps scored against your configured relaxation baseline. Use rerun to relax further.`
                                : 'No live rare listings survived the current constrained search, so this section falls back to the top positive template swaps scored against your configured relaxation baseline. Use rerun to relax further.'}
                            </p>
                          ) : null}
                          {section.key === 'best_single' && plans.length === 0 ? (
                            <div className="rounded-large border-divider bg-default-50/60 border p-4">
                              <p className="text-default-500 text-sm">
                                No rare upgrades found for this run. The search constraints may be
                                too narrow, or no listings on trade matched the target slots. Try
                                relaxing filters or rerunning analysis with a higher budget.
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
                                        <Chip size="sm" variant="soft">
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
                stageTreeSource={recordedTreeSpec ? 'recorded' : recommendationStageTreeSpec ? 'saved' : null}
                stageSkillSet={recommendationStageSkillSet}
                isDraftStage={false}
                selectedRun={selectedRun}
                selectedRunIsLive={false}
                passiveTreeRefreshToken={0}
                reservationAuditAnchorId={reservationAuditAnchorId}
              />
            </aside>
          </div>
        </Card.Content>
      </Card>

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
                          Party member was found but no buff effects were parsed. The support build
                          may have no active auras or links.
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
                            This run predates detailed configuration insight capture, or the active
                            config set matched PoB defaults.
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
      </>
    </div>
  )
}
