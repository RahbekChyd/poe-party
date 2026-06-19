
export type ModifierSectionKey =
  | 'enchant'
  | 'implicit'
  | 'fractured'
  | 'crafted'
  | 'veiled'
  | 'explicit'

type ModifierSectionMeta = {
  key: ModifierSectionKey
  lineClassName: string
}

const RARE_TOOLTIP_PROPERTY_NAMES = new Set([
  'quality',
  'sockets',
  'armour',
  'evasion',
  'evasion rating',
  'energy shield',
  'ward',
  'physical damage',
  'elemental damage',
  'chaos damage',
  'critical strike chance',
  'attacks per second',
  'chance to block',
  'spirit',
])

const RARE_TOOLTIP_REQUIREMENT_NAMES = new Set(['requires level', 'str', 'dex', 'int'])

function normalizeMarker(marker: string): string {
  return marker.toLowerCase().replace(/[{}]/g, ' ').trim()
}

function normalizeTooltipFieldName(name: string): string {
  return name.trim().toLowerCase()
}

function getExactMarkerKey(marker: string): ModifierSectionKey | null {
  const normalized = normalizeMarker(marker)
  if (normalized === 'enchant' || normalized === 'enchanted') return 'enchant'
  if (normalized === 'implicit') return 'implicit'
  if (normalized === 'fractured') return 'fractured'
  if (normalized === 'crafted') return 'crafted'
  if (normalized === 'veiled') return 'veiled'
  return null
}

function stripLeadingModifierBlocks(line: string): {
  markers: string[]
  line: string
} {
  let nextLine = line.trim()
  const markers: string[] = []

  while (nextLine.startsWith('{')) {
    const match = nextLine.match(/^\{([^}]*)\}(.*)$/)
    if (!match) break

    markers.push(match[1]?.trim() ?? '')
    nextLine = match[2]?.trimStart() ?? ''
  }

  return { markers, line: nextLine }
}

export function getModifierSectionMeta(marker: string): ModifierSectionMeta {
  const exactKey = getExactMarkerKey(marker)
  if (exactKey === 'enchant') {
    return { key: 'enchant', lineClassName: 'text-[#8ee8ff]' }
  }
  if (exactKey === 'implicit') {
    return { key: 'implicit', lineClassName: 'text-[#7aa6ff]' }
  }
  if (exactKey === 'fractured') {
    return { key: 'fractured', lineClassName: 'text-[#a29162]' }
  }
  if (exactKey === 'crafted') {
    return { key: 'crafted', lineClassName: 'text-[#8fe6d7]' }
  }
  if (exactKey === 'veiled') {
    return { key: 'veiled', lineClassName: 'italic text-[#c7b7ff]' }
  }
  return { key: 'explicit', lineClassName: 'text-[#7aa6ff]' }
}

export function stripTrailingModifierSuffixes(line: string): {
  key: ModifierSectionKey | null
  line: string
} {
  let nextLine = line.trim()
  let detectedKey: ModifierSectionKey | null = null

  while (true) {
    const suffixMatch = nextLine.match(
      /^(.*?)\s+\((implicit|crafted|fractured|veiled|enchant(?:ed)?)\)\s*$/i,
    )
    if (!suffixMatch?.[1] || !suffixMatch[2]) {
      break
    }

    detectedKey ??= getModifierSectionMeta(suffixMatch[2]).key
    nextLine = suffixMatch[1].trim()
  }

  return { key: detectedKey, line: nextLine }
}

export function stripInlineModifierMarker(line: string): {
  key: ModifierSectionKey | null
  lineClassName: string | null
  line: string
} {
  const strippedPrefix = stripLeadingModifierBlocks(line)
  const prefixKey =
    strippedPrefix.markers.map(getExactMarkerKey).find((key): key is ModifierSectionKey => !!key) ??
    null
  const strippedSuffix = stripTrailingModifierSuffixes(strippedPrefix.line)
  const resolvedKey = prefixKey ?? strippedSuffix.key

  return {
    key: resolvedKey,
    lineClassName: resolvedKey
      ? getModifierSectionMeta(resolvedKey).lineClassName
      : null,
    line: strippedSuffix.line,
  }
}

export function shouldDisplayTooltipProperty(name: string, rarity?: string | null): boolean {
  if (rarity?.trim().toLowerCase() !== 'rare') {
    return true
  }

  return RARE_TOOLTIP_PROPERTY_NAMES.has(normalizeTooltipFieldName(name))
}

export function shouldDisplayTooltipRequirement(name: string, rarity?: string | null): boolean {
  if (rarity?.trim().toLowerCase() !== 'rare') {
    return true
  }

  return RARE_TOOLTIP_REQUIREMENT_NAMES.has(normalizeTooltipFieldName(name))
}
