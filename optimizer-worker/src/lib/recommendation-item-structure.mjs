import { sanitizeAnalysisRawText } from './pob-item-text.mjs'

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function trim(value) {
  return String(value ?? '').trim()
}

function normalizeLines(lines) {
  return Array.isArray(lines) ? lines.map((entry) => trim(entry)).filter(Boolean) : []
}

const IGNORED_PROPERTY_NAMES = new Set(['crafted', 'prefix', 'suffix', 'catalyst'])

function isIgnoredMetadataLine(line) {
  const normalized = trim(line).toLowerCase()
  return (
    normalized.startsWith('crafted:') ||
    normalized.startsWith('prefix:') ||
    normalized.startsWith('suffix:') ||
    normalized.startsWith('catalyst:')
  )
}

function parseSections(rawText) {
  const text = trim(rawText)
  if (!text) return []

  const sections = []
  let current = []
  for (const rawLine of text.split(/\r?\n/)) {
    const line = trim(rawLine)
    if (!line) continue
    if (line === '--------') {
      if (current.length) {
        sections.push(current)
        current = []
      }
      continue
    }
    current.push(line)
  }
  if (current.length) {
    sections.push(current)
  }
  return sections
}

function parsePropertyLine(line) {
  if (trim(line).startsWith('{')) return null

  const match = String(line ?? '').match(/^([^:]+):\s*(.+)$/)
  if (!match) return null

  let name = trim(match[1])
  const value = trim(match[2])
  if (!name || !value) return null
  if (/xbasepercentile/i.test(name)) return null
  if (IGNORED_PROPERTY_NAMES.has(name.toLowerCase())) return null
  if (name.toLowerCase() === 'catalystquality') {
    name = 'Quality'
  }

  return {
    name,
    values: [value.replace(/\s*\((?:augmented|unmet|met)\)\s*/gi, '').trim()],
  }
}

function normalizeRequirementName(name) {
  const normalized = trim(name).toLowerCase()
  if (normalized === 'levelreq') return 'Requires Level'
  if (normalized === 'str') return 'Str'
  if (normalized === 'dex') return 'Dex'
  if (normalized === 'int') return 'Int'
  return trim(name)
}

function isRequirementPropertyName(name) {
  const normalized = trim(name).toLowerCase()
  return (
    normalized === 'levelreq' ||
    normalized === 'str' ||
    normalized === 'dex' ||
    normalized === 'int'
  )
}

function normalizeMarker(marker) {
  return trim(marker).toLowerCase().replace(/[{}]/g, ' ').trim()
}

function getExactModifierSectionKey(marker) {
  const normalized = normalizeMarker(marker)
  if (normalized === 'enchant' || normalized === 'enchanted') return 'enchant'
  if (normalized === 'implicit') return 'implicit'
  if (normalized === 'fractured') return 'fractured'
  if (normalized === 'crafted') return 'crafted'
  if (normalized === 'veiled') return 'veiled'
  return null
}

function getModifierSectionKey(marker) {
  return getExactModifierSectionKey(marker) ?? 'explicit'
}

function stripTrailingModifierSuffixes(line) {
  let nextLine = trim(line)
  let detectedKey = null

  while (true) {
    const suffixMatch = String(nextLine ?? '').match(
      /^(.*?)\s+\((implicit|crafted|fractured|veiled|enchant(?:ed)?)\)\s*$/i,
    )
    if (!suffixMatch?.[1] || !suffixMatch[2]) {
      break
    }

    detectedKey ||= getModifierSectionKey(suffixMatch[2])
    nextLine = trim(suffixMatch[1])
  }

  return { key: detectedKey, line: nextLine }
}

function stripLeadingModifierBlocks(line) {
  let nextLine = trim(line)
  const markers = []

  while (nextLine.startsWith('{')) {
    const match = nextLine.match(/^\{([^}]*)\}(.*)$/)
    if (!match) break

    markers.push(trim(match[1]))
    nextLine = String(match[2] ?? '').trimStart()
  }

  return { markers, line: nextLine }
}

function stripInlineMarker(line) {
  const strippedPrefix = stripLeadingModifierBlocks(line)
  const prefixKey = strippedPrefix.markers.map(getExactModifierSectionKey).find(Boolean) ?? null
  const strippedSuffix = stripTrailingModifierSuffixes(strippedPrefix.line)
  return { key: prefixKey ?? strippedSuffix.key, line: strippedSuffix.line }
}

function isFooterLine(line) {
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

function pushModifierSection(sections, key, line) {
  if (!trim(line)) return
  const last = sections[sections.length - 1]
  if (last && last.key === key) {
    last.lines.push(line)
    return
  }
  sections.push({ key, lines: [line] })
}

export function buildStructuredRecommendationItem(itemPayload) {
  const payload = asRecord(itemPayload)
  const rawText = trim(sanitizeAnalysisRawText(payload.raw_text))
  if (!rawText) return null

  const sections = parseSections(rawText)
  const title = trim(payload.display_name) || trim(payload.name) || trim(payload.item_name)
  const baseType = trim(payload.base_type)
  const rarity = trim(payload.rarity) || null

  const structured = {
    title: title || null,
    base_line: baseType && baseType !== title ? baseType : null,
    rarity,
    properties: [],
    requirements: [],
    modifier_sections: [],
    footer_lines: [],
  }

  let inRequirements = false
  let currentModifierKey = 'explicit'
  let implicitLinesRemaining = 0

  for (const section of sections) {
    for (const rawLine of section) {
      const line = trim(rawLine)
      if (!line) continue
      if (line.startsWith('Rarity:')) continue
      if (line === structured.title || line === structured.base_line) continue
      if (line.startsWith('Item Class:')) continue
      if (line.startsWith('Unique ID:')) continue
      if (line.startsWith('League:')) continue
      if (line.startsWith('Note:')) continue
      if (line.startsWith('Split Tag:')) continue
      if (isIgnoredMetadataLine(line)) continue
      if (/xbasepercentile/i.test(line)) continue

      if (line.startsWith('Requirements:')) {
        inRequirements = true
        continue
      }

      const implicitsMatch = line.match(/^Implicits:\s*(\d+)/i)
      if (implicitsMatch) {
        implicitLinesRemaining = Number(implicitsMatch[1] ?? 0)
        continue
      }

      const standaloneMarkerKey =
        line.startsWith('{') && line.endsWith('}') ? getExactModifierSectionKey(line) : null
      if (standaloneMarkerKey) {
        currentModifierKey = standaloneMarkerKey
        continue
      }

      if (isFooterLine(line)) {
        structured.footer_lines.push(line)
        continue
      }

      const property = parsePropertyLine(line)
      if (property) {
        if (inRequirements || isRequirementPropertyName(property.name)) {
          structured.requirements.push({
            name: normalizeRequirementName(property.name),
            values: property.values,
          })
        } else {
          structured.properties.push(property)
        }
        continue
      }

      const inlineMarker = stripInlineMarker(line)
      const cleanedLine = trim(inlineMarker.line)
      if (!cleanedLine) continue

      const sectionKey =
        implicitLinesRemaining > 0 ? 'implicit' : (inlineMarker.key ?? currentModifierKey)
      pushModifierSection(structured.modifier_sections, sectionKey, cleanedLine)

      if (implicitLinesRemaining > 0) {
        implicitLinesRemaining -= 1
      }
    }

    if (inRequirements && structured.requirements.length > 0) {
      inRequirements = false
    }
  }

  if (!structured.title) {
    const headerLines = normalizeLines(
      rawText
        .split(/\r?\n/)
        .filter((line) => trim(line) && trim(line) !== '--------')
        .slice(0, 3),
    )
    structured.title = headerLines.find((line) => !line.startsWith('Rarity:')) ?? null
  }

  return structured
}
