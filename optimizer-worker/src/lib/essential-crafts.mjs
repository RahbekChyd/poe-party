import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const moduleDir = dirname(fileURLToPath(import.meta.url))
const dataPath = resolve(moduleDir, '../data/essential_crafted_mods.json')

let cachedCrafts = null

function loadEssentialCrafts() {
  if (cachedCrafts) return cachedCrafts
  try {
    const raw = readFileSync(dataPath, 'utf8')
    const parsed = JSON.parse(raw)
    const crafts = Array.isArray(parsed?.crafts) ? parsed.crafts : []
    cachedCrafts = crafts
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null
        const id = typeof entry.id === 'string' ? entry.id.trim() : ''
        const label = typeof entry.label === 'string' ? entry.label.trim() : ''
        const matchAny = Array.isArray(entry.match_any)
          ? entry.match_any
              .filter((value) => typeof value === 'string' && value.trim())
              .map((value) => compileMatcher(value))
          : []
        if (!id || !label || matchAny.length === 0) return null
        return { id, label, matchers: matchAny }
      })
      .filter(Boolean)
  } catch (error) {
    console.warn('[essential-crafts] Failed to load data file:', error?.message || error)
    cachedCrafts = []
  }
  return cachedCrafts
}

function compileMatcher(pattern) {
  const escaped = pattern
    .replace(/\{crafted\}/gi, '')
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/#/g, '-?\\d+(?:\\.\\d+)?')
  return new RegExp(escaped, 'i')
}

function normalizeText(rawText) {
  return String(rawText ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\{[a-z]+\}/gi, '').trim())
    .filter(Boolean)
}

export function detectEssentialCraftsOnTarget(rawText) {
  const lines = normalizeText(rawText)
  if (lines.length === 0) return []
  const crafts = loadEssentialCrafts()
  const found = []
  for (const craft of crafts) {
    if (craft.matchers.some((regex) => lines.some((line) => regex.test(line)))) {
      found.push({ id: craft.id, label: craft.label })
    }
  }
  return found
}

export function hasEssentialCraft(rawText, craftId) {
  const crafts = loadEssentialCrafts()
  const craft = crafts.find((entry) => entry.id === craftId)
  if (!craft) return false
  const lines = normalizeText(rawText)
  return craft.matchers.some((regex) => lines.some((line) => regex.test(line)))
}

export function computeMissingEssentialCrafts(targetRawText, candidateRawText) {
  const targetCrafts = detectEssentialCraftsOnTarget(targetRawText)
  if (targetCrafts.length === 0) return []
  return targetCrafts.filter((craft) => !hasEssentialCraft(candidateRawText, craft.id))
}
