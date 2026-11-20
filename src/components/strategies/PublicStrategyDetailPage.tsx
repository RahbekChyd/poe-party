import { useMemo } from 'react'
import { Button } from '@heroui/react/button'
import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { Spinner } from '@heroui/react/spinner'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Route } from '../../routes/dashboard/strategies/public/$strategyId'
import { useGroupStore } from '../../store/group-store'
import { usePublicStrategy, useSubscribeToStrategy } from '../../hooks/useStrategies'
import { useActiveGroupContext, useMyGroupRole } from '../../hooks/useGroups'
import { useCurrencyStore } from '../../store/currency-store'
import { useNinjaPrices } from '../../hooks/useNinjaPrices'
import { DIFFICULTY_CHIP, MAP_REQ_LABELS } from '../../lib/constants'
import { formatCurrencyAmount } from '../../lib/utils'
import { DetailPageSkeleton } from '../layout/Skeletons'
import { StrategyMetadataBadges, StrategySourceLinks } from './StrategyMetadataBadges'
import { QueryStatePanel } from '../ui/QueryStatePanel'
type NativeChipColor = 'default' | 'accent' | 'success' | 'warning' | 'danger'

function toNativeChipColor(color: string): NativeChipColor {
  if (color === 'primary' || color === 'secondary') return 'accent'
  return color as NativeChipColor
}

export function PublicStrategyDetailPage() {
  const { strategyId } = Route.useParams()
  const activeGroupId = useGroupStore((state) => state.activeGroupId)
  const { data: strategy, isLoading, isError, refetch } = usePublicStrategy(activeGroupId, strategyId)
  const { mutate: subscribeToStrategy, isPending: subscribePending, isError: subscribeFailed } = useSubscribeToStrategy()
  const { game, league: activeLeague, capabilities } = useActiveGroupContext()
  const myRole = useMyGroupRole(activeGroupId)
  const navigate = useNavigate()
  const display = useCurrencyStore((state) => state.display)
  const { data: ninjaData } = useNinjaPrices(activeLeague, game ?? 'poe1')
  const divinePrice = ninjaData?.divinePrice ?? null

  const reqChips = useMemo(
    () =>
      Object.entries(strategy?.map_requirements ?? {})
        .filter(([, value]) => value != null)
        .map(([key, value]) => ({ label: MAP_REQ_LABELS[key] ?? key, value: value as number })),
    [strategy?.map_requirements],
  )
  const fmt = (chaos: number): string => formatCurrencyAmount(chaos, divinePrice == null ? 'chaos' : display, divinePrice ?? 1)

  if (isLoading) {
    return <DetailPageSkeleton />
  }

  if (!strategy) {
    return (
      <div className="flex flex-col gap-4">
        <Link to="/dashboard/strategies" search={{ tab: 'public' }} className="button button--sm button--tertiary self-start">
          <ArrowLeft size={14} aria-hidden="true" /> Back to strategies
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
  const hasAtlas = capabilities?.supportsAtlasTree && !!strategy.atlas_tree_url
  const hasMapSetup = capabilities?.supportsAtlasTree &&
    (!!strategy.map_trade_link || strategy.map_cost != null || reqChips.length > 0)
  const showsThreadSetup = capabilities?.supportsMapInvestmentPlanning &&
    (strategy.threads.length > 0 || strategy.scarabs.length > 0)
  const hasSetup = hasAtlas || hasMapSetup || showsThreadSetup || !!strategy.content_metadata?.source_refs.length

  return (
    <div className="flex min-w-0 flex-col gap-6 wrap-anywhere">
      <Link to="/dashboard/strategies" search={{ tab: 'public' }} className="button button--sm button--tertiary self-start">
        <ArrowLeft size={14} aria-hidden="true" /> Back to strategies
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 basis-full sm:flex-1">
          <h1 className="text-foreground text-2xl font-semibold">{strategy.name}</h1>
          <p className="text-default-500 mt-1 text-sm">
            Published by {strategy.group_name} · {strategy.group_league}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {strategy.live_subscription_id ? (
            <Link
              to="/dashboard/strategies/$strategyId"
              params={{ strategyId: strategy.live_subscription_id }}
              className="button button--sm button--primary"
            >
              View subscription
            </Link>
          ) : myRole !== 'viewer' ? (
            <Button
              size="sm"
              isPending={subscribePending}
              onPress={() => {
                if (!activeGroupId) return
                subscribeToStrategy(
                  { groupId: activeGroupId, sourceStrategyId: strategy.id },
                  {
                    onSuccess: (subscribedId) => navigate({
                      to: '/dashboard/strategies/$strategyId',
                      params: { strategyId: subscribedId },
                    }),
                  },
                )
              }}
            >
              {({ isPending }) => (
                <>
                  {isPending ? <Spinner color="current" size="sm" /> : null}
                  Subscribe
                </>
              )}
            </Button>
          ) : null}
        </div>
      </div>

      {subscribeFailed ? (
        <p className="text-danger text-sm" role="alert">Could not subscribe to this strategy. Try again.</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Chip size="sm" variant="soft" color={toNativeChipColor(diffChip.color)}>
          {diffChip.label}
        </Chip>
        <Chip size="sm" variant="soft" color="accent">
          Public
        </Chip>
        <Chip size="sm" variant="soft">
          {strategy.benchmark_chaos_per_hour == null
            ? 'No benchmark yet'
            : `${fmt(strategy.benchmark_chaos_per_hour)}/hr`}
        </Chip>
        {strategy.benchmark_sample_count > 0 ? (
          <Chip size="sm" variant="soft">
            {strategy.benchmark_sample_count} benchmark sample
            {strategy.benchmark_sample_count === 1 ? '' : 's'}
          </Chip>
        ) : null}
        <StrategyMetadataBadges metadata={strategy.content_metadata} />
      </div>

      <p className="text-default-500 text-sm">
        Subscriptions add a read-only copy that follows the publisher’s updates while public.
      </p>

      {strategy.description ? (
        <Card>
          <Card.Content>
            <p className="text-default-600 text-sm leading-relaxed whitespace-pre-wrap">{strategy.description}</p>
          </Card.Content>
        </Card>
      ) : null}

      {hasSetup ? (
        <section aria-label="Strategy setup" className="flex min-w-0 flex-col gap-3">
          <StrategySourceLinks metadata={strategy.content_metadata} />

          {hasAtlas && strategy.atlas_tree_url ? (
            <div className="rounded-large border-divider bg-default-50/60 flex flex-wrap items-center justify-between gap-3 border p-4">
              <div>
                <p className="text-foreground text-sm font-medium">Atlas tree</p>
              </div>
              <a
                href={strategy.atlas_tree_url}
                target="_blank"
                rel="noopener noreferrer"
                className="button button--sm button--tertiary"
              >
                Open Atlas tree
                <ExternalLink size={14} aria-hidden />
              </a>
            </div>
          ) : null}

          {capabilities?.supportsMapInvestmentPlanning && strategy.scarabs.length > 0 && (
            <details className="text-default-400 wrap-anywhere text-sm">
              <summary className="cursor-pointer">Legacy Scarab reference (removed in 3.30)</summary>
              <ul className="mt-2">{strategy.scarabs.map((scarab, index) => (
                <li key={index}>{scarab.quantity} × {scarab.name}</li>
              ))}</ul>
            </details>
          )}
          {capabilities?.supportsMapInvestmentPlanning && strategy.threads.length > 0 ? (
            <div className="rounded-large border-divider bg-default-50/60 border p-4">
              <p className="text-foreground text-sm font-medium">Threads</p>
              <div className="mt-3 flex flex-col gap-3">
                {strategy.threads.map((thread, index) => (
                  <div
                    key={`${thread.name}-${index}`}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <Chip size="sm" variant="soft" className="h-auto max-w-full px-2 py-1 whitespace-normal wrap-anywhere">
                      {thread.name}
                      {thread.quantity > 1 ? ` ×${thread.quantity}` : ''}
                      {!thread.required ? ' · optional' : ''}
                    </Chip>
                    {thread.alternatives.map((alternative, alternativeIndex) => (
                      <Chip
                        key={`${thread.name}-${index}-alt-${alternative.name}-${alternativeIndex}`}
                        size="sm"
                        variant="secondary"
                        className="h-auto max-w-full border-dashed px-2 py-1 whitespace-normal wrap-anywhere"
                      >
                        Alternative · {alternative.name}
                        {thread.quantity > 1 ? ` ×${thread.quantity}` : ''}
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

          {hasMapSetup ? (
            <div className="rounded-large border-divider bg-default-50/60 border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-foreground text-sm font-medium">Map setup</p>
                {strategy.map_cost != null ? (
                  <Chip size="sm" variant="soft">
                    ~{fmt(strategy.map_cost)}/map
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
                    Open trade link
                  </a>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
