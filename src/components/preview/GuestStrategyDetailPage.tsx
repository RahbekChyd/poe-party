import { useMemo } from 'react'
import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useGuestPublicStrategyPreview } from '../../hooks/useGuestPreview'
import { DIFFICULTY_CHIP, MAP_REQ_LABELS } from '../../lib/constants'
import { getPoeGameCapabilities, getPoeGameShortLabel } from '../../lib/poe-game'
import { formatCurrencyAmount } from '../../lib/utils'
import { Route } from '../../routes/preview/strategies/$strategyId'
import { PreviewPageIntro } from './PreviewShared'
import { StrategyMetadataBadges, StrategySourceLinks } from '../strategies/StrategyMetadataBadges'
import { QueryStatePanel } from '../ui/QueryStatePanel'
const divinePrice = 205

export function GuestStrategyDetailPage() {
  const { strategyId } = Route.useParams()
  const { data: strategy, isLoading, isError, refetch } = useGuestPublicStrategyPreview(strategyId)
  const reqChips = useMemo(
    () =>
      Object.entries(strategy?.map_requirements ?? {})
        .filter(([, value]) => value != null)
        .map(([key, value]) => ({ label: MAP_REQ_LABELS[key] ?? key, value: value as number })),
    [strategy?.map_requirements],
  )

  if (isLoading) {
    return (
      <QueryStatePanel kind="loading" title="Loading strategy" description="Getting the public setup." />
    )
  }

  if (!strategy) {
    return (
      <div className="flex flex-col gap-4">
        <Link to="/preview/strategies" className="button button--sm button--tertiary self-start">
          <ArrowLeft size={14} />
          Back to Strategies
        </Link>
        <h1 className="text-2xl font-semibold">{isError ? 'Strategy unavailable' : 'Strategy not found'}</h1>
        {isError ? (
          <QueryStatePanel kind="error" title="Could not load strategy" description="Try again to open the public setup." onRetry={refetch} />
        ) : (
          <p className="text-default-500 text-sm">This strategy may have been removed or made private.</p>
        )}
      </div>
    )
  }

  const diffChip = DIFFICULTY_CHIP[strategy.difficulty] ?? DIFFICULTY_CHIP.normal
  const game = strategy.group_game ?? 'poe1'
  const capabilities = getPoeGameCapabilities(game)
  const fmt = (chaos: number): string => formatCurrencyAmount(chaos, 'chaos', divinePrice)

  return (
    <div className="flex flex-col gap-6">
      <Link to="/preview/strategies" className="button button--sm button--tertiary self-start">
        <ArrowLeft size={14} />
        Back to Strategies
      </Link>

      <PreviewPageIntro
        mode="public"
        title={strategy.name}
        description={`Published by ${strategy.group_name} · ${getPoeGameShortLabel(game)} ${strategy.group_league}`}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Chip size="sm" color={diffChip.color} variant="soft">
          {diffChip.label}
        </Chip>
        {strategy.map_cost != null ? (
          <Chip size="sm" variant="soft">
            ~ {fmt(strategy.map_cost)}/map
          </Chip>
        ) : null}
        <Chip size="sm" variant="soft">
          {strategy.benchmark_chaos_per_hour == null
            ? 'No benchmark yet'
            : `${fmt(strategy.benchmark_chaos_per_hour)}/hr`}
        </Chip>
        <Chip size="sm" variant="soft">
          {strategy.benchmark_sample_count} benchmark sample
          {strategy.benchmark_sample_count === 1 ? '' : 's'}
        </Chip>
        <StrategyMetadataBadges metadata={strategy.content_metadata} />
      </div>

      {strategy.description ? (
        <Card>
          <Card.Content className="p-5">
            <p className="text-default-600 text-sm leading-relaxed wrap-anywhere whitespace-pre-wrap">{strategy.description}</p>
          </Card.Content>
        </Card>
      ) : null}

      <Card>
        <Card.Content className="gap-4 p-5">
          <StrategySourceLinks metadata={strategy.content_metadata} />

          {capabilities.supportsAtlasTree && strategy.atlas_tree_url ? (
            <div className="rounded-large border-divider bg-default-50/60 flex items-center justify-between gap-3 border p-4">
              <div>
                <p className="text-foreground text-sm font-medium">Atlas tree</p>
                <p className="text-default-500 text-sm">Open the publisher&apos;s atlas setup.</p>
              </div>
              <a
                href={strategy.atlas_tree_url}
                target="_blank"
                rel="noopener noreferrer"
                className="button button--sm button--tertiary"
              >
                Open Atlas Tree
                <ExternalLink size={14} aria-hidden />
              </a>
            </div>
          ) : null}

          {capabilities.supportsMapInvestmentPlanning && strategy.scarabs.length > 0 && (
            <details className="text-default-400 text-sm">
              <summary className="cursor-pointer">Legacy Scarab reference (removed in 3.30)</summary>
              <ul className="mt-2">{strategy.scarabs.map((scarab, index) => (
                <li key={index}>{scarab.quantity} × {scarab.name}</li>
              ))}</ul>
            </details>
          )}
          {capabilities.supportsMapInvestmentPlanning && strategy.threads.length > 0 ? (
            <div className="rounded-large border-divider bg-default-50/60 border p-4">
              <p className="text-foreground text-sm font-medium">Threads</p>
              <div className="mt-3 flex flex-col gap-3">
                {strategy.threads.map((thread, index) => (
                  <div
                    key={`${thread.name}-${index}`}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <Chip size="sm" variant="soft">
                      {thread.name}
                      {thread.quantity > 1 ? ` x${thread.quantity}` : ''}
                      {!thread.required ? ' - optional' : ''}
                    </Chip>
                    {thread.alternatives.map((alternative, alternativeIndex) => (
                      <Chip
                        key={`${thread.name}-${index}-alt-${alternative.name}-${alternativeIndex}`}
                        size="sm"
                        variant="secondary"
                        className="border-dashed"
                      >
                        Alternative: {alternative.name}
                        {thread.quantity > 1 ? ` x${thread.quantity}` : ''}
                      </Chip>
                    ))}
                  </div>
                ))}
              </div>
              {strategy.threads.some((thread) => thread.alternatives.length > 0) ? (
                <p className="text-default-400 mt-3 text-xs">
                  Alternative threads use the same quantity as the primary thread.
                </p>
              ) : null}
            </div>
          ) : null}

          {capabilities.supportsAtlasTree &&
          (strategy.map_trade_link || strategy.map_cost != null || reqChips.length > 0) ? (
            <div className="rounded-large border-divider bg-default-50/60 border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-foreground text-sm font-medium">Map setup</p>
                {strategy.map_cost != null ? (
                  <Chip size="sm" variant="soft">
                    ~ {fmt(strategy.map_cost)}/map
                  </Chip>
                ) : null}
              </div>
              {reqChips.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {reqChips.map((chip) => (
                    <Chip key={chip.label} size="sm" variant="soft">
                      {chip.label} {chip.value}%
                    </Chip>
                  ))}
                </div>
              ) : null}
              {strategy.map_trade_link ? (
                <div className="mt-3">
                  <a
                    href={strategy.map_trade_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="button button--sm button--tertiary"
                  >
                    Open Trade Link
                  </a>
                </div>
              ) : null}
            </div>
          ) : null}

          {!capabilities.supportsAtlasTree ? (
            <div className="rounded-large border-divider bg-default-50/60 border p-4">
              <p className="text-foreground text-sm font-medium">PoE2 public strategy view</p>
              <p className="text-default-500 mt-1 text-sm">
                This public view stays focused on shared planning data. Atlas, thread, and map setup
                fields remain hidden for PoE2 workspaces.
              </p>
            </div>
          ) : null}
        </Card.Content>
      </Card>

    </div>
  )
}
