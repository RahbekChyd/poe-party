import {
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Button } from '@heroui/react/button'
import { Chip, type ChipProps } from '@heroui/react/chip'
import { Modal } from '@heroui/react/modal'
import { Spinner } from '@heroui/react/spinner'
import { Award, Check, Copy, ExternalLink, Trophy } from 'lucide-react'
import type {
  UpgradeAnalysisMode,
  UpgradeRecommendationItem,
  UpgradeRecommendationPlan,
} from '../../types/app'
import {
  getModifierSectionMeta,
  shouldDisplayTooltipProperty,
  shouldDisplayTooltipRequirement,
  stripInlineModifierMarker,
} from '../../lib/item-modifier-tooltip'
import {
  getRecommendationDependencies,
  type RecommendationDependency,
} from '../../lib/recommendation-dependencies'
import { usePoeWikiInventoryIcon } from '../../hooks/usePoeWikiInventoryIcon'
import {
  getRecommendationScoreBreakdown,
  shouldShowRecommendationScore,
} from '../../lib/recommendation-score'
import {
  formatCompareImpact,
  formatCompareImpactPercent,
  formatCompareSecondaryImpact,
  formatCompareSecondaryImpactPercent,
  type ComparePowerRow,
} from '../../lib/compare-power-report'
import { formatCurrencyAmount } from '../../lib/utils'
import { asRecord, readString } from '../../lib/parse-helpers'
import { useCurrencyStore } from '../../store/currency-store'
import { HoverTooltip, type HoverTooltipPlacement } from '../ui/hover-tooltip'

type TooltipPlacement = HoverTooltipPlacement

function Tooltip({
  children,
  classNames,
  closeDelay,
  content,
  delay,
  isDisabled,
  placement = 'top',
}: {
  children: ReactNode
  classNames?: { base?: string; content?: string }
  closeDelay?: number
  content: ReactNode
  delay?: number
  isDisabled?: boolean
  placement?: TooltipPlacement
}) {
  if (isDisabled) return <>{children}</>

  const triggerClassName = classNames?.base ?? 'inline-flex'

  return (
    <HoverTooltip
      className={triggerClassName}
      closeDelay={closeDelay}
      content={content}
      contentClassName={classNames?.content}
      delay={delay}
      placement={placement}
      unstyledContent={classNames?.content?.includes('bg-transparent') === true}
    >
      {children}
    </HoverTooltip>
  )
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

function readBoolean(value: unknown): boolean | null {
  if (value === true) return true
  if (value === false) return false
  return null
}

function sanitizeAnalysisItemRawText(rawText: string | null | undefined): string | null {
  if (!rawText) return null

  const sections: string[][] = []
  let currentSection: string[] = []

  for (const rawLine of rawText.split(/\r?\n/)) {
    const trimmed = rawLine.trim()
    if (!trimmed) continue

    if (trimmed === '--------') {
      if (currentSection.length > 0) {
        sections.push(currentSection)
        currentSection = []
      }
      continue
    }

    let normalizedLine = trimmed
      .replace(/\{fractured\}/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    while (/\s+\(fractured\)\s*$/i.test(normalizedLine)) {
      normalizedLine = normalizedLine.replace(/\s+\(fractured\)\s*$/i, '').trim()
    }

    if (
      !normalizedLine ||
      /^fractured item$/i.test(normalizedLine) ||
      /^\{?\s*fractured\s*\}?$/i.test(normalizedLine)
    ) {
      continue
    }

    currentSection.push(normalizedLine)
  }

  if (currentSection.length > 0) {
    sections.push(currentSection)
  }

  const normalizedText = sections.map((section) => section.join('\n')).join('\n--------\n')
  return normalizedText || null
}

function getPayload(item: UpgradeRecommendationItem): Record<string, unknown> {
  return asRecord(item.item_payload)
}

function getItemIconUrl(item: UpgradeRecommendationItem): string | null {
  const payload = getPayload(item)
  return readString(payload.icon_url) ?? readString(payload.icon)
}

function getItemRawText(item: UpgradeRecommendationItem): string | null {
  return sanitizeAnalysisItemRawText(readString(getPayload(item).raw_text))
}

function getItemBaseType(item: UpgradeRecommendationItem): string | null {
  return readString(getPayload(item).base_type)
}

function getBudgetStatus(
  item: UpgradeRecommendationItem,
  plan: UpgradeRecommendationPlan | null | undefined,
): {
  withinBudgetLimit: boolean | null
  budgetDeltaChaos: number | null
  budgetLimitChaos: number | null
} {
  const payload = getPayload(item)
  const rankingReason = getPlanRankingReason(plan)
  return {
    withinBudgetLimit:
      readBoolean(payload.within_budget_limit) ?? readBoolean(rankingReason.within_budget_limit),
    budgetDeltaChaos:
      readNumber(payload.budget_delta_chaos) ?? readNumber(rankingReason.budget_delta_chaos),
    budgetLimitChaos:
      readNumber(payload.budget_limit_chaos) ?? readNumber(rankingReason.budget_limit_chaos),
  }
}

function getTradeLinkKind(item: UpgradeRecommendationItem): string | null {
  return readString(getPayload(item).trade_link_kind)
}

function getMissingEssentialCrafts(
  item: UpgradeRecommendationItem,
): { id: string; label: string }[] {
  const value = getPayload(item).missing_essential_crafts
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => {
      const record = asRecord(entry)
      const id = readString(record.id)
      const label = readString(record.label)
      if (!id || !label) return null
      return { id, label }
    })
    .filter((entry): entry is { id: string; label: string } => entry !== null)
}

function getFlexibleElementalResistanceSuggestion(item: UpgradeRecommendationItem): {
  totalPool: number | null
  currentDeficits: { fire: number; cold: number; lightning: number }
  suggestedActions: Array<{
    from: string
    to: string
    amount: number
    label: string
  }>
} | null {
  const value = asRecord(getPayload(item).flexible_elemental_resistance)
  const actionsValue = value.suggested_actions
  if (!Array.isArray(actionsValue)) return null

  const suggestedActions = actionsValue
    .map((entry) => {
      const record = asRecord(entry)
      const from = readString(record.from)
      const to = readString(record.to)
      const amount = readNumber(record.amount)
      const label = readString(record.label)
      if (!from || !to || amount == null || amount <= 0 || !label) return null
      return { from, to, amount, label }
    })
    .filter(
      (
        entry,
      ): entry is {
        from: string
        to: string
        amount: number
        label: string
      } => entry !== null,
    )

  if (suggestedActions.length === 0) return null

  const currentDeficits = asRecord(value.current_deficits)

  return {
    totalPool: readNumber(value.total_pool),
    currentDeficits: {
      fire: readNumber(currentDeficits.fire) ?? 0,
      cold: readNumber(currentDeficits.cold) ?? 0,
      lightning: readNumber(currentDeficits.lightning) ?? 0,
    },
    suggestedActions,
  }
}

type AppliedSlotEffect = {
  kind: string | null
  label: string | null
  passiveName: string | null
  allocationLine: string | null
}

type RequiredSourceEffect = {
  key: string
  label: string
  sourceReason: string | null
  matchedSourceLine: string | null
}

type ReservationSimulation = {
  beforeDelta: number | null
  afterDelta: number | null
  deltaGain: number | null
  status: string | null
  progressScore: number | null
  resolvesBlocker: boolean
}

type EvaluationSummary = {
  status: string | null
  reason: string | null
  reasonKey: string | null
  detail: string | null
  sentence: string | null
  exactScoreNegative: boolean
  defensiveOrUtility: boolean
  locallyPositive: boolean | null
  withinBudgetLimit: boolean | null
}

function getPlanRankingReason(
  plan: UpgradeRecommendationPlan | null | undefined,
): Record<string, unknown> {
  return asRecord(plan?.ranking_reason)
}

function getAppliedSlotEffects(
  item: UpgradeRecommendationItem,
  plan: UpgradeRecommendationPlan | null | undefined,
): AppliedSlotEffect[] {
  const payload = getPayload(item)
  const rankingReason = getPlanRankingReason(plan)
  const value = Array.isArray(payload.applied_slot_effects)
    ? payload.applied_slot_effects
    : Array.isArray(rankingReason.applied_slot_effects)
      ? rankingReason.applied_slot_effects
      : []

  return value
    .map((entry) => {
      const record = asRecord(entry)
      return {
        kind: readString(record.kind),
        label: readString(record.label),
        passiveName: readString(record.passive_name),
        allocationLine: readString(record.allocation_line),
      }
    })
    .filter((entry) => entry.kind || entry.label || entry.passiveName || entry.allocationLine)
}

function getRequiredSourceEffects(
  item: UpgradeRecommendationItem,
  plan: UpgradeRecommendationPlan | null | undefined,
): RequiredSourceEffect[] {
  const payload = getPayload(item)
  const rankingReason = getPlanRankingReason(plan)
  const value = Array.isArray(payload.required_source_effects)
    ? payload.required_source_effects
    : Array.isArray(rankingReason.required_source_effects)
      ? rankingReason.required_source_effects
      : []

  return value
    .map((entry, index) => {
      const record = asRecord(entry)
      const key = readString(record.key) ?? `required-source-effect-${index}`
      const label = readString(record.label)
      if (!label) return null
      return {
        key,
        label,
        sourceReason: readString(record.source_reason),
        matchedSourceLine: readString(record.matched_source_line),
      }
    })
    .filter((entry): entry is RequiredSourceEffect => entry !== null)
}

function getReservationSimulation(
  item: UpgradeRecommendationItem,
  plan: UpgradeRecommendationPlan | null | undefined,
): ReservationSimulation | null {
  const payload = getPayload(item)
  const rankingReason = getPlanRankingReason(plan)
  const beforeDelta =
    readNumber(payload.reservation_before_delta) ??
    readNumber(rankingReason.reservation_before_delta)
  const afterDelta =
    readNumber(payload.reservation_after_delta) ?? readNumber(rankingReason.reservation_after_delta)
  const deltaGain =
    readNumber(payload.reservation_delta_gain) ?? readNumber(rankingReason.reservation_delta_gain)
  const progressScore =
    readNumber(payload.reservation_progress_score) ??
    readNumber(rankingReason.reservation_progress_score)
  const status =
    readString(payload.reservation_status) ?? readString(rankingReason.reservation_status)
  const resolvesBlocker =
    payload.resolves_reservation_blocker === true ||
    rankingReason.resolves_reservation_blocker === true

  if (
    beforeDelta == null &&
    afterDelta == null &&
    deltaGain == null &&
    progressScore == null &&
    !status &&
    !resolvesBlocker
  ) {
    return null
  }

  return {
    beforeDelta,
    afterDelta,
    deltaGain,
    status,
    progressScore,
    resolvesBlocker,
  }
}

function getEvaluationSummary(
  item: UpgradeRecommendationItem,
  plan: UpgradeRecommendationPlan | null | undefined,
): EvaluationSummary | null {
  const payload = getPayload(item)
  const rankingReason = getPlanRankingReason(plan)
  let status = readString(payload.evaluation_status) ?? readString(rankingReason.evaluation_status)
  let reason = readString(payload.evaluation_reason) ?? readString(rankingReason.evaluation_reason)
  let reasonKey =
    readString(payload.evaluation_reason_key) ?? readString(rankingReason.evaluation_reason_key)
  let detail = readString(payload.evaluation_detail) ?? readString(rankingReason.evaluation_detail)
  let sentence =
    readString(payload.evaluation_reason_sentence) ??
    readString(rankingReason.evaluation_reason_sentence)
  const exactScoreNegative =
    payload.exact_score_negative === true || rankingReason.exact_score_negative === true
  const defensiveOrUtility =
    payload.defensive_or_utility === true || rankingReason.defensive_or_utility === true
  const locallyPositive =
    readBoolean(payload.locally_positive) ?? readBoolean(rankingReason.locally_positive)
  const withinBudgetLimit =
    readBoolean(payload.within_budget_limit) ?? readBoolean(rankingReason.within_budget_limit)

  if (withinBudgetLimit !== false && reasonKey === 'over_budget') {
    reason = null
    reasonKey = null
    detail = null
    sentence = null
    if (status === 'accepted_over_budget' || status === 'budget_limited') {
      status = 'accepted'
    }
  }

  if (
    !status &&
    !reason &&
    !reasonKey &&
    !detail &&
    !sentence &&
    !exactScoreNegative &&
    !defensiveOrUtility &&
    locallyPositive == null &&
    withinBudgetLimit == null
  ) {
    return null
  }

  return {
    status,
    reason,
    reasonKey,
    detail,
    sentence,
    exactScoreNegative,
    defensiveOrUtility,
    locallyPositive,
    withinBudgetLimit,
  }
}

function getEvaluationReasonChip(summary: EvaluationSummary | null): {
  label: string
  color: 'default' | 'accent' | 'warning' | 'danger'
} | null {
  if (!summary) return null

  switch (summary.reasonKey) {
    case 'same_as_equipped':
      return { label: 'Already equipped', color: 'default' }
    case 'over_budget':
      return { label: 'Over budget', color: 'warning' }
    case 'fire_resistance_cap':
      return { label: 'Breaks fire cap', color: 'danger' }
    case 'cold_resistance_cap':
      return { label: 'Breaks cold cap', color: 'danger' }
    case 'lightning_resistance_cap':
      return { label: 'Breaks lightning cap', color: 'danger' }
    case 'total_ehp_floor':
      return { label: 'Breaks EHP floor', color: 'danger' }
    case 'mana_reservation_blocker':
      return { label: 'Creates reservation blocker', color: 'danger' }
    case 'worsened_mana_reservation_blocker':
      return { label: 'Worsens reservation', color: 'warning' }
    case 'missing_required_source_effect':
      return { label: 'Drops build effect', color: 'danger' }
    case 'exact_score_failed':
      return { label: 'Exact scoring failed', color: 'warning' }
    case 'not_meaningful':
      return { label: 'Low local impact', color: 'default' }
    case 'score_negative':
      return { label: 'Negative optimizer score', color: 'accent' }
    default:
      if (summary.status === 'retained_for_incremental_rerun') {
        return { label: 'Rerun focus', color: 'accent' }
      }
      return null
  }
}

function getNegativeOverallChip(summary: EvaluationSummary | null): {
  label: string
  color: 'accent'
} | null {
  if (!summary || !summary.exactScoreNegative) return null
  if (summary.defensiveOrUtility) {
    return { label: 'Defensive / utility', color: 'accent' }
  }
  return { label: 'Negative optimizer score', color: 'accent' }
}

function getDependencyBadge(dependencies: RecommendationDependency[]): {
  label: string
  color: 'success' | 'warning' | 'danger'
} | null {
  if (dependencies.length === 0) return null
  if (dependencies.some((dependency) => dependency.status === 'missing')) {
    return { label: 'Missing source', color: 'danger' }
  }
  if (dependencies.some((dependency) => dependency.status === 'paired_target')) {
    return { label: 'Needs setup', color: 'warning' }
  }
  return { label: 'Supported', color: 'success' }
}

function getDependencyStatusChip(dependency: RecommendationDependency): {
  label: string
  color: 'success' | 'warning' | 'danger'
} {
  switch (dependency.status) {
    case 'missing':
      return { label: 'Missing source', color: 'danger' }
    case 'paired_target':
      return { label: 'Target source', color: 'warning' }
    default:
      return { label: 'Already covered', color: 'success' }
  }
}

function getPreviewRarity(item: UpgradeRecommendationItem): string {
  const rawText = getItemRawText(item)
  const rarityLine = rawText
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith('Rarity:'))
  const payloadRarity = readString(getPayload(item).rarity)
  return rarityLine?.replace('Rarity:', '').trim() ?? payloadRarity ?? 'Item'
}

function getRarityColor(rarity: string): string {
  switch (rarity.toLowerCase()) {
    case 'unique':
      return 'text-[#af6025]'
    case 'rare':
      return 'text-[#ffff77]'
    case 'magic':
      return 'text-[#8888ff]'
    case 'gem':
      return 'text-[#1aa29b]'
    default:
      return 'text-[#ece3c9]'
  }
}

function getTradeActionLabel(item: UpgradeRecommendationItem): string {
  switch (getTradeLinkKind(item)) {
    case 'template_exact_search':
    case 'exact_rare_search':
      return 'Open trade'
    case 'pob_weighted_query':
      return 'PoB search'
    case 'similar_search':
      return 'Search market'
    case 'name_search':
      return 'Find listings'
    default:
      return 'Open trade'
  }
}

function getTradeActionHint(item: UpgradeRecommendationItem): string | null {
  const payload = getPayload(item)
  switch (getTradeLinkKind(item)) {
    case 'template_exact_search':
      return 'Opens an official trade search built from this recommendation item, including its actual base type, item properties, and stat lines.'
    case 'exact_rare_search':
      return 'Opens an official trade search built from this rare recommendation, including its actual base type, item properties, and stat lines.'
    case 'pob_weighted_query':
      return 'This is an internal weighted PoB search used for analysis, not a precise buy link.'
    case 'similar_search':
      return 'This opens a constrained market search, not the exact preview item.'
    case 'name_search':
      return 'Opens a fresh official trade search for this unique.'
    case 'trade_search':
      return 'Opens the official trade search that produced this candidate.'
    default:
      if (payload.requires_search_iteration === true || payload.estimated_price === true) {
        return 'This is an exact-scored template rare. Use rerun inputs to generate live market candidates for this slot.'
      }
      return null
  }
}

function getRecommendationMode(item: UpgradeRecommendationItem): {
  kind: 'live' | 'template' | 'name_search' | 'other'
  label: string
  color: 'success' | 'warning' | 'accent' | 'default'
} {
  const payload = getPayload(item)
  const tradeKind = getTradeLinkKind(item)
  if (item.source === 'compare' || payload.compare_source === true) {
    const actionType = typeof payload.action_type === 'string' ? payload.action_type : null
    return {
      kind: 'other',
      label:
        actionType === 'passive_node'
          ? 'Compare passive'
          : actionType === 'config_change'
            ? 'Compare config'
            : actionType === 'skill_gem' || actionType === 'support_gem'
              ? 'Compare gem'
              : 'Compare',
      color: 'accent',
    }
  }
  if (tradeKind === 'template_exact_search') {
    return { kind: 'template', label: 'Exact template', color: 'warning' }
  }
  if (tradeKind === 'exact_rare_search') {
    return { kind: 'live', label: 'Exact market', color: 'success' }
  }
  if (tradeKind === 'pob_weighted_query') {
    return { kind: 'live', label: 'PoB search', color: 'accent' }
  }
  if (tradeKind === 'similar_search' || payload.estimated_price === true) {
    return { kind: 'template', label: 'Template', color: 'warning' }
  }
  if (tradeKind === 'name_search') {
    return { kind: 'name_search', label: 'Name search', color: 'accent' }
  }
  if (
    tradeKind === 'trade_search' ||
    payload.candidate_type === 'market_rare' ||
    payload.candidate_type === 'market_unique'
  ) {
    return { kind: 'live', label: 'Live market', color: 'success' }
  }
  return { kind: 'other', label: 'Market', color: 'default' }
}

function getItemPreview(item: UpgradeRecommendationItem): {
  title: string
  subtitle: string | null
  rarity: string
  bodyLines: string[]
} {
  const rawText = getItemRawText(item)
  const baseType = getItemBaseType(item)
  const lines =
    rawText
      ?.split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean) ?? []
  const rarityIndex = lines.findIndex((line) => line.startsWith('Rarity:'))
  const rarity =
    (rarityIndex >= 0 ? lines[rarityIndex]?.replace('Rarity:', '').trim() : null) ??
    getPreviewRarity(item)
  const title =
    (rarityIndex >= 0 ? lines[rarityIndex + 1] : null) ??
    item.item_name ??
    baseType ??
    'Recommendation'
  const subtitle =
    (rarityIndex >= 0 ? lines[rarityIndex + 2] : null) ??
    (baseType && baseType !== title ? baseType : null)
  const bodyLines = rarityIndex >= 0 ? lines.slice(rarityIndex + (subtitle ? 3 : 2)) : lines

  return { title, subtitle, rarity, bodyLines }
}

function isUnpricedTemplate(item: UpgradeRecommendationItem): boolean {
  const payload = getPayload(item)
  return payload.requires_search_iteration === true || payload.estimated_price === true
}

function isPoeNinjaPriceEstimate(item: UpgradeRecommendationItem): boolean {
  return getPayload(item).price_source === 'poe_ninja'
}

function formatListingPrice(amount: number, currency: string): string {
  const rounded = Math.round(amount * 100) / 100
  const amountLabel = Number.isInteger(rounded)
    ? rounded.toLocaleString()
    : rounded.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      })
  const normalizedCurrency = currency.trim().toLowerCase()
  const currencyLabel =
    normalizedCurrency === 'divine' ? 'div' : normalizedCurrency === 'chaos' ? 'c' : currency
  return `${amountLabel} ${currencyLabel}`
}

function getPriceLabel(
  item: UpgradeRecommendationItem,
  divinePrice: number,
  display: 'chaos' | 'divine',
  analysisMode: UpgradeAnalysisMode | null | undefined,
): string | null {
  const payload = getPayload(item)
  if (payload.overview_only === true) {
    return null
  }
  if (payload.live_search_status === 'no_listings') {
    return 'No live listings found'
  }
  if (item.source === 'compare' || payload.compare_source === true) {
    return null
  }
  if (isUnpricedTemplate(item)) {
    return analysisMode === 'quick' ? 'Live search skipped' : 'No live listings found'
  }
  const listingPriceAmount = readNumber(payload.listing_price_amount)
  const listingPriceCurrency = readString(payload.listing_price_currency)
  if (
    payload.price_source === 'trade_listing' &&
    listingPriceAmount != null &&
    listingPriceCurrency
  ) {
    return formatListingPrice(listingPriceAmount, listingPriceCurrency)
  }
  const label = formatCurrencyAmount(item.effective_price_chaos, display, divinePrice)
  return isPoeNinjaPriceEstimate(item) ? `~${label}` : label
}

function getPriceContextLabel(item: UpgradeRecommendationItem): string | null {
  const payload = getPayload(item)
  if (payload.overview_only === true || isUnpricedTemplate(item)) {
    return null
  }
  if (payload.price_source === 'trade_listing') {
    return 'Live listing'
  }
  return null
}

function getLinkedSocketCount(item: UpgradeRecommendationItem): number | null {
  const links = readNumber(getPayload(item).links)
  return links != null && links >= 5 ? Math.floor(links) : null
}

function getUnpricedTemplateInfoText(analysisMode: UpgradeAnalysisMode | null | undefined): string {
  if (analysisMode === 'quick') {
    return 'Quick overview stays fast by skipping fresh live rare search. Switch to Live market when you want budgeted live listings and prices for this slot.'
  }

  return "The trade search found no live listings matching this template. Click 'Rerun with manual tunings' above to relax the search constraints and try again."
}

function getTooltipSections(item: UpgradeRecommendationItem): string[][] {
  const rawText = getItemRawText(item)
  if (!rawText) return []

  const sections: string[][] = []
  let current: string[] = []

  for (const line of rawText.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue

    if (trimmed === '--------') {
      if (current.length) {
        sections.push(current)
        current = []
      }
      continue
    }

    current.push(trimmed)
  }

  if (current.length) {
    sections.push(current)
  }

  return sections
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fall through to the legacy copy path below.
    }
  }

  if (typeof document === 'undefined') {
    return false
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  textarea.setSelectionRange(0, textarea.value.length)

  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(textarea)
  }
}

function normalizeModifierLines(lines: string[] | undefined): string[] {
  return (lines ?? []).filter((line) => typeof line === 'string' && line.trim().length > 0)
}

type ParsedTooltipItem = {
  title: string
  baseLine: string | null
  rarity: string
  properties: Array<{ name: string; values: string[] }>
  requirements: Array<{ name: string; values: string[] }>
  modifierSections: Array<{
    key: string
    groupKey: string
    lines: string[]
    lineClassName: string
  }>
  footerLines: string[]
}

function getStructuredTooltipItem(item: UpgradeRecommendationItem): ParsedTooltipItem | null {
  const structured = getPayload(item).structured_item
  if (!structured || typeof structured !== 'object' || Array.isArray(structured)) {
    return null
  }

  const record = structured as Record<string, unknown>
  const modifierSections = Array.isArray(record.modifier_sections)
    ? record.modifier_sections
        .filter(
          (entry): entry is Record<string, unknown> =>
            !!entry && typeof entry === 'object' && !Array.isArray(entry),
        )
        .map((entry, index) => {
          const rawGroupKey = typeof entry.key === 'string' ? entry.key : 'explicit'
          const groupKey = rawGroupKey === 'fractured' ? 'explicit' : rawGroupKey
          return {
            key: `${groupKey}-${index}`,
            groupKey,
            lines: Array.isArray(entry.lines)
              ? entry.lines.filter(
                  (line): line is string => typeof line === 'string' && line.trim().length > 0,
                )
              : [],
            lineClassName: getModifierSectionMeta(groupKey).lineClassName,
          }
        })
        .filter((entry) => entry.lines.length > 0)
    : []

  return {
    title: readString(record.title) ?? getItemPreview(item).title,
    baseLine: readString(record.base_line),
    rarity: readString(record.rarity) ?? getPreviewRarity(item),
    properties: Array.isArray(record.properties)
      ? record.properties
          .filter(
            (entry): entry is Record<string, unknown> =>
              !!entry && typeof entry === 'object' && !Array.isArray(entry),
          )
          .map((entry) => ({
            name: readString(entry.name) ?? '',
            values: Array.isArray(entry.values)
              ? entry.values.filter(
                  (value): value is string => typeof value === 'string' && value.trim().length > 0,
                )
              : [],
          }))
          .filter((entry) => entry.name && entry.values.length > 0)
      : [],
    requirements: Array.isArray(record.requirements)
      ? record.requirements
          .filter(
            (entry): entry is Record<string, unknown> =>
              !!entry && typeof entry === 'object' && !Array.isArray(entry),
          )
          .map((entry) => ({
            name: readString(entry.name) ?? '',
            values: Array.isArray(entry.values)
              ? entry.values.filter(
                  (value): value is string => typeof value === 'string' && value.trim().length > 0,
                )
              : [],
          }))
          .filter((entry) => entry.name && entry.values.length > 0)
      : [],
    modifierSections,
    footerLines: Array.isArray(record.footer_lines)
      ? record.footer_lines.filter(
          (line): line is string =>
            typeof line === 'string' && line.trim().length > 0 && !line.includes('Fractured Item'),
        )
      : [],
  }
}

const IGNORED_TOOLTIP_PROPERTY_NAMES = new Set(['crafted', 'prefix', 'suffix', 'catalyst'])

function isIgnoredTooltipMetadataLine(line: string): boolean {
  const normalized = line.trim().toLowerCase()
  return (
    normalized.startsWith('crafted:') ||
    normalized.startsWith('prefix:') ||
    normalized.startsWith('suffix:') ||
    normalized.startsWith('catalyst:')
  )
}

function parsePropertyLine(line: string): { name: string; values: string[] } | null {
  if (line.trim().startsWith('{')) return null

  const match = line.match(/^([^:]+):\s*(.+)$/)
  if (!match) return null

  let name = match[1]?.trim()
  const value = match[2]?.trim()
  if (!name || !value) return null
  if (/xbasepercentile/i.test(name)) return null
  if (IGNORED_TOOLTIP_PROPERTY_NAMES.has(name.toLowerCase())) return null
  if (name.toLowerCase() === 'catalystquality') {
    name = 'Quality'
  }

  return {
    name,
    values: [value.replace(/\s*\((?:augmented|unmet|met)\)\s*/gi, '').trim()],
  }
}

function normalizeRequirementName(name: string): string {
  const normalized = name.trim().toLowerCase()
  if (normalized === 'levelreq') return 'Requires Level'
  if (normalized === 'str') return 'Str'
  if (normalized === 'dex') return 'Dex'
  if (normalized === 'int') return 'Int'
  return name.trim()
}

function isRequirementPropertyName(name: string): boolean {
  const normalized = name.trim().toLowerCase()
  return (
    normalized === 'levelreq' ||
    normalized === 'str' ||
    normalized === 'dex' ||
    normalized === 'int'
  )
}

function isFooterLine(line: string): boolean {
  return (
    line === 'Corrupted' ||
    line.includes('Synthesised Item') ||
    line.includes('Fractured Item') ||
    line.includes('Veiled Item') ||
    line.startsWith('Item Level:') ||
    line.endsWith('Influence') ||
    line.includes('Shaper Item') ||
    line.includes('Elder Item') ||
    line.includes('Crusader Item') ||
    line.includes('Redeemer Item') ||
    line.includes('Hunter Item') ||
    line.includes('Warlord Item') ||
    line.includes('Searing Exarch Item') ||
    line.includes('Eater of Worlds Item')
  )
}

function pushModifierLine(
  sections: ParsedTooltipItem['modifierSections'],
  key: string,
  lineClassName: string,
  line: string,
) {
  if (!line.trim()) return
  const lastSection = sections[sections.length - 1]
  if (lastSection && lastSection.groupKey === key && lastSection.lineClassName === lineClassName) {
    lastSection.lines.push(line)
    return
  }

  sections.push({
    key: `${key}-${sections.length}`,
    groupKey: key,
    lines: [line],
    lineClassName,
  })
}

function parseTooltipItem(item: UpgradeRecommendationItem): ParsedTooltipItem {
  const preview = getItemPreview(item)
  const sections = getTooltipSections(item)
  if (sections.length === 0) {
    const structuredItem = getStructuredTooltipItem(item)
    if (structuredItem) {
      return structuredItem
    }
  }

  const parsed: ParsedTooltipItem = {
    title: preview.title,
    baseLine: preview.subtitle,
    rarity: preview.rarity,
    properties: [],
    requirements: [],
    modifierSections: [],
    footerLines: [],
  }

  let inRequirements = false
  let currentModifier = { key: 'explicit', lineClassName: 'text-[#7aa6ff]' }
  let implicitLinesRemaining = 0

  for (const section of sections) {
    for (const rawLine of section) {
      const line = rawLine.trim()
      if (!line) continue
      if (line.startsWith('Rarity:')) continue
      if (line === preview.title || line === preview.subtitle) continue
      if (line.startsWith('Item Class:')) continue
      if (line.startsWith('Unique ID:')) continue
      if (line.startsWith('League:')) continue
      if (line.startsWith('Note:')) continue
      if (line.startsWith('Split Tag:')) continue
      if (isIgnoredTooltipMetadataLine(line)) continue
      if (/xbasepercentile/i.test(line)) continue

      if (line.startsWith('Requirements:')) {
        inRequirements = true
        continue
      }

      const implicitMatch = line.match(/^Implicits:\s*(\d+)/i)
      if (implicitMatch) {
        implicitLinesRemaining = Number(implicitMatch[1] ?? 0)
        continue
      }

      if (line.startsWith('{') && line.endsWith('}')) {
        currentModifier = getModifierSectionMeta(line)
        continue
      }

      if (isFooterLine(line)) {
        parsed.footerLines.push(line)
        continue
      }

      const property = parsePropertyLine(line)
      if (property) {
        if (inRequirements || isRequirementPropertyName(property.name)) {
          parsed.requirements.push({
            name: normalizeRequirementName(property.name),
            values: property.values,
          })
        } else {
          parsed.properties.push(property)
        }
        continue
      }

      const inlineMarker = stripInlineModifierMarker(line)
      const cleanedLine = inlineMarker.line.trim()
      if (!cleanedLine) continue

      const modifierForLine =
        inlineMarker.key && inlineMarker.lineClassName
          ? { key: inlineMarker.key, lineClassName: inlineMarker.lineClassName }
          : implicitLinesRemaining > 0
            ? getModifierSectionMeta('implicit')
            : currentModifier

      pushModifierLine(
        parsed.modifierSections,
        modifierForLine.key,
        modifierForLine.lineClassName,
        cleanedLine,
      )

      if (implicitLinesRemaining > 0) {
        implicitLinesRemaining -= 1
      }
    }

    if (inRequirements && parsed.requirements.length > 0) {
      inRequirements = false
    }
  }

  if (parsed.modifierSections.length === 0) {
    const fallbackLines = normalizeModifierLines(preview.bodyLines)
      .filter((line) => !line.startsWith('Unique ID:'))
      .filter((line) => !line.startsWith('Item Class:'))
      .filter((line) => !line.startsWith('League:'))
      .filter((line) => !line.startsWith('Requirements:'))
      .filter((line) => !isIgnoredTooltipMetadataLine(line))
      .filter((line) => !/^Implicits:\s*\d+/i.test(line))
      .filter((line) => !/xbasepercentile/i.test(line))

    if (fallbackLines.length > 0) {
      parsed.modifierSections.push({
        key: 'fallback-0',
        groupKey: 'fallback',
        lines: fallbackLines,
        lineClassName: 'text-[#7aa6ff]',
      })
    }
  }

  return parsed
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

function formatScore(value: number | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (Math.abs(value) >= 1000) return Math.round(value).toLocaleString()
  if (Math.abs(value) >= 100) return value.toFixed(0)
  return value.toFixed(2)
}

function formatSignedWholeNumber(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const rounded = Math.round(value)
  const formatted = Math.abs(rounded).toLocaleString()
  if (rounded > 0) return `+${formatted}`
  if (rounded < 0) return `-${formatted}`
  return '0'
}

function getReservationStatusLabel(simulation: ReservationSimulation): string {
  if (simulation.resolvesBlocker) return 'Resolves reservation blocker'

  switch (simulation.status) {
    case 'improved_blocked':
      return 'Improves reservation fit'
    case 'created_blocker':
      return 'Creates reservation blocker'
    case 'blocked':
      return 'Still reservation-blocked'
    case 'fit':
      return 'Fits current reservation'
    default:
      return 'Reservation check'
  }
}

type RecommendationScoreContext = {
  overallRank: number
  dpsRank: number | null
  ehpRank: number | null
  reservationRank: number | null
  total: number
  sectionLabel: string
}

type RecommendationScoreEntry = {
  key: 'overall' | 'dps' | 'ehp' | 'reservation'
  label: string
  value: number | null
  rank: number | null
}

function getReservationChipColor(
  entry: RecommendationScoreEntry | null,
  simulation: ReservationSimulation | null,
): ChipProps['color'] {
  if (simulation?.resolvesBlocker || simulation?.status === 'improved_blocked') return 'success'
  if (simulation?.status === 'created_blocker' || simulation?.status === 'blocked') return 'danger'
  if ((entry?.value ?? 0) < 0) return 'danger'
  if ((entry?.value ?? 0) > 0) return 'success'
  return 'accent'
}

function getScoreContextLabel(scoreContext: RecommendationScoreContext | undefined): string | null {
  if (!scoreContext || scoreContext.total <= 0) return null
  return `Rank ${scoreContext.overallRank} of ${scoreContext.total}`
}

function getScoreContextNote(scoreContext: RecommendationScoreContext | undefined): string | null {
  if (!scoreContext || scoreContext.total <= 0) return null
  const rankParts = [`Optimizer rank ${scoreContext.overallRank} of ${scoreContext.total}`]
  if (scoreContext.dpsRank != null) {
    rankParts.push(`DPS rank ${scoreContext.dpsRank} of ${scoreContext.total}`)
  }
  if (scoreContext.ehpRank != null) {
    rankParts.push(`EHP rank ${scoreContext.ehpRank} of ${scoreContext.total}`)
  }
  if (scoreContext.reservationRank != null) {
    rankParts.push(`Reservation rank ${scoreContext.reservationRank} of ${scoreContext.total}`)
  }

  return `${rankParts.join(' | ')} in ${scoreContext.sectionLabel} for this run. Optimizer rank stays the default blended ordering, while DPS, EHP, and Reservation show the offensive, defensive, and mana-fit value signals. Compare them only within the same section of the same run. A negative optimizer score does not always mean bad; it can mean the item is mostly defensive, reservation-focused, or utility-focused in the default blend.`
}

function getEvaluationSummaryText(
  summary: EvaluationSummary | null,
  plan: UpgradeRecommendationPlan | null | undefined,
  reservationSimulation: ReservationSimulation | null,
): string | null {
  if (!summary) return null

  const rankingReason = getPlanRankingReason(plan)
  const primaryMetric = readString(rankingReason.primary_metric)
  const primaryDelta = readNumber(rankingReason.primary_delta)
  const ehpDelta = readNumber(rankingReason.total_ehp_delta)
  const primaryLabel = primaryMetric ? formatMetricLabel(primaryMetric) : 'Offence'
  const primaryDeltaLabel =
    primaryDelta != null ? `${primaryLabel} ${formatSignedWholeNumber(primaryDelta)}` : null
  const ehpDeltaLabel = ehpDelta != null ? `EHP ${formatSignedWholeNumber(ehpDelta)}` : null

  switch (summary.reasonKey) {
    case 'cold_resistance_cap':
    case 'fire_resistance_cap':
    case 'lightning_resistance_cap': {
      const element = summary.reasonKey
        .replace('_resistance_cap', '')
        .replace(/^./, (c) => c.toUpperCase())
      if (primaryDeltaLabel) {
        return `${primaryDeltaLabel}, but the isolated swap breaks ${element.toLowerCase()} resistance cap.`
      }
      return `This isolated swap breaks ${element.toLowerCase()} resistance cap.`
    }
    case 'mana_reservation_blocker':
      return summary.detail
        ? `It creates a mana reservation blocker. ${summary.detail}`
        : 'It creates a mana reservation blocker on the current setup.'
    case 'worsened_mana_reservation_blocker': {
      const before = formatSignedWholeNumber(reservationSimulation?.beforeDelta)
      const after = formatSignedWholeNumber(reservationSimulation?.afterDelta)
      if (before || after) {
        return `It worsens the current mana reservation blocker from ${before ?? '?'} to ${after ?? '?'}.`
      }
      return 'It worsens the current mana reservation blocker.'
    }
    case 'total_ehp_floor':
      return ehpDeltaLabel
        ? `${ehpDeltaLabel}, but the one-slot swap drops total EHP too far for the current guardrail.`
        : 'The one-slot swap drops total EHP too far for the current guardrail.'
    case 'same_as_equipped':
      return 'This target PoB item already matches the currently equipped item in that slot, so the isolated swap is neutral.'
    case 'over_budget':
      if (summary.status === 'accepted_over_budget') {
        return summary.detail
          ? `This live listing exact-scored well, but it is above the current budget. ${summary.detail}`
          : 'This live listing exact-scored well, but it is above the current budget.'
      }
      return summary.detail
        ? `This target item scored locally, but live search was skipped because it is over budget. ${summary.detail}`
        : 'This target item scored locally, but live search was skipped because it is over budget.'
    case 'missing_required_source_effect':
      return summary.detail
        ? `It would drop a build-critical source effect: ${summary.detail}.`
        : 'It would drop a build-critical source effect the target build depends on.'
    case 'not_meaningful':
      if ((ehpDelta ?? 0) > 0 && (primaryDelta ?? 0) < 0) {
        return 'It adds some defence, but the isolated swap loses too much offence for the default blended ranking.'
      }
      return 'As a one-slot swap, it does not move the current build enough to stay in the main recommendation lane.'
    case 'exact_score_failed':
      return summary.detail
        ? `Path of Building could not exact-score this target item. ${summary.detail}`
        : 'Path of Building could not exact-score this target item.'
    case 'score_negative':
      return 'The blended optimizer score stayed below zero even though the item still changes build metrics.'
    default:
      return summary.sentence
  }
}

function getNegativeOverallSummaryText(summary: EvaluationSummary | null): string | null {
  if (!summary?.exactScoreNegative) return null
  if (summary.defensiveOrUtility) {
    return 'A negative optimizer score here does not automatically mean bad. It usually means the default blended ranking penalized the offensive loss more than the defensive, reservation, or utility gains.'
  }
  return 'A negative optimizer score means this isolated swap lost more blended value than it gained in the default ranking.'
}

function getTopRankBadge(scoreContext: RecommendationScoreContext | undefined): {
  label: string
  className: string
  icon: 'trophy' | 'award'
} | null {
  if (!scoreContext || scoreContext.overallRank < 1 || scoreContext.overallRank > 3) return null

  if (scoreContext.overallRank === 1) {
    return {
      label: '#1 Top pick',
      icon: 'trophy',
      className: 'border-warning/60 bg-warning/15 text-warning',
    }
  }

  return {
    label: `#${scoreContext.overallRank}`,
    icon: 'award',
    className:
      scoreContext.overallRank === 2
        ? 'border-accent/50 bg-accent/10 text-accent'
        : 'border-default-300 bg-default-100 text-default-700',
  }
}

function getPlanMetricKeys(plan: UpgradeRecommendationPlan | undefined): string[] {
  if (!plan) return []

  return ['totalDps', 'combinedDps', 'totalEhp', 'life', 'energyShield', 'armour', 'evasion']
    .filter((key) => plan.before_metrics[key] != null || plan.after_metrics[key] != null)
    .slice(0, 4)
}

type RecommendationTooltipNote = {
  content: ReactNode
  key: string
  label: string
}

function RecommendationTooltipContent({
  analysisNotes = [],
  item,
}: {
  analysisNotes?: RecommendationTooltipNote[]
  item: UpgradeRecommendationItem
}) {
  const parsed = parseTooltipItem(item)
  const visibleProperties = parsed.properties.filter((property) =>
    shouldDisplayTooltipProperty(property.name, parsed.rarity),
  )
  const visibleRequirements = parsed.requirements.filter((requirement) =>
    shouldDisplayTooltipRequirement(requirement.name, parsed.rarity),
  )

  return (
    <div className="rounded-large max-w-[24rem] min-w-[18rem] border border-amber-300/35 bg-[#11100d]/95 px-3 py-2 text-[#d9c7a2] shadow-2xl">
      <div className="border-b border-amber-300/20 pb-2 text-center">
        <p className="text-sm font-semibold tracking-[0.18em] text-[#e1c47a] uppercase">
          {parsed.title}
        </p>
        {parsed.baseLine ? (
          <p className="mt-1 text-xs tracking-[0.15em] text-[#f2ebd0] uppercase">
            {parsed.baseLine}
          </p>
        ) : null}
      </div>

      {visibleProperties.length > 0 ? (
        <div className="border-b border-amber-300/15 py-2 text-center">
          {visibleProperties.map((property, index) => (
            <p
              key={`${property.name}-${property.values.join('|')}-${index}`}
              className="text-xs leading-5 text-[#d7d7d7]"
            >
              <span className="text-[#b4b4b4]">{property.name}:</span>{' '}
              <span className="text-white">{property.values.join(', ')}</span>
            </p>
          ))}
        </div>
      ) : null}

      {visibleRequirements.length > 0 ? (
        <div className="border-b border-amber-300/15 py-2 text-center">
          <p className="text-[11px] tracking-[0.14em] text-[#8f8f8f] uppercase">Requires</p>
          {visibleRequirements.map((requirement, index) => (
            <p
              key={`${requirement.name}-${requirement.values.join('|')}-${index}`}
              className="text-xs leading-5 text-[#d7d7d7]"
            >
              {requirement.name} {requirement.values.join(', ')}
            </p>
          ))}
        </div>
      ) : null}

      {parsed.modifierSections.length > 0 ? (
        <div className="border-b border-amber-300/15">
          {parsed.modifierSections.map((section, index) => (
            <div
              key={`${parsed.title}-section-${index}`}
              className={`${index > 0 ? 'border-t border-amber-300/10' : ''} py-2`}
            >
              {section.lines.map((line) => (
                <p
                  key={`${parsed.title}-${index}-${line}`}
                  className={`text-center text-xs leading-5 ${section.lineClassName}`}
                >
                  {line}
                </p>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="py-3 text-center text-xs text-[#d7d7d7]">No item details available.</div>
      )}

      {parsed.footerLines.length > 0 ? (
        <div className="pt-2 text-center text-[11px] text-[#a89467]">
          {parsed.footerLines.map((line) => (
            <p
              key={`${parsed.title}-footer-${line}`}
              className={
                line === 'Corrupted'
                  ? 'text-[#d14b4b]'
                  : line.includes('Synthesised')
                    ? 'text-[#8ee8ff]'
                    : line.includes('Fractured')
                      ? 'text-[#a29162]'
                      : line.includes('Veiled')
                        ? 'text-[#c7b7ff]'
                        : undefined
              }
            >
              {line}
            </p>
          ))}
        </div>
      ) : null}

      {analysisNotes.length > 0 ? (
        <div className="mt-2 border-t border-amber-300/15 pt-2 text-left">
          <p className="text-[11px] tracking-[0.14em] text-[#a89467] uppercase">
            Analysis notes
          </p>
          <div className="mt-1 flex flex-col gap-2">
            {analysisNotes.map((note) => (
              <div key={note.key}>
                <p className="text-[11px] font-semibold tracking-[0.12em] text-[#e1c47a] uppercase">
                  {note.label}
                </p>
                <div className="text-xs leading-5 text-[#d7d7d7]">{note.content}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function RecommendationItemRow({
  item,
  plan,
  scoreContext,
  divinePrice,
  analysisMode,
  canPromote = false,
  promotingRecommendation = false,
  onPromote,
  runIsStale = false,
  comparePowerRow = null,
  reservationAuditAnchorId,
  showRankBadge = false,
}: {
  item: UpgradeRecommendationItem
  plan?: UpgradeRecommendationPlan
  scoreContext?: RecommendationScoreContext
  divinePrice: number
  analysisMode?: UpgradeAnalysisMode | null
  canPromote?: boolean
  promotingRecommendation?: boolean
  onPromote?: () => void
  runIsStale?: boolean
  comparePowerRow?: ComparePowerRow | null
  reservationAuditAnchorId?: string
  showRankBadge?: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [copiedFullItemText, setCopiedFullItemText] = useState(false)
  const copyResetTimeoutRef = useRef<number | null>(null)
  const currencyDisplay = useCurrencyStore((s) => s.display)
  const payload = getPayload(item)
  const baseType = getItemBaseType(item)
  const payloadIconUrl = getItemIconUrl(item)
  const { data: fallbackIconUrl } = usePoeWikiInventoryIcon(baseType, !payloadIconUrl)
  const iconUrl = payloadIconUrl ?? fallbackIconUrl ?? null
  const tradeActionLabel = getTradeActionLabel(item)
  const tradeActionHint = getTradeActionHint(item)
  const tradeLinksDisabledForStaleRun = runIsStale
  const effectiveTradeActionHint = tradeLinksDisabledForStaleRun
    ? 'This run is stale. Trade links are disabled here so older recommendation output is not mistaken for the current buy path.'
    : tradeActionHint
  const recommendationMode = getRecommendationMode(item)
  const exactEval = payload.exact_eval === true
  const preview = useMemo(() => getItemPreview(item), [item])
  const dependencies = useMemo(() => getRecommendationDependencies(item), [item])
  const dependencyBadge = useMemo(() => getDependencyBadge(dependencies), [dependencies])
  const missingEssentialCrafts = useMemo(() => getMissingEssentialCrafts(item), [item])
  const appliedSlotEffects = useMemo(() => getAppliedSlotEffects(item, plan), [item, plan])
  const requiredSourceEffects = useMemo(() => getRequiredSourceEffects(item, plan), [item, plan])
  const reservationSimulation = useMemo(() => getReservationSimulation(item, plan), [item, plan])
  const evaluationSummary = useMemo(() => getEvaluationSummary(item, plan), [item, plan])
  const flexibleResistanceSuggestion = useMemo(
    () => getFlexibleElementalResistanceSuggestion(item),
    [item],
  )
  const evaluationReasonChip = useMemo(
    () => getEvaluationReasonChip(evaluationSummary),
    [evaluationSummary],
  )
  const negativeOverallChip = useMemo(
    () => getNegativeOverallChip(evaluationSummary),
    [evaluationSummary],
  )
  const missingEssentialCraftsTooltip =
    missingEssentialCrafts.length > 0
      ? `Target item had these essential crafts that this recommendation does not: ${missingEssentialCrafts.map((craft) => craft.label).join(', ')}.`
      : null
  const planMetricKeys = useMemo(() => getPlanMetricKeys(plan), [plan])
  const fullItemText = useMemo(() => {
    const rawText = getItemRawText(item)
    if (rawText) return rawText
    return [preview.title, preview.subtitle, ...preview.bodyLines]
      .filter((line): line is string => Boolean(line))
      .join('\n')
  }, [item, preview.bodyLines, preview.subtitle, preview.title])
  const hasFullItemText = fullItemText.trim().length > 0
  const priceLabel = getPriceLabel(item, divinePrice, currencyDisplay, analysisMode)
  const priceContextLabel = getPriceContextLabel(item)
  const linkedSocketCount = getLinkedSocketCount(item)
  const budgetStatus = getBudgetStatus(item, plan)
  const showUnpricedInfo = isUnpricedTemplate(item) && payload.overview_only !== true
  const unpricedTemplateInfoText = getUnpricedTemplateInfoText(analysisMode)
  const priceEstimateInfoText = isPoeNinjaPriceEstimate(item) ? 'poe.ninja estimate' : null
  const priceInfoText = showUnpricedInfo ? unpricedTemplateInfoText : priceEstimateInfoText
  const scoreEntries = useMemo<RecommendationScoreEntry[]>(() => {
    const breakdown = getRecommendationScoreBreakdown(plan)
    const entries: RecommendationScoreEntry[] = [
      {
        key: 'overall',
        label: 'Optimizer score',
        value: breakdown.overall,
        rank: scoreContext?.overallRank ?? null,
      },
      {
        key: 'dps',
        label: 'DPS',
        value: breakdown.dps,
        rank: scoreContext?.dpsRank ?? null,
      },
      {
        key: 'ehp',
        label: 'EHP',
        value: breakdown.ehp,
        rank: scoreContext?.ehpRank ?? null,
      },
      {
        key: 'reservation',
        label: 'Reservation',
        value: breakdown.reservation,
        rank: scoreContext?.reservationRank ?? null,
      },
    ]

    return entries.filter((entry) => shouldShowRecommendationScore(entry.key, entry.value))
  }, [plan, scoreContext])
  const reservationScoreEntry = scoreEntries.find((entry) => entry.key === 'reservation') ?? null
  const scoreContextLabel = showRankBadge ? getScoreContextLabel(scoreContext) : null
  const topRankBadge = showRankBadge ? getTopRankBadge(scoreContext) : null
  const scoreContextNote = getScoreContextNote(scoreContext)
  const evaluationSummaryText = useMemo(
    () => getEvaluationSummaryText(evaluationSummary, plan, reservationSimulation),
    [evaluationSummary, plan, reservationSimulation],
  )
  const negativeOverallSummaryText = useMemo(
    () => getNegativeOverallSummaryText(evaluationSummary),
    [evaluationSummary],
  )
  const flexibleResistanceTooltip = flexibleResistanceSuggestion ? (
    <div className="max-w-[18rem] p-2 text-xs leading-5">
      <p>
        Single fire, cold, and lightning resistance on this item can be rebalanced to keep your
        caps.
      </p>
      {flexibleResistanceSuggestion.suggestedActions.map((action) => (
        <p key={`${action.from}-${action.to}-${action.amount}`} className="mt-2">
          {action.label}
        </p>
      ))}
    </div>
  ) : null
  const comparePowerPercent = comparePowerRow ? formatCompareImpactPercent(comparePowerRow) : null
  const comparePowerEhp = comparePowerRow?.secondaryImpacts.totalEhp
  const comparePowerEhpLabel = formatCompareSecondaryImpact(comparePowerEhp)
  const comparePowerEhpPercent = formatCompareSecondaryImpactPercent(comparePowerEhp)
  const comparePowerPercentSummary = [
    comparePowerPercent ? `DPS ${comparePowerPercent}` : null,
    comparePowerEhpPercent ? `EHP ${comparePowerEhpPercent}` : null,
  ].filter((entry): entry is string => entry !== null)
  const comparePowerEhpTone = comparePowerEhp && comparePowerEhp.impact >= 0 ? 'success' : 'danger'
  const comparePowerTone =
    comparePowerRow && comparePowerRow.impact > 0
      ? 'success'
      : comparePowerRow && comparePowerRow.impact < 0
        ? 'danger'
        : 'default'
  const reservationChipColor = getReservationChipColor(reservationScoreEntry, reservationSimulation)
  const reservationScoreLabel = formatScore(reservationScoreEntry?.value ?? undefined)
  const reservationChipTooltip = useMemo(() => {
    if (!reservationScoreEntry) return null

    const parts = [
      `Reservation score ${formatScore(reservationScoreEntry.value ?? undefined) ?? '?'}`,
    ]
    if (reservationScoreEntry.rank != null && scoreContext?.total) {
      parts.push(`Rank ${reservationScoreEntry.rank} of ${scoreContext.total}`)
    }
    if (reservationSimulation) {
      parts.push(getReservationStatusLabel(reservationSimulation))
      if (reservationSimulation.deltaGain != null) {
        parts.push(`${formatSignedWholeNumber(reservationSimulation.deltaGain) ?? '?'} mana`)
      }
    }
    if (reservationAuditAnchorId) {
      parts.push('Open reservation audit')
    }
    return parts.join(' | ')
  }, [reservationAuditAnchorId, reservationScoreEntry, reservationSimulation, scoreContext?.total])
  const analysisNotes = useMemo<RecommendationTooltipNote[]>(() => {
    const notes: RecommendationTooltipNote[] = []

    if (priceInfoText) {
      notes.push({
        key: 'price-info',
        label: showUnpricedInfo ? 'Market availability' : 'Price source',
        content: priceInfoText,
      })
    }

    if (effectiveTradeActionHint) {
      notes.push({
        key: 'trade-action',
        label: 'Trade action',
        content: effectiveTradeActionHint,
      })
    }

    if (missingEssentialCraftsTooltip) {
      notes.push({
        key: 'missing-essential-crafts',
        label: 'Missing essential craft',
        content: missingEssentialCraftsTooltip,
      })
    }

    if (flexibleResistanceSuggestion) {
      notes.push({
        key: 'flexible-resistance',
        label: 'Suggested action',
        content: (
          <>
            <p>Single fire, cold, and lightning resistance can be rebalanced to keep your caps.</p>
            {flexibleResistanceSuggestion.suggestedActions.map((action) => (
              <p key={`${action.from}-${action.to}-${action.amount}`} className="mt-1">
                {action.label}
              </p>
            ))}
          </>
        ),
      })
    }

    if (reservationChipTooltip) {
      notes.push({
        key: 'reservation',
        label: 'Reservation',
        content: reservationChipTooltip,
      })
    }

    return notes
  }, [
    effectiveTradeActionHint,
    flexibleResistanceSuggestion,
    missingEssentialCraftsTooltip,
    priceInfoText,
    reservationChipTooltip,
    showUnpricedInfo,
  ])

  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current != null) {
        window.clearTimeout(copyResetTimeoutRef.current)
      }
    }
  }, [])

  function openDetails() {
    setIsOpen(true)
  }

  function handleReservationBadgeClick() {
    if (!reservationAuditAnchorId) {
      openDetails()
      return
    }

    const reservationAuditSection = document.getElementById(reservationAuditAnchorId)
    if (!reservationAuditSection) {
      openDetails()
      return
    }

    reservationAuditSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function handleCopyFullItemText() {
    if (!hasFullItemText) return

    void copyTextToClipboard(fullItemText).then((copied) => {
      if (!copied) return

      setCopiedFullItemText(true)
      if (copyResetTimeoutRef.current != null) {
        window.clearTimeout(copyResetTimeoutRef.current)
      }
      copyResetTimeoutRef.current = window.setTimeout(() => {
        setCopiedFullItemText(false)
        copyResetTimeoutRef.current = null
      }, 1500)
    })
  }

  const card = (
    <div
      className={`rounded-large border-divider/70 bg-content1 hover:border-warning/40 hover:bg-warning/5 relative flex h-full w-full min-w-0 flex-col border p-3 transition-colors ${topRankBadge ? 'pt-9' : ''}`}
    >
      <button
        type="button"
        aria-label={`View ${preview.title}`}
        className="rounded-large focus-visible:outline-primary absolute inset-0 z-10 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
        onClick={openDetails}
      />
      {topRankBadge ? (
        <div
          className={`pointer-events-none absolute top-2 left-2 inline-flex max-w-[8.5rem] items-center gap-1 rounded-full border px-2 py-1 text-[11px] leading-4 font-semibold shadow-sm backdrop-blur ${topRankBadge.className}`}
        >
          {topRankBadge.icon === 'trophy' ? <Trophy size={13} /> : <Award size={13} />}
          <span className="truncate">{topRankBadge.label}</span>
        </div>
      ) : null}
      <div className="flex flex-1 flex-col gap-3">
        <div className="rounded-large border-divider/70 bg-default-100 mx-auto flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center border">
          {iconUrl ? (
            <img
              src={iconUrl}
              alt={preview.title}
              className="h-14 w-14 object-contain"
              loading="lazy"
            />
          ) : (
            <span className="text-default-400 text-xs font-semibold tracking-[0.14em] uppercase">
              {item.slot?.slice(0, 2) ?? 'It'}
            </span>
          )}
        </div>
        <div className="min-w-0 text-center">
          <p className={`wrap-anywhere text-sm font-semibold ${getRarityColor(preview.rarity)}`}>
            {preview.title}
          </p>
          {preview.subtitle ? (
            <p className="text-default-500 wrap-anywhere mt-1 text-[11px] tracking-[0.14em] uppercase">
              {preview.subtitle}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {item.source === 'owned' ? (
              <Chip size="sm" variant="soft" color="success">
                Owned
              </Chip>
            ) : null}
            {item.source === 'compare' ? (
              <Chip size="sm" variant="soft" color="accent">
                Compare
              </Chip>
            ) : null}
            {item.slot ? (
              <Chip size="sm" variant="soft">
                {item.slot}
              </Chip>
            ) : null}
            {linkedSocketCount ? (
              <Chip size="sm" variant="soft" color="accent">
                {linkedSocketCount}-link
              </Chip>
            ) : null}
            {evaluationReasonChip ? (
              <Chip size="sm" variant="soft" color={evaluationReasonChip.color}>
                {evaluationReasonChip.label}
              </Chip>
            ) : null}
            {negativeOverallChip &&
            (!evaluationReasonChip || negativeOverallChip.label !== evaluationReasonChip.label) ? (
              <Chip size="sm" variant="soft" color={negativeOverallChip.color}>
                {negativeOverallChip.label}
              </Chip>
            ) : null}
            {dependencyBadge && dependencyBadge.color !== 'success' ? (
              <Chip size="sm" variant="soft" color={dependencyBadge.color}>
                {dependencyBadge.label}
              </Chip>
            ) : null}
            {missingEssentialCrafts.length > 0 ? (
              <Chip size="sm" variant="soft" color="warning">
                Missing essential craft
              </Chip>
            ) : null}
            {flexibleResistanceSuggestion ? (
              <Chip size="sm" variant="soft" color="accent">
                Suggested action
              </Chip>
            ) : null}
            {comparePowerRow ? (
              <Chip size="sm" variant="soft" color={comparePowerTone}>
                DPS {formatCompareImpact(comparePowerRow)}
              </Chip>
            ) : null}
            {comparePowerEhpLabel ? (
              <Chip size="sm" variant="soft" color={comparePowerEhpTone}>
                EHP {comparePowerEhpLabel}
              </Chip>
            ) : null}
            {reservationScoreEntry ? (
              <button
                type="button"
                className="focus-visible:ring-accent/60 relative z-20 inline-flex cursor-pointer rounded-full focus-visible:ring-2 focus-visible:outline-none"
                aria-label="Open reservation audit"
                onClick={handleReservationBadgeClick}
              >
                <Chip size="sm" variant="soft" color={reservationChipColor}>
                  Reservation {reservationScoreLabel}
                </Chip>
              </button>
            ) : null}
            {plan?.kind === 'bundle' ? (
              <Chip size="sm" variant="soft" color="accent">
                Bundle
              </Chip>
            ) : null}
          </div>
        </div>
      </div>

      <div className="border-divider/70 mt-3 flex items-center justify-between gap-2 border-t pt-3">
        <div className="min-w-0">
          {priceLabel ? (
            <p className="text-foreground wrap-anywhere text-sm font-semibold">{priceLabel}</p>
          ) : null}
          {priceContextLabel ? (
            <p className="text-default-400 mt-1 text-[11px]">{priceContextLabel}</p>
          ) : null}
          {budgetStatus.withinBudgetLimit === false && (budgetStatus.budgetDeltaChaos ?? 0) > 0 ? (
            <p className="text-warning mt-1 text-[11px]">
              {formatCurrencyAmount(
                budgetStatus.budgetDeltaChaos ?? 0,
                currencyDisplay,
                divinePrice,
              )}{' '}
              over budget
            </p>
          ) : null}
          {scoreContextLabel && !topRankBadge ? (
            <p className="text-default-400 mt-1 text-[11px]">{scoreContextLabel}</p>
          ) : null}
          {exactEval ? <p className="text-default-400 mt-1 text-[11px]">Exact-scored</p> : null}
          {comparePowerPercentSummary.length > 0 ? (
            <p className="text-default-400 mt-1 text-[11px]">
              {comparePowerPercentSummary.join(' | ')}
            </p>
          ) : null}
        </div>
        {item.trade_link ? (
          tradeLinksDisabledForStaleRun ? (
            <Button isIconOnly size="sm" variant="tertiary" isDisabled aria-label={tradeActionLabel} className="relative z-20 shrink-0">
              <ExternalLink size={14} aria-hidden="true" />
            </Button>
          ) : (
            <a
              href={item.trade_link}
              target="_blank"
              rel="noopener noreferrer"
              className="button button--sm button--tertiary button--icon-only relative z-20 shrink-0"
              aria-label={tradeActionLabel}
            >
              <ExternalLink size={14} aria-hidden="true" />
            </a>
          )
        ) : null}
      </div>
    </div>
  )

  return (
    <>
      <Tooltip
        content={<RecommendationTooltipContent item={item} analysisNotes={analysisNotes} />}
        placement="right"
        delay={150}
        closeDelay={50}
        classNames={{ base: 'block min-w-0 before:hidden', content: 'bg-transparent p-0 shadow-none' }}
      >
        {card}
      </Tooltip>

      <>
        <Modal.Backdrop
          isOpen={isOpen}
          onOpenChange={(open) => {
            if (!open) setIsOpen(false)
          }}
        >
          <Modal.Container>
            <Modal.Dialog className="w-[calc(100vw-2rem)] max-w-2xl max-h-[calc(100dvh-2rem)] overflow-hidden sm:w-[calc(100vw-4rem)]">
              <Modal.Header className="flex flex-col gap-3">
                <div className="flex items-start gap-4">
                  <div className="rounded-large border-divider/70 bg-default-100 flex h-12 w-12 shrink-0 items-center justify-center border sm:h-20 sm:w-20">
                    {iconUrl ? (
                      <img src={iconUrl} alt="" className="h-10 w-10 object-contain sm:h-16 sm:w-16" />
                    ) : (
                      <span className="text-default-400 text-xs font-semibold tracking-[0.14em] uppercase">
                        {item.slot?.slice(0, 2) ?? 'It'}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <Modal.Heading
                      className={`wrap-anywhere text-base font-semibold ${getRarityColor(preview.rarity)}`}
                    >
                      {preview.title}
                    </Modal.Heading>
                    {preview.subtitle ? (
                      <p className="text-default-500 wrap-anywhere mt-1 text-sm">{preview.subtitle}</p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.source === 'owned' ? (
                        <Chip size="sm" variant="soft" color="success">
                          Owned
                        </Chip>
                      ) : null}
                      {item.source === 'compare' ? (
                        <Chip size="sm" variant="soft" color="accent">
                          Compare source
                        </Chip>
                      ) : null}
                      <Chip size="sm" variant="soft" color={recommendationMode.color}>
                        {recommendationMode.label}
                      </Chip>
                      {dependencyBadge ? (
                        <Chip size="sm" variant="soft" color={dependencyBadge.color}>
                          {dependencyBadge.label}
                        </Chip>
                      ) : null}
                      {missingEssentialCrafts.length > 0 ? (
                        <Tooltip content={missingEssentialCraftsTooltip ?? ''} placement="top">
                          <Chip size="sm" variant="soft" color="warning">
                            Missing essential craft
                          </Chip>
                        </Tooltip>
                      ) : null}
                      {flexibleResistanceSuggestion ? (
                        <Tooltip content={flexibleResistanceTooltip ?? ''} placement="top">
                          <Chip size="sm" variant="soft" color="accent">
                            Suggested action
                          </Chip>
                        </Tooltip>
                      ) : null}
                      {comparePowerRow ? (
                        <Chip size="sm" variant="soft" color={comparePowerTone}>
                          DPS {formatCompareImpact(comparePowerRow)}
                          {comparePowerPercent ? ` (${comparePowerPercent})` : ''}
                        </Chip>
                      ) : null}
                      {comparePowerEhpLabel ? (
                        <Chip size="sm" variant="soft" color={comparePowerEhpTone}>
                          EHP {comparePowerEhpLabel}
                          {comparePowerEhpPercent ? ` (${comparePowerEhpPercent})` : ''}
                        </Chip>
                      ) : null}
                      {reservationScoreEntry ? (
                        <Tooltip content={reservationChipTooltip ?? ''} placement="top">
                          <Chip size="sm" variant="soft" color={reservationChipColor}>
                            Reservation {reservationScoreLabel}
                          </Chip>
                        </Tooltip>
                      ) : null}
                      {plan?.kind === 'bundle' ? (
                        <Chip size="sm" variant="soft" color="accent">
                          Bundle
                        </Chip>
                      ) : null}
                      {item.slot ? (
                        <Chip size="sm" variant="soft">
                          {item.slot}
                        </Chip>
                      ) : null}
                      {evaluationReasonChip ? (
                        <Chip size="sm" variant="soft" color={evaluationReasonChip.color}>
                          {evaluationReasonChip.label}
                        </Chip>
                      ) : null}
                      {negativeOverallChip &&
                      (!evaluationReasonChip ||
                        negativeOverallChip.label !== evaluationReasonChip.label) ? (
                        <Chip size="sm" variant="soft" color={negativeOverallChip.color}>
                          {negativeOverallChip.label}
                        </Chip>
                      ) : null}
                      {exactEval ? (
                        <Chip size="sm" variant="soft" color="accent">
                          Exact-scored
                        </Chip>
                      ) : null}
                      {appliedSlotEffects.length > 0 ? (
                        <Chip size="sm" variant="soft" color="accent">
                          Target anoint
                        </Chip>
                      ) : null}
                      {requiredSourceEffects.length > 0 ? (
                        <Chip size="sm" variant="soft" color="success">
                          Preserves build effect
                        </Chip>
                      ) : null}
                      {reservationSimulation?.resolvesBlocker ? (
                        <Chip size="sm" variant="soft" color="success">
                          Reservation unlock
                        </Chip>
                      ) : null}
                      {priceLabel ? (
                        <Chip size="sm" variant="soft">
                          {priceLabel}
                        </Chip>
                      ) : null}
                      {budgetStatus.withinBudgetLimit === false &&
                      (budgetStatus.budgetDeltaChaos ?? 0) > 0 ? (
                        <Chip size="sm" variant="soft" color="warning">
                          {formatCurrencyAmount(
                            budgetStatus.budgetDeltaChaos ?? 0,
                            currencyDisplay,
                            divinePrice,
                          )}{' '}
                          over budget
                        </Chip>
                      ) : null}
                    </div>
                  </div>
                </div>
              </Modal.Header>
              <Modal.Body className="min-h-0 gap-4 overflow-y-auto">
                {effectiveTradeActionHint ? (
                  <div className="rounded-large border-divider/70 bg-default-50 border p-3">
                    <p className="text-default-700 text-sm">{effectiveTradeActionHint}</p>
                  </div>
                ) : null}

                {plan ? (
                  <div className="rounded-large border-divider/70 border p-3">
                    <p className="text-default-500 text-xs font-semibold tracking-[0.14em] uppercase">
                      Recommendation
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Chip size="sm" variant="soft">
                        {plan.kind}
                      </Chip>
                      {scoreEntries.map((entry) => (
                        <Chip key={entry.key} size="sm" variant="soft">
                          {entry.label.toLowerCase()} {formatScore(entry.value ?? undefined)}
                        </Chip>
                      ))}
                      <Chip size="sm" variant="soft">
                        progress {plan.stage_progress_score.toFixed(2)}
                      </Chip>
                    </div>
                    {plan.summary ? (
                      <p className="text-default-700 mt-3 text-sm">{plan.summary}</p>
                    ) : null}
                    {plan.explanation ? (
                      <p className="text-default-500 mt-2 text-sm">{plan.explanation}</p>
                    ) : null}
                    {scoreContextNote ? (
                      <p className="text-default-500 mt-2 text-sm">{scoreContextNote}</p>
                    ) : null}
                    {comparePowerRow ? (
                      <p className="text-default-500 mt-2 text-sm">
                        Compare estimates this target slot at {formatCompareImpact(comparePowerRow)}
                        {comparePowerPercent ? ` (${comparePowerPercent})` : ''}
                        {comparePowerEhpLabel
                          ? `, with Effective Hit Pool ${comparePowerEhpLabel}${comparePowerEhpPercent ? ` (${comparePowerEhpPercent})` : ''}`
                          : ''}{' '}
                        for this run.
                      </p>
                    ) : null}
                    {evaluationSummaryText || negativeOverallSummaryText ? (
                      <div className="mt-3 flex flex-col gap-2">
                        {evaluationSummaryText ? (
                          <div className="rounded-large border-divider/60 bg-default-50 border p-3">
                            <p className="text-default-700 text-sm">{evaluationSummaryText}</p>
                          </div>
                        ) : null}
                        {negativeOverallSummaryText ? (
                          <div className="rounded-large border-divider/60 bg-default-50 border p-3">
                            <p className="text-default-500 text-sm">{negativeOverallSummaryText}</p>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {planMetricKeys.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {planMetricKeys.map((key) => (
                          <Chip key={key} size="sm" variant="soft">
                            {formatMetricLabel(key)}{' '}
                            {plan.before_metrics[key] != null
                              ? formatMetricValue(plan.before_metrics[key])
                              : '-'}{' '}
                            to{' '}
                            {plan.after_metrics[key] != null
                              ? formatMetricValue(plan.after_metrics[key])
                              : '-'}
                          </Chip>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {flexibleResistanceSuggestion ? (
                  <div className="rounded-large border-divider/70 border p-3">
                    <p className="text-default-500 text-xs font-semibold tracking-[0.14em] uppercase">
                      Suggested action
                    </p>
                    <p className="text-default-700 mt-2 text-sm">
                      This item keeps enough total single-element resistance, but you may need to
                      rebalance the colours to stay capped.
                    </p>
                    <div className="mt-3 flex flex-col gap-2">
                      {flexibleResistanceSuggestion.suggestedActions.map((action) => (
                        <div
                          key={`suggested-action-${action.from}-${action.to}-${action.amount}`}
                          className="rounded-large border-divider/60 bg-default-50 border p-3"
                        >
                          <p className="text-default-700 text-sm">{action.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {dependencies.length > 0 ? (
                  <div className="rounded-large border-divider/70 border p-3">
                    <p className="text-default-500 text-xs font-semibold tracking-[0.14em] uppercase">
                      Build dependencies
                    </p>
                    <div className="mt-2 flex flex-col gap-2">
                      {dependencies.map((dependency) => {
                        const statusChip = getDependencyStatusChip(dependency)
                        return (
                          <div
                            key={`${preview.title}-dependency-${dependency.key}`}
                            className="rounded-large border-divider/60 bg-default-50 border p-3"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <Chip size="sm" variant="soft" color={statusChip.color}>
                                {statusChip.label}
                              </Chip>
                              <Chip size="sm" variant="soft">
                                {dependency.label}
                              </Chip>
                              {dependency.source_label ? (
                                <Chip size="sm" variant="soft" color="accent">
                                  {dependency.source_label}
                                </Chip>
                              ) : null}
                              {dependency.source_slot ? (
                                <Chip size="sm" variant="soft">
                                  {dependency.source_slot}
                                </Chip>
                              ) : null}
                            </div>
                            <p className="text-default-700 mt-2 text-sm">{dependency.note}</p>
                            {dependency.source_detail ? (
                              <p className="text-default-500 mt-1 text-xs">
                                {dependency.source_detail}
                              </p>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="rounded-large border-divider/70 border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-default-500 text-xs font-semibold tracking-[0.14em] uppercase">
                      Full item text
                    </p>
                    <Tooltip content={copiedFullItemText ? 'Copied' : 'Copy to clipboard'}>
                      <Button
                        isIconOnly
                        size="sm"
                        variant="tertiary"
                        aria-label="Copy full item text to clipboard"
                        isDisabled={!hasFullItemText}
                        onPress={handleCopyFullItemText}
                      >
                        {copiedFullItemText ? <Check size={14} /> : <Copy size={14} />}
                      </Button>
                    </Tooltip>
                  </div>
                  {hasFullItemText ? (
                    <div className="rounded-large mt-2 border border-amber-300/20 bg-[#11100d] p-3">
                      {preview.title ? (
                        <p className="font-mono text-xs leading-5 text-[#d7d7d7]">
                          {preview.title}
                        </p>
                      ) : null}
                      {preview.subtitle ? (
                        <p className="font-mono text-xs leading-5 text-[#d7d7d7]">
                          {preview.subtitle}
                        </p>
                      ) : null}
                      {preview.bodyLines.map((line, index) => (
                        <p
                          key={`${preview.title}-body-${index}`}
                          className="font-mono text-xs leading-5 text-[#d7d7d7]"
                        >
                          {line}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-default-500 mt-2 text-sm">
                      No raw item text is available yet.
                    </p>
                  )}
                </div>

                <div className="rounded-large border-divider/70 border p-3">
                  <p className="text-default-500 text-xs font-semibold tracking-[0.14em] uppercase">
                    Simulation details
                  </p>
                  {appliedSlotEffects.length === 0 &&
                  requiredSourceEffects.length === 0 &&
                  !reservationSimulation ? (
                    <p className="text-default-600 mt-2 text-sm">
                      No extra item-specific simulation notes were captured for this recommendation.
                    </p>
                  ) : (
                    <div className="mt-3 flex flex-col gap-3">
                      {appliedSlotEffects.length > 0 ? (
                        <div className="rounded-large border-divider/60 bg-default-50 border p-3">
                          <p className="text-default-500 text-xs font-semibold tracking-[0.14em] uppercase">
                            Applied slot effects
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {appliedSlotEffects.map((effect, index) => (
                              <Chip
                                key={`${effect.kind ?? 'effect'}-${effect.label ?? effect.passiveName ?? index}`}
                                size="sm"
                                variant="soft"
                                color="accent"
                              >
                                {effect.kind === 'transferable_anoint'
                                  ? `Target anoint: ${effect.label ?? effect.passiveName ?? 'Passive'}`
                                  : (effect.label ?? effect.passiveName ?? 'Slot effect')}
                              </Chip>
                            ))}
                          </div>
                          {appliedSlotEffects.map((effect, index) =>
                            effect.allocationLine ? (
                              <p
                                key={`applied-slot-effect-line-${effect.allocationLine}-${index}`}
                                className="text-default-500 mt-2 text-xs"
                              >
                                Simulated with `{effect.allocationLine}` on the equipped item swap.
                              </p>
                            ) : null,
                          )}
                        </div>
                      ) : null}

                      {requiredSourceEffects.length > 0 ? (
                        <div className="rounded-large border-divider/60 bg-default-50 border p-3">
                          <p className="text-default-500 text-xs font-semibold tracking-[0.14em] uppercase">
                            Preserved build effects
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {requiredSourceEffects.map((effect) => (
                              <Chip key={effect.key} size="sm" variant="soft" color="success">
                                {effect.label}
                              </Chip>
                            ))}
                          </div>
                          <div className="mt-3 flex flex-col gap-2">
                            {requiredSourceEffects.map((effect) => (
                              <div
                                key={`${effect.key}-detail`}
                                className="rounded-large border-divider/60 border p-3"
                              >
                                <p className="text-default-700 text-sm">
                                  This recommendation keeps {effect.label} on the item so the target
                                  build still functions as expected.
                                </p>
                                {effect.sourceReason ? (
                                  <p className="text-default-500 mt-1 text-xs">
                                    {effect.sourceReason}
                                  </p>
                                ) : null}
                                {effect.matchedSourceLine &&
                                effect.matchedSourceLine !== effect.sourceReason ? (
                                  <p className="text-default-400 mt-1 text-xs">
                                    Matched line: {effect.matchedSourceLine}
                                  </p>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {reservationSimulation ? (
                        <div className="rounded-large border-divider/60 bg-default-50 border p-3">
                          <p className="text-default-500 text-xs font-semibold tracking-[0.14em] uppercase">
                            Reservation impact
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Chip
                              size="sm"
                              variant="soft"
                              color={reservationSimulation.resolvesBlocker ? 'success' : 'accent'}
                            >
                              {getReservationStatusLabel(reservationSimulation)}
                            </Chip>
                            {reservationSimulation.deltaGain != null ? (
                              <Chip size="sm" variant="soft" color="accent">
                                {formatSignedWholeNumber(reservationSimulation.deltaGain)} mana
                              </Chip>
                            ) : null}
                          </div>
                          {reservationSimulation.beforeDelta != null ||
                          reservationSimulation.afterDelta != null ? (
                            <p className="text-default-700 mt-3 text-sm">
                              Unreserved mana delta{' '}
                              {formatSignedWholeNumber(reservationSimulation.beforeDelta) ?? '?'} to{' '}
                              {formatSignedWholeNumber(reservationSimulation.afterDelta) ?? '?'}.
                            </p>
                          ) : null}
                          {reservationSimulation.progressScore != null &&
                          reservationSimulation.progressScore > 0 ? (
                            <p className="text-default-500 mt-1 text-xs">
                              Reservation progress contributed to the ranking because the baseline
                              stage was mana-blocked.
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              </Modal.Body>
              <Modal.Footer className="flex flex-wrap justify-between gap-3">
                <div className="text-default-500 text-xs">
                  {item.source === 'owned'
                    ? 'Owned item'
                    : item.source === 'compare'
                      ? 'Compare recommendation'
                      : recommendationMode.kind === 'template'
                        ? 'Template refinement candidate'
                        : 'Market recommendation'}
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.trade_link ? (
                    tradeLinksDisabledForStaleRun ? (
                      <Button size="sm" variant="tertiary" isDisabled>
                        {tradeActionLabel}
                      </Button>
                    ) : (
                      <a href={item.trade_link} target="_blank" rel="noopener noreferrer" className="button button--sm button--tertiary">
                        {tradeActionLabel}
                      </a>
                    )
                  ) : null}
                  {canPromote && onPromote ? (
                    <Button size="sm" isPending={promotingRecommendation} onPress={onPromote}>
                      {({ isPending }) => (
                        <>
                          {isPending ? <Spinner size="sm" /> : null}
                          Add to gear queue
                        </>
                      )}
                    </Button>
                  ) : null}
                  <Button size="sm" variant="tertiary" onPress={() => setIsOpen(false)}>
                    Close
                  </Button>
                </div>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </>
    </>
  )
}
