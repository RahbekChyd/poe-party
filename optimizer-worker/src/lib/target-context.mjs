function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function normalizeRarity(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

function normalizeSlot(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

function isMeaningfulLinkRequirement(slot, value) {
  const normalizedValue = Number(value ?? 0)
  if (!Number.isFinite(normalizedValue) || normalizedValue < 6) {
    return false
  }

  const normalizedSlot = normalizeSlot(slot)
  return (
    normalizedSlot === 'body armour' ||
    normalizedSlot === 'weapon 1' ||
    normalizedSlot === 'weapon 2'
  )
}

function isMeaningfulHardRequirement(requirement) {
  if (!requirement || typeof requirement !== 'object') return false

  if (requirement.kind === 'minimum_sockets') {
    return false
  }

  if (requirement.kind === 'minimum_links') {
    return isMeaningfulLinkRequirement(requirement.slot, requirement.value)
  }

  return true
}

function findById(entries, id) {
  if (!id) return null
  return entries.find((entry) => String(entry?.id ?? '') === String(id)) ?? null
}

function findTreeSpec(entries, id, title) {
  if (!id && !title) return null
  const requestedId = String(id ?? '')
  const position = /^tree-spec:([1-9]\d*)$/.exec(requestedId)
  if (position) return entries[Number(position[1]) - 1] ?? null
  return findById(entries, requestedId) ??
    entries.find((entry) => entry?.legacyId === requestedId || entry?.title === requestedId) ??
    (/^[1-9]\d*$/.test(requestedId) ? entries[Number(requestedId) - 1] : null) ??
    (title ? entries.find((entry) => entry?.title === title) : null) ??
    null
}

export function resolveTargetContext({ buildTarget, targetStage }) {
  const metadata = asRecord(buildTarget?.import_metadata)
  const treeSpecs = asArray(metadata.tree_specs)
  const skillSets = asArray(metadata.skill_sets)
  const configSets = asArray(metadata.config_sets)
  const itemSets = asArray(metadata.item_sets)
  const hardRequirements = asArray(targetStage?.hard_requirements).filter(
    isMeaningfulHardRequirement,
  )
  const targetMetrics = asRecord(targetStage?.target_metrics)
  const fallbackMetrics = asRecord(metadata.player_stats)

  const treeSpec = findTreeSpec(treeSpecs, targetStage?.tree_spec_id, targetStage?.tree_spec_title)
  const selectedTreeSpec = treeSpec
    ? { ...treeSpec, id: `tree-spec:${treeSpecs.indexOf(treeSpec) + 1}` }
    : null
  const selectedSkillSet = findById(skillSets, targetStage?.skill_set_id)
  const selectedConfigSet = findById(
    configSets,
    targetStage?.config_set_id ?? metadata.active_config_set_id,
  )
  const selectedItemSet = findById(itemSets, targetStage?.item_set_id)

  const selectedUniqueNames = asArray(selectedItemSet?.items)
    .filter((item) => normalizeRarity(item?.rarity) === 'unique' && item?.name)
    .map((item) => String(item.name))

  return {
    label: targetStage?.label ?? null,
    notes: targetStage?.notes ?? null,
    primaryMetric:
      typeof targetStage?.primary_offensive_metric === 'string'
        ? targetStage.primary_offensive_metric
        : 'totalDps',
    targetMetrics: Object.keys(targetMetrics).length > 0 ? targetMetrics : fallbackMetrics,
    hardRequirements,
    selectedTreeSpec,
    selectedSkillSet,
    selectedConfigSet,
    selectedItemSet,
    selectedUniqueNames,
  }
}
