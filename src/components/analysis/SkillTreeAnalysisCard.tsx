import { useEffect, useMemo, useState } from 'react'
import { Button } from '@heroui/react/button'
import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'

import type { MyCharacter } from '../../hooks/useCharacters'
import { PassiveTreeDiffWorkspace } from './PassiveTreeDiffWorkspace'
import { addPassiveTreeProfileContext, buildPassiveTreeUrl, countPassiveTreeClusterJewels, formatRelativeTimestamp, getCharacterClassId, hasPassiveTreeClusterSubgraphs, type CharacterProfileSnapshot } from '../../lib/character-profile'
import { getPobTreeSpecComparable, getPobTreeSpecUrl, hasExactPobTreeSpecData } from '../../lib/pob'
import { buildPassiveTreeDiffViewModel, type PassiveTreeClusterReviewSummary } from '../../lib/passive-tree-diff'
import { comparePassiveTrees, decodePassiveTreeUrl, type DecodedPassiveTreeUrl, type PassiveTreeComparable } from '../../lib/passive-tree-links'
import { loadPassiveTreeRenderData, resolvePassiveTreeRenderResolution, type PassiveTreeRenderData } from '../../lib/passive-tree-render-data'
import type { ComparePowerRow } from '../../lib/compare-power-report'
import type { PobClusterJewelSize, PobTreeSpecLayout } from '../../types/app'
import { FieldInput } from '../ui/heroui-native'
export type SkillTreeAnalysisPanelProps = {
  selectedCharacter: MyCharacter | null
  selectedProfile: CharacterProfileSnapshot | null
  stageLabel: string | null
  stageTreeSpec: PobTreeSpecLayout | null
  isDraftStage: boolean
  passiveImpactRows?: ComparePowerRow[]
  passiveImpactMetricLabel?: string | null
}

type DecodeState = {
  decoded: DecodedPassiveTreeUrl | null
  error: string | null
}

type TargetTreeState = {
  comparable: PassiveTreeComparable | null
  treeUrl: string | null
  detail: string | null
  error: string | null
  source: 'none' | 'pob_spec' | 'url'
  gameVersion: string | null
  hasAlternateAscendancy: boolean
  isRuthless: boolean
}

type ProfileTreeState = {
  comparable: PassiveTreeComparable | null
  url: string | null
  detail: string | null
  gameVersion: string | null
  hasAlternateAscendancy: boolean
  isRuthless: boolean
}

type ClusterJewelAlignmentSummary = {
  matchedTotal: number
  targetTotal: number
  currentTotal: number
  missingTotal: number
  extraTotal: number
}

const CLUSTER_JEWEL_SIZES: PobClusterJewelSize[] = ['large', 'medium', 'small', 'unknown']
const DEFAULT_SETUP_LABEL = 'Current setup'

function readTreeVersion(rawCharacter: Record<string, unknown>): string | null {
  const directValue = rawCharacter.version
  if (typeof directValue === 'string' && directValue.trim()) return directValue

  const passiveTree = rawCharacter.passive_tree
  if (passiveTree && typeof passiveTree === 'object' && !Array.isArray(passiveTree)) {
    const nestedValue = (passiveTree as Record<string, unknown>).version
    if (typeof nestedValue === 'string' && nestedValue.trim()) return nestedValue
  }

  const metadata = rawCharacter.metadata
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    const metaValue = (metadata as Record<string, unknown>).version
    if (typeof metaValue === 'string' && metaValue.trim()) return metaValue
  }

  return null
}

function readAlternateAscendancy(rawCharacter: Record<string, unknown>): string | null {
  const passives = rawCharacter.passives
  if (passives && typeof passives === 'object' && !Array.isArray(passives)) {
    const value = (passives as Record<string, unknown>).alternate_ascendancy
    if (typeof value === 'string' && value.trim()) return value
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return String(value)
  }

  const passiveTree = rawCharacter.passive_tree
  if (passiveTree && typeof passiveTree === 'object' && !Array.isArray(passiveTree)) {
    const nestedPassives = (passiveTree as Record<string, unknown>).passives
    if (nestedPassives && typeof nestedPassives === 'object' && !Array.isArray(nestedPassives)) {
      const value = (nestedPassives as Record<string, unknown>).alternate_ascendancy
      if (typeof value === 'string' && value.trim()) return value
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) return String(value)
    }
  }

  return null
}

function decodeTreeState(url: string | null | undefined): DecodeState {
  if (!url || !url.trim()) {
    return { decoded: null, error: null }
  }

  try {
    return { decoded: decodePassiveTreeUrl(url), error: null }
  } catch (error) {
    return {
      decoded: null,
      error: error instanceof Error ? error.message : 'The passive tree link could not be decoded.',
    }
  }
}

function formatTreeVersionDetail(value: string | null | undefined): string | null {
  if (!value || !value.trim()) return null
  return `PoB tree version ${value.replace(/_/g, '.')}`
}

function getTargetTreeState(treeSpec: PobTreeSpecLayout | null): TargetTreeState {
  if (!treeSpec) {
    return {
      comparable: null,
      treeUrl: null,
      detail: null,
      error: null,
      source: 'none',
      gameVersion: null,
      hasAlternateAscendancy: false,
      isRuthless: false,
    }
  }

  const hasAlternateAscendancy = (treeSpec.secondaryAscendancyId ?? 0) > 0
  const isRuthless = treeSpec.treeVersion?.toLowerCase().includes('ruthless') ?? false

  if (hasExactPobTreeSpecData(treeSpec)) {
    return {
      comparable: getPobTreeSpecComparable(treeSpec),
      treeUrl: getPobTreeSpecUrl(treeSpec),
      detail: formatTreeVersionDetail(treeSpec.treeVersion) ?? 'Exact PoB tree spec',
      error: null,
      source: 'pob_spec',
      gameVersion: treeSpec.treeVersion,
      hasAlternateAscendancy,
      isRuthless,
    }
  }

  const decodedState = decodeTreeState(treeSpec.url ?? null)
  if (decodedState.decoded) {
    return {
      comparable: {
        classId: decodedState.decoded.classId,
        ascendancyId: decodedState.decoded.ascendancyId,
        hashes: decodedState.decoded.hashes,
        hashesEx: decodedState.decoded.hashesEx,
        masteryEffects: decodedState.decoded.masteryEffects,
      },
      treeUrl: treeSpec.url,
      detail: decodedState.decoded.treeVersionLabel ?? 'PoB tree spec link',
      error: null,
      source: 'url',
      gameVersion: decodedState.decoded.treeVersionLabel ?? treeSpec.treeVersion,
      hasAlternateAscendancy,
      isRuthless,
    }
  }

  return {
    comparable: null,
    treeUrl: getPobTreeSpecUrl(treeSpec),
    detail: formatTreeVersionDetail(treeSpec.treeVersion),
    error: decodedState.error,
    source: 'url',
    gameVersion: treeSpec.treeVersion,
    hasAlternateAscendancy,
    isRuthless,
  }
}

function formatPercent(value: number | null): string {
  if (value == null) return '0%'
  return `${Math.round(value * 100)}%`
}

function getPassiveTreeClusterJewelSize(
  type: string | null | undefined,
): PobClusterJewelSize | null {
  switch (type) {
    case 'JewelPassiveTreeExpansionLarge':
      return 'large'
    case 'JewelPassiveTreeExpansionMedium':
      return 'medium'
    case 'JewelPassiveTreeExpansionSmall':
      return 'small'
    default:
      return null
  }
}

function getCurrentClusterJewelSizes(
  profile: CharacterProfileSnapshot | null,
): PobClusterJewelSize[] {
  if (!profile) return []

  return profile.passive_tree.jewelData
    .filter((entry) => entry.subgraphNodeIds.length > 0)
    .map((entry) => getPassiveTreeClusterJewelSize(entry.type))
    .filter((entry): entry is PobClusterJewelSize => entry != null)
}

function getTargetClusterJewelSizes(treeSpec: PobTreeSpecLayout | null): PobClusterJewelSize[] {
  return (treeSpec?.clusterJewels ?? []).map((entry) => entry.size)
}

function summarizeClusterJewelAlignment(
  currentSizes: PobClusterJewelSize[],
  targetSizes: PobClusterJewelSize[],
): ClusterJewelAlignmentSummary {
  const currentBySize = new Map<PobClusterJewelSize, number>()
  const targetBySize = new Map<PobClusterJewelSize, number>()

  for (const size of CLUSTER_JEWEL_SIZES) {
    currentBySize.set(size, currentSizes.filter((entry) => entry === size).length)
    targetBySize.set(size, targetSizes.filter((entry) => entry === size).length)
  }

  const matchedTotal = CLUSTER_JEWEL_SIZES.reduce(
    (total, size) => total + Math.min(currentBySize.get(size) ?? 0, targetBySize.get(size) ?? 0),
    0,
  )
  const targetTotal = targetSizes.length
  const currentTotal = currentSizes.length

  return {
    matchedTotal,
    targetTotal,
    currentTotal,
    missingTotal: Math.max(0, targetTotal - matchedTotal),
    extraTotal: Math.max(0, currentTotal - matchedTotal),
  }
}

function getAlignmentTone(
  summary: ReturnType<typeof comparePassiveTrees> | null,
  options?: {
    clusterDifferenceOnly?: boolean
  },
): {
  color: 'success' | 'warning' | 'danger' | 'default'
  label: string
  description: string
} {
  if (!summary) {
    return {
      color: 'default',
      label: 'Waiting for tree data',
      description: 'Provide a current and target tree to compare alignment.',
    }
  }

  if (summary.exactMatch) {
    return {
      color: 'success',
      label: 'Exact alignment',
      description: 'The selected tree matches the target setup node-for-node.',
    }
  }

  if (summary.classMatches === false || summary.ascendancyMatches === false) {
    return {
      color: 'danger',
      label: 'Class mismatch',
      description: 'The selected tree belongs to a different class or ascendancy than the target.',
    }
  }

  if (options?.clusterDifferenceOnly) {
    return {
      color: 'warning',
      label: 'Cluster review needed',
      description:
        'Core tree and masteries align. The remaining differences are in cluster jewel allocations, which are currently treated as a best-effort comparison.',
    }
  }

  if (summary.missingTotal === 0 && summary.extraTotal > 0) {
    return {
      color: 'warning',
      label: 'Target reached with extras',
      description:
        'All target nodes are present, but the current tree still has extra allocations.',
    }
  }

  return {
    color: summary.coverage != null && summary.coverage >= 0.85 ? 'warning' : 'danger',
    label: 'Needs changes',
    description: `${summary.missingTotal} target selections are still missing from the selected tree.`,
  }
}

function getProfileTree(profile: CharacterProfileSnapshot | null): ProfileTreeState {
  if (!profile) {
    return {
      comparable: null,
      url: null,
      detail: 'No synced character profile is available for this character yet.',
      gameVersion: null,
      hasAlternateAscendancy: false,
      isRuthless: false,
    }
  }

  const comparable: PassiveTreeComparable = {
    classId: profile.passive_tree.classId ?? getCharacterClassId(profile.class),
    ascendancyId: profile.passive_tree.ascendancyId ?? profile.ascendancy_class ?? null,
    hashes: profile.passive_tree.hashes,
    hashesEx: profile.passive_tree.hashesEx,
    masteryEffects: profile.passive_tree.masteryEffects,
  }

  const hasTreeData =
    comparable.hashes.length > 0 ||
    comparable.hashesEx.length > 0 ||
    comparable.masteryEffects.length > 0

  if (!hasTreeData) {
    return {
      comparable: null,
      url: null,
      detail: 'The synced profile does not contain passive tree allocations yet.',
      gameVersion: profile.passive_tree.version ?? readTreeVersion(profile.raw_character),
      hasAlternateAscendancy: !!readAlternateAscendancy(profile.raw_character),
      isRuthless: profile.league?.toLowerCase().includes('ruthless') ?? false,
    }
  }

  const gameVersion = profile.passive_tree.version ?? readTreeVersion(profile.raw_character)
  const alternateAscendancy = readAlternateAscendancy(profile.raw_character)
  const generatedTreeUrl = buildPassiveTreeUrl({
    gameVersion,
    classId: comparable.classId,
    ascendancyId: comparable.ascendancyId,
    alternateAscendancy,
    hashes: comparable.hashes,
    hashesEx: comparable.hashesEx,
    masteryEffects: comparable.masteryEffects,
  })
  const clusterJewelCount = countPassiveTreeClusterJewels(profile.passive_tree)
  const contextualTreeUrl = addPassiveTreeProfileContext(
    generatedTreeUrl ?? profile.passive_tree.url,
    {
      accountName: profile.poe_account_name,
      characterName: profile.character_name,
    },
  )
  const detailParts = [`Last synced ${formatRelativeTimestamp(profile.last_synced_at)}`]
  if (clusterJewelCount > 0) {
    detailParts.push(
      `${clusterJewelCount} cluster jewel${clusterJewelCount === 1 ? '' : 's'} detected`,
    )
  }

  return {
    comparable,
    url: contextualTreeUrl,
    detail: detailParts.join(', '),
    gameVersion,
    hasAlternateAscendancy: !!alternateAscendancy,
    isRuthless: profile.league?.toLowerCase().includes('ruthless') ?? false,
  }
}

function buildClusterReviewSummary(
  clusterJewelSummary: ClusterJewelAlignmentSummary,
  comparisonSummary: ReturnType<typeof comparePassiveTrees> | null,
): PassiveTreeClusterReviewSummary {
  return {
    matchedShells: clusterJewelSummary.matchedTotal,
    targetShells: clusterJewelSummary.targetTotal,
    currentShells: clusterJewelSummary.currentTotal,
    missingShells: clusterJewelSummary.missingTotal,
    extraShells: clusterJewelSummary.extraTotal,
    matchedExactNodes: comparisonSummary?.matchedHashesEx ?? 0,
    targetExactNodes:
      comparisonSummary?.matchedHashesEx != null
        ? comparisonSummary.matchedHashesEx + (comparisonSummary.missingHashesEx ?? 0)
        : 0,
    missingExactNodes: comparisonSummary?.missingHashesEx ?? 0,
    extraExactNodes: comparisonSummary?.extraHashesEx ?? 0,
  }
}

function TreeSourcePanel({
  title,
  subtitle,
  detail,
  nodeCount,
  treeUrl,
  treeSpecTitle,
}: {
  title: string
  subtitle: string
  detail: string | null
  nodeCount: number
  treeUrl: string | null
  treeSpecTitle?: string | null
}) {
  return (
    <div className="rounded-large border-divider/70 bg-default-50/60 border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-foreground text-sm font-semibold">{title}</p>
          <p className="text-default-500 mt-1 text-sm">{subtitle}</p>
          {treeSpecTitle ? <p className="text-default-400 mt-2 text-xs">{treeSpecTitle}</p> : null}
        </div>
        {treeUrl ? (
          <a href={treeUrl} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="tertiary">
              Open tree
            </Button>
          </a>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Chip size="sm" variant="soft">
          {nodeCount} tracked selections
        </Chip>
        {detail ? (
          <Chip size="sm" variant="soft">
            {detail}
          </Chip>
        ) : null}
      </div>
    </div>
  )
}

export function SkillTreeSummaryPanel({
  selectedCharacter,
  selectedProfile,
  stageLabel,
  stageTreeSpec,
  isDraftStage,
}: SkillTreeAnalysisPanelProps) {
  const [renderData, setRenderData] = useState<PassiveTreeRenderData | null>(null)
  const targetTreeState = useMemo(() => getTargetTreeState(stageTreeSpec), [stageTreeSpec])
  const profileTreeState = useMemo(() => getProfileTree(selectedProfile), [selectedProfile])
  const currentClusterJewelSizes = useMemo(
    () => getCurrentClusterJewelSizes(selectedProfile),
    [selectedProfile],
  )
  const targetClusterJewelSizes = useMemo(
    () => getTargetClusterJewelSizes(stageTreeSpec),
    [stageTreeSpec],
  )
  const clusterJewelSummary = useMemo(
    () => summarizeClusterJewelAlignment(currentClusterJewelSizes, targetClusterJewelSizes),
    [currentClusterJewelSizes, targetClusterJewelSizes],
  )
  const comparisonSummary = useMemo(() => {
    if (!profileTreeState.comparable || !targetTreeState.comparable) {
      return null
    }

    return comparePassiveTrees(profileTreeState.comparable, targetTreeState.comparable, {
      renderData,
    })
  }, [profileTreeState.comparable, renderData, targetTreeState.comparable])
  const targetHasClusterNodes = (targetTreeState.comparable?.hashesEx.length ?? 0) > 0
  const clusterReviewSummary = useMemo(
    () => buildClusterReviewSummary(clusterJewelSummary, comparisonSummary),
    [clusterJewelSummary, comparisonSummary],
  )
  const diffViewModel = useMemo(() => {
    if (!profileTreeState.comparable || !targetTreeState.comparable) return null
    return buildPassiveTreeDiffViewModel(profileTreeState.comparable, targetTreeState.comparable, {
      comparisonSummary,
      clusterReviewSummary,
      renderData,
    })
  }, [
    clusterReviewSummary,
    comparisonSummary,
    profileTreeState.comparable,
    renderData,
    targetTreeState.comparable,
  ])
  const visualResolution = useMemo(() => {
    if (!profileTreeState.comparable || !targetTreeState.comparable) return null
    return resolvePassiveTreeRenderResolution(
      {
        gameVersion: profileTreeState.gameVersion,
        hasAlternateAscendancy: profileTreeState.hasAlternateAscendancy,
        isRuthless: profileTreeState.isRuthless,
      },
      {
        gameVersion: targetTreeState.gameVersion,
        hasAlternateAscendancy: targetTreeState.hasAlternateAscendancy,
        isRuthless: targetTreeState.isRuthless,
      },
    )
  }, [
    profileTreeState.comparable,
    profileTreeState.gameVersion,
    profileTreeState.hasAlternateAscendancy,
    profileTreeState.isRuthless,
    targetTreeState.comparable,
    targetTreeState.gameVersion,
    targetTreeState.hasAlternateAscendancy,
    targetTreeState.isRuthless,
  ])
  useEffect(() => {
    let cancelled = false

    if (!visualResolution?.supported || !visualResolution.branch) {
      setRenderData(null)
      return () => {
        cancelled = true
      }
    }

    setRenderData(null)
    loadPassiveTreeRenderData(visualResolution.branch)
      .then((data) => {
        if (cancelled) return
        setRenderData(data)
      })
      .catch(() => {
        if (cancelled) return
        setRenderData(null)
      })

    return () => {
      cancelled = true
    }
  }, [visualResolution?.branch, visualResolution?.supported])
  const clusterDifferenceOnly =
    !!comparisonSummary &&
    targetHasClusterNodes &&
    comparisonSummary.missingHashes === 0 &&
    comparisonSummary.missingMasteries === 0 &&
    comparisonSummary.extraHashes === 0 &&
    comparisonSummary.extraMasteries === 0 &&
    (comparisonSummary.missingHashesEx > 0 || comparisonSummary.extraHashesEx > 0)
  const alignmentTone = getAlignmentTone(comparisonSummary, { clusterDifferenceOnly })
  const stageDisplayLabel = stageLabel?.trim() || (isDraftStage ? 'Unsaved setup' : null)
  const showStageDisplayChip =
    !!stageDisplayLabel && (isDraftStage || stageDisplayLabel !== DEFAULT_SETUP_LABEL)
  if (!selectedCharacter) {
    return (
      <div className="rounded-large border-divider/70 bg-default-50/60 border p-4">
        <p className="text-foreground text-sm font-semibold">No character selected</p>
        <p className="text-default-600 mt-1 text-sm">
          Choose one of your own characters before reviewing passive tree alignment.
        </p>
      </div>
    )
  }

  if (!stageDisplayLabel) {
    return (
      <div className="rounded-large border-divider/70 bg-default-50/60 border p-4">
        <p className="text-foreground text-sm font-semibold">No target tree selected</p>
        <p className="text-default-600 mt-1 text-sm">
          Choose a tree spec in the current setup to compare it against the current tree.
        </p>
      </div>
    )
  }

  if (!stageTreeSpec) {
    return (
      <p className="text-default-600 text-sm">Choose a target tree to compare allocated nodes.</p>
    )
  }

  if (targetTreeState.error) {
    return (
      <div className="rounded-large border-danger/40 bg-danger/10 border p-4">
        <p className="text-foreground text-sm font-semibold">Target tree link could not be read</p>
        <p className="text-default-600 mt-1 text-sm">{targetTreeState.error}</p>
      </div>
    )
  }

  if (!profileTreeState.comparable) {
    return (
      <div className="rounded-large border-warning/40 bg-warning/10 border p-4">
        <p className="text-foreground text-sm font-semibold">No current passive tree available</p>
        <p className="text-default-600 mt-1 text-sm">
          {profileTreeState.detail ??
            'Open tree details to use a manual official tree link while testing.'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Chip size="sm" variant="soft">
            {selectedCharacter.name}
          </Chip>
          {showStageDisplayChip ? (
            <Chip size="sm" variant="soft" color={isDraftStage ? 'accent' : 'default'}>
              {isDraftStage ? 'Unsaved setup' : 'Saved setup'} {stageDisplayLabel}
            </Chip>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className={`rounded-large border p-4 ${
          alignmentTone.color === 'success'
            ? 'border-success/40 bg-success/10'
            : alignmentTone.color === 'warning'
              ? 'border-warning/40 bg-warning/10'
              : alignmentTone.color === 'danger'
                ? 'border-danger/40 bg-danger/10'
                : 'border-divider/70 bg-default-50/60'
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-foreground text-sm font-semibold">{alignmentTone.label}</p>
            <p className="text-default-600 mt-1 text-sm">{alignmentTone.description}</p>
          </div>
          <Chip size="sm" variant="soft" color={alignmentTone.color}>
            {formatPercent(comparisonSummary?.coverage ?? null)} coverage
          </Chip>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Chip size="sm" variant="soft" color="success">
            {diffViewModel?.counts.add ?? 0} add
          </Chip>
          <Chip size="sm" variant="soft" color="danger">
            {diffViewModel?.counts.remove ?? 0} refund
          </Chip>
          <Chip size="sm" variant="soft" color="accent">
            {diffViewModel?.counts.masteryChange ?? 0} mastery changes
          </Chip>
          <Chip size="sm" variant="soft" color="warning">
            {diffViewModel?.counts.clusterReview ?? 0} cluster review
          </Chip>
          {comparisonSummary?.classMatches === false ? (
            <Chip size="sm" variant="soft" color="danger">
              Class mismatch
            </Chip>
          ) : null}
          {comparisonSummary?.ascendancyMatches === false ? (
            <Chip size="sm" variant="soft" color="danger">
              Ascendancy mismatch
            </Chip>
          ) : null}
        </div>
      </div>

      {targetTreeState.source === 'url' && targetHasClusterNodes ? (
        <div className="rounded-large border-secondary/30 bg-secondary/10 border p-3">
          <p className="text-foreground text-sm font-semibold">Cluster comparison is best effort</p>
          <p className="text-default-600 mt-1 text-sm">
            Current characters include cluster-jewel subgraphs from the official API, but this saved
            target still falls back to legacy tree-link decoding for cluster alignment.
          </p>
        </div>
      ) : null}

      {visualResolution && !visualResolution.supported ? (
        <div className="rounded-large border-divider/70 bg-default-50/60 border p-3">
          <p className="text-foreground text-sm font-semibold">Visual diff fallback</p>
          <p className="text-default-600 mt-1 text-sm">{visualResolution.detail}</p>
        </div>
      ) : null}
    </div>
  )
}

export function SkillTreeAnalysisPanel({
  selectedCharacter,
  selectedProfile,
  stageLabel,
  stageTreeSpec,
  isDraftStage,
  passiveImpactRows = [],
  passiveImpactMetricLabel = null,
}: SkillTreeAnalysisPanelProps) {
  const [manualTreeInput, setManualTreeInput] = useState('')
  const [manualTreeUrl, setManualTreeUrl] = useState<string | null>(null)
  const [manualTreeError, setManualTreeError] = useState<string | null>(null)
  const [showManualControls, setShowManualControls] = useState(false)
  const [renderData, setRenderData] = useState<PassiveTreeRenderData | null>(null)
  const [renderDataLoading, setRenderDataLoading] = useState(false)
  const [renderDataError, setRenderDataError] = useState<string | null>(null)

  const targetTreeState = useMemo(() => getTargetTreeState(stageTreeSpec), [stageTreeSpec])
  const manualTreeState = useMemo(() => decodeTreeState(manualTreeUrl), [manualTreeUrl])
  const profileTreeState = useMemo(() => getProfileTree(selectedProfile), [selectedProfile])
  const currentClusterJewelSizes = useMemo(
    () => getCurrentClusterJewelSizes(selectedProfile),
    [selectedProfile],
  )
  const targetClusterJewelSizes = useMemo(
    () => getTargetClusterJewelSizes(stageTreeSpec),
    [stageTreeSpec],
  )
  const clusterJewelSummary = useMemo(
    () => summarizeClusterJewelAlignment(currentClusterJewelSizes, targetClusterJewelSizes),
    [currentClusterJewelSizes, targetClusterJewelSizes],
  )

  useEffect(() => {
    if (!profileTreeState.comparable) {
      setShowManualControls(true)
    }
  }, [profileTreeState.comparable])

  const activeCurrentTree = manualTreeState.decoded
    ? {
        comparable: {
          classId: manualTreeState.decoded.classId,
          ascendancyId: manualTreeState.decoded.ascendancyId,
          hashes: manualTreeState.decoded.hashes,
          hashesEx: manualTreeState.decoded.hashesEx,
          masteryEffects: manualTreeState.decoded.masteryEffects,
        } satisfies PassiveTreeComparable,
        url: manualTreeUrl,
        detail: 'Manual official tree link',
        gameVersion: manualTreeState.decoded.treeVersionLabel ?? profileTreeState.gameVersion,
        hasAlternateAscendancy: profileTreeState.hasAlternateAscendancy,
        isRuthless: profileTreeState.isRuthless,
      }
    : profileTreeState

  const comparisonSummary = useMemo(() => {
    if (!activeCurrentTree.comparable || !targetTreeState.comparable) {
      return null
    }

    return comparePassiveTrees(activeCurrentTree.comparable, targetTreeState.comparable, {
      renderData,
    })
  }, [activeCurrentTree.comparable, renderData, targetTreeState.comparable])

  const targetHasClusterNodes = (targetTreeState.comparable?.hashesEx.length ?? 0) > 0
  const clusterReviewSummary = useMemo(
    () => buildClusterReviewSummary(clusterJewelSummary, comparisonSummary),
    [clusterJewelSummary, comparisonSummary],
  )
  const diffViewModel = useMemo(() => {
    if (!activeCurrentTree.comparable || !targetTreeState.comparable) return null
    return buildPassiveTreeDiffViewModel(activeCurrentTree.comparable, targetTreeState.comparable, {
      comparisonSummary,
      clusterReviewSummary,
      renderData,
      visualUnavailableDetail: null,
    })
  }, [
    activeCurrentTree.comparable,
    clusterReviewSummary,
    comparisonSummary,
    renderData,
    targetTreeState.comparable,
  ])
  const visualResolution = useMemo(() => {
    if (!activeCurrentTree.comparable || !targetTreeState.comparable) return null
    return resolvePassiveTreeRenderResolution(
      {
        gameVersion: activeCurrentTree.gameVersion,
        hasAlternateAscendancy: activeCurrentTree.hasAlternateAscendancy,
        isRuthless: activeCurrentTree.isRuthless,
      },
      {
        gameVersion: targetTreeState.gameVersion,
        hasAlternateAscendancy: targetTreeState.hasAlternateAscendancy,
        isRuthless: targetTreeState.isRuthless,
      },
    )
  }, [
    activeCurrentTree.comparable,
    activeCurrentTree.gameVersion,
    activeCurrentTree.hasAlternateAscendancy,
    activeCurrentTree.isRuthless,
    targetTreeState.comparable,
    targetTreeState.gameVersion,
    targetTreeState.hasAlternateAscendancy,
    targetTreeState.isRuthless,
  ])
  const clusterDifferenceOnly =
    !!comparisonSummary &&
    targetHasClusterNodes &&
    comparisonSummary.missingHashes === 0 &&
    comparisonSummary.missingMasteries === 0 &&
    comparisonSummary.extraHashes === 0 &&
    comparisonSummary.extraMasteries === 0 &&
    (comparisonSummary.missingHashesEx > 0 || comparisonSummary.extraHashesEx > 0)
  const alignmentTone = getAlignmentTone(comparisonSummary, { clusterDifferenceOnly })
  const stageDisplayLabel = stageLabel?.trim() || (isDraftStage ? 'Unsaved setup' : null)
  const showStageDisplayChip =
    !!stageDisplayLabel && (isDraftStage || stageDisplayLabel !== DEFAULT_SETUP_LABEL)
  const clusterJewelCount = countPassiveTreeClusterJewels(selectedProfile?.passive_tree)
  const hasClusterSubgraphs = hasPassiveTreeClusterSubgraphs(selectedProfile?.passive_tree)
  const hasClusterAwareTreeUrl =
    hasClusterSubgraphs && !!selectedProfile?.poe_account_name?.trim() && !manualTreeState.decoded
  const visualUnavailableDetail =
    renderDataError ?? (visualResolution?.supported === false ? visualResolution.detail : null)

  useEffect(() => {
    let cancelled = false

    if (!visualResolution?.supported || !visualResolution.branch) {
      setRenderData(null)
      setRenderDataLoading(false)
      setRenderDataError(null)
      return () => {
        cancelled = true
      }
    }

    setRenderDataLoading(true)
    setRenderDataError(null)
    setRenderData(null)
    loadPassiveTreeRenderData(visualResolution.branch)
      .then((data) => {
        if (cancelled) return
        setRenderData(data)
      })
      .catch((error) => {
        if (cancelled) return
        setRenderData(null)
        setRenderDataError(
          error instanceof Error ? error.message : 'Could not load official passive-tree geometry.',
        )
      })
      .finally(() => {
        if (cancelled) return
        setRenderDataLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [visualResolution?.branch, visualResolution?.supported])

  function applyManualTreeUrl() {
    const trimmed = manualTreeInput.trim()
    if (!trimmed) {
      setManualTreeUrl(null)
      setManualTreeError(null)
      return
    }

    try {
      decodePassiveTreeUrl(trimmed)
      setManualTreeUrl(trimmed)
      setManualTreeError(null)
    } catch (error) {
      setManualTreeError(
        error instanceof Error ? error.message : 'The manual tree link could not be decoded.',
      )
    }
  }

  function clearManualTreeUrl() {
    setManualTreeInput('')
    setManualTreeUrl(null)
    setManualTreeError(null)
    setShowManualControls(false)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-large border-divider/70 bg-default-50/60 border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-foreground text-sm font-semibold">Comparison scope</p>
            <p className="text-default-500 mt-1 text-sm">
              {selectedCharacter
                ? `Using ${selectedCharacter.name}${stageDisplayLabel ? ` against ${stageDisplayLabel}` : ''}.`
                : 'Select a character to compare its passive tree.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedCharacter ? (
              <Chip size="sm" variant="soft">
                {selectedCharacter.name}
              </Chip>
            ) : null}
            {showStageDisplayChip ? (
              <Chip size="sm" variant="soft" color={isDraftStage ? 'accent' : 'default'}>
                {isDraftStage ? 'Unsaved setup' : 'Saved setup'} {stageDisplayLabel}
              </Chip>
            ) : null}
            {manualTreeState.decoded ? (
              <Chip size="sm" variant="soft" color="accent">
                Manual tree active
              </Chip>
            ) : (
              <Chip size="sm" variant="soft">
                Synced tree
              </Chip>
            )}
            {clusterJewelCount > 0 ? (
              <Chip size="sm" variant="soft" color="accent">
                {clusterJewelCount} cluster jewel{clusterJewelCount === 1 ? '' : 's'}
              </Chip>
            ) : null}
          </div>
        </div>
      </div>

      {showManualControls || !profileTreeState.comparable ? (
        <div className="rounded-large border-divider/70 bg-content1 border p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-foreground text-sm font-semibold">Manual current tree link</p>
              <p className="text-default-500 mt-1 text-sm">
                Paste an official Path of Exile passive tree link if you want to test this without
                relying on synced OAuth tree data.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {manualTreeUrl ? (
                <Button size="sm" variant="tertiary" onPress={clearManualTreeUrl}>
                  Use synced tree
                </Button>
              ) : null}
              {profileTreeState.comparable ? (
                <Button
                  size="sm"
                  variant="tertiary"
                  onPress={() => setShowManualControls((current) => !current)}
                >
                  {showManualControls ? 'Hide manual override' : 'Show manual override'}
                </Button>
              ) : null}
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-3">
            <FieldInput
              label="Official passive tree link"
              placeholder="https://www.pathofexile.com/passive-skill-tree/..."
              value={manualTreeInput}
              onValueChange={setManualTreeInput}
            />
            <div className="flex justify-end">
              <Button size="sm" onPress={applyManualTreeUrl}>
                Apply link
              </Button>
            </div>
          </div>
          {manualTreeError ? <p className="text-danger mt-2 text-sm">{manualTreeError}</p> : null}
          {manualTreeState.error && manualTreeUrl ? (
            <p className="text-danger mt-2 text-sm">{manualTreeState.error}</p>
          ) : null}
        </div>
      ) : (
        <div className="flex justify-end">
          <Button size="sm" variant="tertiary" onPress={() => setShowManualControls(true)}>
            Manual tree override
          </Button>
        </div>
      )}

      {!selectedCharacter ? (
        <div className="rounded-large border-divider/70 bg-default-50/60 border p-4">
          <p className="text-default-600 text-sm">
            Choose one of your characters first so Analysis knows which current tree to compare.
          </p>
        </div>
      ) : !stageDisplayLabel ? (
        <div className="rounded-large border-divider/70 bg-default-50/60 border p-4">
          <p className="text-default-600 text-sm">
            Pick a tree spec in the current setup to inspect tree alignment.
          </p>
        </div>
      ) : !stageTreeSpec ? (
        <div className="rounded-large border-divider/70 bg-default-50/60 border p-4">
          <p className="text-default-600 text-sm">
            This setup does not point at a tree spec yet. Choose one in the setup controls to
            compare it.
          </p>
        </div>
      ) : targetTreeState.error ? (
        <div className="rounded-large border-danger/40 bg-danger/10 border p-4">
          <p className="text-foreground text-sm font-semibold">
            Target tree link could not be decoded
          </p>
          <p className="text-default-600 mt-1 text-sm">{targetTreeState.error}</p>
          {targetTreeState.treeUrl ? (
            <div className="mt-3">
              <a href={targetTreeState.treeUrl} target="_blank" rel="noopener noreferrer">
                <Button
                  size="sm"
                  variant="danger-soft"
                >
                  Open stored tree spec
                </Button>
              </a>
            </div>
          ) : null}
        </div>
      ) : !activeCurrentTree.comparable ? (
        <div className="rounded-large border-warning/40 bg-warning/10 border p-4">
          <p className="text-foreground text-sm font-semibold">No current tree available yet</p>
          <p className="text-default-600 mt-1 text-sm">
            {profileTreeState.detail ??
              'Paste a manual tree link above or wait for a synced character profile.'}
          </p>
        </div>
      ) : (
        <>
          <div
            className={`rounded-large border p-4 ${
              alignmentTone.color === 'success'
                ? 'border-success/40 bg-success/10'
                : alignmentTone.color === 'warning'
                  ? 'border-warning/40 bg-warning/10'
                  : alignmentTone.color === 'danger'
                    ? 'border-danger/40 bg-danger/10'
                    : 'border-divider/70 bg-default-50/60'
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-foreground text-sm font-semibold">{alignmentTone.label}</p>
                <p className="text-default-600 mt-1 text-sm">{alignmentTone.description}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Chip size="sm" variant="soft" color={alignmentTone.color}>
                  {formatPercent(comparisonSummary?.coverage ?? null)} target coverage
                </Chip>
                <Chip size="sm" variant="soft" color="success">
                  {diffViewModel?.counts.add ?? 0} add
                </Chip>
                <Chip size="sm" variant="soft" color="danger">
                  {diffViewModel?.counts.remove ?? 0} refund
                </Chip>
                <Chip size="sm" variant="soft" color="accent">
                  {diffViewModel?.counts.masteryChange ?? 0} mastery
                </Chip>
                <Chip size="sm" variant="soft" color="warning">
                  {diffViewModel?.counts.clusterReview ?? 0} cluster review
                </Chip>
                {comparisonSummary?.classMatches === false ? (
                  <Chip size="sm" variant="soft" color="danger">
                    Class mismatch
                  </Chip>
                ) : null}
                {comparisonSummary?.ascendancyMatches === false ? (
                  <Chip size="sm" variant="soft" color="danger">
                    Ascendancy mismatch
                  </Chip>
                ) : null}
              </div>
            </div>
          </div>

          {targetHasClusterNodes ? (
            <div className="rounded-large border-secondary/30 bg-secondary/10 border p-4">
              <p className="text-foreground text-sm font-semibold">
                Cluster comparison is best effort
              </p>
              <p className="text-default-600 mt-1 text-sm">
                Cluster jewel shells are tracked separately from exact cluster nodes. The diff map
                intentionally stays non-spatial for clusters until target-side geometry is richer.
              </p>
            </div>
          ) : null}

          {diffViewModel ? (
            <PassiveTreeDiffWorkspace
              viewModel={diffViewModel}
              renderData={renderData}
              isPending={renderDataLoading && !renderData && !visualUnavailableDetail}
              visualUnavailableDetail={visualUnavailableDetail}
              passiveImpactRows={passiveImpactRows}
              passiveImpactMetricLabel={passiveImpactMetricLabel}
            />
          ) : null}

          <div className="grid gap-3">
            <TreeSourcePanel
              title="Current tree"
              subtitle={
                manualTreeState.decoded
                  ? 'Using the manual link you pasted for testing.'
                  : hasClusterAwareTreeUrl
                    ? 'Using the latest synced tree for the selected character, with profile context added for cluster jewels.'
                    : 'Using the latest synced tree for the selected character.'
              }
              detail={activeCurrentTree.detail}
              nodeCount={comparisonSummary?.currentTotal ?? 0}
              treeUrl={activeCurrentTree.url}
              treeSpecTitle={selectedProfile?.character_name ?? selectedCharacter.name}
            />
            <TreeSourcePanel
              title="Target tree"
              subtitle={
                targetTreeState.source === 'pob_spec'
                  ? 'Using exact node and mastery selections parsed from the imported PoB spec.'
                  : isDraftStage
                    ? 'The currently drafted tree spec for this setup, using the saved official tree link.'
                    : 'The tree spec saved on the selected setup, using the saved official tree link.'
              }
              detail={targetTreeState.detail}
              nodeCount={comparisonSummary?.targetTotal ?? 0}
              treeUrl={targetTreeState.treeUrl}
              treeSpecTitle={stageTreeSpec.title}
            />
          </div>
        </>
      )}
    </div>
  )
}

export function SkillTreeAnalysisCard(props: SkillTreeAnalysisPanelProps) {
  return (
    <Card>
      <Card.Header className="px-4 pt-4 pb-0">
        <div>
          <p className="text-foreground text-sm font-semibold">Skill tree alignment</p>
          <p className="text-default-500 mt-1 text-sm">
            Compare the selected character tree against the active target tree spec.
          </p>
        </div>
      </Card.Header>
      <Card.Content className="px-4 pt-3 pb-4">
        <SkillTreeAnalysisPanel {...props} />
      </Card.Content>
    </Card>
  )
}
