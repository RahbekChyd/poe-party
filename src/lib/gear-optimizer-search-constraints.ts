import {
  getModifierSectionMeta,
  shouldDisplayTooltipProperty,
  shouldDisplayTooltipRequirement,
  stripInlineModifierMarker,
} from './item-modifier-tooltip'
import { asRecord } from './parse-helpers'
import type {
  PobImportMetadata,
  PobLayoutItemSummary,
  RareSearchTargetKey,
  UpgradeSearchConstraints,
  UpgradeSearchLineConstraint,
  UpgradeSearchSlotConstraint,
} from '../types/app'
export const RARE_SEARCH_TARGET_LABELS: Record<RareSearchTargetKey, string> = {
  life: 'Life',
  elementalRes: 'Elemental res',
  chaosRes: 'Chaos res',
  strength: 'Strength',
  dexterity: 'Dexterity',
  intelligence: 'Intelligence',
  allAttributes: 'All attributes',
  movementSpeed: 'Move speed',
  attackSpeed: 'Attack speed',
  critChance: 'Crit chance',
  critMulti: 'Crit multi',
  pdps: 'Phys DPS',
  edps: 'Ele DPS',
  weaponDps: 'Weapon DPS',
  custom: 'Custom',
}

const TARGET_KEY_ORDER: RareSearchTargetKey[] = [
  'weaponDps',
  'pdps',
  'edps',
  'attackSpeed',
  'critChance',
  'critMulti',
  'life',
  'elementalRes',
  'chaosRes',
  'allAttributes',
  'strength',
  'dexterity',
  'intelligence',
  'movementSpeed',
  'custom',
]

export type RareStageSearchTooltipProperty = { name: string; values: string[] }

export type RareStageSearchTooltipRequirement = { name: string; values: string[] }

export interface RareStageSearchLineTarget {
  lineId: string
  targetKey: RareSearchTargetKey
  summaryTargetKey: RareSearchTargetKey | null
  label: string
  defaultValue: number | null
  defaultTargetValue: number
  targetMultiplier: number
  isCrafted: boolean
  inputSuffix: string | null
  inputStep: number
  supportsValueOverride: boolean
}

export interface RareStageSearchDisplayLine {
  id: string
  text: string
  lineClassName: string
  target: RareStageSearchLineTarget | null
}

export interface RareStageSearchSection {
  key: string
  title: string | null
  lines: RareStageSearchDisplayLine[]
}

export interface RareStageSearchFooterLine {
  text: string
  className: string | null
}

export interface RareStageSearchOption {
  slot: string
  typeLine: string
  title: string
  subtitle: string | null
  rarity: string
  properties: RareStageSearchTooltipProperty[]
  requirements: RareStageSearchTooltipRequirement[]
  sections: RareStageSearchSection[]
  footerLines: RareStageSearchFooterLine[]
  targetKeys: RareSearchTargetKey[]
  defaultTargetValues: Partial<Record<RareSearchTargetKey, number>>
}

export interface ResolvedRareStageSearchLineTarget extends RareStageSearchLineTarget {
  enabled: boolean
  value: number | null
  targetValue: number
  ignoredByCraftFilter: boolean
}

export interface ResolvedRareStageSearchDisplayLine extends Omit<
  RareStageSearchDisplayLine,
  'target'
> {
  target: ResolvedRareStageSearchLineTarget | null
}

export interface ResolvedRareStageSearchSection extends Omit<RareStageSearchSection, 'lines'> {
  lines: ResolvedRareStageSearchDisplayLine[]
}

export interface ResolvedRareStageSearchOption extends Omit<RareStageSearchOption, 'sections'> {
  sections: ResolvedRareStageSearchSection[]
  defaultActiveTargetValues: Partial<Record<RareSearchTargetKey, number>>
  effectiveTargetValues: Partial<Record<RareSearchTargetKey, number>>
  disabledTargetKeys: RareSearchTargetKey[]
  targetOverrideValues: Partial<Record<RareSearchTargetKey, number>>
  contributingLineCounts: Partial<Record<RareSearchTargetKey, number>>
}

type ParsedModifierLine = {
  id: string
  text: string
  groupKey: string
  lineClassName: string
}

type ParsedModifierSection = {
  key: string
  groupKey: string
  title: string | null
  lines: ParsedModifierLine[]
}

type ParsedTooltipItem = {
  title: string
  baseLine: string | null
  rarity: string
  properties: RareStageSearchTooltipProperty[]
  requirements: RareStageSearchTooltipRequirement[]
  modifierSections: ParsedModifierSection[]
  footerLines: RareStageSearchFooterLine[]
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function normalizeTargetKey(value: unknown): RareSearchTargetKey | null {
  if (typeof value !== 'string') return null
  return TARGET_KEY_ORDER.includes(value as RareSearchTargetKey)
    ? (value as RareSearchTargetKey)
    : null
}

function roundNumber(value: number, precision: number = 2): number {
  if (!Number.isFinite(value)) return 0
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

function normalizePositiveNumber(value: unknown, precision: number = 2): number | null {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue) || numericValue < 0) return null
  return roundNumber(numericValue, precision)
}

function parseNumber(value: string): number | null {
  const parsed = Number(String(value ?? '').replace(/,/g, '').replace(/%/g, ''))
  return Number.isFinite(parsed) && parsed > 0 ? roundNumber(parsed, 2) : null
}

function normalizeSearchLineIdFragment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function getPropertySearchLineId(name: string): string {
  return `property-${normalizeSearchLineIdFragment(name)}`
}

function extractTradeFilterNumbers(line: string): number[] {
  const normalizedLine = String(line ?? '').replace(
    /([+-])?\((\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\)/g,
    (_, sign, left, right) => {
      if (sign === '-') {
        return `-${left} -${right}`
      }
      return `${left} ${right}`
    },
  )

  return [...normalizedLine.matchAll(/[+-]?\d+(?:\.\d+)?/g)]
    .map((match) => Number(match[0]))
    .filter((entry) => Number.isFinite(entry))
}

function buildGenericLineDefaultValue(numbers: number[]): number | null {
  if (numbers.length === 0) return null

  if (numbers.length === 1) {
    return numbers[0] > 0 ? roundNumber(numbers[0], 2) : null
  }

  if (numbers.length === 2) {
    const minimumValue = numbers[0]
    const maximumValue = numbers[1]
    if (minimumValue > 0 && maximumValue > 0) {
      return roundNumber((minimumValue + maximumValue) / 2, 2)
    }
    return null
  }

  if (numbers.length === 4) {
    const averageMinimum = (numbers[0] + numbers[2]) / 2
    const averageMaximum = (numbers[1] + numbers[3]) / 2
    if (averageMinimum > 0 && averageMaximum > 0) {
      return roundNumber((averageMinimum + averageMaximum) / 2, 2)
    }
    return null
  }

  const minimumValue = numbers[0]
  const maximumValue = numbers[numbers.length - 1]
  if (minimumValue > 0 && maximumValue > 0) {
    return roundNumber((minimumValue + maximumValue) / 2, 2)
  }
  return null
}

function inferLineInputSuffix(lineText: string): string | null {
  return lineText.includes('%') ? '%' : null
}

function inferLineInputStep(defaultValue: number | null): number {
  if (defaultValue == null) return 1
  return Math.abs(defaultValue) < 10 || !Number.isInteger(defaultValue) ? 0.1 : 1
}

function numbersClose(left: number, right: number, tolerance: number = 0.01): boolean {
  return Math.abs(left - right) <= tolerance
}

function normalizeLineOverride(value: unknown): UpgradeSearchLineConstraint | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const lineId = typeof record.line_id === 'string' ? record.line_id.trim() : ''
  const targetKey = normalizeTargetKey(record.target_key)
  const numericValue =
    record.value == null ? null : (normalizePositiveNumber(record.value, 2) ?? null)

  if (!lineId || !targetKey) return null

  return {
    line_id: lineId,
    target_key: targetKey,
    enabled: record.enabled !== false,
    value: numericValue,
  }
}

function normalizeTargetOverrides(
  value: unknown,
): Partial<Record<RareSearchTargetKey, number>> | undefined {
  const record = asRecord(value)
  const entries = TARGET_KEY_ORDER.flatMap((key) => {
    const normalizedValue = normalizePositiveNumber(record[key], 2)
    return normalizedValue != null && normalizedValue > 0 ? ([[key, normalizedValue]] as const) : []
  })

  if (!entries.length) return undefined
  return Object.fromEntries(entries)
}

export function normalizeSearchConstraintSlot(slot: string | null | undefined): string | null {
  const normalized = String(slot ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
  if (!normalized) return null

  if (normalized === 'weapon' || normalized === 'weapon 1') return 'Weapon 1'
  if (normalized === 'weapon 2' || normalized === 'offhand') return 'Weapon 2'
  if (normalized === 'bodyarmour' || normalized === 'body armour' || normalized === 'chest')
    return 'Body Armour'
  if (normalized === 'helmet' || normalized === 'helm') return 'Helmet'
  if (normalized === 'gloves') return 'Gloves'
  if (normalized === 'boots') return 'Boots'
  if (normalized === 'ring' || normalized === 'ring 1') return 'Ring 1'
  if (normalized === 'ring 2') return 'Ring 2'
  if (normalized === 'amulet') return 'Amulet'
  if (normalized === 'belt') return 'Belt'
  return normalized
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function normalizeRawText(rawText: string, ignoreCraftedMods: boolean): string {
  const sections: string[][] = []
  let currentSection: string[] = []
  let implicitLinesRemaining = 0
  let implicitHeaderIndex: number | null = null
  let retainedImplicitLineCount = 0

  const finalizeImplicitHeader = () => {
    if (implicitHeaderIndex === null) return

    if (retainedImplicitLineCount > 0) {
      currentSection[implicitHeaderIndex] = `Implicits: ${retainedImplicitLineCount}`
    } else {
      currentSection.splice(implicitHeaderIndex, 1)
    }

    implicitLinesRemaining = 0
    implicitHeaderIndex = null
    retainedImplicitLineCount = 0
  }

  for (const rawLine of rawText.split(/\r?\n/)) {
    const trimmed = rawLine.trim()
    if (!trimmed) continue

    if (trimmed === '--------') {
      finalizeImplicitHeader()
      if (currentSection.length > 0) {
        sections.push(currentSection)
        currentSection = []
      }
      continue
    }

    let normalizedLine = trimmed.replace(/\{fractured\}/gi, ' ').replace(/\s+/g, ' ').trim()
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

    const implicitMatch = normalizedLine.match(/^Implicits:\s*(\d+)/i)
    if (implicitMatch) {
      finalizeImplicitHeader()
      implicitHeaderIndex = currentSection.length
      retainedImplicitLineCount = 0
      implicitLinesRemaining = Number(implicitMatch[1] ?? 0)
      currentSection.push(normalizedLine)
      continue
    }

    const countsTowardsImplicitBlock =
      implicitLinesRemaining > 0 &&
      !(normalizedLine.startsWith('{') && normalizedLine.endsWith('}'))

    if (ignoreCraftedMods && normalizedLine.includes('{crafted}')) {
      if (countsTowardsImplicitBlock) {
        implicitLinesRemaining -= 1
        if (implicitLinesRemaining === 0) {
          finalizeImplicitHeader()
        }
      }
      continue
    }

    currentSection.push(normalizedLine)

    if (countsTowardsImplicitBlock) {
      implicitLinesRemaining -= 1
      retainedImplicitLineCount += 1

      if (implicitLinesRemaining === 0) {
        finalizeImplicitHeader()
      }
    }
  }

  finalizeImplicitHeader()

  if (currentSection.length > 0) {
    sections.push(currentSection)
  }

  return sections.map((section) => section.join('\n')).join('\n--------\n')
}

function extractRareSearchTargetValues(
  rawText: string | null | undefined,
  options?: { ignoreCraftedMods?: boolean },
): Record<RareSearchTargetKey, number> {
  const text = normalizeRawText(String(rawText ?? ''), options?.ignoreCraftedMods === true)
  const targets: Record<RareSearchTargetKey, number> = {
    life: 0,
    elementalRes: 0,
    chaosRes: 0,
    strength: 0,
    dexterity: 0,
    intelligence: 0,
    allAttributes: 0,
    movementSpeed: 0,
    attackSpeed: 0,
    critChance: 0,
    critMulti: 0,
    pdps: 0,
    edps: 0,
    weaponDps: 0,
    custom: 0,
  }

  for (const line of text.split(/\r?\n/)) {
    const normalized = line.trim()
    if (!normalized) continue

    const lifeMatch = normalized.match(/\+(\d+) to maximum Life/i)
    if (lifeMatch) targets.life += Number(lifeMatch[1])

    const fireResMatch = normalized.match(/\+(\d+)% to Fire Resistance/i)
    if (fireResMatch) targets.elementalRes += Number(fireResMatch[1])
    const coldResMatch = normalized.match(/\+(\d+)% to Cold Resistance/i)
    if (coldResMatch) targets.elementalRes += Number(coldResMatch[1])
    const lightningResMatch = normalized.match(/\+(\d+)% to Lightning Resistance/i)
    if (lightningResMatch) targets.elementalRes += Number(lightningResMatch[1])
    const allEleMatch = normalized.match(/\+(\d+)% to all Elemental Resistances/i)
    if (allEleMatch) targets.elementalRes += Number(allEleMatch[1]) * 3

    const chaosMatch = normalized.match(/\+(\d+)% to Chaos Resistance/i)
    if (chaosMatch) targets.chaosRes += Number(chaosMatch[1])

    const strengthMatch = normalized.match(/\+(\d+) to Strength/i)
    if (strengthMatch) targets.strength += Number(strengthMatch[1])
    const dexterityMatch = normalized.match(/\+(\d+) to Dexterity/i)
    if (dexterityMatch) targets.dexterity += Number(dexterityMatch[1])
    const intelligenceMatch = normalized.match(/\+(\d+) to Intelligence/i)
    if (intelligenceMatch) targets.intelligence += Number(intelligenceMatch[1])
    const allAttributesMatch = normalized.match(/\+(\d+) to all Attributes/i)
    if (allAttributesMatch) targets.allAttributes += Number(allAttributesMatch[1])

    const moveSpeedMatch = normalized.match(/(\d+)% increased Movement Speed/i)
    if (moveSpeedMatch) {
      targets.movementSpeed = Math.max(targets.movementSpeed, Number(moveSpeedMatch[1]))
    }

    const attackSpeedMatch = normalized.match(/(\d+)% increased Attack Speed/i)
    if (attackSpeedMatch) {
      targets.attackSpeed = Math.max(targets.attackSpeed, Number(attackSpeedMatch[1]))
    }

    const critChanceMatch = normalized.match(/\+(\d+)% to Global Critical Strike Chance/i)
    if (critChanceMatch) {
      targets.critChance = Math.max(targets.critChance, Number(critChanceMatch[1]))
    }

    const critMultiMatch = normalized.match(/\+(\d+)% to Global Critical Strike Multiplier/i)
    if (critMultiMatch) {
      targets.critMulti = Math.max(targets.critMulti, Number(critMultiMatch[1]))
    }
  }

  const physicalDamageMatch = text.match(/Physical Damage:\s*(\d+)-(\d+)/i)
  const elementalDamageLine = text.match(/Elemental Damage:\s*([^\r\n]+)/i)?.[1] ?? null
  const apsMatch = text.match(/Attacks per Second:\s*([\d.]+)/i)
  let edps = 0

  if (physicalDamageMatch && apsMatch) {
    const minimumDamage = Number(physicalDamageMatch[1])
    const maximumDamage = Number(physicalDamageMatch[2])
    const attacksPerSecond = Number(apsMatch[1])
    if (
      Number.isFinite(minimumDamage) &&
      Number.isFinite(maximumDamage) &&
      Number.isFinite(attacksPerSecond) &&
      attacksPerSecond > 0
    ) {
      targets.pdps = roundNumber(((minimumDamage + maximumDamage) / 2) * attacksPerSecond, 2)
    }
  }

  if (elementalDamageLine && apsMatch) {
    const attacksPerSecond = Number(apsMatch[1])
    if (Number.isFinite(attacksPerSecond) && attacksPerSecond > 0) {
      const ranges = [...elementalDamageLine.matchAll(/(\d+)-(\d+)/g)]
      for (const range of ranges) {
        const minimumDamage = Number(range[1])
        const maximumDamage = Number(range[2])
        if (Number.isFinite(minimumDamage) && Number.isFinite(maximumDamage)) {
          edps += ((minimumDamage + maximumDamage) / 2) * attacksPerSecond
        }
      }
    }
  }

  targets.edps = roundNumber(edps, 2)
  targets.weaponDps = roundNumber(targets.pdps + targets.edps, 2)
  return targets
}

export function extractRareSearchTargetKeys(
  rawText: string | null | undefined,
  options?: { ignoreCraftedMods?: boolean },
): RareSearchTargetKey[] {
  const found = extractRareSearchTargetValues(rawText, options)
  return TARGET_KEY_ORDER.filter((key) => (found[key] ?? 0) > 0)
}

export function normalizeUpgradeSearchConstraints(
  value: UpgradeSearchConstraints | Record<string, unknown> | null | undefined,
): UpgradeSearchConstraints {
  const record = asRecord(value)
  const rawSlotOverrides = asRecord(record.slot_overrides)
  const normalizedSlotOverrides = Object.fromEntries(
    Object.entries(rawSlotOverrides)
      .map(([slot, slotValue]) => {
        const normalizedSlot = normalizeSearchConstraintSlot(slot)
        const slotRecord = asRecord(slotValue)
        const disabledKeys = Array.from(
          new Set(
            asArray(slotRecord.disabled_target_keys)
              .map(normalizeTargetKey)
              .filter((entry): entry is RareSearchTargetKey => !!entry),
          ),
        ).sort((left, right) => TARGET_KEY_ORDER.indexOf(left) - TARGET_KEY_ORDER.indexOf(right))
        const targetOverrides = normalizeTargetOverrides(slotRecord.target_overrides)
        const lineOverrides = Array.from(
          new Map(
            asArray(slotRecord.line_overrides)
              .map(normalizeLineOverride)
              .filter((entry): entry is UpgradeSearchLineConstraint => !!entry)
              .map((entry) => [entry.line_id, entry] as const),
          ).values(),
        ).sort((left, right) => left.line_id.localeCompare(right.line_id))

        if (
          !normalizedSlot ||
          (disabledKeys.length === 0 && !targetOverrides && lineOverrides.length === 0)
        ) {
          return null
        }

        const normalizedOverride: UpgradeSearchSlotConstraint = {
          disabled_target_keys: disabledKeys,
        }
        if (targetOverrides && Object.keys(targetOverrides).length > 0) {
          normalizedOverride.target_overrides = targetOverrides
        }
        if (lineOverrides.length > 0) {
          normalizedOverride.line_overrides = lineOverrides
        }

        return [normalizedSlot, normalizedOverride] as const
      })
      .filter((entry): entry is readonly [string, UpgradeSearchSlotConstraint] => !!entry)
      .sort(([left], [right]) => left.localeCompare(right)),
  )

  const percentileFloorValue = Number(record.property_percentile_floor)
  const propertyPercentileFloor = Number.isFinite(percentileFloorValue)
    ? Math.min(90, Math.max(0, Math.round(percentileFloorValue)))
    : 20

  return {
    ignore_crafted_mods: record.ignore_crafted_mods !== false,
    ignore_enchants: record.ignore_enchants !== false,
    ignore_quality: record.ignore_quality !== false,
    ignore_corrupted_implicits: record.ignore_corrupted_implicits !== false,
    property_percentile_floor: propertyPercentileFloor,
    slot_overrides: normalizedSlotOverrides,
  }
}

export function formatRareSearchTargetValue(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '0'
  if (numbersClose(value, Math.round(value), 0.001)) {
    return Math.round(value).toLocaleString()
  }
  if (Math.abs(value) >= 100) {
    return roundNumber(value, 1).toLocaleString(undefined, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })
  }
  return roundNumber(value, 2).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

export function summarizeUpgradeSearchConstraints(
  constraints: UpgradeSearchConstraints | Record<string, unknown> | null | undefined,
): string[] {
  const normalized = normalizeUpgradeSearchConstraints(constraints)
  const chips: string[] = []

  if (normalized.ignore_crafted_mods) {
    chips.push('Ignore crafted mods')
  }
  if (normalized.ignore_enchants) {
    chips.push('Ignore enchants')
  }
  if (normalized.ignore_quality) {
    chips.push('Ignore quality')
  }
  if (normalized.ignore_corrupted_implicits) {
    chips.push('Ignore corrupted implicits')
  }
  if (normalized.property_percentile_floor > 0) {
    chips.push(`${normalized.property_percentile_floor}% relaxation`)
  }

  for (const [slot, override] of Object.entries(normalized.slot_overrides)) {
    if (override.disabled_target_keys.length > 0) {
      const labels = override.disabled_target_keys
        .map((key) => RARE_SEARCH_TARGET_LABELS[key] ?? key)
        .join(', ')
      chips.push(`${slot}: no ${labels}`)
    }

    const targetOverrides = Object.entries(override.target_overrides ?? {})
      .map(([key, value]) => {
        const normalizedKey = normalizeTargetKey(key)
        return normalizedKey && typeof value === 'number'
          ? `${RARE_SEARCH_TARGET_LABELS[normalizedKey] ?? normalizedKey} ${formatRareSearchTargetValue(value)}`
          : null
      })
      .filter((entry): entry is string => !!entry)
    if (targetOverrides.length > 0) {
      chips.push(`${slot}: ${targetOverrides.join(', ')}`)
    } else if ((override.line_overrides?.length ?? 0) > 0) {
      chips.push(
        `${slot}: ${override.line_overrides?.length ?? 0} custom line${override.line_overrides?.length === 1 ? '' : 's'}`,
      )
    }
  }

  return chips
}

export function getSelectedItemSet(
  metadata: PobImportMetadata | null | undefined,
  itemSetId: string | null | undefined,
): { id: string; title: string | null; items: PobLayoutItemSummary[] } | null {
  if (!metadata || !itemSetId) return null
  const itemSet = metadata.item_sets.find((entry) => entry.id === itemSetId)
  if (!itemSet) return null
  return {
    id: itemSet.id,
    title: itemSet.title,
    items: itemSet.items,
  }
}

function getTooltipSections(rawText: string | null | undefined): string[][] {
  if (!rawText) return []

  const sections: string[][] = []
  let current: string[] = []

  for (const line of rawText.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed === '--------') {
      if (current.length > 0) {
        sections.push(current)
        current = []
      }
      continue
    }
    current.push(trimmed)
  }

  if (current.length > 0) {
    sections.push(current)
  }

  return sections
}

function getItemPreview(item: PobLayoutItemSummary): {
  title: string
  subtitle: string | null
  rarity: string
  bodyLines: string[]
} {
  const lines =
    item.rawText
      ?.split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean) ?? []
  const rarityIndex = lines.findIndex((line) => line.startsWith('Rarity:'))
  const rarity =
    (rarityIndex >= 0 ? lines[rarityIndex]?.replace('Rarity:', '').trim() : null) ??
    item.rarity ??
    'Item'
  const title =
    (rarityIndex >= 0 ? lines[rarityIndex + 1] : null) ?? item.name ?? item.typeLine ?? 'Rare item'
  const subtitle =
    (rarityIndex >= 0 ? lines[rarityIndex + 2] : null) ??
    (item.typeLine && item.typeLine !== title ? item.typeLine : null)
  const bodyLines = rarityIndex >= 0 ? lines.slice(rarityIndex + (subtitle ? 3 : 2)) : lines

  return { title, subtitle, rarity, bodyLines }
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

function getFooterLineClassName(line: string): string | null {
  if (line === 'Corrupted') return 'text-[#d14b4b]'
  if (line.includes('Synthesised')) return 'text-[#8ee8ff]'
  if (line.includes('Fractured')) return 'text-[#a29162]'
  if (line.includes('Veiled')) return 'text-[#c7b7ff]'
  return null
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

function pushModifierLine(sections: ParsedModifierSection[], line: ParsedModifierLine): void {
  if (!line.text.trim()) return
  const lastSection = sections[sections.length - 1]
  if (
    lastSection &&
    lastSection.groupKey === line.groupKey &&
    lastSection.lines.every((entry) => entry.lineClassName === line.lineClassName)
  ) {
    lastSection.lines.push(line)
    return
  }

  sections.push({
    key: `${line.groupKey}-${sections.length}`,
    groupKey: line.groupKey,
    title: null,
    lines: [line],
  })
}

function parseTooltipItem(item: PobLayoutItemSummary): ParsedTooltipItem {
  const preview = getItemPreview(item)
  const sections = getTooltipSections(item.rawText)
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
  let modifierIndex = 0

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
        parsed.footerLines.push({
          text: line,
          className: getFooterLineClassName(line),
        })
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

      pushModifierLine(parsed.modifierSections, {
        id: `modifier-${modifierIndex}`,
        text: cleanedLine,
        groupKey: modifierForLine.key,
        lineClassName: modifierForLine.lineClassName,
      })
      modifierIndex += 1

      if (implicitLinesRemaining > 0) {
        implicitLinesRemaining -= 1
      }
    }

    if (inRequirements && parsed.requirements.length > 0) {
      inRequirements = false
    }
  }

  if (parsed.modifierSections.length === 0) {
    const fallbackLines = preview.bodyLines
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
        groupKey: 'explicit',
        title: null,
        lines: fallbackLines.map((line, index) => ({
          id: `fallback-${index}`,
          text: line,
          groupKey: 'explicit',
          lineClassName: 'text-[#7aa6ff]',
        })),
      })
    }
  }

  parsed.properties = parsed.properties.filter((property) =>
    shouldDisplayTooltipProperty(property.name, parsed.rarity),
  )
  parsed.requirements = parsed.requirements.filter((requirement) =>
    shouldDisplayTooltipRequirement(requirement.name, parsed.rarity),
  )

  return parsed
}

function buildLineTarget(
  lineId: string,
  lineText: string,
  targetKey: RareSearchTargetKey,
  defaultValue: number | null,
  options?: {
    label?: string
    summaryTargetKey?: RareSearchTargetKey | null
    targetMultiplier?: number
    isCrafted?: boolean
    inputSuffix?: string | null
    inputStep?: number
  },
): RareStageSearchLineTarget | null {
  const normalizedDefaultValue =
    typeof defaultValue === 'number' && Number.isFinite(defaultValue) && defaultValue > 0
      ? roundNumber(defaultValue, 2)
      : null
  const summaryTargetKey = options?.summaryTargetKey ?? targetKey
  const targetMultiplier = options?.targetMultiplier ?? 1
  return {
    lineId,
    targetKey,
    summaryTargetKey,
    label: options?.label ?? RARE_SEARCH_TARGET_LABELS[targetKey] ?? lineText,
    defaultValue: normalizedDefaultValue,
    defaultTargetValue:
      normalizedDefaultValue != null && summaryTargetKey
        ? roundNumber(normalizedDefaultValue * targetMultiplier, 2)
        : 0,
    targetMultiplier,
    isCrafted: options?.isCrafted === true,
    inputSuffix: options?.inputSuffix ?? null,
    inputStep: options?.inputStep ?? inferLineInputStep(normalizedDefaultValue),
    supportsValueOverride: normalizedDefaultValue != null,
  }
}

function buildCustomModifierLineTarget(line: ParsedModifierLine): RareStageSearchLineTarget | null {
  const defaultValue = buildGenericLineDefaultValue(extractTradeFilterNumbers(line.text))
  return buildLineTarget(line.id, line.text, 'custom', defaultValue, {
    label: line.text,
    summaryTargetKey: null,
    isCrafted: line.groupKey === 'crafted',
    inputSuffix: inferLineInputSuffix(line.text),
  })
}

function parseModifierLineTarget(line: ParsedModifierLine): RareStageSearchLineTarget | null {
  const isCrafted = line.groupKey === 'crafted'

  const lifeMatch = line.text.match(/\+(\d+) to maximum Life/i)
  if (lifeMatch) {
    return buildLineTarget(line.id, line.text, 'life', Number(lifeMatch[1]), { isCrafted })
  }

  const fireResMatch = line.text.match(/\+(\d+)% to Fire Resistance/i)
  if (fireResMatch) {
    return buildLineTarget(line.id, line.text, 'elementalRes', Number(fireResMatch[1]), {
      isCrafted,
      inputSuffix: '%',
    })
  }

  const coldResMatch = line.text.match(/\+(\d+)% to Cold Resistance/i)
  if (coldResMatch) {
    return buildLineTarget(line.id, line.text, 'elementalRes', Number(coldResMatch[1]), {
      isCrafted,
      inputSuffix: '%',
    })
  }

  const lightningResMatch = line.text.match(/\+(\d+)% to Lightning Resistance/i)
  if (lightningResMatch) {
    return buildLineTarget(line.id, line.text, 'elementalRes', Number(lightningResMatch[1]), {
      isCrafted,
      inputSuffix: '%',
    })
  }

  const allElementalResMatch = line.text.match(/\+(\d+)% to all Elemental Resistances/i)
  if (allElementalResMatch) {
    return buildLineTarget(line.id, line.text, 'elementalRes', Number(allElementalResMatch[1]), {
      isCrafted,
      inputSuffix: '%',
      targetMultiplier: 3,
    })
  }

  const chaosResMatch = line.text.match(/\+(\d+)% to Chaos Resistance/i)
  if (chaosResMatch) {
    return buildLineTarget(line.id, line.text, 'chaosRes', Number(chaosResMatch[1]), {
      isCrafted,
      inputSuffix: '%',
    })
  }

  const strengthMatch = line.text.match(/\+(\d+) to Strength/i)
  if (strengthMatch) {
    return buildLineTarget(line.id, line.text, 'strength', Number(strengthMatch[1]), { isCrafted })
  }

  const dexterityMatch = line.text.match(/\+(\d+) to Dexterity/i)
  if (dexterityMatch) {
    return buildLineTarget(line.id, line.text, 'dexterity', Number(dexterityMatch[1]), {
      isCrafted,
    })
  }

  const intelligenceMatch = line.text.match(/\+(\d+) to Intelligence/i)
  if (intelligenceMatch) {
    return buildLineTarget(line.id, line.text, 'intelligence', Number(intelligenceMatch[1]), {
      isCrafted,
    })
  }

  const allAttributesMatch = line.text.match(/\+(\d+) to all Attributes/i)
  if (allAttributesMatch) {
    return buildLineTarget(line.id, line.text, 'allAttributes', Number(allAttributesMatch[1]), {
      isCrafted,
    })
  }

  const movementSpeedMatch = line.text.match(/(\d+)% increased Movement Speed/i)
  if (movementSpeedMatch) {
    return buildLineTarget(line.id, line.text, 'movementSpeed', Number(movementSpeedMatch[1]), {
      isCrafted,
      inputSuffix: '%',
    })
  }

  const attackSpeedMatch = line.text.match(/(\d+)% increased Attack Speed/i)
  if (attackSpeedMatch) {
    return buildLineTarget(line.id, line.text, 'attackSpeed', Number(attackSpeedMatch[1]), {
      isCrafted,
      inputSuffix: '%',
    })
  }

  const critChanceMatch = line.text.match(/\+(\d+)% to Global Critical Strike Chance/i)
  if (critChanceMatch) {
    return buildLineTarget(line.id, line.text, 'critChance', Number(critChanceMatch[1]), {
      isCrafted,
      inputSuffix: '%',
    })
  }

  const critMultiMatch = line.text.match(/\+(\d+)% to Global Critical Strike Multiplier/i)
  if (critMultiMatch) {
    return buildLineTarget(line.id, line.text, 'critMulti', Number(critMultiMatch[1]), {
      isCrafted,
      inputSuffix: '%',
    })
  }

  return buildCustomModifierLineTarget(line)
}

function buildPropertyLineTarget(
  name: string,
  value: string,
): RareStageSearchLineTarget | null {
  const normalizedName = name.trim().toLowerCase()
  const text = `${name}: ${value}`

  if (normalizedName === 'item level') {
    return buildLineTarget(
      getPropertySearchLineId('Item Level'),
      text,
      'custom',
      parseNumber(value),
      {
        label: name,
        summaryTargetKey: null,
      },
    )
  }

  if (normalizedName === 'quality') {
    return buildLineTarget(getPropertySearchLineId('Quality'), text, 'custom', parseNumber(value), {
      label: name,
      summaryTargetKey: null,
      inputSuffix: '%',
      inputStep: 0.1,
    })
  }

  if (normalizedName === 'armour') {
    return buildLineTarget(getPropertySearchLineId('Armour'), text, 'custom', parseNumber(value), {
      label: name,
      summaryTargetKey: null,
    })
  }

  if (normalizedName === 'evasion' || normalizedName === 'evasion rating') {
    return buildLineTarget(getPropertySearchLineId('Evasion'), text, 'custom', parseNumber(value), {
      label: 'Evasion',
      summaryTargetKey: null,
    })
  }

  if (normalizedName === 'energy shield') {
    return buildLineTarget(
      getPropertySearchLineId('Energy Shield'),
      text,
      'custom',
      parseNumber(value),
      {
        label: name,
        summaryTargetKey: null,
      },
    )
  }

  if (normalizedName === 'ward') {
    return buildLineTarget(getPropertySearchLineId('Ward'), text, 'custom', parseNumber(value), {
      label: name,
      summaryTargetKey: null,
    })
  }

  if (normalizedName === 'chance to block') {
    return buildLineTarget(
      getPropertySearchLineId('Chance to Block'),
      text,
      'custom',
      parseNumber(value),
      {
        label: name,
        summaryTargetKey: null,
        inputSuffix: '%',
        inputStep: 0.1,
      },
    )
  }

  if (normalizedName === 'attacks per second') {
    return buildLineTarget(
      getPropertySearchLineId('Attacks per Second'),
      text,
      'custom',
      parseNumber(value),
      {
        label: name,
        summaryTargetKey: null,
        inputStep: 0.01,
      },
    )
  }

  if (normalizedName === 'critical strike chance') {
    return buildLineTarget(
      getPropertySearchLineId('Critical Strike Chance'),
      text,
      'custom',
      parseNumber(value),
      {
        label: name,
        summaryTargetKey: null,
        inputSuffix: '%',
        inputStep: 0.01,
      },
    )
  }

  return null
}

function createSearchablePropertySection(
  properties: RareStageSearchTooltipProperty[],
): {
  remainingProperties: RareStageSearchTooltipProperty[]
  section: RareStageSearchSection | null
} {
  const remainingProperties: RareStageSearchTooltipProperty[] = []
  const lines: RareStageSearchDisplayLine[] = []

  for (const property of properties) {
    const propertyText = `${property.name}: ${property.values.join(', ')}`
    const target = buildPropertyLineTarget(property.name, property.values[0] ?? '')
    if (!target) {
      remainingProperties.push(property)
      continue
    }

    lines.push({
      id: target.lineId,
      text: propertyText,
      lineClassName: 'text-[#d7d7d7]',
      target,
    })
  }

  return {
    remainingProperties,
    section:
      lines.length > 0
        ? {
            key: 'searchable-properties',
            title: 'Item properties',
            lines,
          }
        : null,
  }
}

function createDerivedWeaponSection(item: PobLayoutItemSummary): RareStageSearchSection | null {
  const derivedTargets = extractRareSearchTargetValues(item.rawText)
  const lines: RareStageSearchDisplayLine[] = []

  if ((derivedTargets.pdps ?? 0) > 0) {
    lines.push({
      id: 'derived-pdps',
      text: 'Physical DPS target',
      lineClassName: 'text-[#8ee8ff]',
      target: buildLineTarget('derived-pdps', 'Physical DPS target', 'pdps', derivedTargets.pdps, {
        inputStep: 0.1,
      }),
    })
  }

  if ((derivedTargets.edps ?? 0) > 0) {
    lines.push({
      id: 'derived-edps',
      text: 'Elemental DPS target',
      lineClassName: 'text-[#8ee8ff]',
      target: buildLineTarget('derived-edps', 'Elemental DPS target', 'edps', derivedTargets.edps, {
        inputStep: 0.1,
      }),
    })
  }

  if ((derivedTargets.weaponDps ?? 0) > 0) {
    lines.push({
      id: 'derived-weapon-dps',
      text: 'Weapon DPS target',
      lineClassName: 'text-[#8ee8ff]',
      target: buildLineTarget(
        'derived-weapon-dps',
        'Weapon DPS target',
        'weaponDps',
        derivedTargets.weaponDps,
        { inputStep: 0.1 },
      ),
    })
  }

  return lines.length > 0
    ? {
        key: 'derived-search-targets',
        title: 'Derived search targets',
        lines,
      }
    : null
}

function getDefaultTargetValuesForOption(
  option: Pick<RareStageSearchOption, 'sections'>,
): Partial<Record<RareSearchTargetKey, number>> {
  const totals: Partial<Record<RareSearchTargetKey, number>> = {}
  for (const section of option.sections) {
    for (const line of section.lines) {
      const targetKey = line.target?.summaryTargetKey
      if (!line.target || !targetKey) continue
      totals[targetKey] = roundNumber(
        (totals[targetKey] ?? 0) + line.target.defaultTargetValue,
        2,
      )
    }
  }
  return Object.fromEntries(
    TARGET_KEY_ORDER.filter((key) => (totals[key] ?? 0) > 0).map((key) => [key, totals[key] ?? 0]),
  )
}

function getEditableLinesForOption(
  option: Pick<RareStageSearchOption, 'sections'>,
): RareStageSearchLineTarget[] {
  return option.sections.flatMap((section) =>
    section.lines.flatMap((line) => (line.target ? [line.target] : [])),
  )
}

function buildRareStageSearchOption(item: PobLayoutItemSummary): RareStageSearchOption | null {
  const slot = normalizeSearchConstraintSlot(item.slot)
  const typeLine = String(item.typeLine ?? '').trim()
  if (!slot || !typeLine || !item.rawText) return null

  const normalizedRawText = normalizeRawText(item.rawText, false)
  if (!normalizedRawText) return null
  const normalizedItem = { ...item, rawText: normalizedRawText }

  const parsed = parseTooltipItem(normalizedItem)
  const searchablePropertySection = createSearchablePropertySection(parsed.properties)
  const sections: RareStageSearchSection[] = parsed.modifierSections.map((section) => ({
    key: section.key,
    title: section.title,
    lines: section.lines.map((line) => ({
      id: line.id,
      text: line.text,
      lineClassName: line.lineClassName,
      target: parseModifierLineTarget(line),
    })),
  }))

  if (searchablePropertySection.section) {
    sections.unshift(searchablePropertySection.section)
  }

  const derivedWeaponSection = createDerivedWeaponSection(normalizedItem)
  if (derivedWeaponSection) {
    sections.push(derivedWeaponSection)
  }

  const option: RareStageSearchOption = {
    slot,
    typeLine,
    title: parsed.title,
    subtitle: parsed.baseLine,
    rarity: parsed.rarity,
    properties: searchablePropertySection.remainingProperties,
    requirements: parsed.requirements,
    sections,
    footerLines: parsed.footerLines,
    targetKeys: [],
    defaultTargetValues: {},
  }

  const defaultTargetValues = getDefaultTargetValuesForOption(option)
  option.defaultTargetValues = defaultTargetValues
  option.targetKeys = TARGET_KEY_ORDER.filter(
    (key) => key !== 'custom' && (defaultTargetValues[key] ?? 0) > 0,
  )
  return option
}

export function getRareStageSearchOptions(
  metadata: PobImportMetadata | null | undefined,
  itemSetId: string | null | undefined,
): RareStageSearchOption[] {
  const itemSet = getSelectedItemSet(metadata, itemSetId)
  if (!itemSet) return []

  const seen = new Set<string>()
  const stageOptions: RareStageSearchOption[] = []

  for (const item of itemSet.items) {
    if (
      String(item.rarity ?? '')
        .trim()
        .toLowerCase() !== 'rare'
    ) {
      continue
    }

    const option = buildRareStageSearchOption(item)
    if (!option) continue

    const dedupeKey = `${option.slot}::${option.typeLine}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    stageOptions.push(option)
  }

  return stageOptions
}

function resolveSlotTargetLines(
  option: RareStageSearchOption,
  slotOverride: UpgradeSearchSlotConstraint | undefined,
  ignoreCraftedMods: boolean,
): Map<string, ResolvedRareStageSearchLineTarget> {
  const editableLines = getEditableLinesForOption(option)
  const editableLinesById = new Map(editableLines.map((line) => [line.lineId, line] as const))
  const explicitLineOverrides = new Map(
    (slotOverride?.line_overrides ?? [])
      .filter((entry) => editableLinesById.has(entry.line_id))
      .map((entry) => [entry.line_id, entry] as const),
  )
  const targetKeysWithExplicitLineOverrides = new Set(
    Array.from(explicitLineOverrides.values()).map((entry) => entry.target_key),
  )
  const coarseDisabledTargetKeys = new Set(
    (slotOverride?.disabled_target_keys ?? []).filter(
      (key) => !targetKeysWithExplicitLineOverrides.has(key),
    ),
  )
  const coarseTargetOverrides = Object.fromEntries(
    Object.entries(slotOverride?.target_overrides ?? {}).filter(([key]) => {
      const normalizedKey = normalizeTargetKey(key)
      return normalizedKey ? !targetKeysWithExplicitLineOverrides.has(normalizedKey) : false
    }),
  ) as Partial<Record<RareSearchTargetKey, number>>

  const defaultActiveTotalsByTarget: Partial<Record<RareSearchTargetKey, number>> = {}
  for (const editableLine of editableLines) {
    if (ignoreCraftedMods && editableLine.isCrafted) continue
    if (!editableLine.summaryTargetKey) continue
    defaultActiveTotalsByTarget[editableLine.summaryTargetKey] = roundNumber(
      (defaultActiveTotalsByTarget[editableLine.summaryTargetKey] ?? 0) +
        editableLine.defaultTargetValue,
      2,
    )
  }

  const scaleByTarget: Partial<Record<RareSearchTargetKey, number>> = {}
  for (const targetKey of option.targetKeys) {
    const defaultActiveValue = defaultActiveTotalsByTarget[targetKey] ?? 0
    const overrideValue = coarseTargetOverrides[targetKey]
    if (
      typeof overrideValue === 'number' &&
      Number.isFinite(overrideValue) &&
      overrideValue > 0 &&
      defaultActiveValue > 0
    ) {
      scaleByTarget[targetKey] = overrideValue / defaultActiveValue
    }
  }

  const resolved = new Map<string, ResolvedRareStageSearchLineTarget>()
  for (const editableLine of editableLines) {
    const explicitOverride = explicitLineOverrides.get(editableLine.lineId)
    const ignoredByCraftFilter = ignoreCraftedMods && editableLine.isCrafted
    let enabled = !ignoredByCraftFilter
    let value = editableLine.defaultValue

    if (explicitOverride) {
      enabled = explicitOverride.enabled !== false
      if (
        editableLine.supportsValueOverride &&
        typeof explicitOverride.value === 'number' &&
        Number.isFinite(explicitOverride.value)
      ) {
        value = Math.max(0, roundNumber(explicitOverride.value, 2))
      }
    } else if (!ignoredByCraftFilter && editableLine.summaryTargetKey) {
      if (coarseDisabledTargetKeys.has(editableLine.summaryTargetKey)) {
        enabled = false
      }

      const scale = scaleByTarget[editableLine.summaryTargetKey]
      if (
        editableLine.defaultValue != null &&
        typeof scale === 'number' &&
        Number.isFinite(scale) &&
        scale >= 0
      ) {
        value = roundNumber(editableLine.defaultValue * scale, 2)
      }
    }

    if (ignoredByCraftFilter) {
      enabled = false
    }

    resolved.set(editableLine.lineId, {
      ...editableLine,
      enabled,
      value,
      targetValue:
        enabled &&
        !ignoredByCraftFilter &&
        editableLine.summaryTargetKey &&
        value != null &&
        editableLine.defaultValue != null
          ? roundNumber(value * editableLine.targetMultiplier, 2)
          : 0,
      ignoredByCraftFilter,
    })
  }

  return resolved
}

function buildResolvedOption(
  option: RareStageSearchOption,
  normalizedConstraints: UpgradeSearchConstraints,
): ResolvedRareStageSearchOption {
  const slotOverride = normalizedConstraints.slot_overrides[option.slot]
  const resolvedTargets = resolveSlotTargetLines(
    option,
    slotOverride,
    normalizedConstraints.ignore_crafted_mods,
  )

  const defaultActiveTargetValues: Partial<Record<RareSearchTargetKey, number>> = {}
  const effectiveTargetValues: Partial<Record<RareSearchTargetKey, number>> = {}
  const contributingLineCounts: Partial<Record<RareSearchTargetKey, number>> = {}

  for (const targetKey of option.targetKeys) {
    const lineStates = Array.from(resolvedTargets.values()).filter(
      (line) => line.summaryTargetKey === targetKey,
    )
    const defaultActiveValue = roundNumber(
      lineStates.reduce(
        (total, line) => total + (line.ignoredByCraftFilter ? 0 : line.defaultTargetValue),
        0,
      ),
      2,
    )
    const effectiveValue = roundNumber(
      lineStates.reduce((total, line) => total + line.targetValue, 0),
      2,
    )
    const contributingLineCount = lineStates.filter(
      (line) => !line.ignoredByCraftFilter,
    ).length
    if (defaultActiveValue > 0) {
      defaultActiveTargetValues[targetKey] = defaultActiveValue
    }
    if (effectiveValue > 0) {
      effectiveTargetValues[targetKey] = effectiveValue
    }
    if (contributingLineCount > 0) {
      contributingLineCounts[targetKey] = contributingLineCount
    }
  }

  const disabledTargetKeys = option.targetKeys.filter((targetKey) => {
    const defaultActiveValue = defaultActiveTargetValues[targetKey] ?? 0
    if (defaultActiveValue <= 0) return false
    return (effectiveTargetValues[targetKey] ?? 0) <= 0
  })

  const targetOverrideValues = Object.fromEntries(
    option.targetKeys.flatMap((targetKey) => {
      const defaultActiveValue = defaultActiveTargetValues[targetKey] ?? 0
      const effectiveValue = effectiveTargetValues[targetKey] ?? 0
      if (
        defaultActiveValue <= 0 ||
        effectiveValue <= 0 ||
        numbersClose(defaultActiveValue, effectiveValue)
      ) {
        return []
      }
      return [[targetKey, effectiveValue]] as const
    }),
  ) as Partial<Record<RareSearchTargetKey, number>>

  return {
    ...option,
    sections: option.sections.map((section) => ({
      ...section,
      lines: section.lines.map((line) => ({
        ...line,
        target: line.target ? (resolvedTargets.get(line.target.lineId) ?? null) : null,
      })),
    })),
    defaultActiveTargetValues,
    effectiveTargetValues,
    disabledTargetKeys,
    targetOverrideValues,
    contributingLineCounts,
  }
}

export function resolveRareStageSearchOptions(
  options: RareStageSearchOption[],
  constraints: UpgradeSearchConstraints | Record<string, unknown> | null | undefined,
): ResolvedRareStageSearchOption[] {
  const normalized = normalizeUpgradeSearchConstraints(constraints)
  return options.map((option) => buildResolvedOption(option, normalized))
}

export function deriveNormalizedUpgradeSearchConstraints(
  options: RareStageSearchOption[],
  constraints: UpgradeSearchConstraints | Record<string, unknown> | null | undefined,
): UpgradeSearchConstraints {
  const normalized = normalizeUpgradeSearchConstraints(constraints)
  const resolvedOptions = resolveRareStageSearchOptions(options, normalized)
  const slotOverrides = Object.fromEntries(
    resolvedOptions
      .map((option) => {
        const currentSlotOverride = normalized.slot_overrides[option.slot]
        const editableLinesById = new Map(
          getEditableLinesForOption(option).map((line) => [line.lineId, line] as const),
        )
        const canonicalLineOverrides = (currentSlotOverride?.line_overrides ?? [])
          .filter((entry) => editableLinesById.has(entry.line_id))
          .map((entry) => {
            const editableLine = editableLinesById.get(entry.line_id)
            if (!editableLine) return null
            const normalizedValue =
              entry.value == null ? null : Math.max(0, roundNumber(entry.value, 2))
            const differsFromDefault =
              entry.enabled === false ||
              (editableLine.supportsValueOverride &&
                normalizedValue != null &&
                editableLine.defaultValue != null &&
                !numbersClose(normalizedValue, editableLine.defaultValue))

            if (!differsFromDefault) {
              return null
            }

            return {
              line_id: entry.line_id,
              target_key: editableLine.targetKey,
              enabled: entry.enabled !== false,
              value: normalizedValue,
            } satisfies UpgradeSearchLineConstraint
          })
          .filter((entry): entry is UpgradeSearchLineConstraint => !!entry)
          .sort((left, right) => left.line_id.localeCompare(right.line_id))

        const slotOverride: UpgradeSearchSlotConstraint = {
          disabled_target_keys: option.disabledTargetKeys,
        }

        if (Object.keys(option.targetOverrideValues).length > 0) {
          slotOverride.target_overrides = option.targetOverrideValues
        }

        if (canonicalLineOverrides.length > 0) {
          slotOverride.line_overrides = canonicalLineOverrides
        }

        if (
          slotOverride.disabled_target_keys.length === 0 &&
          !slotOverride.target_overrides &&
          !slotOverride.line_overrides
        ) {
          return null
        }

        return [option.slot, slotOverride] as const
      })
      .filter((entry): entry is readonly [string, UpgradeSearchSlotConstraint] => !!entry),
  )

  return normalizeUpgradeSearchConstraints({
    ignore_crafted_mods: normalized.ignore_crafted_mods,
    ignore_enchants: normalized.ignore_enchants,
    ignore_quality: normalized.ignore_quality,
    ignore_corrupted_implicits: normalized.ignore_corrupted_implicits,
    property_percentile_floor: normalized.property_percentile_floor,
    slot_overrides: slotOverrides,
  })
}
