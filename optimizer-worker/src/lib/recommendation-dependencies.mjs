import { toPobTextFromProfileItem } from './pob-item-text.mjs'

const DEPENDENCY_ALIAS_GROUPS = [
  {
    id: 'aspect_of_the_cat',
    label: 'Aspect of the Cat',
    aliases: ['Aspect of the Cat', "Cat's Stealth", "Cat's Agility"],
  },
  {
    id: 'aspect_of_the_avian',
    label: 'Aspect of the Avian',
    aliases: ['Aspect of the Avian', "Avian's Flight", "Avian's Might"],
  },
  {
    id: 'aspect_of_the_spider',
    label: 'Aspect of the Spider',
    aliases: ['Aspect of the Spider', "Spider's Web", "Spider's Webs"],
  },
  {
    id: 'aspect_of_the_crab',
    label: 'Aspect of the Crab',
    aliases: ['Aspect of the Crab', 'Crab Barrier', 'Crab Barriers'],
  },
  {
    id: 'blood_stance',
    label: 'Blood Stance',
    aliases: ['Blood Stance'],
    sourceAliases: ['Blood and Sand'],
  },
  {
    id: 'sand_stance',
    label: 'Sand Stance',
    aliases: ['Sand Stance'],
    sourceAliases: ['Blood and Sand'],
  },
]

const IGNORED_REQUIREMENT_LABELS = new Set(['effect', 'flask effect'])

const NAMED_REQUIREMENT_PATTERNS = [
  /\baffected by ([A-Z][A-Za-z']*(?: [A-Z][A-Za-z'/-]+){0,5})\b/g,
  /\bwhile you have ([A-Z][A-Za-z']*(?: [A-Z][A-Za-z'/-]+){0,5})\b/g,
  /\bif you have ([A-Z][A-Za-z']*(?: [A-Z][A-Za-z'/-]+){0,5})\b/g,
  /\bduring ([A-Z][A-Za-z']*(?: [A-Z][A-Za-z'/-]+){0,5})\b/g,
  /\bin ((?:Blood|Sand) Stance)\b/g,
]

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function trim(value) {
  return String(value ?? '').trim()
}

function readString(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function readStringList(value) {
  return Array.isArray(value)
    ? value.filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
    : []
}

function normalizeText(value) {
  return trim(value).toLowerCase().replace(/\s+/g, ' ')
}

function normalizeSlot(slot) {
  return normalizeText(slot)
}

function normalizeProfileSlot(slot) {
  const value = trim(slot)
  if (!value) return null

  switch (value) {
    case 'VisceraHead': return 'Head'
    case 'VisceraBody': return 'Body'
    case 'VisceraArm': return 'Arm'
    case 'VisceraLeg': return 'Leg'
    case 'Helm':
      return 'Helmet'
    case 'BodyArmour':
      return 'Body Armour'
    case 'Ring':
      return 'Ring 1'
    case 'Ring2':
      return 'Ring 2'
    case 'Weapon':
      return 'Weapon 1'
    case 'Offhand':
      return 'Weapon 2'
    case 'Weapon2':
      return 'Weapon 1 Swap'
    case 'Offhand2':
      return 'Weapon 2 Swap'
    default:
      return value
  }
}

function parseTextLines(rawText) {
  return trim(rawText)
    .split(/\r?\n/)
    .map((line) => trim(line))
    .filter((line) => line && line !== '--------')
}

function parseSections(rawText) {
  const sections = []
  let current = []

  for (const rawLine of trim(rawText).split(/\r?\n/)) {
    const line = trim(rawLine)
    if (!line) continue
    if (line === '--------') {
      if (current.length > 0) {
        sections.push(current)
        current = []
      }
      continue
    }

    current.push(line)
  }

  if (current.length > 0) {
    sections.push(current)
  }

  return sections
}

function isMetadataLine(line) {
  return (
    /^rarity:/i.test(line) ||
    /^item class:/i.test(line) ||
    /^unique id:/i.test(line) ||
    /^league:/i.test(line) ||
    /^note:/i.test(line) ||
    /^split tag:/i.test(line) ||
    /^requirements:/i.test(line) ||
    /^sockets:/i.test(line) ||
    /^item level:/i.test(line) ||
    /^quality:/i.test(line) ||
    /^levelreq:/i.test(line) ||
    /^level:/i.test(line) ||
    /^implicits:/i.test(line) ||
    /^str:/i.test(line) ||
    /^dex:/i.test(line) ||
    /^int:/i.test(line) ||
    /^xbasepercentile/i.test(line) ||
    /^[^:]+:\s+.+$/.test(line) ||
    line === 'Corrupted' ||
    line.includes('Synthesised Item') ||
    line.includes('Fractured Item') ||
    line.includes('Veiled Item') ||
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

function extractRelevantLines(rawText) {
  const sections = parseSections(rawText)
  const contentLines = sections.length > 1 ? sections.slice(1).flat() : parseTextLines(rawText)
  return contentLines.filter((line) => !isMetadataLine(line))
}

function findAliasGroup(label) {
  const normalizedLabel = normalizeText(label)
  return (
    DEPENDENCY_ALIAS_GROUPS.find((group) =>
      group.aliases.some((alias) => normalizeText(alias) === normalizedLabel),
    ) ?? null
  )
}

function getRequirementTokens(label) {
  const trimmedLabel = trim(label)
  const normalizedLabel = normalizeText(trimmedLabel)
  if (!trimmedLabel || IGNORED_REQUIREMENT_LABELS.has(normalizedLabel)) {
    return null
  }

  const aliasGroup = findAliasGroup(label)
  if (!aliasGroup) {
    return {
      key: normalizedLabel.replace(/[^a-z0-9]+/g, '-'),
      label: trimmedLabel,
      aliases: [trimmedLabel],
      sourceAliases: [trimmedLabel],
    }
  }

  return {
    key: aliasGroup.id,
    label: aliasGroup.label,
    aliases: aliasGroup.aliases.slice(),
    sourceAliases: (aliasGroup.sourceAliases ?? aliasGroup.aliases).slice(),
  }
}

function includesToken(line, tokens) {
  const normalizedLine = normalizeText(line)
  return tokens.some((token) => normalizedLine.includes(normalizeText(token)))
}

function lineStartsWithToken(line, tokens, prefix) {
  const normalizedLine = normalizeText(line)
  return tokens.some((token) => normalizedLine.startsWith(`${prefix}${normalizeText(token)}`))
}

function isLikelyDependencySourceLine(line, sourceTokens) {
  if (!includesToken(line, sourceTokens)) return false

  return (
    /\bgrants level \d+ .+ skill\b/i.test(line) ||
    /\btrigger(?:s)? level \d+ /i.test(line) ||
    lineStartsWithToken(line, sourceTokens, 'you have ') ||
    lineStartsWithToken(line, sourceTokens, 'gain ') ||
    lineStartsWithToken(line, sourceTokens, 'affects you with ') ||
    lineStartsWithToken(line, sourceTokens, 'affected by ') ||
    /^summon\b/i.test(line) ||
    /^summons\b/i.test(line) ||
    /\bon hit\b/i.test(line)
  )
}

function findDependencySourceLine(rawText, sourceTokens) {
  return extractRelevantLines(rawText).find((line) =>
    isLikelyDependencySourceLine(line, sourceTokens),
  )
}

function readGemName(gem) {
  return trim(gem?.name) || trim(gem?.typeLine) || null
}

function collectEquippedSkillSources(profile) {
  const sources = []

  for (const item of asArray(profile?.gear)) {
    const slotKey = normalizeSlot(normalizeProfileSlot(item?.slot))
    for (const gem of asArray(item?.socketedItems)) {
      const name = readGemName(gem)
      if (name) {
        sources.push({ name, slotKey })
      }
    }
  }

  return sources
}

function collectEquippedItems(profile) {
  return asArray(profile?.gear)
    .map((item) => {
      const stageSlot = normalizeProfileSlot(item?.slot)
      return {
        slot: stageSlot,
        slotKey: normalizeSlot(stageSlot),
        itemName: trim(item?.name) || trim(item?.typeLine) || trim(item?.baseType) || null,
        rawText: toPobTextFromProfileItem(item),
      }
    })
    .filter((item) => item.slotKey && item.rawText)
}

function collectStageItems(targetContext) {
  return asArray(targetContext?.selectedItemSet?.items)
    .map((item) => ({
      slot: trim(item?.slot) || null,
      slotKey: normalizeSlot(item?.slot),
      rarity: trim(item?.rarity) || null,
      itemName: trim(item?.name) || trim(item?.typeLine) || null,
      rawText: trim(item?.rawText) || null,
    }))
    .filter((item) => item.slotKey && item.rawText)
}

function collectStageSkillSources(targetContext) {
  const gems =
    asArray(targetContext?.selectedSkillSet?.gems)
      .filter((entry) => entry?.enabled !== false)
      .map((entry) => trim(entry?.name))
      .filter(Boolean) ?? []

  const fallbackGems = asArray(targetContext?.selectedSkillSet?.gemNames)
    .map((entry) => trim(entry))
    .filter(Boolean)

  return (gems.length > 0 ? gems : fallbackGems)
    .map((entry) => ({ name: entry, slotKey: null }))
    .filter((entry) => !!entry.name)
}

function skillNameMatchesToken(name, token) {
  const normalizedName = normalizeText(name)
  const normalizedToken = normalizeText(token)
  return (
    normalizedName === normalizedToken ||
    normalizedName.startsWith(`${normalizedToken} `) ||
    normalizedName.endsWith(` ${normalizedToken}`)
  )
}

function skillListContainsSource(skillSources, sourceTokens, excludedSlotKey = null) {
  return (
    skillSources.find(
      (entry) =>
        entry &&
        (!excludedSlotKey || entry.slotKey !== excludedSlotKey) &&
        sourceTokens.some((token) => skillNameMatchesToken(entry.name, token)),
    )?.name ?? null
  )
}

function extractRequirementSpecs(rawText) {
  const lines = extractRelevantLines(rawText)
  const specs = new Map()

  function pushSpec(label, reasonLine) {
    const tokens = getRequirementTokens(label)
    if (!tokens?.label) return

    const existing = specs.get(tokens.key)
    if (existing) return

    specs.set(tokens.key, {
      key: tokens.key,
      label: tokens.label,
      aliases: tokens.aliases,
      sourceAliases: tokens.sourceAliases,
      reasonLine,
    })
  }

  for (const line of lines) {
    for (const group of DEPENDENCY_ALIAS_GROUPS) {
      if (group.aliases.some((alias) => includesToken(line, [alias]))) {
        pushSpec(group.label, line)
      }
    }

    for (const pattern of NAMED_REQUIREMENT_PATTERNS) {
      pattern.lastIndex = 0
      for (const match of line.matchAll(pattern)) {
        const label = trim(match[1])
        if (!label) continue
        pushSpec(label, line)
      }
    }
  }

  return [...specs.values()].filter(
    (spec) => !findDependencySourceLine(rawText, spec.sourceAliases),
  )
}

function resolveDependencySource({
  spec,
  consumerSlotKey,
  stageItems,
  stageSkillSources,
  equippedItems,
  equippedSkillSources,
}) {
  const currentItemMatch = equippedItems.find((item) => {
    if (item.slotKey === consumerSlotKey) return false
    const sourceLine = findDependencySourceLine(item.rawText, spec.sourceAliases)
    return !!sourceLine
  })
  if (currentItemMatch) {
    const sourceLine = findDependencySourceLine(currentItemMatch.rawText, spec.sourceAliases)
    return {
      status: 'satisfied',
      source_kind: 'equipped_item',
      source_label:
        currentItemMatch.itemName && currentItemMatch.slot
          ? `${currentItemMatch.itemName} (${currentItemMatch.slot})`
          : (currentItemMatch.itemName ?? currentItemMatch.slot),
      source_slot: currentItemMatch.slot,
      source_item_name: currentItemMatch.itemName,
      source_detail: sourceLine ?? null,
    }
  }

  const currentSkill = skillListContainsSource(
    equippedSkillSources,
    spec.sourceAliases,
    consumerSlotKey,
  )
  if (currentSkill) {
    return {
      status: 'satisfied',
      source_kind: 'equipped_skill',
      source_label: currentSkill,
      source_slot: null,
      source_item_name: null,
      source_detail: `Equipped gem: ${currentSkill}`,
    }
  }

  const stageItemMatch = stageItems.find((item) => {
    if (item.slotKey === consumerSlotKey) return false
    const sourceLine = findDependencySourceLine(item.rawText, spec.sourceAliases)
    return !!sourceLine
  })
  if (stageItemMatch) {
    const sourceLine = findDependencySourceLine(stageItemMatch.rawText, spec.sourceAliases)
    return {
      status: 'paired_target',
      source_kind: 'stage_item',
      source_label:
        stageItemMatch.itemName && stageItemMatch.slot
          ? `${stageItemMatch.itemName} (${stageItemMatch.slot})`
          : (stageItemMatch.itemName ?? stageItemMatch.slot),
      source_slot: stageItemMatch.slot,
      source_item_name: stageItemMatch.itemName,
      source_detail: sourceLine ?? null,
    }
  }

  const stageSkill = skillListContainsSource(stageSkillSources, spec.sourceAliases)
  if (stageSkill) {
    return {
      status: 'paired_target',
      source_kind: 'stage_skill',
      source_label: stageSkill,
      source_slot: null,
      source_item_name: null,
      source_detail: `Selected skill set: ${stageSkill}`,
    }
  }

  return {
    status: 'missing',
    source_kind: 'unknown',
    source_label: null,
    source_slot: null,
    source_item_name: null,
    source_detail: null,
  }
}

function buildDependencyStatus(dependencies) {
  const unresolved = getDependencySummary(dependencies)
  return unresolved.some((entry) => entry.status === 'missing')
    ? 'missing'
    : unresolved.some((entry) => entry.status === 'paired_target')
      ? 'paired_target'
      : 'satisfied'
}

function buildDependencyNote(consumerItemName, dependency) {
  if (dependency.status === 'satisfied') {
    if (dependency.source_kind === 'equipped_item') {
      return `${consumerItemName} already has ${dependency.label} covered by ${dependency.source_label}.`
    }
    if (dependency.source_kind === 'equipped_skill') {
      return `${consumerItemName} already has ${dependency.label} covered by ${dependency.source_label}.`
    }
  }

  if (dependency.status === 'paired_target') {
    if (dependency.source_kind === 'stage_item') {
      return `${consumerItemName} needs ${dependency.label}, and the selected PoB stage gets it from ${dependency.source_label}.`
    }
    if (dependency.source_kind === 'stage_skill') {
      return `${consumerItemName} needs ${dependency.label}, and the selected PoB skill set provides it via ${dependency.source_label}.`
    }
  }

  return `${consumerItemName} references ${dependency.label}, but no source for it was found in the selected PoB setup.`
}

function getDependencySummary(dependencies) {
  const unresolved = dependencies.filter((dependency) => dependency.status !== 'satisfied')
  return unresolved.length > 0 ? unresolved : dependencies
}

function formatPlanDependencyExplanation(plan, itemDependencies) {
  const unresolvedNotes = itemDependencies
    .flatMap(({ dependencies }) => getDependencySummary(dependencies))
    .map((dependency) => dependency.note)

  if (unresolvedNotes.length === 0) {
    return plan.explanation ?? null
  }

  const existing = trim(plan.explanation)
  const bundleNote = `Bundle note: ${unresolvedNotes.join(' ')}`
  return existing ? `${existing} ${bundleNote}` : bundleNote
}

function getItemPayload(item) {
  return item?.item_payload &&
    typeof item.item_payload === 'object' &&
    !Array.isArray(item.item_payload)
    ? item.item_payload
    : {}
}

function withItemPayload(item, patch) {
  return {
    ...item,
    item_payload: {
      ...getItemPayload(item),
      ...patch,
    },
  }
}

function extractTransferableAnoint(rawText) {
  const lines = extractRelevantLines(rawText)
  const canBeAnointed = lines.some((line) => normalizeText(line) === 'can be anointed')
  if (!canBeAnointed) {
    return null
  }

  const allocationLine = lines.find((line) => /^\{[^}]+\}\s*allocates /i.test(line) || /^allocates /i.test(line))
  if (!allocationLine) {
    return null
  }

  const normalizedAllocationLine = trim(allocationLine.replace(/^\{[^}]+\}\s*/i, ''))
  const passiveName = trim(normalizedAllocationLine.replace(/^allocates /i, ''))
  if (!passiveName) {
    return null
  }

  return {
    passive_name: passiveName,
    allocation_line: `Allocates ${passiveName}`,
  }
}

function extractProvidedSourceEffects(rawText) {
  const provided = new Map()

  for (const group of DEPENDENCY_ALIAS_GROUPS) {
    const sourceLine = findDependencySourceLine(rawText, group.sourceAliases ?? group.aliases)
    if (!sourceLine) continue

    provided.set(group.id, {
      key: group.id,
      label: group.label,
      aliases: group.aliases.slice(),
      source_aliases: (group.sourceAliases ?? group.aliases).slice(),
      source_reason: sourceLine,
    })
  }

  return [...provided.values()]
}

function addStrictRequiredEffect(target, effect) {
  const key = readString(effect?.key)
  const label = readString(effect?.label)
  if (!key || !label || target.has(key)) {
    return
  }

  target.set(key, {
    key,
    label,
    aliases: readStringList(effect?.aliases),
    source_aliases: readStringList(effect?.source_aliases ?? effect?.sourceAliases),
    source_reason: readString(effect?.source_reason) ?? null,
  })
}

function getRequiredSourceEffectDependencies(payload, consumerItemName, consumerSlot) {
  const requiredSourceEffects = Array.isArray(payload.required_source_effects)
    ? payload.required_source_effects
    : []

  return requiredSourceEffects
    .map((entry, index) => {
      const record = asRecord(entry)
      const key = readString(record.key) ?? `required-source-effect-${index}`
      const label = readString(record.label)
      if (!label) return null

      return {
        key,
        label,
        reason_line: readString(record.source_reason),
        consumer_item_name: consumerItemName,
        consumer_slot: consumerSlot,
        status: 'satisfied',
        source_kind: 'preserved_item_effect',
        source_label: consumerItemName,
        source_slot: consumerSlot,
        source_item_name: consumerItemName,
        source_detail: readString(record.source_reason),
        note: `${consumerItemName} keeps ${label} on the recommendation itself.`,
      }
    })
    .filter(Boolean)
}

export function candidateSatisfiesRequiredSourceEffects(rawText, requiredEffects) {
  const normalizedText = trim(rawText)
  if (!normalizedText) return false

  const effects = Array.isArray(requiredEffects) ? requiredEffects : []
  return effects.every((entry) => {
    const record = asRecord(entry)
    const sourceAliases = readStringList(record.source_aliases ?? record.sourceAliases)
    if (sourceAliases.length === 0) return true
    return !!findDependencySourceLine(normalizedText, sourceAliases)
  })
}

export function buildRareSlotContext({ targetContext, profile }) {
  const stageItems = collectStageItems(targetContext)
  const stageSkillSources = collectStageSkillSources(targetContext)
  const equippedItems = collectEquippedItems(profile)
  const equippedSkillSources = collectEquippedSkillSources(profile)
  const contexts = {}

  for (const stageItem of stageItems) {
    if (normalizeText(stageItem?.rarity) !== 'rare' || !stageItem.slot || !stageItem.slotKey) {
      continue
    }

    const strictRequiredEffects = new Map()
    const transferableAnoint = extractTransferableAnoint(stageItem.rawText)

    for (const effect of extractProvidedSourceEffects(stageItem.rawText)) {
      addStrictRequiredEffect(strictRequiredEffects, effect)
    }

    for (const consumerStageItem of stageItems) {
      const consumerSlotKey = consumerStageItem.slotKey
      if (!consumerSlotKey || !consumerStageItem.rawText) {
        continue
      }

      for (const spec of extractRequirementSpecs(consumerStageItem.rawText)) {
        const source = resolveDependencySource({
          spec,
          consumerSlotKey,
          stageItems,
          stageSkillSources,
          equippedItems,
          equippedSkillSources,
        })

        if (
          source.source_kind === 'stage_item' &&
          normalizeSlot(source.source_slot) === stageItem.slotKey
        ) {
          addStrictRequiredEffect(strictRequiredEffects, {
            key: spec.key,
            label: spec.label,
            aliases: spec.aliases,
            source_aliases: spec.sourceAliases,
            source_reason:
              spec.reasonLine ??
              `${consumerStageItem.itemName ?? consumerStageItem.slot ?? 'Selected item'} needs ${spec.label}.`,
          })
        }
      }
    }

    const serializedRequiredEffects = [...strictRequiredEffects.values()]
    if (!transferableAnoint && serializedRequiredEffects.length === 0) {
      continue
    }

    contexts[stageItem.slot] = {
      transferable_anoint: transferableAnoint,
      strict_required_effects: serializedRequiredEffects,
    }
  }

  return contexts
}

function isUniqueRecommendationItem(item) {
  const payload = getItemPayload(item)
  return (
    normalizeText(payload.rarity) === 'unique' ||
    normalizeText(payload.candidate_type) === 'market_unique' ||
    (normalizeText(item?.item_name).length > 0 &&
      normalizeText(payload.trade_link_kind) === 'name_search')
  )
}

function findStageItemForRecommendation(targetContext, item) {
  const payload = getItemPayload(item)
  const wantedSlot = normalizeSlot(payload.target_stage_slot ?? item?.slot)
  const wantedName = normalizeText(item?.item_name ?? payload.name)

  const stageItems = asArray(targetContext?.selectedItemSet?.items)
  let fallback = null

  for (const stageItem of stageItems) {
    const stageSlot = normalizeSlot(stageItem?.slot)
    if (wantedSlot && stageSlot !== wantedSlot) {
      continue
    }

    if (!fallback) {
      fallback = stageItem
    }

    if (wantedName && normalizeText(stageItem?.name) === wantedName) {
      return stageItem
    }
  }

  return fallback
}

function buildNormalizedStringSet(values) {
  return new Set(readStringList(values).map((entry) => normalizeText(entry)).filter(Boolean))
}

function buildTreeDependencyNote(consumerItemName, dependency) {
  if (dependency.status === 'satisfied') {
    return `${consumerItemName} already has the ${dependency.label} keystone on the current tree.`
  }

  if (dependency.status === 'paired_target') {
    return `${consumerItemName} depends on ${dependency.label}, and the selected PoB tree allocates that keystone.`
  }

  return `${consumerItemName} references ${dependency.label}, but neither the current tree nor the selected target tree allocates that keystone.`
}

function extractTreeKeystoneDependencies(rawText, consumerItemName, consumerSlot, summary) {
  const availableKeystones = readStringList(asRecord(summary).available_tree_keystones)
  if (availableKeystones.length === 0) {
    return []
  }

  const currentKeystones = buildNormalizedStringSet(asRecord(summary).current_tree_keystones)
  const targetKeystones = buildNormalizedStringSet(asRecord(summary).target_tree_keystones)
  const dependencies = new Map()

  for (const line of extractRelevantLines(rawText)) {
    const normalizedLine = normalizeText(line)
    for (const keystoneName of availableKeystones) {
      const normalizedKeystone = normalizeText(keystoneName)
      if (!normalizedKeystone || !normalizedLine.includes(normalizedKeystone)) {
        continue
      }

      if (dependencies.has(normalizedKeystone)) {
        continue
      }

      const status = currentKeystones.has(normalizedKeystone)
        ? 'satisfied'
        : targetKeystones.has(normalizedKeystone)
          ? 'paired_target'
          : 'missing'
      const dependency = {
        key: `skill-tree-keystone-${normalizedKeystone.replace(/[^a-z0-9]+/g, '-')}`,
        label: keystoneName,
        reason_line: line,
        consumer_item_name: consumerItemName,
        consumer_slot: consumerSlot,
        status,
        source_kind: 'skill_tree',
        source_label: 'Keystone',
        source_slot: null,
        source_item_name: null,
        source_detail:
          status === 'satisfied'
            ? `Current passive tree: ${keystoneName}`
            : status === 'paired_target'
              ? `Selected tree spec: ${keystoneName}`
              : `Missing keystone allocation: ${keystoneName}`,
      }

      dependencies.set(normalizedKeystone, {
        ...dependency,
        note: buildTreeDependencyNote(consumerItemName, dependency),
      })
    }
  }

  return [...dependencies.values()]
}

export function annotateRecommendationDependencies({ analysis, targetContext, profile }) {
  if (!analysis?.plans?.length) {
    return analysis
  }

  const stageItems = collectStageItems(targetContext)
  const stageSkillSources = collectStageSkillSources(targetContext)
  const equippedItems = collectEquippedItems(profile)
  const equippedSkillSources = collectEquippedSkillSources(profile)

  return {
    ...analysis,
    plans: analysis.plans.map((plan) => {
      const itemDependencies = []
      const items = asArray(plan.items).map((item) => {
        const payload = getItemPayload(item)
        const stageItem = findStageItemForRecommendation(targetContext, item)
        const rawText = trim(payload.raw_text) || trim(stageItem?.rawText)
        const consumerItemName = trim(item?.item_name) || trim(stageItem?.name) || 'This item'
        const consumerSlot =
          trim(payload.target_stage_slot ?? item?.slot ?? stageItem?.slot) || null
        const consumerSlotKey = normalizeSlot(consumerSlot)
        const dependencies = [
          ...getRequiredSourceEffectDependencies(payload, consumerItemName, consumerSlot),
        ]

        if (!isUniqueRecommendationItem(item)) {
          if (dependencies.length === 0) {
            return item
          }

          itemDependencies.push({ itemName: consumerItemName, dependencies })
          return withItemPayload(item, {
            bundle_dependencies: dependencies,
            dependency_status: buildDependencyStatus(dependencies),
          })
        }

        if (!rawText) {
          if (dependencies.length === 0) {
            return item
          }

          itemDependencies.push({ itemName: consumerItemName, dependencies })
          return withItemPayload(item, {
            bundle_dependencies: dependencies,
            dependency_status: buildDependencyStatus(dependencies),
          })
        }

        if (!consumerSlotKey) {
          if (dependencies.length === 0) {
            return item
          }

          itemDependencies.push({ itemName: consumerItemName, dependencies })
          return withItemPayload(item, {
            bundle_dependencies: dependencies,
            dependency_status: buildDependencyStatus(dependencies),
          })
        }

        dependencies.push(
          ...extractRequirementSpecs(rawText).map((spec) => {
            const source = resolveDependencySource({
              spec,
              consumerSlotKey,
              stageItems,
              stageSkillSources,
              equippedItems,
              equippedSkillSources,
            })

            const dependency = {
              key: spec.key,
              label: spec.label,
              reason_line: spec.reasonLine,
              consumer_item_name: consumerItemName,
              consumer_slot: consumerSlot,
              status: source.status,
              source_kind: source.source_kind,
              source_label: source.source_label,
              source_slot: source.source_slot,
              source_item_name: source.source_item_name,
              source_detail: source.source_detail,
            }

            return {
              ...dependency,
              note: buildDependencyNote(consumerItemName, dependency),
            }
          }),
          ...extractTreeKeystoneDependencies(rawText, consumerItemName, consumerSlot, analysis.summary),
        )

        if (dependencies.length === 0) {
          return item
        }

        itemDependencies.push({ itemName: consumerItemName, dependencies })

        return withItemPayload(item, {
          bundle_dependencies: dependencies,
          dependency_status: buildDependencyStatus(dependencies),
        })
      })

      if (itemDependencies.length === 0) {
        return plan
      }

      const dependencyCount = itemDependencies.reduce(
        (total, entry) => total + entry.dependencies.length,
        0,
      )

      return {
        ...plan,
        explanation: formatPlanDependencyExplanation(plan, itemDependencies),
        ranking_reason: {
          ...asRecord(plan.ranking_reason),
          dependency_count: dependencyCount,
          bundle_dependencies: itemDependencies.flatMap((entry) => entry.dependencies),
        },
        items,
      }
    }),
  }
}
