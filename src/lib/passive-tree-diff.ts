import type { PassiveTreeSource } from './passive-tree-comparison'
import { getPassiveTreeMasterySelections } from './passive-tree-links'
import {
  filterComparablePassiveTreeNodeIds,
  type PassiveTreeRenderData,
  type PassiveTreeRenderNode,
} from './passive-tree-render-data'
import { sortUniqueNumbers } from './parse-helpers'

export const PASSIVE_TREE_DIFF_LABELS = {
  target: 'In target',
  current: 'In current tree',
  mastery: 'Mastery changes',
} as const

export type PassiveTreeDiffKind = keyof typeof PASSIVE_TREE_DIFF_LABELS

export const TREE_CHANGE_TONES: Record<PassiveTreeDiffKind, string> = {
  current: 'text-currency',
  target: 'text-info',
  mastery: 'text-arcane',
}

export type PassiveTreeDiffEntry = {
  node: PassiveTreeRenderNode
  kind: PassiveTreeDiffKind
  currentEffect: number | null
  targetEffect: number | null
}

export type PassiveTreeDiffViewModel = {
  counts: Record<PassiveTreeDiffKind, number>
  entries: PassiveTreeDiffEntry[]
  currentNodeIds: number[]
  targetNodeIds: number[]
  unknownNodeIds: number[]
  unknownMasteryNodeIds: number[]
  classMismatch: boolean
  ascendancyMismatch: boolean
}

export function buildPassiveTreeDiffViewModel(
  current: PassiveTreeSource,
  target: PassiveTreeSource,
  geometry: PassiveTreeRenderData,
): PassiveTreeDiffViewModel {
  function buildSide(source: PassiveTreeSource) {
    const masteries = new Map(
      getPassiveTreeMasterySelections(source.tree.masteryEffects)
        .map(({ nodeId, effectId }) => [nodeId, effectId]),
    )
    const ids = filterComparablePassiveTreeNodeIds([
      ...source.tree.hashes,
      ...masteries.keys(),
    ], geometry)
    return {
      masteries,
      ids: new Set(ids.filter((id) => geometry.nodes[id])),
      unknownIds: [...ids.filter((id) => !geometry.nodes[id]), ...source.unresolvedNodeIds],
    }
  }

  const currentSide = buildSide(current)
  const targetSide = buildSide(target)
  const modifiedIds = new Set([...current.modifiedNodeIds, ...target.modifiedNodeIds])
  const entries: PassiveTreeDiffEntry[] = []
  const unknownMasteryNodeIds: number[] = []
  const counts = { target: 0, current: 0, mastery: 0 }
  const availableIds = new Set([...currentSide.ids, ...targetSide.ids])

  for (const id of availableIds) {
    if (modifiedIds.has(id)) continue
    const node = geometry.nodes[id]
    const currentEffect = currentSide.masteries.get(id) ?? null
    const targetEffect = targetSide.masteries.get(id) ?? null
    const currentHasNode = currentSide.ids.has(id)
    const targetHasNode = targetSide.ids.has(id)
    const missingMastery = node.isMastery &&
      ((currentHasNode && currentEffect === null) || (targetHasNode && targetEffect === null))
    const unknownMastery = [currentEffect, targetEffect].some((effect) =>
      effect !== null && !node.masteryEffects.some((mastery) => mastery.effectId === effect),
    )
    if (missingMastery || unknownMastery) unknownMasteryNodeIds.push(id)

    let kind: PassiveTreeDiffKind
    if (currentEffect !== targetEffect) kind = 'mastery'
    else if (!node.isMastery && currentHasNode !== targetHasNode) kind = targetHasNode ? 'target' : 'current'
    else continue

    entries.push({ node, kind, currentEffect, targetEffect })
    counts[kind] += 1
  }

  entries.sort((left, right) =>
    Number(right.node.isKeystone) - Number(left.node.isKeystone) ||
    Number(right.node.isNotable) - Number(left.node.isNotable) ||
    left.node.label.localeCompare(right.node.label) ||
    left.node.nodeId - right.node.nodeId,
  )

  return {
    counts,
    entries,
    currentNodeIds: [...currentSide.ids],
    targetNodeIds: [...targetSide.ids],
    unknownNodeIds: sortUniqueNumbers([...currentSide.unknownIds, ...targetSide.unknownIds]),
    unknownMasteryNodeIds: sortUniqueNumbers(unknownMasteryNodeIds),
    classMismatch: current.tree.classId !== null && target.tree.classId !== null &&
      current.tree.classId !== target.tree.classId,
    ascendancyMismatch: current.tree.ascendancyId !== null && target.tree.ascendancyId !== null &&
      current.tree.ascendancyId !== target.tree.ascendancyId,
  }
}
