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
type NativeChipColor = 'default' | 'accent' | 'success' | 'warning' | 'danger'

function toNativeChipColor(color: string): NativeChipColor {
  if (color === 'primary' || color === 'secondary') return 'accent'
  return color as NativeChipColor
}

export function PublicStrategyDetailPage() {
  const { strategyId } = Route.useParams()
  const activeGroupId = useGroupStore((state) => state.activeGroupId)
  const { data: strategy, isLoading } = usePublicStrategy(activeGroupId, strategyId)
  const { mutateAsync: subscribeToStrategy, isPending: subscribePending } = useSubscribeToStrategy()
  const { game, league: activeLeague, capabilities } = useActiveGroupContext()
  const myRole = useMyGroupRole(activeGroupId)
  const navigate = useNavigate()
  const display = useCurrencyStore((state) => state.display)
  const { data: ninjaData } = useNinjaPrices(activeLeague, game ?? 'poe1')
  const divinePrice = ninjaData?.divinePrice ?? 200

  const reqChips = useMemo(
    () =>
      Object.entries(strategy?.map_requirements ?? {})
        .filter(([, value]) => value != null)
        .map(([key, value]) => ({ label: MAP_REQ_LABELS[key] ?? key, value: value as number })),
    [strategy?.map_requirements],
  )
  const fmt = (chaos: number): string => formatCurrencyAmount(chaos, display, divinePrice)

  if (isLoading) {
    return <DetailPageSkeleton />
  }

  if (!strategy) {
    return (
      <div className="flex flex-col gap-4">
        <Link to="/dashboard/strategies" className="button button--sm button--tertiary self-start">
          <ArrowLeft size={14} />
          Back to Strategies
        </Link>
        <p className="text-default-400 text-sm">Public strategy not found.</p>
      </div>
    )
  }

  const diffChip = DIFFICULTY_CHIP[strategy.difficulty] ?? DIFFICULTY_CHIP.normal

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/dashboard/strategies" className="button button--sm button--tertiary -ml-2">
            <ArrowLeft size={14} />
            Back to Strategies
          </Link>
          <h1 className="text-foreground mt-3 text-2xl font-semibold">{strategy.name}</h1>
          <p className="text-default-400 mt-1 text-sm">
            Public strategy published by {strategy.group_name} in {strategy.group_league}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {strategy.live_subscription_id ? (
            <Link
              to="/dashboard/strategies/$strategyId"
              params={{ strategyId: strategy.live_subscription_id }}
              className="button button--sm"
            >
              Open Subscription
            </Link>
          ) : myRole !== 'viewer' ? (
            <Button
              size="sm"
              isPending={subscribePending}
              onPress={async () => {
                if (!activeGroupId) return
                const subscribedId = await subscribeToStrategy({
                  groupId: activeGroupId,
                  sourceStrategyId: strategy.id,
                })
                navigate({
                  to: '/dashboard/strategies/$strategyId',
                  params: { strategyId: subscribedId },
                })
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

      <div className="flex flex-wrap items-center gap-2">
        <Chip size="sm" variant="soft" color={toNativeChipColor(diffChip.color)}>
          {diffChip.label}
        </Chip>
        <Chip size="sm" variant="soft" color="warning">
          Locked after subscribe
        </Chip>
        <Chip size="sm" variant="soft" color="accent">
          Public
        </Chip>
        <Chip size="sm" variant="soft">
          {strategy.group_name}
        </Chip>
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

      <Card>
        <Card.Content className="gap-3 p-5 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-foreground text-sm font-medium">Publisher-managed subscription</p>
            <p className="text-default-500 mt-1 text-sm leading-relaxed">
              Subscribing creates a local copy in your own strategy list. Your group can set it
              active for snapshot tracking, but the strategy content itself stays locked and follows
              updates from {strategy.group_name} while the publisher keeps it public.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            <Chip size="sm" variant="soft" color="warning">
              Read-only content
            </Chip>
            <Chip size="sm" variant="soft">
              Auto-updates while public
            </Chip>
          </div>
        </Card.Content>
      </Card>

      {strategy.description ? (
        <Card>
          <Card.Content className="p-5">
            <p className="text-default-600 text-sm leading-relaxed">{strategy.description}</p>
          </Card.Content>
        </Card>
      ) : null}

      <Card>
        <Card.Content className="gap-4 p-5">
          <StrategySourceLinks metadata={strategy.content_metadata} />

          {capabilities?.supportsAtlasTree && strategy.atlas_tree_url ? (
            <div className="rounded-large border-divider bg-default-50/60 flex items-center justify-between gap-3 border p-4">
              <div>
                <p className="text-foreground text-sm font-medium">Atlas tree</p>
                <p className="text-default-500 text-sm">Open the publisher's atlas setup.</p>
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

          {capabilities?.supportsScarabStrategies && strategy.scarabs.length > 0 ? (
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
                      {!scarab.required ? ' · optional' : ''}
                    </Chip>
                    {scarab.alternatives.map((alternative, alternativeIndex) => (
                      <Chip
                        key={`${scarab.name}-${index}-alt-${alternative.name}-${alternativeIndex}`}
                        size="sm"
                        variant="secondary"
                        className="border-dashed"
                      >
                        Alt: {alternative.name}
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

          {capabilities?.supportsAtlasTree &&
          (strategy.map_trade_link || strategy.map_cost != null || reqChips.length > 0) ? (
            <div className="rounded-large border-divider bg-default-50/60 border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-foreground text-sm font-medium">Map setup</p>
                {strategy.map_cost != null ? (
                  <Chip size="sm" variant="soft">
                    ~= {fmt(strategy.map_cost)}/map
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
          {!capabilities?.supportsAtlasTree ? (
            <div className="rounded-large border-divider bg-default-50/60 border p-4">
              <p className="text-foreground text-sm font-medium">PoE2 public strategy view</p>
              <p className="text-default-500 mt-1 text-sm">
                This preview stays focused on shared planning data. Atlas, scarab, and map setup
                fields remain hidden for PoE2 workspaces.
              </p>
            </div>
          ) : null}
        </Card.Content>
      </Card>
    </div>
  )
}
