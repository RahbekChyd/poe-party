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
  const visibleTags = metadata.tags.slice(0, maxTags)

  return (
    <>
      {metadata.patch ? (
        <Chip size="sm" variant="soft" color="accent">
          {metadata.patch}
        </Chip>
      ) : null}
      {stageLabel ? (
        <Chip size="sm" variant="soft">
          {stageLabel}
        </Chip>
      ) : null}
      {kindLabel ? (
        <Chip size="sm" variant="soft">
          {kindLabel}
        </Chip>
      ) : null}
      {metadata.source_refs.length > 0 ? (
        <Chip size="sm" variant="soft" color="success">
          Source-backed
        </Chip>
      ) : null}
      {verified ? (
        <Chip size="sm" variant="soft">
          Verified {verified}
        </Chip>
      ) : null}
      {visibleTags.map((tag) => (
        <Chip key={tag} size="sm" variant="soft">
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
            className="button button--sm button--tertiary"
          >
            {source.label}
            <ExternalLink size={14} aria-hidden />
          </a>
        ))}
      </div>
    </div>
  )
}
