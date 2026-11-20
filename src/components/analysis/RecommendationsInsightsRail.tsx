import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button } from '@heroui/react/button'
import { Chip } from '@heroui/react/chip'
import { Modal } from '@heroui/react/modal'
import { Skeleton } from '@heroui/react/skeleton'
import { useQuery } from '@tanstack/react-query'
import { Clock3, Sparkles, Waves } from 'lucide-react'
import type { MyCharacter } from '../../hooks/useCharacters'
import {
  formatRelativeTimestamp,
  getCharacterProfileSlotLabel,
  getItemDisplayName,
  type CharacterProfileSnapshot,
} from '../../lib/character-profile'
import { getPobTreeSpecUrl } from '../../lib/pob'
import gemColorLookup from '../../assets/poe_gem_color_lookup.json'
import { fetchNinjaSkillGemIcons } from '../../lib/poe-ninja-client'
import { queryKeys } from '../../lib/queryKeys'
import { getUpgradeAnalysisFailureCopy } from '../../lib/upgrade-analysis-run-state'
import { getReservationAudit } from '../../lib/upgrade-analysis-summary'
import {
  formatCompareImpact,
  formatCompareImpactPercent,
  formatCompareSecondaryImpact,
  formatCompareSecondaryImpactPercent,
  getComparePowerReport,
  type ComparePowerRow,
} from '../../lib/compare-power-report'
import type { PobSkillSetLayout, PobTreeSpecLayout, UpgradeAnalysisRun } from '../../types/app'
import { SkillTreeAnalysisPanel, SkillTreeSummaryPanel } from './SkillTreeAnalysisCard'
type RecommendationsInsightsRailProps = {
  selectedCharacter: MyCharacter | null
  selectedProfile: CharacterProfileSnapshot | null
  stageLabel: string | null
  stageTreeSpec: PobTreeSpecLayout | null
  stageSkillSet: PobSkillSetLayout | null
  isDraftStage: boolean
  selectedRun: UpgradeAnalysisRun | null
  selectedRunIsLive: boolean
  passiveTreeRefreshToken: number
  runTransitionLoading?: boolean
  reservationAuditAnchorId?: string
}

type SkillSetGemEntry = {
  name: string
  level: number | null
  quality: string | null
}

type CurrentGemEntry = {
  name: string
  level: number | null
  quality: string | null
  slot: string | null
  itemName: string | null
  icon: string | null
  support: boolean
  socketColor: string | null
}

type LinkGapEntry = {
  targetLinkCount: number
  currentLinkCount: number | null
  missingLinks: number
}

type TargetGemOccurrence = SkillSetGemEntry & {
  groupId: string
  groupLabel: string | null
  slot: string | null
  linkCount: number
}

type CurrentSlotSummary = {
  slot: string
  label: string
  itemName: string | null
  linkGroups: number[]
  gems: CurrentGemEntry[]
}

type MissingTargetGroupEntry = {
  groupId: string
  groupLabel: string | null
  slot: string | null
  linkCount: number
  missingGems: TargetGemOccurrence[]
}

type GemLevelMismatchEntry = {
  name: string
  targetLevel: number
  currentLevel: number
}

type GemQualityMismatchEntry = {
  name: string
  targetQuality: number
  currentQuality: number
}

type MatchedGemPair = {
  target: TargetGemOccurrence
  current: CurrentGemEntry
}

const TARGET_SLOT_TO_PROFILE_SLOTS: Record<string, string[]> = {
  Helmet: ['Helm'],
  Helm: ['Helm'],
  'Body Armour': ['BodyArmour'],
  Gloves: ['Gloves'],
  Boots: ['Boots'],
  'Weapon 1': ['Weapon'],
  'Weapon 2': ['Offhand'],
  'Weapon 1 Swap': ['Weapon2'],
  'Weapon 2 Swap': ['Offhand2'],
  Amulet: ['Amulet'],
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

const knownGemNames = new Set(
  Object.keys(gemColorLookup as Record<string, string>).map((name) => name.toLowerCase()),
)

function isKnownSkillGem(name: string | null | undefined): boolean {
  if (!name) return false
  const cleaned = name
    .replace(/\s*\(Disabled by Default\)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
  return knownGemNames.has(cleaned)
}

function pickPreferredGemEntry<T extends { level: number | null }>(
  current: T | undefined,
  next: T,
): T {
  if (!current) return next
  const currentLevel = current.level ?? -1
  const nextLevel = next.level ?? -1
  return nextLevel > currentLevel ? next : current
}

function parseQualityValue(value: string | null | undefined): number | null {
  if (!value) return null
  const match = value.match(/-?\d+/)
  if (!match) return null
  const parsed = Number(match[0])
  return Number.isFinite(parsed) ? parsed : null
}

function getTargetGemOccurrences(skillSet: PobSkillSetLayout | null): TargetGemOccurrence[] {
  if (!skillSet) return []

  return (skillSet.groups ?? [])
    .filter((group) => group.enabled !== false)
    .flatMap((group) =>
      group.gems
        .filter((gem) => gem.enabled !== false && !gem.isItemGranted && isKnownSkillGem(gem.name))
        .map((gem) => ({
          name: gem.name.replace(/\s*\(Disabled by Default\)\s*$/i, '').trim(),
          level: gem.level,
          quality: gem.quality,
          groupId: group.id,
          groupLabel: group.label,
          slot: group.slot,
          linkCount: group.linkCount,
        })),
    )
    .filter((gem) => !!normalizeGemNameForComparison(gem.name))
}

function getCurrentGems(profile: CharacterProfileSnapshot | null): CurrentGemEntry[] {
  if (!profile) return []

  return profile.gear
    .flatMap((item) =>
      item.socketedItems.map((gem, index) => {
        const displayName = (gem.name.trim() || gem.typeLine.trim()).trim()
        return {
          name: displayName,
          level: gem.level,
          quality: gem.quality,
          slot: item.slot,
          itemName: getItemDisplayName(item),
          icon: gem.icon,
          support: gem.support,
          socketColor: item.sockets[index]?.color ?? null,
        }
      }),
    )
    .filter((gem) => !!normalizeGemNameForComparison(gem.name))
}

function getCurrentLinkGroupSizes(profile: CharacterProfileSnapshot | null): number[] {
  if (!profile) return []

  return profile.gear
    .flatMap((item) => {
      const counts = new Map<number, number>()
      for (const socket of item.sockets) {
        counts.set(socket.group, (counts.get(socket.group) ?? 0) + 1)
      }
      return [...counts.values()]
    })
    .filter((count) => count > 1)
    .sort((left, right) => right - left)
}

function getTargetLinkGroupSizes(skillSet: PobSkillSetLayout | null): number[] {
  if (!skillSet) return []

  return (skillSet.groups ?? [])
    .filter((group) => group.enabled !== false && group.linkCount > 1)
    .map((group) => group.linkCount)
    .sort((left, right) => right - left)
}

function getCurrentSlotSummaries(profile: CharacterProfileSnapshot | null): CurrentSlotSummary[] {
  if (!profile) return []

  return profile.gear
    .filter((item) => !!item.slot)
    .map((item) => {
      const linkGroups = [...new Set(item.sockets.map((socket) => socket.group))]
        .map((groupId) => item.sockets.filter((socket) => socket.group === groupId).length)
        .filter((count) => count > 0)
        .sort((left, right) => right - left)

      const colorMap = gemColorLookup as Record<string, string>
      const gems = item.socketedItems
        .map((gem) => {
          const gemName = (gem.name.trim() || gem.typeLine.trim()).trim()
          const normalizedName = gemName.replace(/\s+Support\s*$/i, '').trim()
          const socketColor = colorMap[gemName] ?? colorMap[normalizedName] ?? null
          return {
            name: gemName,
            level: gem.level,
            quality: gem.quality,
            slot: item.slot,
            itemName: getItemDisplayName(item),
            icon: gem.icon,
            support: gem.support,
            socketColor,
          }
        })
        .filter((gem) => !!normalizeGemNameForComparison(gem.name))

      return {
        slot: item.slot!,
        label: getCharacterProfileSlotLabel(item.slot),
        itemName: getItemDisplayName(item),
        linkGroups,
        gems,
      } satisfies CurrentSlotSummary
    })
}

function getComparableCurrentSlots(
  targetSlot: string | null | undefined,
  currentSlots: CurrentSlotSummary[],
): CurrentSlotSummary[] {
  const mappedSlots = targetSlot ? (TARGET_SLOT_TO_PROFILE_SLOTS[targetSlot] ?? []) : []
  if (mappedSlots.length > 0) {
    return currentSlots.filter((slot) => mappedSlots.includes(slot.slot))
  }

  if (!targetSlot?.trim()) return []
  const normalizedTarget = targetSlot.trim().toLowerCase()
  return currentSlots.filter((slot) => slot.label.trim().toLowerCase() === normalizedTarget)
}

function matchTargetAndCurrentGems(
  targetGems: TargetGemOccurrence[],
  currentGems: CurrentGemEntry[],
): {
  matchedPairs: MatchedGemPair[]
  missingGems: TargetGemOccurrence[]
} {
  const targetByKey = new Map<string, TargetGemOccurrence[]>()
  const currentByKey = new Map<string, CurrentGemEntry[]>()

  for (const gem of targetGems) {
    const key = normalizeGemNameForComparison(gem.name)
    if (!key) continue
    const entries = targetByKey.get(key) ?? []
    entries.push(gem)
    targetByKey.set(key, entries)
  }

  for (const gem of currentGems) {
    const key = normalizeGemNameForComparison(gem.name)
    if (!key) continue
    const entries = currentByKey.get(key) ?? []
    entries.push(gem)
    currentByKey.set(key, entries)
  }

  const matchedPairs: MatchedGemPair[] = []
  const missingGems: TargetGemOccurrence[] = []

  for (const [key, targets] of targetByKey.entries()) {
    const currents = [...(currentByKey.get(key) ?? [])].sort(
      (left, right) => (right.level ?? -1) - (left.level ?? -1),
    )
    const sortedTargets = [...targets].sort(
      (left, right) => (right.level ?? -1) - (left.level ?? -1),
    )
    const pairCount = Math.min(sortedTargets.length, currents.length)

    for (let index = 0; index < pairCount; index += 1) {
      matchedPairs.push({
        target: sortedTargets[index],
        current: currents[index],
      })
    }

    if (sortedTargets.length > pairCount) {
      missingGems.push(...sortedTargets.slice(pairCount))
    }
  }

  return { matchedPairs, missingGems }
}

function getMissingTargetGroups(missingGems: TargetGemOccurrence[]): MissingTargetGroupEntry[] {
  const groups = new Map<string, MissingTargetGroupEntry>()

  for (const gem of missingGems) {
    const current = groups.get(gem.groupId)
    if (current) {
      current.missingGems.push(gem)
      continue
    }

    groups.set(gem.groupId, {
      groupId: gem.groupId,
      groupLabel: gem.groupLabel,
      slot: gem.slot,
      linkCount: gem.linkCount,
      missingGems: [gem],
    })
  }

  return [...groups.values()]
}

function getMissingSkillSetGems(missingGems: TargetGemOccurrence[]): SkillSetGemEntry[] {
  const gemsByKey = new Map<string, SkillSetGemEntry>()

  for (const gem of missingGems) {
    const key = normalizeGemNameForComparison(gem.name)
    if (!key) continue
    gemsByKey.set(key, pickPreferredGemEntry(gemsByKey.get(key), gem))
  }

  return [...gemsByKey.values()].sort((left, right) => left.name.localeCompare(right.name))
}

function getGemLevelMismatches(matchedPairs: MatchedGemPair[]): GemLevelMismatchEntry[] {
  return matchedPairs
    .map(({ target, current }) => {
      if (target.level == null || current.level == null || current.level === target.level)
        return null
      return {
        name: target.name,
        targetLevel: target.level,
        currentLevel: current.level,
      } satisfies GemLevelMismatchEntry
    })
    .filter((entry): entry is GemLevelMismatchEntry => !!entry)
}

function getGemQualityMismatches(matchedPairs: MatchedGemPair[]): GemQualityMismatchEntry[] {
  return matchedPairs
    .map(({ target, current }) => {
      const targetQuality = parseQualityValue(target.quality)
      const currentQuality = parseQualityValue(current.quality)
      if (targetQuality == null || currentQuality == null || targetQuality === currentQuality) {
        return null
      }

      return {
        name: target.name,
        targetQuality,
        currentQuality,
      } satisfies GemQualityMismatchEntry
    })
    .filter((entry): entry is GemQualityMismatchEntry => !!entry)
}

function getLinkGaps(targetLinkGroups: number[], currentLinkGroups: number[]): LinkGapEntry[] {
  const remainingCurrent = [...currentLinkGroups].sort((left, right) => right - left)
  const gaps: LinkGapEntry[] = []

  for (const targetLinkCount of targetLinkGroups) {
    const exactOrBetterMatchIndex = remainingCurrent.findIndex((count) => count >= targetLinkCount)
    if (exactOrBetterMatchIndex >= 0) {
      remainingCurrent.splice(exactOrBetterMatchIndex, 1)
      continue
    }

    const bestCurrent = remainingCurrent.shift() ?? null
    gaps.push({
      targetLinkCount,
      currentLinkCount: bestCurrent,
      missingLinks:
        bestCurrent == null ? targetLinkCount : Math.max(0, targetLinkCount - bestCurrent),
    })
  }

  return gaps
}

function formatManaDelta(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return 'Unknown fit'
  const rounded = Math.round(value)
  if (rounded < 0) return `Needs ${Math.abs(rounded)} mana`
  if (rounded === 0) return 'Exact fit'
  return `${rounded} mana spare`
}

function getReservationTone(status: 'fit' | 'blocked' | 'excess' | 'unknown'): {
  color: 'success' | 'warning' | 'danger' | 'default'
  label: string
  description: string
} {
  switch (status) {
    case 'fit':
      return {
        color: 'success',
        label: 'Reservation fits',
        description: 'The selected skill package fits within the current mana setup.',
      }
    case 'blocked':
      return {
        color: 'danger',
        label: 'Reservation blocked',
        description: 'The current setup cannot reserve the full target package yet.',
      }
    case 'excess':
      return {
        color: 'warning',
        label: 'Reservation has slack',
        description: 'There is room to spend more of the available mana budget.',
      }
    default:
      return {
        color: 'default',
        label: 'Reservation unknown',
        description: 'Reservation math was not available for this run.',
      }
  }
}

function getToneClasses(color: 'success' | 'warning' | 'danger' | 'default'): string {
  switch (color) {
    case 'success':
      return 'border-success/40 bg-success/10'
    case 'warning':
      return 'border-warning/40 bg-warning/10'
    case 'danger':
      return 'border-danger/40 bg-danger/10'
    default:
      return 'border-divider/70 bg-default-50/60'
  }
}

function buildGemIconLookup(
  profile: CharacterProfileSnapshot | null,
  ninjaGems: Array<{ name: string; icon: string }>,
): Map<string, { icon: string; socketColor: string | null }> {
  const lookup = new Map<string, { icon: string; socketColor: string | null }>()

  // poe.ninja gems as base layer — icons only; derive socket color from asset lookup
  const colorMap = gemColorLookup as Record<string, string>
  for (const gem of ninjaGems) {
    const key = normalizeGemNameForComparison(gem.name)
    if (key) {
      // Try the full name first (JSON has "Multistrike Support"), then the normalized key
      const socketColor = colorMap[gem.name] ?? colorMap[key] ?? null
      lookup.set(key, { icon: gem.icon, socketColor })
    }
  }

  // Profile gems override — icons from profile; color from JSON by gem name
  if (profile) {
    for (const item of profile.gear) {
      for (let i = 0; i < item.socketedItems.length; i++) {
        const gem = item.socketedItems[i]
        const gemName = gem.name || gem.typeLine
        const key = normalizeGemNameForComparison(gemName)
        if (key && gem.icon) {
          const normalizedName = gemName.replace(/\s+Support\s*$/i, '').trim()
          const socketColor = colorMap[gemName] ?? colorMap[normalizedName] ?? null
          lookup.set(key, { icon: gem.icon, socketColor })
        }
      }
    }
  }

  return lookup
}

function getSocketTextColorClass(socketColor: string | null): string {
  const normalized = socketColor?.toUpperCase() ?? null
  switch (normalized) {
    case 'RED':
    case 'S':
    case 'R':
    case 'STRENGTH':
      return 'text-red-800 dark:text-red-300'
    case 'GREEN':
    case 'D':
    case 'G':
    case 'DEXTERITY':
      return 'text-green-800 dark:text-green-300'
    case 'BLUE':
    case 'I':
    case 'B':
    case 'INTELLIGENCE':
      return 'text-blue-800 dark:text-blue-300'
    case 'W':
      return 'text-foreground'
    case 'A':
    case 'ABYSS':
      return 'text-amber-900 dark:text-amber-200'
    default:
      return 'text-foreground'
  }
}

function GemChip({
  name,
  icon,
  socketColor,
  color,
}: {
  name: string
  icon?: string | null
  socketColor?: string | null
  support?: boolean
  color?: 'warning' | 'secondary' | 'default'
}) {
  const textColor = getSocketTextColorClass(socketColor ?? null)
  const borderColor =
    color === 'warning'
      ? 'border-warning/40 bg-warning/10'
      : color === 'secondary'
        ? 'border-secondary/40 bg-secondary/10'
        : 'border-divider bg-content2'

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border py-0.5 pr-2 pl-0.5 text-[11px] leading-4 ${borderColor} ${textColor}`}
    >
      {icon ? (
        <img src={icon} alt="" className="h-4 w-4 rounded-full object-contain" />
      ) : (
        <span className="bg-default-400/40 h-3 w-3 shrink-0 rounded-full" />
      )}
      <span className="truncate">{name}</span>
    </span>
  )
}

function Section({
  id,
  title,
  children,
}: {
  id?: string
  title: string
  children: ReactNode
}) {
  return (
    <section
      id={id}
      className="rounded-large border-divider/70 bg-content1/70 scroll-mt-24 border p-4"
    >
      <h3 className="text-foreground text-sm font-semibold">{title}</h3>
      <div className="mt-2.5">{children}</div>
    </section>
  )
}

function ComparePowerRowItem({ row, metricLabel }: { row: ComparePowerRow; metricLabel: string }) {
  const percent = formatCompareImpactPercent(row)
  const ehpImpact = row.secondaryImpacts.totalEhp
  const ehpLabel = formatCompareSecondaryImpact(ehpImpact)
  const ehpPercent = formatCompareSecondaryImpactPercent(ehpImpact)
  const tone =
    row.impact > 0
      ? 'border-success/30 bg-success/10 text-success-600'
      : row.impact < 0
        ? 'border-danger/30 bg-danger/10 text-danger-600'
        : 'border-default-200 bg-default-100 text-default-600'

  return (
    <div className="rounded-large border-divider/70 bg-default-50/70 flex items-start justify-between gap-3 border p-3">
      <div className="min-w-0">
        <p className="text-foreground truncate text-sm font-semibold">{row.name}</p>
        <p className="text-default-500 mt-1 text-xs">
          {row.slot ?? (row.nodeId != null ? `Node ${row.nodeId}` : metricLabel)}
          {row.perPoint != null ? ` · ${Math.round(row.perPoint).toLocaleString()} per point` : ''}
        </p>
      </div>
      <Chip size="sm" variant="soft" className={`shrink-0 border ${tone}`}>
        {formatCompareImpact(row)}
        {percent ? ` (${percent})` : ''}
      </Chip>
      {ehpLabel ? (
        <Chip
          size="sm"
          variant="soft"
          color={ehpImpact.impact >= 0 ? 'success' : 'danger'}
          className="shrink-0"
        >
          EHP {ehpLabel}
          {ehpPercent ? ` (${ehpPercent})` : ''}
        </Chip>
      ) : null}
    </div>
  )
}

function formatLinkCount(count: number): string {
  return `${count}-link`
}

function formatLinkGroupSummary(linkGroups: number[]): string {
  if (!linkGroups.length) return 'No linked groups detected'
  return linkGroups.map(formatLinkCount).join(' + ')
}

function sortCompareRowsByMagnitude(rows: ComparePowerRow[]): ComparePowerRow[] {
  return [...rows].sort((left, right) => Math.abs(right.impact) - Math.abs(left.impact))
}

export function RecommendationsInsightsRail({
  selectedCharacter,
  selectedProfile,
  stageLabel,
  stageTreeSpec,
  stageSkillSet,
  isDraftStage,
  selectedRun,
  selectedRunIsLive,
  passiveTreeRefreshToken,
  runTransitionLoading = false,
  reservationAuditAnchorId,
}: RecommendationsInsightsRailProps) {
  const [treeDetailsOpen, setTreeDetailsOpen] = useState(false)
  const [skillDetailsOpen, setSkillDetailsOpen] = useState(false)

  const targetGemOccurrences = getTargetGemOccurrences(stageSkillSet)
  const currentGems = getCurrentGems(selectedProfile)
  const currentSlotSummaries = getCurrentSlotSummaries(selectedProfile)
  const currentLinkGroups = getCurrentLinkGroupSizes(selectedProfile)
  const targetLinkGroups = getTargetLinkGroupSizes(stageSkillSet)
  const { matchedPairs, missingGems } = matchTargetAndCurrentGems(targetGemOccurrences, currentGems)
  const missingSkillSetGems = getMissingSkillSetGems(missingGems)
  const missingTargetGroups = getMissingTargetGroups(missingGems)
  const gemLevelMismatches = getGemLevelMismatches(matchedPairs)
  const gemQualityMismatches = getGemQualityMismatches(matchedPairs)
  const linkGaps = getLinkGaps(targetLinkGroups, currentLinkGroups)

  const { data: ninjaGemIcons } = useQuery({
    queryKey: queryKeys.ninja.gemIcons,
    queryFn: () => fetchNinjaSkillGemIcons('poe1'),
    staleTime: 1000 * 60 * 60,
  })
  const gemIconLookup = useMemo(
    () => buildGemIconLookup(selectedProfile, ninjaGemIcons ?? []),
    [selectedProfile, ninjaGemIcons],
  )
  const selectedRunFailureCopy = getUpgradeAnalysisFailureCopy(selectedRun)
  const reservationAudit = getReservationAudit(selectedRun?.summary)
  const reservationTone = getReservationTone(reservationAudit?.status ?? 'unknown')
  const displayedSkillSetTitle =
    reservationAudit?.target_skill_set_title ?? stageSkillSet?.title ?? stageLabel ?? null
  const targetTreeUrl = getPobTreeSpecUrl(stageTreeSpec)
  const comparePowerReport = useMemo(
    () => getComparePowerReport(selectedRun?.summary),
    [selectedRun?.summary],
  )
  const passiveCompareRows = useMemo(
    () =>
      sortCompareRowsByMagnitude(
        comparePowerReport?.rows.filter(
          (row) => row.actionType === 'passive_node' || row.category === 'tree_node',
        ) ?? [],
      ),
    [comparePowerReport],
  )
  const skillGemCompareRows = useMemo(
    () =>
      sortCompareRowsByMagnitude(
        comparePowerReport?.rows.filter(
          (row) =>
            row.actionType === 'skill_gem' ||
            row.actionType === 'support_gem' ||
            row.category === 'skill_gem' ||
            row.category === 'support_gem',
        ) ?? [],
      ),
    [comparePowerReport],
  )

  useEffect(() => {
    setTreeDetailsOpen(false)
    setSkillDetailsOpen(false)
  }, [passiveTreeRefreshToken])

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Section title="Passive tree">
        {runTransitionLoading ? (
          <div className="rounded-large border-divider/70 bg-default-50/60 flex flex-col gap-3 border p-4">
            <Skeleton className="h-4 w-40 rounded-md" />
            <Skeleton className="h-3 w-56 rounded-md" />
            <div className="flex gap-2">
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <SkillTreeSummaryPanel
              key={`tree-summary-${passiveTreeRefreshToken}`}
              selectedCharacter={selectedCharacter}
              selectedProfile={selectedProfile}
              stageLabel={stageLabel}
              stageTreeSpec={stageTreeSpec}
              isDraftStage={isDraftStage}
            />
            <div className="flex justify-end">
              <Button size="sm" variant="tertiary" onPress={() => setTreeDetailsOpen(true)}>
                View tree details
              </Button>
            </div>
          </div>
        )}
      </Section>

      <>
        <Modal.Backdrop
          isOpen={treeDetailsOpen}
          onOpenChange={(open) => {
            if (!open) setTreeDetailsOpen(false)
          }}
        >
          <Modal.Container>
            <Modal.Dialog className="w-[calc(100vw-2rem)] max-w-[96rem] max-h-[calc(100dvh-2rem)] overflow-hidden sm:w-[calc(100vw-4rem)]">
              <Modal.Header className="flex flex-col gap-2">
                <div>
                  <Modal.Heading>Passive tree details</Modal.Heading>
                  <p className="text-default-500 mt-1 text-sm">
                    Compare allocated nodes and adjust the tree used for analysis.
                  </p>
                </div>
              </Modal.Header>
              <Modal.Body className="min-h-0 gap-4 overflow-y-auto">
                <SkillTreeAnalysisPanel
                  key={`tree-details-${passiveTreeRefreshToken}`}
                  selectedCharacter={selectedCharacter}
                  selectedProfile={selectedProfile}
                  stageLabel={stageLabel}
                  stageTreeSpec={stageTreeSpec}
                  isDraftStage={isDraftStage}
                  passiveImpactRows={passiveCompareRows}
                  passiveImpactMetricLabel={comparePowerReport?.metricLabel ?? null}
                />
              </Modal.Body>
              <Modal.Footer>
                <Button size="sm" variant="tertiary" onPress={() => setTreeDetailsOpen(false)}>
                  Close
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </>

      <Section title="Skill gems">
        {runTransitionLoading ? (
          <div className="rounded-large border-divider/70 bg-default-50/60 flex flex-col gap-3 border p-4">
            <Skeleton className="h-4 w-36 rounded-md" />
            <Skeleton className="h-3 w-52 rounded-md" />
            <div className="flex flex-wrap gap-1.5">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-6 w-20 rounded-full" />
              ))}
            </div>
          </div>
        ) : !stageSkillSet ? (
          <p className="text-default-600 text-sm">Choose a skill set to compare gems and links.</p>
        ) : !selectedProfile ? (
          <p className="text-default-600 text-sm">Sync the character to compare gems and links.</p>
        ) : missingSkillSetGems.length === 0 &&
          linkGaps.length === 0 &&
          gemLevelMismatches.length === 0 &&
          gemQualityMismatches.length === 0 ? (
          <div className="rounded-large border-success/40 bg-success/10 flex flex-col gap-4 border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-foreground text-sm font-semibold">No obvious gem gaps</p>
                <p className="text-default-600 mt-1 text-sm">
                  The current character already covers the selected target skill package at the gem,
                  quality, level, and link-shell summary level.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Chip size="sm" variant="soft" color={isDraftStage ? 'accent' : 'success'}>
                  {isDraftStage ? 'Unsaved setup' : 'Saved setup'}
                </Chip>
              </div>
            </div>
            <div className="flex justify-end">
              <Button size="sm" variant="tertiary" onPress={() => setSkillDetailsOpen(true)}>
                View skill gem details
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-foreground text-sm font-semibold">{stageSkillSet.title}</p>
                <p className="text-default-500 mt-1 text-xs">
                  {missingSkillSetGems.length} missing gem
                  {missingSkillSetGems.length === 1 ? '' : 's'}
                  {linkGaps.length > 0
                    ? `, ${linkGaps.length} link gap${linkGaps.length === 1 ? '' : 's'}`
                    : ''}
                  {gemLevelMismatches.length > 0
                    ? `, ${gemLevelMismatches.length} level mismatch${gemLevelMismatches.length === 1 ? '' : 'es'}`
                    : ''}
                  {gemQualityMismatches.length > 0
                    ? `, ${gemQualityMismatches.length} quality mismatch${gemQualityMismatches.length === 1 ? '' : 'es'}`
                    : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {gemLevelMismatches.length > 0 ? (
                  <Chip size="sm" variant="soft" color="accent">
                    {gemLevelMismatches.length} gem level
                    {gemLevelMismatches.length === 1 ? '' : 's'} differ
                  </Chip>
                ) : null}
                {gemQualityMismatches.length > 0 ? (
                  <Chip size="sm" variant="soft" color="accent">
                    {gemQualityMismatches.length} gem quality
                    {gemQualityMismatches.length === 1 ? '' : 'ies'} differ
                  </Chip>
                ) : null}
                <Chip size="sm" variant="soft" color={isDraftStage ? 'accent' : 'default'}>
                  {isDraftStage ? 'Unsaved setup' : 'Saved setup'}
                </Chip>
              </div>
            </div>
            {missingSkillSetGems.length > 0 ? (
              <div className="rounded-large border-divider/70 bg-default-50/60 border p-4">
                <p className="text-foreground text-sm font-semibold">Missing gems</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {missingSkillSetGems.slice(0, 12).map((gem, index) => {
                    const resolved = gemIconLookup.get(
                      normalizeGemNameForComparison(gem.name) ?? '',
                    )
                    return (
                      <GemChip
                        key={`${gem.name}-${gem.level ?? 'na'}-${gem.quality ?? 'na'}-${index}`}
                        name={gem.name}
                        icon={resolved?.icon}
                        socketColor={resolved?.socketColor}
                      />
                    )
                  })}
                  {missingSkillSetGems.length > 12 ? (
                    <Chip size="sm" variant="soft">
                      +{missingSkillSetGems.length - 12} more
                    </Chip>
                  ) : null}
                </div>
              </div>
            ) : null}
            {linkGaps.length > 0 ? (
              <div className="rounded-large border-warning/30 bg-warning/5 border p-4">
                <p className="text-foreground text-sm font-semibold">Link gaps</p>
                <div className="text-default-600 mt-2 flex flex-col gap-2 text-sm">
                  {linkGaps.map((gap, index) => (
                    <p key={`${gap.targetLinkCount}-${gap.currentLinkCount ?? 'none'}-${index}`}>
                      Need a {gap.targetLinkCount}-link
                      {gap.currentLinkCount != null
                        ? `; best current match is ${gap.currentLinkCount}-link`
                        : '; no comparable linked group is equipped'}
                      .
                    </p>
                  ))}
                </div>
              </div>
            ) : null}
            {gemLevelMismatches.length > 0 ? (
              <div className="rounded-large border-secondary/30 bg-secondary/10 border p-4">
                <p className="text-foreground text-sm font-semibold">Gem levels differ</p>
                <p className="text-default-600 mt-1 text-sm">
                  Level-only mismatches are tracked separately and do not count as missing gems.
                </p>
              </div>
            ) : null}
            {gemQualityMismatches.length > 0 ? (
              <div className="rounded-large border-secondary/30 bg-secondary/10 border p-4">
                <p className="text-foreground text-sm font-semibold">Gem qualities differ</p>
                <p className="text-default-600 mt-1 text-sm">
                  Quality-only mismatches are tracked separately and do not count as missing gems.
                </p>
              </div>
            ) : null}
            <div className="flex justify-end">
              <Button size="sm" variant="tertiary" onPress={() => setSkillDetailsOpen(true)}>
                View skill gem details
              </Button>
            </div>
          </div>
        )}
      </Section>

      <>
        <Modal.Backdrop
          isOpen={skillDetailsOpen}
          onOpenChange={(open) => {
            if (!open) setSkillDetailsOpen(false)
          }}
        >
          <Modal.Container>
            <Modal.Dialog className="w-[calc(100vw-2rem)] max-w-3xl max-h-[calc(100dvh-2rem)] overflow-hidden sm:w-[calc(100vw-4rem)]">
              <Modal.Header className="flex flex-col gap-2">
                <div>
                  <Modal.Heading>Skill gem details</Modal.Heading>
                  <p className="text-default-500 mt-1 text-sm">
                    Compare the selected target skill set against the current character, including
                    missing gems, intended link groups, current slot gems, and gem stat drift.
                  </p>
                </div>
              </Modal.Header>
              <Modal.Body className="min-h-0 overflow-y-auto">
                {!stageSkillSet ? (
                  <div className="rounded-large border-divider/70 bg-default-50/60 border p-4">
                    <p className="text-default-600 text-sm">
                      Choose a skill set in the setup above to inspect gem details.
                    </p>
                  </div>
                ) : !selectedProfile ? (
                  <div className="rounded-large border-divider/70 bg-default-50/60 border p-4">
                    <p className="text-default-600 text-sm">
                      Sync a character profile first to inspect gem details against the selected
                      target skill set.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    <div className="rounded-large border-divider/70 bg-default-50/60 border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-foreground text-sm font-semibold">
                            {stageSkillSet.title}
                          </p>
                          <p className="text-default-600 mt-1 text-sm">
                            Comparing the target skill package against{' '}
                            {selectedProfile.character_name ??
                              selectedCharacter?.name ??
                              'the selected character'}
                            .
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Chip
                            size="sm"
                            variant="soft"
                            color={missingSkillSetGems.length > 0 ? 'warning' : 'success'}
                          >
                            {missingSkillSetGems.length} missing
                          </Chip>
                          <Chip
                            size="sm"
                            variant="soft"
                            color={linkGaps.length > 0 ? 'warning' : 'success'}
                          >
                            {linkGaps.length} link gaps
                          </Chip>
                          <Chip
                            size="sm"
                            variant="soft"
                            color={gemLevelMismatches.length > 0 ? 'accent' : 'success'}
                          >
                            {gemLevelMismatches.length} level diffs
                          </Chip>
                          <Chip
                            size="sm"
                            variant="soft"
                            color={gemQualityMismatches.length > 0 ? 'accent' : 'success'}
                          >
                            {gemQualityMismatches.length} quality diffs
                          </Chip>
                        </div>
                      </div>
                    </div>

                    {comparePowerReport && skillGemCompareRows.length > 0 ? (
                      <div className="rounded-large border-divider/70 bg-default-50/60 border p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-foreground text-sm font-semibold">
                            Compare gem impact
                          </p>
                          <Chip size="sm" variant="soft" color="accent">
                            {comparePowerReport.metricLabel}
                          </Chip>
                        </div>
                        <div className="mt-3 flex flex-col gap-2">
                          {skillGemCompareRows.slice(0, 20).map((row) => (
                            <ComparePowerRowItem
                              key={`gem-compare-${row.sourceKey ?? row.name}`}
                              row={row}
                              metricLabel={comparePowerReport.metricLabel}
                            />
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {missingTargetGroups.length > 0 ? (
                      <div className="rounded-large border-warning/30 bg-warning/5 border p-4">
                        <p className="text-foreground text-sm font-semibold">
                          Missing target groups
                        </p>
                        <div className="mt-3 flex flex-col gap-3">
                          {missingTargetGroups.map((group) => {
                            const comparableSlots = getComparableCurrentSlots(
                              group.slot,
                              currentSlotSummaries,
                            )
                            return (
                              <div
                                key={group.groupId}
                                className="rounded-large border-divider/70 bg-content1/70 border p-3"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <Chip size="sm" variant="soft" color="warning">
                                    {group.missingGems.length} missing gem
                                    {group.missingGems.length === 1 ? '' : 's'}
                                  </Chip>
                                  {group.slot ? (
                                    <Chip size="sm" variant="soft">
                                      {group.slot}
                                    </Chip>
                                  ) : null}
                                  {group.linkCount > 1 ? (
                                    <Chip size="sm" variant="soft">
                                      Target {formatLinkCount(group.linkCount)}
                                    </Chip>
                                  ) : null}
                                  {group.groupLabel ? (
                                    <Chip size="sm" variant="soft">
                                      {group.groupLabel}
                                    </Chip>
                                  ) : null}
                                </div>
                                <div className="mt-3 flex flex-wrap gap-1.5">
                                  {group.missingGems.map((gem, index) => {
                                    const resolved = gemIconLookup.get(
                                      normalizeGemNameForComparison(gem.name) ?? '',
                                    )
                                    return (
                                      <GemChip
                                        key={`${group.groupId}-${gem.name}-${index}`}
                                        name={gem.name}
                                        icon={resolved?.icon}
                                        socketColor={resolved?.socketColor}
                                      />
                                    )
                                  })}
                                </div>
                                <div className="mt-3 flex flex-col gap-2">
                                  {comparableSlots.length > 0 ? (
                                    comparableSlots.map((slot) => (
                                      <div
                                        key={`${group.groupId}-${slot.slot}`}
                                        className="rounded-large border-divider/70 bg-default-50/60 border p-3"
                                      >
                                        <div className="flex flex-wrap items-center gap-2">
                                          <Chip size="sm" variant="soft">
                                            {slot.label}
                                          </Chip>
                                          {slot.itemName ? (
                                            <Chip size="sm" variant="soft">
                                              {slot.itemName}
                                            </Chip>
                                          ) : null}
                                          <Chip size="sm" variant="soft">
                                            Current links: {formatLinkGroupSummary(slot.linkGroups)}
                                          </Chip>
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                          {slot.gems.length > 0 ? (
                                            slot.gems.map((gem, index) => {
                                              const fallback = gem.icon
                                                ? null
                                                : gemIconLookup.get(
                                                    normalizeGemNameForComparison(gem.name) ?? '',
                                                  )
                                              return (
                                                <GemChip
                                                  key={`${slot.slot}-${gem.name}-${index}`}
                                                  name={gem.name}
                                                  icon={gem.icon || fallback?.icon}
                                                  socketColor={gem.socketColor}
                                                />
                                              )
                                            })
                                          ) : (
                                            <p className="text-default-500 text-sm">
                                              No current gems detected in this slot.
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    ))
                                  ) : (
                                    <p className="text-default-500 text-sm">
                                      No comparable current slot could be matched for this target
                                      group.
                                    </p>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ) : null}

                    {linkGaps.length > 0 ? (
                      <div className="rounded-large border-warning/30 bg-warning/5 border p-4">
                        <p className="text-foreground text-sm font-semibold">Link gaps</p>
                        <div className="text-default-600 mt-2 flex flex-col gap-2 text-sm">
                          {linkGaps.map((gap, index) => (
                            <p
                              key={`${gap.targetLinkCount}-${gap.currentLinkCount ?? 'none'}-${index}`}
                            >
                              Need a {formatLinkCount(gap.targetLinkCount)}
                              {gap.currentLinkCount != null
                                ? `; best current match is ${formatLinkCount(gap.currentLinkCount)}`
                                : '; no comparable linked group is equipped'}
                              .
                            </p>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {gemLevelMismatches.length > 0 ? (
                      <div className="rounded-large border-secondary/30 bg-secondary/10 border p-4">
                        <p className="text-foreground text-sm font-semibold">Level differences</p>
                        <div className="mt-3 flex flex-col gap-2">
                          {gemLevelMismatches.map((entry, index) => {
                            const resolved = gemIconLookup.get(
                              normalizeGemNameForComparison(entry.name) ?? '',
                            )
                            return (
                              <div
                                key={`${entry.name}-${entry.currentLevel}-${entry.targetLevel}-${index}`}
                                className="rounded-large border-divider/70 bg-content1/70 border p-3"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <GemChip
                                    name={entry.name}
                                    icon={resolved?.icon}
                                    socketColor={resolved?.socketColor}
                                    color="secondary"
                                  />
                                  <Chip size="sm" variant="soft">
                                    Current {entry.currentLevel}
                                    {' -> '}
                                    Target {entry.targetLevel}
                                  </Chip>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ) : null}

                    {gemQualityMismatches.length > 0 ? (
                      <div className="rounded-large border-secondary/30 bg-secondary/10 border p-4">
                        <p className="text-foreground text-sm font-semibold">Quality differences</p>
                        <div className="mt-3 flex flex-col gap-2">
                          {gemQualityMismatches.map((entry, index) => {
                            const resolved = gemIconLookup.get(
                              normalizeGemNameForComparison(entry.name) ?? '',
                            )
                            return (
                              <div
                                key={`${entry.name}-${entry.currentQuality}-${entry.targetQuality}-${index}`}
                                className="rounded-large border-divider/70 bg-content1/70 border p-3"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <GemChip
                                    name={entry.name}
                                    icon={resolved?.icon}
                                    socketColor={resolved?.socketColor}
                                    color="secondary"
                                  />
                                  <Chip size="sm" variant="soft">
                                    Current {entry.currentQuality}%{' -> '}
                                    Target {entry.targetQuality}%
                                  </Chip>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </Modal.Body>
              <Modal.Footer>
                <Button size="sm" variant="tertiary" onPress={() => setSkillDetailsOpen(false)}>
                  Close
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </>

      <Section id={reservationAuditAnchorId} title="Reservation audit">
        {runTransitionLoading ? (
          <div className="rounded-large border-divider/70 bg-default-50/60 flex flex-col gap-3 border p-4">
            <Skeleton className="h-4 w-40 rounded-md" />
            <Skeleton className="h-3 w-56 rounded-md" />
            <div className="flex gap-2">
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          </div>
        ) : !selectedRun ? (
          <div className="rounded-large border-divider/70 bg-default-50/60 border p-4">
            <p className="text-default-600 text-sm">
              Run analysis to see whether the current setup can reserve the selected skill package.
            </p>
          </div>
        ) : selectedRunIsLive ? (
          <div className="rounded-large border-warning/40 bg-warning/10 border p-4">
            <div className="flex items-start gap-3">
              <Clock3 size={16} className="text-warning mt-0.5 shrink-0" />
              <div>
                <p className="text-foreground text-sm font-semibold">Waiting for run output</p>
                <p className="text-default-600 mt-1 text-sm">
                  Reservation results will appear here when the current run finishes.
                </p>
              </div>
            </div>
          </div>
        ) : selectedRun.status === 'failed' ? (
          <div className="rounded-large border-danger/40 bg-danger/10 border p-4">
            <p className="text-foreground text-sm font-semibold">{selectedRunFailureCopy.title}</p>
            <p className="text-default-600 mt-1 text-sm">{selectedRunFailureCopy.description}</p>
            {selectedRunFailureCopy.technicalDetail ? (
              <p className="text-default-500 mt-2 text-xs">
                Worker detail: {selectedRunFailureCopy.technicalDetail}
              </p>
            ) : null}
          </div>
        ) : !reservationAudit ? (
          <p className="text-default-600 text-sm">Run analysis again to check mana reservation.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className={`rounded-large border p-4 ${getToneClasses(reservationTone.color)}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-foreground text-sm font-semibold">{reservationTone.label}</p>
                  <p className="text-default-600 mt-1 text-sm">{reservationTone.description}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Chip size="sm" variant="soft" color={reservationTone.color}>
                    {formatManaDelta(reservationAudit.reserved_mana_delta)}
                  </Chip>
                  {displayedSkillSetTitle ? (
                    <Chip size="sm" variant="soft">
                      {displayedSkillSetTitle}
                    </Chip>
                  ) : null}
                </div>
              </div>
            </div>

            {reservationAudit.blockers.length > 0 ? (
              <div className="rounded-large border-danger/30 bg-danger/5 border p-4">
                <p className="text-foreground text-sm font-semibold">Blockers</p>
                <div className="text-default-600 mt-2 flex flex-col gap-2 text-sm">
                  {reservationAudit.blockers.map((entry, index) => (
                    <p key={`${entry}-${index}`}>{entry}</p>
                  ))}
                </div>
              </div>
            ) : null}

            {reservationAudit.surplus_sources.length > 0 ? (
              <div className="rounded-large border-warning/30 bg-warning/5 border p-4">
                <p className="text-foreground text-sm font-semibold">Spare room</p>
                <div className="text-default-600 mt-2 flex flex-col gap-2 text-sm">
                  {reservationAudit.surplus_sources.map((entry, index) => (
                    <p key={`${entry}-${index}`}>{entry}</p>
                  ))}
                </div>
              </div>
            ) : null}

            {reservationAudit.suggestions.length > 0 ? (
              <div className="rounded-large border-secondary/30 bg-secondary/10 border p-4">
                <div className="flex items-start gap-3">
                  <Sparkles size={16} className="text-secondary mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground text-sm font-semibold">Gem tuning</p>
                    <div className="mt-2 flex flex-col gap-3">
                      {reservationAudit.suggestions.map((suggestion, index) => (
                        <div
                          key={`${suggestion.gem_name}-${suggestion.suggested_level ?? 'keep'}-${suggestion.reason}-${index}`}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <Chip size="sm" variant="soft" color="accent">
                              {suggestion.gem_name}
                            </Chip>
                            {suggestion.current_level != null ? (
                              <Chip size="sm" variant="soft">
                                {suggestion.current_level}
                                {' -> '}
                                {suggestion.suggested_level ?? suggestion.current_level}
                              </Chip>
                            ) : null}
                          </div>
                          <p className="text-default-600 mt-2 text-sm">{suggestion.reason}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {reservationAudit.notes.length > 0 ? (
              <div className="rounded-large border-divider/70 bg-default-50/60 border p-4">
                <div className="flex items-start gap-3">
                  <Waves size={16} className="text-default-500 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground text-sm font-semibold">Notes</p>
                    <div className="text-default-600 mt-2 flex flex-col gap-2 text-sm">
                      {reservationAudit.notes.map((note, index) => (
                        <p key={`${note}-${index}`}>{note}</p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}

        {selectedRun ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-default-400 text-xs">
              Run stored {formatRelativeTimestamp(selectedRun.created_at)}
            </p>
            {targetTreeUrl ? (
              <a href={targetTreeUrl} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="tertiary">
                  Open target tree
                </Button>
              </a>
            ) : null}
          </div>
        ) : selectedProfile?.last_synced_at ? (
          <p className="text-default-400 mt-4 text-xs">
            Current profile synced {formatRelativeTimestamp(selectedProfile.last_synced_at)}.
          </p>
        ) : null}
      </Section>
    </div>
  )
}
