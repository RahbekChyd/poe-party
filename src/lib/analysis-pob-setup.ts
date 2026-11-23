import type { PobImportMetadata } from '../types/app'
import { findPobTreeSpec, findResolvedPobTreeSpec, getPobTreeSpecLabel } from './pob'

export type AnalysisPobSetupSelection = {
  treeSpecId: string | null
  itemSetId: string | null
  skillSetId: string | null
  configSetId: string | null
}

export const analysisPobLayoutFields = [
  {
    label: 'Tree',
    description: 'Passive nodes, masteries, and ascendancy.',
    optionsKey: 'tree_specs',
    selectionKey: 'treeSpecId',
  },
  {
    label: 'Item set',
    description: 'Target equipment and weapon swap.',
    optionsKey: 'item_sets',
    selectionKey: 'itemSetId',
  },
  {
    label: 'Skill set',
    description: 'Skill gems and their linked supports.',
    optionsKey: 'skill_sets',
    selectionKey: 'skillSetId',
  },
  {
    label: 'Configuration',
    description: 'Combat conditions, enemy settings, and buffs.',
    optionsKey: 'config_sets',
    selectionKey: 'configSetId',
  },
] as const

export function findPobLayout<T extends { id: string }>(
  layouts: readonly T[],
  ...selections: unknown[]
): T | null {
  for (const selection of selections) {
    if (typeof selection !== 'string' && typeof selection !== 'number') continue
    const layout = layouts.find(({ id }) => id === String(selection).trim())
    if (layout) return layout
  }
  return null
}

type StageSelection = {
  tree_spec_id?: unknown
  item_set_id?: unknown
  skill_set_id?: unknown
  config_set_id?: unknown
}

export function resolveAnalysisPobSetup(
  metadata: PobImportMetadata,
  run?: Record<string, unknown>,
  sourceStage?: StageSelection,
  savedStage?: StageSelection,
): AnalysisPobSetupSelection {
  const tree =
    findResolvedPobTreeSpec(metadata.tree_specs, run?.resolved_tree_spec_id) ??
    findPobTreeSpec(metadata.tree_specs, sourceStage?.tree_spec_id) ??
    findPobTreeSpec(metadata.tree_specs, savedStage?.tree_spec_id) ??
    findPobTreeSpec(metadata.tree_specs, metadata.active_tree_spec_id) ??
    metadata.tree_specs[0]

  return {
    treeSpecId: tree?.id ?? null,
    itemSetId:
      findPobLayout(
        metadata.item_sets,
        run?.resolved_item_set_id,
        sourceStage?.item_set_id,
        savedStage?.item_set_id,
        metadata.active_item_set_id,
      )?.id ??
      metadata.item_sets[0]?.id ??
      null,
    skillSetId:
      findPobLayout(
        metadata.skill_sets,
        run?.resolved_skill_set_id,
        sourceStage?.skill_set_id,
        savedStage?.skill_set_id,
        metadata.active_skill_set_id,
      )?.id ??
      metadata.skill_sets[0]?.id ??
      null,
    configSetId:
      findPobLayout(
        metadata.config_sets,
        run?.resolved_config_set_id,
        sourceStage?.config_set_id,
        savedStage?.config_set_id,
        metadata.active_config_set_id,
      )?.id ??
      metadata.config_sets[0]?.id ??
      null,
  }
}

export function getAnalysisPobResultLayoutLabels(
  metadata: PobImportMetadata | undefined,
  run: Record<string, unknown>,
  stage?: StageSelection,
) {
  const tree = metadata
    ? (findResolvedPobTreeSpec(metadata.tree_specs, run.resolved_tree_spec_id) ??
      findPobTreeSpec(metadata.tree_specs, stage?.tree_spec_id))
    : null
  function resultTitle(value: unknown, fallback: string | undefined) {
    return typeof value === 'string' && value.trim() ? value : fallback
  }
  return [
    {
      label: 'Tree',
      value:
        tree && metadata
          ? getPobTreeSpecLabel(metadata.tree_specs, tree)
          : resultTitle(run.resolved_tree_spec_title, undefined),
    },
    {
      label: 'Item set',
      value: resultTitle(
        run.resolved_item_set_title,
        findPobLayout(metadata?.item_sets ?? [], run.resolved_item_set_id, stage?.item_set_id)
          ?.title,
      ),
    },
    {
      label: 'Skill set',
      value: resultTitle(
        run.resolved_skill_set_title,
        findPobLayout(metadata?.skill_sets ?? [], run.resolved_skill_set_id, stage?.skill_set_id)
          ?.title,
      ),
    },
    {
      label: 'Configuration',
      value: resultTitle(
        run.resolved_config_set_title,
        findPobLayout(metadata?.config_sets ?? [], run.resolved_config_set_id, stage?.config_set_id)
          ?.title,
      ),
    },
  ]
}

export function getAnalysisPobLayoutLabels(
  metadata: PobImportMetadata,
  selection: AnalysisPobSetupSelection,
) {
  return analysisPobLayoutFields.map(({ label, optionsKey, selectionKey }) => {
    const tree =
      optionsKey === 'tree_specs'
        ? findPobTreeSpec(metadata.tree_specs, selection.treeSpecId)
        : null
    return {
      label,
      value: tree
        ? getPobTreeSpecLabel(metadata.tree_specs, tree)
        : (findPobLayout(metadata[optionsKey], selection[selectionKey])?.title ?? 'PoB default'),
    }
  })
}
