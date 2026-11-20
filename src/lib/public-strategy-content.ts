import strategyContent from '../content/public-strategy-content.json'
import type { PoeGame } from './poe-game'

export const STRATEGY_CONTENT_STAGE_OPTIONS = [
  { value: 'league_starter', label: 'League starter' },
  { value: 'alch_and_go', label: 'Alch & go' },
  { value: 'early_maps', label: 'Early maps' },
  { value: 'midgame', label: 'Midgame' },
  { value: 'high_end', label: 'High end' },
  { value: 'party', label: 'Party' },
] as const

export type StrategyContentStage = (typeof STRATEGY_CONTENT_STAGE_OPTIONS)[number]['value']

export const STRATEGY_STAGE_FILTER_OPTIONS = [
  { value: 'all' as const, label: 'All stages', shortLabel: 'All' },
  ...STRATEGY_CONTENT_STAGE_OPTIONS.map((option) => ({
    ...option,
    shortLabel: option.value === 'league_starter' ? 'Starter' : undefined,
  })),
]

export const STRATEGY_CONTENT_KIND_OPTIONS = [
  { value: 'league_starter', label: 'League starter' },
  { value: 'build_source', label: 'Build sources' },
  { value: 'farming', label: 'Farming' },
  { value: 'party', label: 'Party' },
] as const

export type StrategyContentKind = (typeof STRATEGY_CONTENT_KIND_OPTIONS)[number]['value']

export type StrategyContentConfidence = 'official' | 'source_backed' | 'curated'

export interface StrategySourceRef {
  label: string
  url: string
  type?: 'official' | 'community' | 'creator' | 'tool' | 'other'
}

export interface StrategyContentMetadata {
  content_slug: string | null
  patch: string | null
  stage: StrategyContentStage | null
  kind: StrategyContentKind | null
  tags: string[]
  source_refs: StrategySourceRef[]
  verified_at: string | null
  confidence: StrategyContentConfidence | null
}

export interface PublicStrategyContentEntry {
  slug: string
  game: PoeGame
  league: string
  patch: string
  stage: StrategyContentStage
  kind: StrategyContentKind
  confidence: StrategyContentConfidence
  title: string
  headline: string
  summary: string
  intro: string
  tags: string[]
  tracking: string[]
  sourceRefs: StrategySourceRef[]
  sourceFiles?: string[]
  verifiedAt: string
  seo: {
    title: string
    description: string
    priority: number
    changefreq: 'daily' | 'weekly' | 'monthly'
    llmsSection: string
  }
  strategy: {
    name: string
    description: string
    colour: string
    difficulty: 'easy' | 'normal' | 'hard'
    atlasTreeUrl?: string | null
    scarabs?: unknown[]
    threads?: unknown[]
    mapTradeLink?: string | null
    mapRequirements?: Record<string, number | null>
    mapCost?: number | null
  }
}

interface PublicStrategyContentManifest {
  lastmod: string
  sourceInbox: string
  entries: PublicStrategyContentEntry[]
}

const stageLabels = new Map(
  STRATEGY_CONTENT_STAGE_OPTIONS.map((option) => [option.value, option.label]),
)
const kindLabels = new Map(
  STRATEGY_CONTENT_KIND_OPTIONS.map((option) => [option.value, option.label]),
)
const stageValues = new Set(STRATEGY_CONTENT_STAGE_OPTIONS.map((option) => option.value))
const kindValues = new Set(STRATEGY_CONTENT_KIND_OPTIONS.map((option) => option.value))
const confidenceValues = new Set<StrategyContentConfidence>([
  'official',
  'source_backed',
  'curated',
])

export const publicStrategyContentManifest =
  strategyContent as PublicStrategyContentManifest

export const publicStrategyContentEntries = publicStrategyContentManifest.entries

export function getStrategyStageLabel(stage: StrategyContentStage | null | undefined) {
  return stage ? stageLabels.get(stage) ?? stage : null
}

export function getStrategyKindLabel(kind: StrategyContentKind | null | undefined) {
  return kind ? kindLabels.get(kind) ?? kind : null
}

export function findPublicStrategyContentBySlug(slug: string) {
  return publicStrategyContentEntries.find((entry) => entry.slug === slug) ?? null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => readString(entry))
    .filter((entry): entry is string => !!entry)
}

function readSourceRefs(value: unknown): StrategySourceRef[] {
  if (!Array.isArray(value)) return []

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const record = entry as Record<string, unknown>
      const label = readString(record.label)
      const url = readString(record.url)
      if (!label || !url) return null
      const type = readString(record.type)
      const sourceRef: StrategySourceRef = { label, url }

      if (
        type === 'official' ||
        type === 'community' ||
        type === 'creator' ||
        type === 'tool' ||
        type === 'other'
      ) {
        sourceRef.type = type
      }

      return sourceRef
    })
    .filter((entry): entry is StrategySourceRef => !!entry)
}

export function normalizeStrategyContentMetadata(
  value: unknown,
): StrategyContentMetadata | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const record = value as Record<string, unknown>
  const stage = readString(record.stage)
  const kind = readString(record.kind)
  const confidence = readString(record.confidence)
  const sourceRefs = readSourceRefs(record.source_refs ?? record.sourceRefs)
  const tags = readStringArray(record.tags)
  const contentSlug = readString(record.content_slug ?? record.contentSlug)
  const patch = readString(record.patch)
  const verifiedAt = readString(record.verified_at ?? record.verifiedAt)

  if (!contentSlug && !patch && !stage && !kind && tags.length === 0 && sourceRefs.length === 0) {
    return null
  }

  return {
    content_slug: contentSlug,
    patch,
    stage: stageValues.has(stage as StrategyContentStage)
      ? (stage as StrategyContentStage)
      : null,
    kind: kindValues.has(kind as StrategyContentKind) ? (kind as StrategyContentKind) : null,
    tags,
    source_refs: sourceRefs,
    verified_at: verifiedAt,
    confidence: confidenceValues.has(confidence as StrategyContentConfidence)
      ? (confidence as StrategyContentConfidence)
      : null,
  }
}

export function buildStrategyContentMetadata(
  entry: PublicStrategyContentEntry,
): StrategyContentMetadata {
  return {
    content_slug: entry.slug,
    patch: entry.patch,
    stage: entry.stage,
    kind: entry.kind,
    tags: entry.tags,
    source_refs: entry.sourceRefs,
    verified_at: entry.verifiedAt,
    confidence: entry.confidence,
  }
}
