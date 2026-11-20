import { Chip } from '@heroui/react/chip'
import { ExternalLink } from 'lucide-react'
import {
  getStrategyKindLabel,
  getStrategyStageLabel,
  type StrategyContentMetadata,
} from '../../lib/public-strategy-content'

function formatVerifiedDate(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

export function StrategyMetadataBadges({
  metadata,
  maxTags = 2,
  includeVerified = true,
}: {
  metadata: StrategyContentMetadata | null
  maxTags?: number
  includeVerified?: boolean
}) {
  if (!metadata) return null

  const stageLabel = getStrategyStageLabel(metadata.stage)
  const kindLabel = getStrategyKindLabel(metadata.kind)
  const verified = includeVerified ? formatVerifiedDate(metadata.verified_at) : null
  const labels: Array<{ label: string | null; color?: 'accent' | 'success' }> = [
    { label: metadata.patch, color: 'accent' },
    { label: stageLabel },
    { label: kindLabel },
    { label: metadata.source_refs.length > 0 ? 'Source-backed' : null, color: 'success' },
    { label: verified ? `Verified ${verified}` : null },
  ]
  const seen = new Set<string>()
  const badges = labels.flatMap(({ label, color }) => {
    if (!label) return []
    const key = label.trim().toLowerCase()
    if (seen.has(key)) return []
    seen.add(key)
    return [{ label, color }]
  })
  const visibleTags = metadata.tags.filter((tag) => {
    const key = tag.trim().toLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, maxTags)

  return (
    <>
      {badges.map(({ label, color }) => (
        <Chip key={label} size="sm" variant="soft" color={color} className="h-auto min-h-5 max-w-full whitespace-normal wrap-anywhere">
          {label}
        </Chip>
      ))}
      {visibleTags.map((tag) => (
        <Chip key={tag} size="sm" variant="soft" className="h-auto min-h-5 max-w-full whitespace-normal wrap-anywhere">
          {tag}
        </Chip>
      ))}
    </>
  )
}

export function StrategySourceLinks({
  metadata,
  title = 'Sources',
}: {
  metadata: StrategyContentMetadata | null
  title?: string
}) {
  if (!metadata?.source_refs.length) return null

  return (
    <div className="rounded-large border-divider bg-default-50/60 border p-4">
      <p className="text-foreground text-sm font-medium">{title}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {metadata.source_refs.map((source) => (
          <a
            key={`${source.label}-${source.url}`}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="button button--sm button--tertiary h-auto max-w-full py-2 text-left whitespace-normal wrap-anywhere"
          >
            {source.label}
            <ExternalLink size={14} aria-hidden />
          </a>
        ))}
      </div>
    </div>
  )
}
