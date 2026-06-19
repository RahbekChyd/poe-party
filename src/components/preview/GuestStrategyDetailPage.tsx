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
import { PreviewNotice, PreviewPageIntro } from './PreviewShared'
const divinePrice = 205

export function GuestStrategyDetailPage() {
  const { strategyId } = Route.useParams()
  const { data: strategy, isLoading } = useGuestPublicStrategyPreview(strategyId)
  const reqChips = useMemo(
    () =>
      Object.entries(strategy?.map_requirements ?? {})
        .filter(([, value]) => value != null)
        .map(([key, value]) => ({ label: MAP_REQ_LABELS[key] ?? key, value: value as number })),
    [strategy?.map_requirements],
  )

  if (isLoading) {
    return (
      <Card>
        <Card.Content className="text-default-400 p-10 text-center text-sm">
          Loading live public strategy summary...
        </Card.Content>
      </Card>
    )
  }

  if (!strategy) {
    return (
      <div className="flex flex-col gap-4">
        <Link to="/preview/strategies" className="button button--sm button--tertiary self-start">
          <ArrowLeft size={14} />
          Back to Strategies
        </Link>
        <p className="text-default-400 text-sm">This public strategy could not be found.</p>
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
        description="This page shows the live public strategy setup so anyone can inspect the plan directly."
        aside={
          <PreviewNotice
            mode="public"
            title="Live public summary"
            description="The title, description, publisher, league, benchmark, atlas setup, scarabs, and map cost below come from the real public listing."
          />
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Chip size="sm" color={diffChip.color} variant="soft">
          {diffChip.label}
        </Chip>
        <Chip size="sm" color="accent" variant="soft">
          Public
        </Chip>
        <Chip size="sm" variant="soft">
          {strategy.group_name}
        </Chip>
        <Chip size="sm" variant="soft">
          {getPoeGameShortLabel(game)}
        </Chip>
        <Chip size="sm" variant="soft">
          {strategy.group_league}
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
      </div>

      {strategy.description ? (
        <Card>
          <Card.Content className="p-5">
            <p className="text-default-600 text-sm leading-relaxed">{strategy.description}</p>
          </Card.Content>
        </Card>
      ) : null}

      <Card>
        <Card.Content className="gap-4 p-5">
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

          {capabilities.supportsScarabStrategies && strategy.scarabs.length > 0 ? (
            <div className="rounded-large border-divider bg-default-50/60 border p-4">
              <p className="text-foreground text-sm font-medium">Scarabs</p>
              <div className="mt-3 flex flex-col gap-3">
                {strategy.scarabs.map((scarab, index) => (
                  <div
                    key={`${scarab.name}-${index}`}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <Chip size="sm" variant="soft">
                      {scarab.name}
                      {scarab.quantity > 1 ? ` x${scarab.quantity}` : ''}
                      {!scarab.required ? ' - optional' : ''}
                    </Chip>
                    {scarab.alternatives.map((alternative, alternativeIndex) => (
                      <Chip
                        key={`${scarab.name}-${index}-alt-${alternative.name}-${alternativeIndex}`}
                        size="sm"
                        variant="secondary"
                        className="border-dashed"
                      >
                        Alternative: {alternative.name}
                        {scarab.quantity > 1 ? ` x${scarab.quantity}` : ''}
                      </Chip>
                    ))}
                  </div>
                ))}
              </div>
              {strategy.scarabs.some((scarab) => scarab.alternatives.length > 0) ? (
                <p className="text-default-400 mt-3 text-xs">
                  Alternative scarabs use the same quantity as the primary scarab.
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
                This public view stays focused on shared planning data. Atlas, scarab, and map setup
                fields remain hidden for PoE2 workspaces.
              </p>
            </div>
          ) : null}
        </Card.Content>
      </Card>

    </div>
  )
}
