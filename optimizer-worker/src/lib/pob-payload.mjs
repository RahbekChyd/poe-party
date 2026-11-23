import {
  getDisplayName,
  sanitizeAnalysisRawText,
  isLikelyEquippableStashItem,
  toPobTextFromProfileItem,
  toPobTextFromStashItem,
  toStructuredStashMods,
} from './pob-item-text.mjs'
import { normalizeRunKind } from './run-lifecycle.mjs'

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

const OVERLAY_SLOT_IDS = new Set([
  'Weapon',
  'Offhand',
  'Weapon2',
  'Offhand2',
  'Helm',
  'BodyArmour',
  'Gloves',
  'Boots',
  'Amulet',
  'Ring',
  'Ring2',
  'Ring3',
  'Belt',
  'Flask',
  'BrequelGrafts',
  'BrequelGrafts2',
  'VisceraHead', 'VisceraBody', 'VisceraArm', 'VisceraLeg',
])

function normalizeStageSlot(slot) {
  return (
    String(slot ?? '')
      .replace(/\s+/g, ' ')
      .trim() || null
  )
}

export function normalizeProfileSlot(slot) {
  const value = String(slot ?? '').trim()
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

function toProfilePayloadItem(item) {
  return {
    id: item.id ?? null,
    slot: item.slot ?? null,
    stage_slot_hint: normalizeProfileSlot(item.slot),
    name: item.name ?? '',
    type_line: item.typeLine ?? '',
    base_type: item.baseType ?? null,
    rarity: item.rarity ?? null,
    frame_type: item.frameType ?? null,
    item_level: item.itemLevel ?? null,
    identified: item.identified ?? true,
    corrupted: item.corrupted ?? false,
    fractured: item.fractured ?? false,
    synthesised: item.synthesised ?? false,
    influences: item.influences ?? [],
    sockets: item.sockets ?? [],
    properties: item.properties ?? [],
    requirements: item.requirements ?? [],
    implicit_mods: item.implicitMods ?? [],
    explicit_mods: item.explicitMods ?? [],
    crafted_mods: item.craftedMods ?? [],
    fractured_mods: item.fracturedMods ?? [],
    enchant_mods: item.enchantMods ?? [],
    veiled_mods: item.veiledMods ?? [],
    socketed_items: item.socketedItems ?? [],
    pob_item_text: toPobTextFromProfileItem(item),
  }
}

function toOwnedCandidatePayload(item) {
  const rawData = asRecord(item.raw_data)
  return {
    id: item.id ?? null,
    user_id: item.user_id ?? null,
    display_name: getDisplayName(item),
    name: item.name ?? '',
    type_line: item.type_line ?? '',
    base_type: item.base_type ?? null,
    item_class: item.item_class ?? null,
    frame_type: item.frame_type ?? null,
    ilvl: item.ilvl ?? null,
    identified: item.identified ?? true,
    corrupted: item.corrupted ?? false,
    fractured: item.fractured ?? false,
    synthesised: item.synthesised ?? false,
    price_chaos: item.price_chaos == null ? null : Number(item.price_chaos),
    sockets: item.sockets ?? [],
    mods: toStructuredStashMods(item),
    raw_data: rawData,
    pob_item_text: toPobTextFromStashItem(item),
    icon_url: item.icon_url ?? null,
    tab_name: item.tab_name ?? null,
    tab_type: item.tab_type ?? null,
  }
}

export function normalizePobApiItem(item) {
  return {
    ...item,
    ilvl: item.ilvl ?? item.itemLevel ?? 0,
    socketedItems: asArray(item.socketedItems).map(normalizePobApiItem),
    sockets: asArray(item.sockets).map((socket) => ({ ...socket, sColour: socket.sColour ?? socket.color ?? ({ S: 'R', D: 'G', I: 'B', G: 'W', A: 'A', DV: 'DV' })[socket.attr] })),
  }
}

export function cloneOverlayImportItem(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null
  const slot = String(item.inventoryId ?? '').trim()
  if (!slot || !OVERLAY_SLOT_IDS.has(slot)) return null

  const clone = normalizePobApiItem(item)
  delete clone.socketedItems
  return clone
}

export function collectOverlayImportItems(profile) {
  const rawCharacter = asRecord(profile?.raw_character)
  const primaryItems = asArray(rawCharacter.items)
  const candidateArrays =
    primaryItems.length > 0
      ? [primaryItems]
      : [asArray(rawCharacter.equipment), asArray(rawCharacter.inventory), asArray(rawCharacter.jewels)]

  const deduped = new Map()

  for (const items of [...candidateArrays, asArray(rawCharacter.wickerman)]) {
    for (const item of items) {
      const overlayItem = cloneOverlayImportItem(item)
      if (!overlayItem) continue
      const key =
        overlayItem.id ??
        `${overlayItem.inventoryId ?? 'unknown'}:${overlayItem.name ?? ''}:${overlayItem.typeLine ?? ''}`
      if (!deduped.has(key)) {
        deduped.set(key, overlayItem)
      }
    }
  }

  return [...deduped.values()]
}

function normalizeMasteryEffects(effects) {
  if (!Array.isArray(effects)) return asRecord(effects)

  // Normalized character snapshots store the node in the low 16 bits.
  const byNode = {}
  for (const pair of effects) {
    if (!Number.isInteger(pair) || pair < 0 || pair > 0xffffffff) continue
    const node = pair & 0xffff
    const effect = pair >>> 16
    if (node && effect) byNode[node] = effect
  }
  return byNode
}

/** Flatten OAuth and legacy character-window responses for PoB 2.68+. */
export function buildCurrentImportPayload(profile) {
  const raw = asRecord(profile?.raw_character)
  if (Object.keys(raw).length === 0) return { character: null, completeness: { equipment: false, passives: false, wickerman: false } }
  const identity = asRecord(raw.character)
  const items = asArray(raw.items)
  const legacyPassives = asRecord(raw.passives ?? raw.passive_tree ?? profile?.passive_tree)
  const passiveHashes = legacyPassives.hashes ?? legacyPassives.passiveSkills ?? raw.hashes ?? raw.passiveSkills
  const masteryEffects = legacyPassives.mastery_effects ?? legacyPassives.mastery_effect_pairs ??
    legacyPassives.masteryEffectPairs ?? legacyPassives.masteryEffects ?? raw.mastery_effects ??
    raw.mastery_effect_pairs ?? raw.masteryEffectPairs ?? raw.masteryEffects
  const isEquipped = (item) => OVERLAY_SLOT_IDS.has(item?.inventoryId)
  const wickerman = asArray(raw.wickerman).length ? asArray(raw.wickerman) : items.filter((item) => String(item?.inventoryId ?? '').startsWith('Viscera'))
  const character = {
    ...identity, ...raw,
    name: raw.name ?? identity.name ?? profile?.character_name ?? '',
    class: raw.class ?? identity.class ?? profile?.class ?? '',
    league: raw.league ?? identity.league ?? profile?.league ?? '',
    level: raw.level ?? identity.level ?? profile?.level ?? 1,
    equipment: Array.isArray(raw.equipment) ? raw.equipment : items.filter(isEquipped).filter((item) => !String(item.inventoryId).startsWith('Viscera')),
    wickerman,
    guardian: asArray(raw.guardian),
    jewels: Array.isArray(raw.jewels) ? raw.jewels : [...items, ...asArray(legacyPassives.items)].filter((item) => item?.inventoryId === 'PassiveJewels'),
    passives: {
      ...legacyPassives,
      hashes: asArray(passiveHashes),
      hashes_ex: asArray(legacyPassives.hashes_ex ?? legacyPassives.hashesEx ?? raw.hashes_ex ?? raw.hashesEx),
      mastery_effects: normalizeMasteryEffects(masteryEffects),
      jewel_data: asRecord(legacyPassives.jewel_data ?? legacyPassives.jewelData ?? raw.jewel_data ?? raw.jewelData),
      skill_overrides: asRecord(legacyPassives.skill_overrides ?? legacyPassives.skillOverrides ?? raw.skill_overrides ?? raw.skillOverrides),
      alternate_ascendancy: legacyPassives.alternate_ascendancy ?? legacyPassives.alternateAscendancy ?? raw.alternate_ascendancy ?? raw.alternateAscendancy,
    },
  }
  character.equipment = character.equipment.map(normalizePobApiItem)
  character.wickerman = character.wickerman.map(normalizePobApiItem)
  character.guardian = character.guardian.map(normalizePobApiItem)
  character.jewels = character.jewels.map(normalizePobApiItem)
  const hasOAuthEquipment = Array.isArray(raw.equipment)
  const completeness = {
    equipment: hasOAuthEquipment || Array.isArray(raw.items),
    passives: Array.isArray(passiveHashes),
    wickerman: hasOAuthEquipment || Array.isArray(raw.wickerman) || wickerman.length > 0,
  }
  const unsupportedFlags = [...character.equipment, ...character.wickerman, ...character.jewels].flatMap((item) => [...asArray(item.implicitMods), ...asArray(item.explicitMods)]).some((mod) => mod?.flags?.rareonly === true) ? ['rareonly'] : []
  return { character, completeness, unsupported_flags: unsupportedFlags }
}

/** Use stage base identity to constrain stash parts; PoB validates slot compatibility. */
export function collectOwnedVisceraCandidates(ownedItems, stageItems) {
  return asArray(stageItems).flatMap((stage) => {
    const slot = normalizeStageSlot(stage.slot)
    if (!['Head', 'Body', 'Arm', 'Leg'].includes(slot)) return []
    const baseType = stage.type_line ?? stage.typeLine
    if (!baseType) return []
    return asArray(ownedItems).filter((item) => !item.is_excluded && (item.base_type ?? item.type_line) === baseType && item.pob_item_text).map((item) => ({
      slot, baseType, rawText: item.pob_item_text, itemName: item.display_name ?? item.name,
      chaosValue: 0, candidateSource: 'owned', ownedItemId: item.id, ownerUserId: item.user_id,
      iconUrl: item.icon_url,
    }))
  })
}

export function buildPobRuntimePayload({
  run,
  buildTarget,
  targetStage,
  profile,
  latestItems,
  marketUniques,
  marketRares,
  league,
  targetContext,
  partyBuilds,
  rareSlotContext,
}) {
  const equippedItems = asArray(profile?.gear).map(toProfilePayloadItem)
  const overlayImportItems = collectOverlayImportItems(profile)
  const currentImport = buildCurrentImportPayload(profile)
  const runSummary = asRecord(run?.summary)
  const rerunChangedSlots = asArray(runSummary.rerun_changed_slots)
    .filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
    .map((entry) => entry.trim())

  const ownedCandidates = latestItems
    .filter((item) => !item?.is_excluded)
    .filter(isLikelyEquippableStashItem)
    .map(toOwnedCandidatePayload)

  const selectedItemSetItems = asArray(targetContext.selectedItemSet?.items).map((item) => ({
    slot: normalizeStageSlot(item?.slot),
    item_id: item?.itemId ?? null,
    rarity: item?.rarity ?? null,
    name: item?.name ?? null,
    type_line: item?.typeLine ?? null,
    socket_count: item?.socketCount ?? null,
    max_link_count: item?.maxLinkCount ?? null,
    raw_text: sanitizeAnalysisRawText(item?.rawText ?? null) || null,
  }))

  return {
    schema_version: 2,
    engine_contract: 'pob-2.68.1-adapter-1',
    generated_at: new Date().toISOString(),
    run: {
      id: run.id,
      kind: normalizeRunKind(run.__run_type),
      group_id: run.group_id,
      build_target_id: run.build_target_id,
      target_stage_id: run.target_stage_id ?? null,
      target_user_id: run.target_user_id,
      character_id: run.character_id ?? null,
      budget_chaos: Number(run.budget_chaos ?? 0),
      analysis_mode: run.analysis_mode === 'thorough' ? 'thorough' : 'quick',
      search_constraints:
        run.search_constraints && typeof run.search_constraints === 'object'
          ? run.search_constraints
          : {},
      rerun_base_run_id:
        typeof runSummary.rerun_base_run_id === 'string' ? runSummary.rerun_base_run_id : null,
      rerun_changed_slots: rerunChangedSlots,
    },
    build_target: {
      id: buildTarget.id,
      name: buildTarget.name ?? 'Imported PoB',
      source_kind: buildTarget.source_kind ?? null,
      raw_xml: buildTarget.raw_xml,
      import_metadata: asRecord(buildTarget.import_metadata),
    },
    target_stage: {
      id: run.target_stage_id ?? null,
      label: targetContext.label ?? null,
      notes: targetContext.notes ?? null,
      primary_metric: targetContext.primaryMetric ?? 'totalDps',
      target_metrics: targetContext.targetMetrics ?? {},
      hard_requirements: targetContext.hardRequirements ?? [],
      tree_spec:
        targetContext.selectedTreeSpec ??
        (targetStage?.tree_spec_id != null || targetStage?.tree_spec_title
          ? { id: targetStage.tree_spec_id ?? null, title: targetStage.tree_spec_title ?? null }
          : null),
      skill_set: targetContext.selectedSkillSet ?? null,
      config_set:
        targetContext.selectedConfigSet ??
        (targetStage?.config_set_id || targetStage?.config_set_title
          ? {
              id: targetStage?.config_set_id ?? null,
              title: targetStage?.config_set_title ?? null,
            }
          : null),
      item_set: targetContext.selectedItemSet
        ? {
            id: targetContext.selectedItemSet.id ?? null,
            title: targetContext.selectedItemSet.title ?? null,
            use_second_weapon_set: Boolean(targetContext.selectedItemSet.useSecondWeaponSet),
            items: selectedItemSetItems,
          }
        : null,
    },
    rare_slot_context:
      rareSlotContext && typeof rareSlotContext === 'object' && !Array.isArray(rareSlotContext)
        ? rareSlotContext
        : {},
    character_snapshot: {
      profile_id: profile?.id ?? null,
      character_id: profile?.character_id ?? null,
      character_name: profile?.character_name ?? null,
      league: profile?.league ?? null,
      class: profile?.class ?? null,
      ascendancy_class: profile?.ascendancy_class ?? null,
      level: profile?.level ?? null,
      last_synced_at: profile?.last_synced_at ?? null,
      passive_tree: profile?.passive_tree ?? {},
      atlas_tree: profile?.atlas_tree ?? {},
      equipped_items: equippedItems,
      overlay_items: overlayImportItems,
      current_import: currentImport,
    },
    owned_candidates: ownedCandidates,
    market_candidates: asArray(marketUniques).map((item) => ({
      name: item?.name ?? null,
      base_type: item?.baseType ?? null,
      icon: item?.icon ?? null,
      variant: item?.variant ?? null,
      links: item?.links == null ? null : Number(item.links),
      details_id: item?.detailsId ?? null,
      chaos_value: item?.chaosValue == null ? null : Number(item.chaosValue),
      price_source: item?.priceSource ?? null,
      league,
    })),
    rare_candidates: [...collectOwnedVisceraCandidates(ownedCandidates, selectedItemSetItems), ...asArray(marketRares)].map((item) => ({
      candidate_source: item?.candidateSource ?? 'market',
      owned_item_id: item?.ownedItemId ?? null,
      owner_user_id: item?.ownerUserId ?? null,
      slot: item?.slot ?? null,
      name: item?.itemName ?? null,
      base_type: item?.baseType ?? null,
      raw_text: item?.rawText ?? null,
      chaos_value: item?.chaosValue == null ? null : Number(item.chaosValue),
      listing_price_amount:
        item?.listingPriceAmount == null ? null : Number(item.listingPriceAmount),
      listing_price_currency: item?.listingPriceCurrency ?? null,
      trade_link: item?.tradeLink ?? null,
      trade_link_kind: item?.tradeLinkKind ?? null,
      trade_query_id: item?.tradeQueryId ?? null,
      trade_result_id: item?.tradeResultId ?? null,
      icon_url: item?.iconUrl ?? null,
    })),
    party_builds: asArray(partyBuilds).map((entry) => ({
      kind: entry?.kind ?? null,
      label: entry?.label ?? null,
      raw_xml: entry?.kind === 'group_member' ? (entry?.raw_xml ?? null) : null,
      pob_code: entry?.kind === 'pob_code' ? (entry?.pob_code ?? null) : null,
    })),
    diagnostics: {
      equipped_item_count: equippedItems.length,
      overlay_item_count: overlayImportItems.length,
      owned_candidate_count: ownedCandidates.length,
      market_candidate_count: asArray(marketUniques).length,
      rare_candidate_count: asArray(marketRares).length,
      stage_item_count: selectedItemSetItems.length,
      party_build_count: asArray(partyBuilds).length,
      search_constraint_slot_count:
        run.search_constraints &&
        typeof run.search_constraints === 'object' &&
        !Array.isArray(run.search_constraints) &&
        run.search_constraints.slot_overrides &&
        typeof run.search_constraints.slot_overrides === 'object' &&
        !Array.isArray(run.search_constraints.slot_overrides)
          ? Object.keys(run.search_constraints.slot_overrides).length
          : 0,
      incremental_rerun_slot_count: rerunChangedSlots.length,
    },
  }
}
