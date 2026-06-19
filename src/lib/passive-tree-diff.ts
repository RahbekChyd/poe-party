import {
  getPassiveTreeMasterySelections,
  type PassiveTreeComparable,
  type PassiveTreeComparisonSummary,
  type PassiveTreeMasterySelection,
} from './passive-tree-links'
import { sortUniqueNumbers } from './parse-helpers'
import {
  filterComparablePassiveTreeNodeIds,
  type PassiveTreeRenderData,
} from './passive-tree-render-data'
export type PassiveTreeDiffEntryKind =
  | 'add'
  | 'remove'
  | 'mastery_change'
  | 'cluster_review'
  | 'version_unavailable'
  | 'class_mismatch'
  | 'ascendancy_mismatch'

export interface PassiveTreeDiffEntry {
  nodeId: number | null
  kind: PassiveTreeDiffEntryKind
  label: string
  shortStatText: string | null
  x: number | null
  y: number | null
  isNotable: boolean
  isKeystone: boolean
  isMastery: boolean
  currentAllocated: boolean
  targetAllocated: boolean
  currentMasteryText: string | null
  targetMasteryText: string | null
  stats: string[]
}

export interface PassiveTreeClusterReviewSummary {
  matchedShells: number
  targetShells: number
  currentShells: number
  missingShells: number
  extraShells: number
  matchedExactNodes: number
  targetExactNodes: number
  missingExactNodes: number
  extraExactNodes: number
}

export interface PassiveTreeDiffCounts {
  add: number
  remove: number
  masteryChange: number
  clusterReview: number
}

export interface PassiveTreeDiffViewModel {
  counts: PassiveTreeDiffCounts
  entries: PassiveTreeDiffEntry[]
  warningEntries: PassiveTreeDiffEntry[]
  currentNodeIds: number[]
  targetNodeIds: number[]
  changedNodeIds: number[]
}

export interface BuildPassiveTreeDiffViewModelOptions {
  comparisonSummary: PassiveTreeComparisonSummary | null
  clusterReviewSummary: PassiveTreeClusterReviewSummary
  renderData?: PassiveTreeRenderData | null
  visualUnavailableDetail?: string | null
}

function getNodeLabel(nodeId: number, renderData?: PassiveTreeRenderData | null): string {
  const renderNode = renderData?.nodes[nodeId]
  return renderNode?.label?.trim() || renderNode?.shortStatText || `Node ${nodeId}`
}

function getNodeShortStat(
  nodeId: number,
  renderData?: PassiveTreeRenderData | null,
): string | null {
  return renderData?.nodes[nodeId]?.shortStatText ?? null
}

function getNodeStats(nodeId: number, renderData?: PassiveTreeRenderData | null): string[] {
  return renderData?.nodes[nodeId]?.stats ?? []
}

function getNodePosition(
  nodeId: number,
  renderData?: PassiveTreeRenderData | null,
): { x: number | null; y: number | null } {
  const renderNode = renderData?.nodes[nodeId]
  return {
    x: renderNode?.x ?? null,
    y: renderNode?.y ?? null,
  }
}

function getNodeFlags(
  nodeId: number,
  renderData?: PassiveTreeRenderData | null,
): {
  isNotable: boolean
  isKeystone: boolean
  isMastery: boolean
} {
  const renderNode = renderData?.nodes[nodeId]
  return {
    isNotable: renderNode?.isNotable ?? false,
    isKeystone: renderNode?.isKeystone ?? false,
    isMastery: renderNode?.isMastery ?? false,
  }
}

function getMasteryEffectText(
  nodeId: number,
  effectId: number | null,
  renderData?: PassiveTreeRenderData | null,
): string | null {
  if (effectId == null) return null
  const renderNode = renderData?.nodes[nodeId]
  const effect = renderNode?.masteryEffects.find((entry) => entry.effectId === effectId)
  return effect?.text ?? (effectId > 0 ? `Effect ${effectId}` : null)
}

function buildMasterySummaryText(
  currentMasteryText: string | null,
  targetMasteryText: string | null,
): string | null {
  const lines: string[] = []
  if (currentMasteryText) {
    lines.push(`Current: ${currentMasteryText}`)
  }
  if (targetMasteryText) {
    lines.push(`Target: ${targetMasteryText}`)
  }
  return lines.length > 0 ? lines.join('\n') : null
}

function buildNodeEntry(
  nodeId: number,
  kind: Extract<PassiveTreeDiffEntryKind, 'add' | 'remove' | 'mastery_change'>,
  currentAllocated: boolean,
  targetAllocated: boolean,
  currentMasteryText: string | null,
  targetMasteryText: string | null,
  renderData?: PassiveTreeRenderData | null,
  overrides?: {
    label?: string
    shortStatText?: string | null
  },
): PassiveTreeDiffEntry {
  const position = getNodePosition(nodeId, renderData)
  const flags = getNodeFlags(nodeId, renderData)

  return {
    nodeId,
    kind,
    label: overrides?.label ?? getNodeLabel(nodeId, renderData),
    shortStatText: overrides?.shortStatText ?? getNodeShortStat(nodeId, renderData),
    x: position.x,
    y: position.y,
    isNotable: flags.isNotable,
    isKeystone: flags.isKeystone,
    isMastery: flags.isMastery,
    currentAllocated,
    targetAllocated,
    currentMasteryText,
    targetMasteryText,
    stats: getNodeStats(nodeId, renderData),
  }
}

function getMasteryTypeKey(
  selection: PassiveTreeMasterySelection,
  renderData?: PassiveTreeRenderData | null,
): string {
  return getNodeLabel(selection.nodeId, renderData).trim().toLowerCase()
}

function takeBestMatchingCurrentMastery(
  target: PassiveTreeMasterySelection,
  currentSelections: PassiveTreeMasterySelection[],
  renderData?: PassiveTreeRenderData | null,
): PassiveTreeMasterySelection | null {
  if (currentSelections.length === 0) return null

  const targetTypeKey = getMasteryTypeKey(target, renderData)
  const sameNodeIndex = currentSelections.findIndex((entry) => entry.nodeId === target.nodeId)
  if (sameNodeIndex >= 0) {
    return currentSelections.splice(sameNodeIndex, 1)[0] ?? null
  }

  const sameTypeIndex = currentSelections.findIndex(
    (entry) => getMasteryTypeKey(entry, renderData) === targetTypeKey,
  )
  if (sameTypeIndex >= 0) {
    return currentSelections.splice(sameTypeIndex, 1)[0] ?? null
  }

  return currentSelections.shift() ?? null
}

function buildMasteryChangeEntry(
  currentSelection: PassiveTreeMasterySelection | null,
  targetSelection: PassiveTreeMasterySelection | null,
  currentNodeSet: Set<number>,
  targetNodeSet: Set<number>,
  renderData?: PassiveTreeRenderData | null,
): PassiveTreeDiffEntry | null {
  const anchorNodeId = targetSelection?.nodeId ?? currentSelection?.nodeId ?? null
  if (anchorNodeId == null) return null

  const currentMasteryText = currentSelection
    ? getMasteryEffectText(currentSelection.nodeId, currentSelection.effectId, renderData)
    : null
  const targetMasteryText = targetSelection
    ? getMasteryEffectText(targetSelection.nodeId, targetSelection.effectId, renderData)
    : null

  return buildNodeEntry(
    anchorNodeId,
    'mastery_change',
    currentSelection
      ? currentNodeSet.has(currentSelection.nodeId)
      : currentNodeSet.has(anchorNodeId),
    targetSelection ? targetNodeSet.has(targetSelection.nodeId) : targetNodeSet.has(anchorNodeId),
    currentMasteryText,
    targetMasteryText,
    renderData,
    {
      label: targetSelection
        ? getNodeLabel(targetSelection.nodeId, renderData)
        : getNodeLabel(anchorNodeId, renderData),
      shortStatText: buildMasterySummaryText(currentMasteryText, targetMasteryText),
    },
  )
}

function getEntrySortWeight(entry: PassiveTreeDiffEntry): number {
  switch (entry.kind) {
    case 'add':
      return 0
    case 'remove':
      return 1
    case 'mastery_change':
      return 2
    case 'cluster_review':
      return 3
    default:
      return 4
  }
}

function getEntryPriority(entry: PassiveTreeDiffEntry): number {
  if (entry.isKeystone) return 0
  if (entry.isNotable) return 1
  if (entry.isMastery) return 2
  return 3
}

function sortEntries(entries: PassiveTreeDiffEntry[]): PassiveTreeDiffEntry[] {
  return [...entries].sort((left, right) => {
    const kindDelta = getEntrySortWeight(left) - getEntrySortWeight(right)
    if (kindDelta !== 0) return kindDelta

    const priorityDelta = getEntryPriority(left) - getEntryPriority(right)
    if (priorityDelta !== 0) return priorityDelta

    return left.label.localeCompare(right.label)
  })
}

function buildWarningEntries(
  summary: PassiveTreeComparisonSummary | null,
  visualUnavailableDetail: string | null,
): PassiveTreeDiffEntry[] {
  const warnings: PassiveTreeDiffEntry[] = []

  if (summary?.classMatches === false) {
    warnings.push({
      nodeId: null,
      kind: 'class_mismatch',
      label: 'Class mismatch',
      shortStatText: 'The selected tree belongs to a different base class than the target.',
      x: null,
      y: null,
      isNotable: false,
      isKeystone: false,
      isMastery: false,
      currentAllocated: false,
      targetAllocated: false,
      currentMasteryText: null,
      targetMasteryText: null,
      stats: [],
    })
  }

  if (summary?.ascendancyMatches === false) {
    warnings.push({
      nodeId: null,
      kind: 'ascendancy_mismatch',
      label: 'Ascendancy mismatch',
      shortStatText: 'The selected tree uses a different ascendancy than the target.',
      x: null,
      y: null,
      isNotable: false,
      isKeystone: false,
      isMastery: false,
      currentAllocated: false,
      targetAllocated: false,
      currentMasteryText: null,
      targetMasteryText: null,
      stats: [],
    })
  }

  if (visualUnavailableDetail) {
    warnings.push({
      nodeId: null,
      kind: 'version_unavailable',
      label: 'Visual diff unavailable',
      shortStatText: visualUnavailableDetail,
      x: null,
      y: null,
      isNotable: false,
      isKeystone: false,
      isMastery: false,
      currentAllocated: false,
      targetAllocated: false,
      currentMasteryText: null,
      targetMasteryText: null,
      stats: [],
    })
  }

  return warnings
}

function computeClusterReviewCount(summary: PassiveTreeClusterReviewSummary): number {
  if (summary.targetShells <= 0 && summary.currentShells <= 0) return 0
  if (summary.missingExactNodes <= 0 && summary.extraExactNodes <= 0) return 0
  return Math.max(summary.targetShells, summary.currentShells, 1)
}

export function buildPassiveTreeDiffViewModel(
  current: PassiveTreeComparable,
  target: PassiveTreeComparable,
  options: BuildPassiveTreeDiffViewModelOptions,
): PassiveTreeDiffViewModel {
  const currentNodeIds = filterComparablePassiveTreeNodeIds(current.hashes, options.renderData)
  const targetNodeIds = filterComparablePassiveTreeNodeIds(target.hashes, options.renderData)
  const currentNodeSet = new Set(currentNodeIds)
  const targetNodeSet = new Set(targetNodeIds)

  const addEntries = targetNodeIds
    .filter((nodeId) => !currentNodeSet.has(nodeId))
    .map((nodeId) => buildNodeEntry(nodeId, 'add', false, true, null, null, options.renderData))

  const removeEntries = currentNodeIds
    .filter((nodeId) => !targetNodeSet.has(nodeId))
    .map((nodeId) => buildNodeEntry(nodeId, 'remove', true, false, null, null, options.renderData))

  const currentMasteries = getPassiveTreeMasterySelections(
    current.masteryEffects,
    options.renderData,
  )
  const targetMasteries = getPassiveTreeMasterySelections(target.masteryEffects, options.renderData)
  const currentMasteriesByEffect = new Map(
    currentMasteries.map((entry) => [entry.effectKey, entry] as const),
  )
  const targetMasteriesByEffect = new Map(
    targetMasteries.map((entry) => [entry.effectKey, entry] as const),
  )

  const unmatchedTargetMasteries = targetMasteries.filter(
    (entry) => !currentMasteriesByEffect.has(entry.effectKey),
  )
  const unmatchedCurrentMasteries = currentMasteries.filter(
    (entry) => !targetMasteriesByEffect.has(entry.effectKey),
  )
  const remainingCurrentMasteries = [...unmatchedCurrentMasteries]

  const masteryChangeEntries = unmatchedTargetMasteries
    .map((targetSelection) =>
      buildMasteryChangeEntry(
        takeBestMatchingCurrentMastery(
          targetSelection,
          remainingCurrentMasteries,
          options.renderData,
        ),
        targetSelection,
        currentNodeSet,
        targetNodeSet,
        options.renderData,
      ),
    )
    .concat(
      remainingCurrentMasteries.map((currentSelection) =>
        buildMasteryChangeEntry(
          currentSelection,
          null,
          currentNodeSet,
          targetNodeSet,
          options.renderData,
        ),
      ),
    )
    .filter((entry): entry is PassiveTreeDiffEntry => entry != null)

  const clusterReviewCount = computeClusterReviewCount(options.clusterReviewSummary)
  const clusterReviewEntries =
    clusterReviewCount > 0
      ? [
          {
            nodeId: null,
            kind: 'cluster_review',
            label: 'Cluster jewel review needed',
            shortStatText: `${options.clusterReviewSummary.matchedShells}/${options.clusterReviewSummary.targetShells} shells align, ${options.clusterReviewSummary.matchedExactNodes}/${options.clusterReviewSummary.targetExactNodes} exact cluster nodes align.`,
            x: null,
            y: null,
            isNotable: false,
            isKeystone: false,
            isMastery: false,
            currentAllocated: false,
            targetAllocated: false,
            currentMasteryText: null,
            targetMasteryText: null,
            stats: [],
          } satisfies PassiveTreeDiffEntry,
        ]
      : []

  const warningEntries = buildWarningEntries(
    options.comparisonSummary,
    options.visualUnavailableDetail ?? null,
  )

  const entries = sortEntries([
    ...addEntries,
    ...removeEntries,
    ...masteryChangeEntries,
    ...clusterReviewEntries,
  ])

  return {
    counts: {
      add: addEntries.length,
      remove: removeEntries.length,
      masteryChange: masteryChangeEntries.length,
      clusterReview: clusterReviewCount,
    },
    entries,
    warningEntries,
    currentNodeIds,
    targetNodeIds,
    changedNodeIds: sortUniqueNumbers(
      entries.map((entry) => entry.nodeId).filter((entry): entry is number => entry != null),
    ),
  }
}
