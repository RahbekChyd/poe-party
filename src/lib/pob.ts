import type {
  AnalysisMetricSnapshot,
  PobClusterJewelSize,
  PobConfigSetLayout,
  PobImportMetadata,
  PobSkillGemLayout,
  PobSkillLinkGroupLayout,
  PobItemSetLayout,
  PobLayoutItemSummary,
  PobSkillSetLayout,
  PobTreeSpecClusterJewelLayout,
  PobTreeSpecLayout,
  TargetStageRequirement,
} from '../types/app'
import { buildPassiveTreeUrl } from './character-profile'
import { sortUniqueNumbers } from './parse-helpers'
import type { PassiveTreeComparable } from './passive-tree-links'
const UINT16_MAX = 0xffff

function normalizeSourceKind(input: string): PobImportMetadata['source_kind'] {
  return input.trim().startsWith('<') ? 'pob_xml' : 'pob_share_code'
}

function normalizeSlotName(slotName: string): string {
  return slotName.replace(/\s+/g, ' ').trim()
}

function isMeaningfulLinkRequirement(slotName: string | null | undefined, value: number | null | undefined): boolean {
  const normalizedSlot = normalizeSlotName(slotName ?? '').toLowerCase()
  const normalizedValue = Number(value ?? 0)
  if (!Number.isFinite(normalizedValue) || normalizedValue < 6) {
    return false
  }

  return (
    normalizedSlot === 'body armour' ||
    normalizedSlot === 'weapon 1' ||
    normalizedSlot === 'weapon 2'
  )
}

export function isMeaningfulStageRequirement(requirement: TargetStageRequirement): boolean {
  if (requirement.kind === 'minimum_sockets') {
    return false
  }

  if (requirement.kind === 'minimum_links') {
    return isMeaningfulLinkRequirement(requirement.slot, requirement.value)
  }

  return true
}

export function filterMeaningfulStageRequirements(
  requirements: TargetStageRequirement[],
): TargetStageRequirement[] {
  return requirements.filter(isMeaningfulStageRequirement)
}

function normalizeRarity(value: string | null): string | null {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) return null
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function readNodeText(node: Element | null): string | null {
  const value = node?.textContent?.trim()
  return value ? value : null
}

function parseNumber(value: string | null): number | null {
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parseBooleanAttribute(value: string | null): boolean | null {
  if (value === 'true') return true
  if (value === 'false') return false
  return null
}

function parseIntegerAttribute(node: Element, attribute: string): number | null {
  return parseNumber(node.getAttribute(attribute))
}

function parseNumberList(value: string | null): number[] {
  if (!value?.trim()) return []

  return sortUniqueNumbers(
    value
      .split(',')
      .map((entry) => Number(entry.trim()))
      .filter((entry) => Number.isFinite(entry)),
  )
}

function parseTreeSpecMasteryEffects(value: string | null): number[] {
  if (!value?.trim()) return []

  return sortUniqueNumbers(
    Array.from(value.matchAll(/\{(\d+),(\d+)\}/g))
      .map(([, masteryNodeId, effectId]) => {
        const node = Number(masteryNodeId)
        const effect = Number(effectId)
        if (!Number.isFinite(node) || !Number.isFinite(effect)) return null
        return (((effect & UINT16_MAX) << 16) | (node & UINT16_MAX)) >>> 0
      })
      .filter((entry): entry is number => entry != null),
  )
}

function splitTreeSpecNodeIds(values: number[]): Pick<PobTreeSpecLayout, 'hashes' | 'hashesEx'> {
  const hashes: number[] = []
  const hashesEx: number[] = []

  for (const value of values) {
    if (!Number.isFinite(value) || value < 0) continue
    if (value > UINT16_MAX) {
      hashesEx.push(value)
      continue
    }
    hashes.push(value)
  }

  return {
    hashes: sortUniqueNumbers(hashes),
    hashesEx: sortUniqueNumbers(hashesEx),
  }
}

function getClusterJewelSize(typeLine: string | null | undefined): PobClusterJewelSize | null {
  const normalized = typeLine?.trim().toLowerCase()
  if (!normalized) return null
  if (normalized.includes('large cluster jewel')) return 'large'
  if (normalized.includes('medium cluster jewel')) return 'medium'
  if (normalized.includes('small cluster jewel')) return 'small'
  if (normalized.includes('cluster jewel')) return 'unknown'
  return null
}

function formatGemQuality(value: number | null): string | null {
  if (value == null) return null
  return `${value}%`
}

function parsePobItemText(rawText: string | null): Omit<PobLayoutItemSummary, 'itemId' | 'slot'> {
  const lines = (rawText ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const rarityIndex = lines.findIndex((line) => line.startsWith('Rarity:'))
  const rarity =
    rarityIndex >= 0 ? normalizeRarity(lines[rarityIndex].replace('Rarity:', '').trim()) : null
  const headerLines = rarityIndex >= 0 ? lines.slice(rarityIndex + 1, rarityIndex + 3) : lines.slice(0, 2)
  const socketsLine = lines.find((line) => line.startsWith('Sockets:'))
  const socketGroups = socketsLine
    ? socketsLine
        .replace('Sockets:', '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
    : []
  const socketCount = socketGroups.reduce((total, group) => total + group.split('-').filter(Boolean).length, 0)
  const maxLinkCount = socketGroups.reduce((maxLinks, group) => {
    const links = group.split('-').filter(Boolean).length
    return Math.max(maxLinks, links)
  }, 0)

  return {
    rarity,
    name: headerLines[0] ?? null,
    typeLine: headerLines[1] ?? headerLines[0] ?? null,
    socketCount: socketCount || null,
    maxLinkCount: maxLinkCount || null,
    rawText,
  }
}

function buildPobItemSummaryLookup(
  document: Document,
): Map<string, Omit<PobLayoutItemSummary, 'itemId' | 'slot'>> {
  const itemNodes = new Map<string, Omit<PobLayoutItemSummary, 'itemId' | 'slot'>>()

  for (const itemNode of document.querySelectorAll('Items > Item[id]')) {
    const itemId = itemNode.getAttribute('id')?.trim()
    if (!itemId) continue
    itemNodes.set(itemId, parsePobItemText(itemNode.textContent ?? null))
  }

  return itemNodes
}

function parseTreeSpecClusterJewels(
  specNode: Element,
  itemNodes: Map<string, Omit<PobLayoutItemSummary, 'itemId' | 'slot'>>,
): PobTreeSpecClusterJewelLayout[] {
  return [...specNode.querySelectorAll('Sockets > Socket')]
    .map((socketNode) => {
      const socketNodeId = parseIntegerAttribute(socketNode, 'nodeId')
      if (socketNodeId == null) return null

      const itemId = socketNode.getAttribute('itemId')?.trim() ?? null
      const itemSummary = itemId ? itemNodes.get(itemId) : null
      const size = getClusterJewelSize(itemSummary?.typeLine)
      if (!size) return null

      return {
        socketNodeId,
        itemId,
        size,
        name: itemSummary?.name ?? null,
        typeLine: itemSummary?.typeLine ?? null,
      } satisfies PobTreeSpecClusterJewelLayout
    })
    .filter((entry): entry is PobTreeSpecClusterJewelLayout => entry != null)
}

async function inflateBase64Payload(base64Payload: string): Promise<string> {
  const normalized = base64Payload.trim().replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  const binary = atob(`${normalized}${padding}`)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))

  if (!('DecompressionStream' in globalThis)) {
    throw new Error('This browser does not support PoB import decompression yet.')
  }

  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))
  return new Response(stream).text()
}

export async function decodePobImport(input: string): Promise<{
  source_kind: PobImportMetadata['source_kind']
  raw_xml: string
}> {
  const trimmed = input.trim()
  const source_kind = normalizeSourceKind(trimmed)

  if (!trimmed) {
    throw new Error('Paste a PoB share code or exported XML first.')
  }

  if (source_kind === 'pob_xml') {
    return { source_kind, raw_xml: trimmed }
  }

  return {
    source_kind,
    raw_xml: await inflateBase64Payload(trimmed),
  }
}

function parseTreeSpecs(document: Document): PobTreeSpecLayout[] {
  const itemNodes = buildPobItemSummaryLookup(document)
  return [...document.querySelectorAll('Tree > Spec')].map((node, index) => {
    const nodeIds = parseNumberList(node.getAttribute('nodes'))
    const { hashes, hashesEx } = splitTreeSpecNodeIds(nodeIds)

    return {
      id:
        node.getAttribute('title')?.trim() ||
        node.getAttribute('specId')?.trim() ||
        String(index + 1),
      title: node.getAttribute('title')?.trim() || `Tree ${index + 1}`,
      url:
        node.querySelector('URL')?.getAttribute('link') ??
        readNodeText(node.querySelector('URL')),
      treeVersion: node.getAttribute('treeVersion')?.trim() || null,
      classId: parseIntegerAttribute(node, 'classId'),
      ascendancyId: parseIntegerAttribute(node, 'ascendClassId'),
      secondaryAscendancyId: parseIntegerAttribute(node, 'secondaryAscendClassId'),
      hashes,
      hashesEx,
      masteryEffects: parseTreeSpecMasteryEffects(node.getAttribute('masteryEffects')),
      clusterJewels: parseTreeSpecClusterJewels(node, itemNodes),
    }
  })
}

function parseSkillSets(document: Document): PobSkillSetLayout[] {
  return [...document.querySelectorAll('Skills > SkillSet')].map((node, index) => {
    const groups: PobSkillLinkGroupLayout[] = [...node.querySelectorAll('Skill')].map(
      (skillNode, skillIndex) => {
        const skillEnabled = parseBooleanAttribute(skillNode.getAttribute('enabled'))
        const gems = [...skillNode.querySelectorAll('Gem')]
          .map((gemNode) => {
            const nameSpec = gemNode.getAttribute('nameSpec')?.trim() || null
            const name =
              nameSpec ||
              skillNode.getAttribute('label')?.trim() ||
              gemNode.getAttribute('skillId')?.trim() ||
              null
            if (!name) return null

            return {
              name,
              level: parseNumber(gemNode.getAttribute('level')),
              quality: formatGemQuality(parseNumber(gemNode.getAttribute('quality'))),
              enabled: parseBooleanAttribute(gemNode.getAttribute('enabled')) ?? skillEnabled,
              isItemGranted: !nameSpec,
            } satisfies PobSkillGemLayout
          })
          .filter((entry): entry is PobSkillGemLayout => !!entry)

        const enabledGems = gems.filter((entry) => entry.enabled !== false && !entry.isItemGranted)

        return {
          id: skillNode.getAttribute('slot')?.trim() || `${index + 1}-${skillIndex + 1}`,
          label: skillNode.getAttribute('label')?.trim() || null,
          slot: skillNode.getAttribute('slot')?.trim() || null,
          enabled: skillEnabled,
          linkCount: enabledGems.length,
          gems,
        } satisfies PobSkillLinkGroupLayout
      },
    )
    const gems: PobSkillGemLayout[] = groups.flatMap((group) => group.gems)
    const gemNames = Array.from(new Set(gems.map((entry) => entry.name).filter(Boolean)))

    return {
      id: node.getAttribute('id')?.trim() || String(index + 1),
      title: node.getAttribute('title')?.trim() || `Skill Set ${index + 1}`,
      gemNames,
      gems,
      groups,
    }
  })
}

function parseItemSets(document: Document): PobItemSetLayout[] {
  const itemNodes = buildPobItemSummaryLookup(document)

  return [...document.querySelectorAll('Items > ItemSet')].map((itemSetNode, index) => {
    const items: PobLayoutItemSummary[] = [...itemSetNode.querySelectorAll('Slot')].map((slotNode) => {
      const itemId = slotNode.getAttribute('itemId')?.trim() ?? null
      const base = itemId ? itemNodes.get(itemId) : null
      return {
        itemId,
        slot: normalizeSlotName(slotNode.getAttribute('name')?.trim() || 'Unknown'),
        rarity: base?.rarity ?? null,
        name: base?.name ?? null,
        typeLine: base?.typeLine ?? null,
        socketCount: base?.socketCount ?? null,
        maxLinkCount: base?.maxLinkCount ?? null,
        rawText: base?.rawText ?? null,
      }
    })

    return {
      id: itemSetNode.getAttribute('id')?.trim() || String(index + 1),
      title: itemSetNode.getAttribute('title')?.trim() || `Item Set ${index + 1}`,
      useSecondWeaponSet: itemSetNode.getAttribute('useSecondWeaponSet') === 'true',
      items,
    }
  })
}

function parseConfigSets(document: Document): {
  config_sets: PobConfigSetLayout[]
  active_config_set_id: string | null
  active_config_set_title: string | null
} {
  const configNode = document.querySelector('Config')
  const activeConfigSetId = configNode?.getAttribute('activeConfigSet')?.trim() ?? null
  const configSets = [...document.querySelectorAll('Config > ConfigSet')].map((node, index) => ({
    id: node.getAttribute('id')?.trim() || String(index + 1),
    title: node.getAttribute('title')?.trim() || `Config ${index + 1}`,
  }))

  if (configSets.length === 0 && configNode) {
    const fallbackId = activeConfigSetId || '1'
    configSets.push({
      id: fallbackId,
      title: 'Default',
    })
  }

  const activeConfigSetTitle =
    configSets.find((entry) => entry.id === activeConfigSetId)?.title ??
    (activeConfigSetId == null ? configSets[0]?.title ?? null : null)

  return {
    config_sets: configSets,
    active_config_set_id: activeConfigSetId ?? (configSets[0]?.id ?? null),
    active_config_set_title: activeConfigSetTitle,
  }
}

function parsePlayerStats(document: Document): AnalysisMetricSnapshot {
  const buildNode = document.querySelector('Build')
  const stats: AnalysisMetricSnapshot = {}

  for (const node of document.querySelectorAll('Build > PlayerStat')) {
    const statName = node.getAttribute('stat')
    const statValue = parseNumber(node.getAttribute('value'))
    if (!statName || statValue == null) continue

    switch (statName) {
      case 'TotalDPS':
        stats.totalDps = statValue
        break
      case 'CombinedDPS':
        stats.combinedDps = statValue
        break
      case 'TotalEHP':
        stats.totalEhp = statValue
        break
      case 'Life':
        stats.life = statValue
        break
      case 'Mana':
        stats.mana = statValue
        break
      case 'EnergyShield':
        stats.energyShield = statValue
        break
      case 'Armour':
        stats.armour = statValue
        break
      case 'Evasion':
        stats.evasion = statValue
        break
      case 'Ward':
        stats.ward = statValue
        break
      case 'FireResist':
        stats.fireResist = statValue
        break
      case 'ColdResist':
        stats.coldResist = statValue
        break
      case 'LightningResist':
        stats.lightningResist = statValue
        break
      case 'ChaosResist':
        stats.chaosResist = statValue
        break
      default:
        stats[statName] = statValue
    }
  }

  if (buildNode) {
    const level = parseNumber(buildNode.getAttribute('level'))
    if (level != null) {
      stats.characterLevel = level
    }
  }

  return stats
}

export function parsePobXml(rawXml: string, sourceKind: PobImportMetadata['source_kind']): PobImportMetadata {
  const document = new DOMParser().parseFromString(rawXml, 'application/xml')
  const parserError = document.querySelector('parsererror')
  if (parserError) {
    throw new Error('The PoB payload could not be parsed as XML.')
  }

  const buildNode = document.querySelector('Build')
  const configData = parseConfigSets(document)

  return {
    source_kind: sourceKind,
    class_name: buildNode?.getAttribute('className')?.trim() ?? null,
    ascendancy_name: buildNode?.getAttribute('ascendClassName')?.trim() ?? null,
    target_version: buildNode?.getAttribute('targetVersion')?.trim() ?? null,
    notes: readNodeText(document.querySelector('Notes')),
    player_stats: parsePlayerStats(document),
    tree_specs: parseTreeSpecs(document),
    skill_sets: parseSkillSets(document),
    config_sets: configData.config_sets,
    active_config_set_id: configData.active_config_set_id,
    active_config_set_title: configData.active_config_set_title,
    item_sets: parseItemSets(document),
  }
}

export async function parsePobImport(input: string): Promise<{
  source_kind: PobImportMetadata['source_kind']
  raw_xml: string
  metadata: PobImportMetadata
}> {
  const decoded = await decodePobImport(input)
  const metadata = parsePobXml(decoded.raw_xml, decoded.source_kind)
  return {
    source_kind: decoded.source_kind,
    raw_xml: decoded.raw_xml,
    metadata,
  }
}

export function deriveStageRequirementsFromSelection(
  metadata: PobImportMetadata,
  selection: {
    item_set_id?: string | null
  },
): TargetStageRequirement[] {
  const requirements: TargetStageRequirement[] = []
  const itemSet = metadata.item_sets.find((entry) => entry.id === selection.item_set_id)

  for (const item of itemSet?.items ?? []) {
    if (normalizeRarity(item.rarity) === 'Unique' && item.name) {
      requirements.push({
        kind: 'mandatory_unique',
        label: `${item.name}${item.slot ? ` (${item.slot})` : ''}`,
        slot: item.slot,
        item_name: item.name,
        details: item.typeLine ?? null,
      })
    }

    if (isMeaningfulLinkRequirement(item.slot, item.maxLinkCount)) {
      requirements.push({
        kind: 'minimum_links',
        label: `${item.slot} needs ${item.maxLinkCount} links`,
        slot: item.slot,
        value: item.maxLinkCount,
      })
    }
  }

  return requirements
}

function readTreeSpecNumberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? sortUniqueNumbers(
        value
          .map((entry) => (typeof entry === 'number' ? entry : Number(entry)))
          .filter((entry) => Number.isFinite(entry)),
      )
    : []
}

function readTreeSpecNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function readTreeSpecString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

export function normalizePobConfigSet(configSet: unknown, index: number): PobConfigSetLayout {
  const record =
    configSet && typeof configSet === 'object' && !Array.isArray(configSet)
      ? (configSet as Record<string, unknown>)
      : {}

  return {
    id: readTreeSpecString(record.id) ?? String(index + 1),
    title: readTreeSpecString(record.title) ?? `Config ${index + 1}`,
  }
}

export function normalizePobTreeSpec(spec: unknown, index: number): PobTreeSpecLayout {
  const record =
    spec && typeof spec === 'object' && !Array.isArray(spec) ? (spec as Record<string, unknown>) : {}

  return {
    id: readTreeSpecString(record.id) ?? readTreeSpecString(record.title) ?? String(index + 1),
    title: readTreeSpecString(record.title) ?? `Tree ${index + 1}`,
    url: readTreeSpecString(record.url),
    treeVersion: readTreeSpecString(record.treeVersion),
    classId: readTreeSpecNumber(record.classId),
    ascendancyId: readTreeSpecNumber(record.ascendancyId),
    secondaryAscendancyId: readTreeSpecNumber(record.secondaryAscendancyId),
    hashes: readTreeSpecNumberArray(record.hashes),
    hashesEx: readTreeSpecNumberArray(record.hashesEx),
    masteryEffects: readTreeSpecNumberArray(record.masteryEffects),
    clusterJewels: Array.isArray(record.clusterJewels)
      ? record.clusterJewels
          .map((entry) => {
            const jewelRecord =
              entry && typeof entry === 'object' && !Array.isArray(entry)
                ? (entry as Record<string, unknown>)
                : {}
            const size = readTreeSpecString(jewelRecord.size)
            const socketNodeId = readTreeSpecNumber(jewelRecord.socketNodeId)
            if (socketNodeId == null) return null

            return {
              socketNodeId,
              itemId: readTreeSpecString(jewelRecord.itemId),
              size:
                size === 'large' || size === 'medium' || size === 'small' || size === 'unknown'
                  ? size
                  : 'unknown',
              name: readTreeSpecString(jewelRecord.name),
              typeLine: readTreeSpecString(jewelRecord.typeLine),
            } satisfies PobTreeSpecClusterJewelLayout
          })
          .filter((entry): entry is PobTreeSpecClusterJewelLayout => entry != null)
      : [],
  }
}

function normalizePobSkillGem(entry: unknown): PobSkillGemLayout | null {
  const record =
    entry && typeof entry === 'object' && !Array.isArray(entry) ? (entry as Record<string, unknown>) : {}
  const name = readTreeSpecString(record.name)
  if (!name) return null

  return {
    name,
    level: readTreeSpecNumber(record.level),
    quality: readTreeSpecString(record.quality),
    enabled:
      typeof record.enabled === 'boolean'
        ? record.enabled
        : record.enabled === null
          ? null
          : null,
    isItemGranted: typeof record.isItemGranted === 'boolean' ? record.isItemGranted : false,
  }
}

export function normalizePobSkillSet(skillSet: unknown, index: number): PobSkillSetLayout {
  const record =
    skillSet && typeof skillSet === 'object' && !Array.isArray(skillSet)
      ? (skillSet as Record<string, unknown>)
      : {}
  const gems = Array.isArray(record.gems)
    ? record.gems
        .map(normalizePobSkillGem)
        .filter((entry): entry is PobSkillGemLayout => entry != null)
    : []
  const groups = Array.isArray(record.groups)
    ? record.groups
        .map((entry, groupIndex) => {
          const groupRecord =
            entry && typeof entry === 'object' && !Array.isArray(entry)
              ? (entry as Record<string, unknown>)
              : {}
          const groupGems = Array.isArray(groupRecord.gems)
            ? groupRecord.gems
                .map(normalizePobSkillGem)
                .filter((gem): gem is PobSkillGemLayout => gem != null)
            : []

          return {
            id: readTreeSpecString(groupRecord.id) ?? `${index + 1}-${groupIndex + 1}`,
            label: readTreeSpecString(groupRecord.label),
            slot: readTreeSpecString(groupRecord.slot),
            enabled:
              typeof groupRecord.enabled === 'boolean'
                ? groupRecord.enabled
                : groupRecord.enabled === null
                  ? null
                  : null,
            linkCount: readTreeSpecNumber(groupRecord.linkCount) ?? groupGems.filter((gem) => gem.enabled !== false).length,
            gems: groupGems,
          } satisfies PobSkillLinkGroupLayout
        })
        .filter((entry) => entry.gems.length > 0 || entry.linkCount > 0)
    : []

  return {
    id: readTreeSpecString(record.id) ?? String(index + 1),
    title: readTreeSpecString(record.title) ?? `Skill Set ${index + 1}`,
    gemNames: Array.isArray(record.gemNames)
      ? record.gemNames.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      : Array.from(new Set(gems.map((entry) => entry.name))),
    gems,
    groups,
  }
}

export function getPobTreeSpecComparable(
  treeSpec: PobTreeSpecLayout | null | undefined,
): PassiveTreeComparable | null {
  if (!treeSpec) return null

  const hashes = Array.isArray(treeSpec.hashes) ? treeSpec.hashes : []
  const hashesEx = Array.isArray(treeSpec.hashesEx) ? treeSpec.hashesEx : []
  const masteryEffects = Array.isArray(treeSpec.masteryEffects) ? treeSpec.masteryEffects : []
  const classId = typeof treeSpec.classId === 'number' ? treeSpec.classId : null
  const ascendancyId =
    typeof treeSpec.ascendancyId === 'number' ? treeSpec.ascendancyId : null

  if (
    classId == null &&
    ascendancyId == null &&
    hashes.length === 0 &&
    hashesEx.length === 0 &&
    masteryEffects.length === 0
  ) {
    return null
  }

  return {
    classId,
    ascendancyId,
    hashes,
    hashesEx,
    masteryEffects,
  }
}

export function hasExactPobTreeSpecData(treeSpec: PobTreeSpecLayout | null | undefined): boolean {
  const comparable = getPobTreeSpecComparable(treeSpec)
  if (!comparable) return false

  return comparable.classId != null && comparable.ascendancyId != null && comparable.hashes.length > 0
}

export function getPobTreeSpecUrl(treeSpec: PobTreeSpecLayout | null | undefined): string | null {
  const comparable = getPobTreeSpecComparable(treeSpec)
  const generatedUrl =
    comparable && treeSpec?.treeVersion
      ? buildPassiveTreeUrl({
          gameVersion: treeSpec.treeVersion,
          classId: comparable.classId,
          ascendancyId: comparable.ascendancyId,
          hashes: comparable.hashes,
          hashesEx: comparable.hashesEx,
          masteryEffects: comparable.masteryEffects,
        })
      : null

  return generatedUrl ?? treeSpec?.url ?? null
}
