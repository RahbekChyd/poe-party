const FRAME_TYPE_TO_RARITY = {
  0: 'Normal',
  1: 'Magic',
  2: 'Rare',
  3: 'Unique',
  4: 'Gem',
  5: 'Currency',
  6: 'Divination Card',
  8: 'Quest Item',
  9: 'Prophecy',
  10: 'Relic',
  15: 'Normal',
}

const SOCKET_COLOR_MAP = {
  S: 'R',
  D: 'G',
  I: 'B',
  G: 'W',
  A: 'A',
  R: 'R',
  G2: 'G',
  B: 'B',
  W: 'W',
}

const EQUIPPABLE_CLASS_KEYWORDS = [
  'viscera',
  'amulet',
  'belt',
  'body',
  'armour',
  'armor',
  'boot',
  'glove',
  'helmet',
  'helm',
  'ring',
  'weapon',
  'shield',
  'quiver',
  'flask',
  'jewel',
  'sceptre',
  'wand',
  'sword',
  'axe',
  'mace',
  'staff',
  'bow',
  'claw',
  'dagger',
  'focus',
]

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function normalizeLineArray(value) {
  return asArray(value)
    .flatMap((entry) => (typeof entry === 'string' ? entry : typeof entry?.description === 'string' ? entry.description : '').split(/\r?\n/).map((line) => line.trim()))
    .filter(Boolean)
}

function normalizeAnalysisItemLine(line) {
  let nextLine = String(line ?? '').trim()
  if (!nextLine) return null
  if (nextLine === '--------') return nextLine

  nextLine = nextLine.replace(/\{fractured\}/gi, ' ').replace(/\s+/g, ' ').trim()

  while (/\s+\(fractured\)\s*$/i.test(nextLine)) {
    nextLine = nextLine.replace(/\s+\(fractured\)\s*$/i, '').trim()
  }

  if (!nextLine) return null
  if (/^fractured item$/i.test(nextLine)) return null
  if (/^\{?\s*fractured\s*\}?$/i.test(nextLine)) return null
  return nextLine
}

function normalizeAnalysisLineArray(value) {
  return normalizeLineArray(value)
    .map((entry) => normalizeAnalysisItemLine(entry))
    .filter(Boolean)
}

export function sanitizeAnalysisRawText(rawText) {
  const sections = []
  let currentSection = []

  for (const rawLine of String(rawText ?? '').split(/\r?\n/)) {
    const trimmed = String(rawLine ?? '').trim()
    if (!trimmed) continue

    if (trimmed === '--------') {
      if (currentSection.length > 0) {
        sections.push(currentSection)
        currentSection = []
      }
      continue
    }

    const normalizedLine = normalizeAnalysisItemLine(trimmed)
    if (!normalizedLine || normalizedLine === '--------') {
      continue
    }

    currentSection.push(normalizedLine)
  }

  if (currentSection.length > 0) {
    sections.push(currentSection)
  }

  return sections.map((section) => section.join('\n')).join('\n--------\n')
}

function toRarity({ rarity, frameType }) {
  if (typeof rarity === 'string' && rarity.trim()) return rarity.trim()
  return FRAME_TYPE_TO_RARITY[Number(frameType)] ?? 'Item'
}

function toSocketColor(socket) {
  const raw = String(socket?.color ?? socket?.sColour ?? socket?.attr ?? '').trim()
  if (!raw) return 'A'
  if (raw.length === 1) {
    return SOCKET_COLOR_MAP[raw] ?? raw
  }
  if (raw.toLowerCase() === 'str') return 'R'
  if (raw.toLowerCase() === 'dex') return 'G'
  if (raw.toLowerCase() === 'int') return 'B'
  return raw[0].toUpperCase()
}

function formatSockets(sockets) {
  if (!Array.isArray(sockets) || sockets.length === 0) return null

  const groups = []
  let currentGroup = null

  for (const socket of sockets) {
    const groupId = Number(socket?.group ?? 0)
    const color = toSocketColor(socket)
    if (!currentGroup || currentGroup.groupId !== groupId) {
      currentGroup = { groupId, colors: [color] }
      groups.push(currentGroup)
      continue
    }
    currentGroup.colors.push(color)
  }

  const socketText = groups.map((group) => group.colors.join('-')).join(' ')

  return socketText ? `Sockets: ${socketText}` : null
}

function formatPropertyList(title, properties) {
  const lines = asArray(properties)
    .map((property) => {
      const name = String(property?.name ?? '').trim()
      const values = asArray(property?.values)
        .map((entry) => {
          if (Array.isArray(entry)) return String(entry[0] ?? '').trim()
          return String(entry ?? '').trim()
        })
        .filter(Boolean)

      if (!name) return null
      if (values.length === 0) return name
      return `${name}: ${values.join(', ')}`
    })
    .filter(Boolean)

  if (lines.length === 0) return []
  return title ? [title, ...lines] : lines
}

function collectItemTextLines(item) {
  const sections = []
  const rarity = toRarity(item)
  const name = String(item?.name ?? '').trim()
  const typeLine = String(item?.typeLine ?? item?.type_line ?? '').trim()
  const baseType = String(item?.baseType ?? item?.base_type ?? '').trim()
  const effectiveTypeLine = typeLine || baseType

  sections.push([`Rarity: ${rarity}`])
  if (name && name !== effectiveTypeLine) {
    sections.push([name, effectiveTypeLine || name].filter(Boolean))
  } else if (effectiveTypeLine) {
    sections.push([effectiveTypeLine])
  } else if (name) {
    sections.push([name])
  }

  const propertyLines = formatPropertyList('', item?.properties)
  if (propertyLines.length > 0) {
    sections.push(propertyLines)
  }

  const requirementLines = formatPropertyList('Requirements:', item?.requirements)
  if (requirementLines.length > 0) {
    sections.push(requirementLines)
  }

  const socketsLine = formatSockets(item?.sockets)
  const detailLines = [
    socketsLine,
    Number.isFinite(Number(item?.itemLevel ?? item?.ilvl))
      ? `Item Level: ${Number(item.itemLevel ?? item.ilvl)}`
      : null,
  ].filter(Boolean)
  if (detailLines.length > 0) {
    sections.push(detailLines)
  }

  const modSections = [
    normalizeAnalysisLineArray(item?.implicitMods ?? item?.implicit),
    [
      ...normalizeAnalysisLineArray(item?.explicitMods ?? item?.explicit),
      ...normalizeAnalysisLineArray(item?.fracturedMods ?? item?.fracturedModsList ?? []),
    ],
    normalizeAnalysisLineArray(item?.craftedMods ?? item?.crafted),
    normalizeAnalysisLineArray(item?.enchantMods ?? item?.enchant),
    normalizeAnalysisLineArray(item?.veiledMods ?? item?.veiled),
    normalizeAnalysisLineArray(item?.scourgeMods ?? item?.scourge),
  ]

  for (const modLines of modSections) {
    if (modLines.length > 0) {
      sections.push(modLines)
    }
  }

  const flags = []
  if (item?.corrupted) flags.push('Corrupted')
  if (item?.synthesised) flags.push('Synthesised Item')
  const influences = normalizeLineArray(item?.influences)
  for (const influence of influences) {
    flags.push(`Influenced by ${influence}`)
  }
  if (flags.length > 0) {
    sections.push(flags)
  }

  return sanitizeAnalysisRawText(
    sections
      .filter((section) => section.length > 0)
      .map((section) => section.join('\n'))
      .join('\n--------\n'),
  )
}

function normalizeProfileItem(item) {
  return {
    id: item?.id ?? null,
    slot: item?.slot ?? null,
    name: item?.name ?? '',
    typeLine: item?.typeLine ?? '',
    baseType: item?.baseType ?? null,
    rarity: item?.rarity ?? null,
    frameType: item?.frameType ?? null,
    itemLevel: item?.itemLevel ?? null,
    identified: item?.identified ?? true,
    corrupted: item?.corrupted ?? false,
    fractured: item?.fractured ?? false,
    synthesised: item?.synthesised ?? false,
    influences: item?.influences ?? [],
    sockets: item?.sockets ?? [],
    properties: item?.properties ?? [],
    requirements: item?.requirements ?? [],
    implicitMods: item?.implicitMods ?? [],
    explicitMods: item?.explicitMods ?? [],
    craftedMods: item?.craftedMods ?? [],
    fracturedMods: item?.fracturedMods ?? [],
    enchantMods: item?.enchantMods ?? [],
    veiledMods: item?.veiledMods ?? [],
    note: item?.note ?? null,
  }
}

function normalizeStashItem(item) {
  const raw = asRecord(item?.raw_data)
  const mods = asRecord(item?.mods)
  return {
    id: item?.id ?? null,
    slot: raw.inventoryId ?? null,
    name: item?.name ?? raw.name ?? '',
    typeLine: item?.type_line ?? raw.typeLine ?? '',
    baseType: item?.base_type ?? raw.baseType ?? null,
    rarity: raw.rarity ?? null,
    frameType: item?.frame_type ?? raw.frameType ?? null,
    itemLevel: item?.ilvl ?? raw.itemLevel ?? raw.ilvl ?? null,
    identified: item?.identified ?? raw.identified ?? true,
    corrupted: item?.corrupted ?? raw.corrupted ?? false,
    fractured: item?.fractured ?? raw.fractured ?? false,
    synthesised: item?.synthesised ?? raw.synthesised ?? false,
    influences: Object.entries(asRecord(raw.influences))
      .filter(([, active]) => Boolean(active))
      .map(([name]) => name),
    sockets: item?.sockets ?? raw.sockets ?? [],
    properties: raw.properties ?? [],
    requirements: raw.requirements ?? [],
    implicitMods: mods.implicit ?? raw.implicitMods ?? [],
    explicitMods: mods.explicit ?? raw.explicitMods ?? [],
    craftedMods: mods.crafted ?? raw.craftedMods ?? [],
    fracturedMods: mods.fractured ?? raw.fracturedMods ?? [],
    enchantMods: raw.enchantMods ?? [],
    veiledMods: raw.veiledMods ?? [],
    note: raw.note ?? null,
  }
}

export function toPobTextFromProfileItem(item) {
  return collectItemTextLines(normalizeProfileItem(item))
}

export function toPobTextFromStashItem(item) {
  return collectItemTextLines(normalizeStashItem(item))
}

export function getDisplayName(item) {
  return String(
    item?.name ??
      item?.typeLine ??
      item?.type_line ??
      item?.baseType ??
      item?.base_type ??
      'Unknown item',
  ).trim()
}

export function isLikelyEquippableStashItem(item) {
  const itemClass = String(item?.item_class ?? '').toLowerCase()
  if (EQUIPPABLE_CLASS_KEYWORDS.some((keyword) => itemClass.includes(keyword))) {
    return true
  }

  const name = getDisplayName(item).toLowerCase()
  if (EQUIPPABLE_CLASS_KEYWORDS.some((keyword) => name.includes(keyword))) {
    return true
  }

  return [2, 3, 15].includes(Number(item?.frame_type))
}

export function toStructuredStashMods(item) {
  const raw = asRecord(item?.raw_data)
  const mods = asRecord(item?.mods)
  return {
    implicit: normalizeLineArray(mods.implicit ?? raw.implicitMods),
    explicit: normalizeLineArray(mods.explicit ?? raw.explicitMods),
    crafted: normalizeLineArray(mods.crafted ?? raw.craftedMods),
    fractured: normalizeLineArray(mods.fractured ?? raw.fracturedMods),
    enchant: normalizeLineArray(raw.enchantMods),
    veiled: normalizeLineArray(raw.veiledMods),
  }
}
