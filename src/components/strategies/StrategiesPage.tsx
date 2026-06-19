import { useMemo, useState } from 'react'
import { Button } from '@heroui/react/button'
import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { Separator } from '@heroui/react/separator'
import { Spinner } from '@heroui/react/spinner'
import { ToggleButton } from '@heroui/react/toggle-button'
import { ToggleButtonGroup } from '@heroui/react/toggle-button-group'
import { ChevronDown, Globe, Star, Target } from 'lucide-react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Route } from '../../routes/dashboard/strategies'
import { useNinjaPrices } from '../../hooks/useNinjaPrices'
import { useGroupStore } from '../../store/group-store'
import {
  type PublicStrategy,
  type Strategy,
  useDeleteStrategy,
  usePublicStrategies,
  useStrategies,
  useSubscribeToStrategy,
} from '../../hooks/useStrategies'
import {
  useCurrentStrategyId,
  useMyGroupRole,
  useActiveGroupContext,
  useSetCurrentStrategy,
} from '../../hooks/useGroups'
import { useStrategyHourlyEstimates } from '../../hooks/useStrategyEconomy'
import { type ScarabEntry, useScarabData } from '../../hooks/useScarabNames'
import { useCurrencyStore } from '../../store/currency-store'
import { CreateStrategyModal } from './CreateStrategyModal'
import { DIFFICULTY_CHIP } from '../../lib/constants'
import { StrategyCardsSkeleton } from '../layout/Skeletons'
import { cn, formatCurrencyAmount } from '../../lib/utils'
import { DashboardEmptyState, DashboardPage, DashboardPageHeader } from '../ui/dashboard'
import { StrategyInfoSection } from './StrategyInfoSection'
type Mode = 'own' | 'public'
type NativeChipColor = 'default' | 'accent' | 'success' | 'warning' | 'danger'

function toNativeChipColor(color: string): NativeChipColor {
  if (color === 'primary' || color === 'secondary') return 'accent'
  return color as NativeChipColor
}

function OwnedStrategyCard({
  strategy,
  currentStrategyId,
  myRole,
  activeGroupId,
  settingCurrent,
  onSetCurrent,
  strategyRate,
  totalCost,
  hasPartialPrices,
  scarabPriceMap,
  scarabIconMap,
  fmt,
  showsPoe1PlanningFields,
}: {
  strategy: Strategy
  currentStrategyId: string | null
  myRole: string | null
  activeGroupId: string | null
  settingCurrent: boolean
  onSetCurrent: (strategyId: string) => void
  strategyRate: { chaosPerHour: number; sampleCount: number } | undefined
  totalCost: number
  hasPartialPrices: boolean
  scarabPriceMap: Map<string, number>
  scarabIconMap: Map<string, ScarabEntry['icon']>
  fmt: (chaos: number) => string
  showsPoe1PlanningFields: boolean
}) {
  const navigate = useNavigate()
  const diffChip = DIFFICULTY_CHIP[strategy.difficulty] ?? DIFFICULTY_CHIP.normal
  const rateColor = !strategyRate
    ? 'default'
    : strategyRate.chaosPerHour > 0
      ? 'success'
      : strategyRate.chaosPerHour < 0
        ? 'danger'
        : 'default'
  const isSubscribed = !!strategy.source_strategy_id
  const visibilityLabel = isSubscribed
    ? strategy.subscription_state === 'frozen'
      ? 'Frozen'
      : 'Live'
    : strategy.visibility === 'public'
      ? 'Public'
      : 'Private'
  const visibilityColor = isSubscribed
    ? strategy.subscription_state === 'frozen'
      ? 'warning'
      : 'success'
    : strategy.visibility === 'public'
      ? 'secondary'
      : 'default'
  const hasAlternativeScarabs = strategy.scarabs.some((scarab) => scarab.alternatives.length > 0)

  return (
    <Card
      className={cn('cursor-pointer', strategy.id === currentStrategyId && 'ring-primary ring-2')}
    >
      <Card.Content
        className="gap-0 p-0"
        onClick={(event) => {
          const target = event.target as HTMLElement
          if (target.closest('button, a, [role="button"]')) return
          navigate({
            to: '/dashboard/strategies/$strategyId',
            params: { strategyId: strategy.id },
          })
        }}
      >
        <div className="flex items-start gap-3 px-5 pt-5 pb-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-foreground font-semibold">{strategy.name}</h2>
              <Chip size="sm" variant="soft" color={isSubscribed ? 'warning' : 'accent'}>
                {isSubscribed ? 'Subscribed copy' : 'Owned'}
              </Chip>
              <Chip size="sm" variant="soft" color={toNativeChipColor(diffChip.color)}>
                {diffChip.label}
              </Chip>
              <Chip size="sm" variant="soft" color={toNativeChipColor(visibilityColor)}>
                {visibilityLabel}
              </Chip>
              {isSubscribed ? (
                <Chip size="sm" variant="soft">
                  {strategy.subscription_state === 'frozen' ? 'Updates paused' : 'Auto-updating'}
                </Chip>
              ) : null}
              {totalCost > 0 ? (
                <Chip size="sm" variant="soft">
                  ~= {fmt(totalCost)}/map
                  {hasAlternativeScarabs ? (
                    <span className="text-default-400 ml-1 text-xs">(primary)</span>
                  ) : null}
                  {hasPartialPrices ? (
                    <span className="text-default-400 ml-1 text-xs">(partial)</span>
                  ) : null}
                </Chip>
              ) : null}
              <Chip size="sm" variant="soft" color={rateColor}>
                {strategyRate ? `${fmt(strategyRate.chaosPerHour)}/hr` : 'No data'}
              </Chip>
            </div>
            {strategy.description ? (
              <p className="text-default-500 mt-1 text-sm leading-relaxed">
                {strategy.description}
              </p>
            ) : null}
            {isSubscribed && strategy.source_group_name ? (
              <p className="text-default-400 mt-2 text-xs">
                Publisher: {strategy.source_group_name}
                {strategy.subscription_state === 'frozen'
                  ? ' · This copy stays locked at the last synced version.'
                  : ' · Content follows the publisher while it remains public.'}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {myRole !== 'viewer' && activeGroupId ? (
              <Button
                isIconOnly
                size="sm"
                variant="tertiary"
                isPending={settingCurrent}
                className={strategy.id === currentStrategyId ? 'text-primary' : 'text-default-300'}
                aria-label={strategy.id === currentStrategyId ? 'Active strategy' : 'Set as active'}
                onPress={() => onSetCurrent(strategy.id)}
              >
                {({ isPending }) =>
                  isPending ? (
                    <Spinner color="current" size="sm" />
                  ) : (
                    <Star
                      size={16}
                      className={strategy.id === currentStrategyId ? 'fill-primary' : ''}
                    />
                  )
                }
              </Button>
            ) : null}
            <Link
              to="/dashboard/strategies/$strategyId"
              params={{ strategyId: strategy.id }}
              className="button button--sm button--tertiary"
            >
              Details
            </Link>
          </div>
        </div>

        <StrategyInfoSection
          atlasTreeUrl={showsPoe1PlanningFields ? strategy.atlas_tree_url : null}
          scarabs={showsPoe1PlanningFields ? strategy.scarabs : []}
          mapTradeLink={showsPoe1PlanningFields ? strategy.map_trade_link : null}
          mapRequirements={showsPoe1PlanningFields ? strategy.map_requirements : {}}
          scarabPriceMap={scarabPriceMap}
          scarabIconMap={scarabIconMap}
        />
      </Card.Content>
    </Card>
  )
}

function PublicStrategyCard({
  strategy,
  myRole,
  isOwned,
  onSubscribe,
  onUnsubscribe,
  subscribePending,
  unsubscribePending,
  scarabPriceMap,
  scarabIconMap,
  fmt,
  showsPoe1PlanningFields,
}: {
  strategy: PublicStrategy
  myRole: string | null
  isOwned: boolean
  onSubscribe: (strategyId: string) => void
  onUnsubscribe: (strategyId: string) => void
  subscribePending: boolean
  unsubscribePending: boolean
  scarabPriceMap: Map<string, number>
  scarabIconMap: Map<string, ScarabEntry['icon']>
  fmt: (chaos: number) => string
  showsPoe1PlanningFields: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const diffChip = DIFFICULTY_CHIP[strategy.difficulty] ?? DIFFICULTY_CHIP.normal
  const benchmarkColor =
    strategy.benchmark_chaos_per_hour == null
      ? 'default'
      : strategy.benchmark_chaos_per_hour > 0
        ? 'success'
        : strategy.benchmark_chaos_per_hour < 0
          ? 'danger'
          : 'default'
  const isSubscribed = !!strategy.live_subscription_id
  const reqChips = Object.entries(strategy.map_requirements ?? {}).filter(
    ([, value]) => value != null,
  )
  const hasExpandableDetails =
    !!strategy.description ||
    (showsPoe1PlanningFields && (!!strategy.map_trade_link || reqChips.length > 0))

  const toggle = () => {
    if (hasExpandableDetails) setExpanded((value) => !value)
  }

  return (
    <Card className="hover:bg-default-50 transition-colors">
      <Card.Content className="gap-0 p-0">
        <div
          role={hasExpandableDetails ? 'button' : undefined}
          tabIndex={hasExpandableDetails ? 0 : undefined}
          aria-expanded={hasExpandableDetails ? expanded : undefined}
          className={cn(
            'flex items-start gap-3 px-5 pt-5 pb-4',
            hasExpandableDetails && 'cursor-pointer',
          )}
          onClick={(event) => {
            const target = event.target as HTMLElement
            if (target.closest('button, a, [role="menuitem"]')) return
            toggle()
          }}
          onKeyDown={(event) => {
            if (!hasExpandableDetails) return
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              toggle()
            }
          }}
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-foreground font-semibold">{strategy.name}</h2>
              <Chip size="sm" variant="soft" color={toNativeChipColor(diffChip.color)}>
                {diffChip.label}
              </Chip>
              {isOwned ? (
                <Chip size="sm" variant="soft" color="accent">
                  Yours
                </Chip>
              ) : null}
              <Chip size="sm" variant="soft" color="warning">
                Locked after subscribe
              </Chip>
              <Chip size="sm" variant="soft" color="accent">
                Public
              </Chip>
              <Chip size="sm" variant="soft">
                {strategy.group_name}
              </Chip>
              <Chip size="sm" variant="soft" color={benchmarkColor}>
                {strategy.benchmark_chaos_per_hour == null
                  ? 'No benchmark'
                  : `${fmt(strategy.benchmark_chaos_per_hour)}/hr`}
              </Chip>
              {showsPoe1PlanningFields && strategy.map_cost != null ? (
                <Chip size="sm" variant="soft">
                  ~= {fmt(strategy.map_cost)}/map
                </Chip>
              ) : null}
              {isSubscribed ? (
                <Chip size="sm" variant="soft" color="success">
                  Subscribed
                </Chip>
              ) : null}
            </div>
            <p className="text-default-400 mt-2 text-xs">
              League: {strategy.group_league} · Benchmark samples:{' '}
              {strategy.benchmark_sample_count.toLocaleString()}
            </p>
            <p className="text-default-400 mt-1 text-xs">
              {isOwned
                ? 'This is how your public strategy appears to other groups in your league.'
                : 'Subscribing creates a local locked copy that can still be set active in your own group.'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isOwned ? (
              <Link
                to="/dashboard/strategies/$strategyId"
                params={{ strategyId: strategy.id }}
                className="button button--sm button--tertiary"
              >
                Open Strategy
              </Link>
            ) : isSubscribed ? (
              <Button
                size="sm"
                variant="danger-soft"
                isPending={unsubscribePending}
                onPress={() => onUnsubscribe(strategy.live_subscription_id!)}
              >
                {({ isPending }) => (
                  <>
                    {isPending ? <Spinner color="current" size="sm" /> : null}
                    Unsubscribe
                  </>
                )}
              </Button>
            ) : myRole !== 'viewer' ? (
              <Button
                size="sm"
                isPending={subscribePending}
                onPress={() => onSubscribe(strategy.id)}
              >
                {({ isPending }) => (
                  <>
                    {isPending ? <Spinner color="current" size="sm" /> : null}
                    Subscribe
                  </>
                )}
              </Button>
            ) : null}
            {hasExpandableDetails ? (
              <Button
                isIconOnly
                size="sm"
                variant="tertiary"
                aria-label={expanded ? 'Collapse strategy details' : 'Expand strategy details'}
                onPress={toggle}
              >
                <ChevronDown
                  size={18}
                  className={cn('text-default-400 transition-transform', expanded && 'rotate-180')}
                  aria-hidden
                />
              </Button>
            ) : null}
          </div>
        </div>

        <StrategyInfoSection
          atlasTreeUrl={showsPoe1PlanningFields ? strategy.atlas_tree_url : null}
          scarabs={showsPoe1PlanningFields ? strategy.scarabs : []}
          mapTradeLink={null}
          mapRequirements={{}}
          scarabPriceMap={scarabPriceMap}
          scarabIconMap={scarabIconMap}
        />

        {expanded ? (
          <>
            <Separator />
            {strategy.description ? (
              <div className="px-5 py-4">
                <p className="text-default-600 text-sm leading-relaxed">{strategy.description}</p>
              </div>
            ) : null}
            <StrategyInfoSection
              atlasTreeUrl={null}
              scarabs={[]}
              mapTradeLink={showsPoe1PlanningFields ? strategy.map_trade_link : null}
              mapRequirements={showsPoe1PlanningFields ? strategy.map_requirements : {}}
              scarabPriceMap={scarabPriceMap}
              scarabIconMap={scarabIconMap}
            />
          </>
        ) : null}
      </Card.Content>
    </Card>
  )
}

export function StrategiesPage() {
  const activeGroupId = useGroupStore((state) => state.activeGroupId)
  const { data: strategies, isLoading } = useStrategies(activeGroupId)
  const { data: publicStrategies, isLoading: publicLoading } = usePublicStrategies(activeGroupId)
  const { game, league: activeLeague, capabilities } = useActiveGroupContext()
  const myRole = useMyGroupRole(activeGroupId)
  const { mutateAsync: subscribeToStrategy, isPending: subscribePending } = useSubscribeToStrategy()
  const { mutate: deleteStrategy, isPending: unsubscribePending } = useDeleteStrategy()
  const currentStrategyId = useCurrentStrategyId(activeGroupId)
  const { mutate: setCurrentStrategy, isPending: settingCurrent } = useSetCurrentStrategy()
  const { data: strategyEconomy } = useStrategyHourlyEstimates(activeGroupId)
  const [createOpen, setCreateOpen] = useState(false)
  const { tab } = Route.useSearch()
  const mode = tab ?? 'own'
  const navigate = useNavigate()

  const setMode = (tab: Mode) => {
    navigate({
      to: '/dashboard/strategies',
      search: { tab },
      replace: true,
    })
  }

  const display = useCurrencyStore((state) => state.display)
  const { data: scarabData = [] } = useScarabData(activeLeague, game ?? 'poe1')
  const { data: ninjaData } = useNinjaPrices(activeLeague, game ?? 'poe1')
  const divinePrice = ninjaData?.divinePrice ?? 200

  const scarabPriceMap = useMemo(
    () => new Map(scarabData.map((scarab) => [scarab.name, scarab.chaosValue])),
    [scarabData],
  )
  const scarabIconMap = useMemo(
    () => new Map(scarabData.map((scarab) => [scarab.name, scarab.icon])),
    [scarabData],
  )
  const ownStrategies = useMemo(
    () =>
      [...(strategies ?? [])].sort((left, right) => {
        const leftSubscribed = left.source_strategy_id ? 1 : 0
        const rightSubscribed = right.source_strategy_id ? 1 : 0
        if (leftSubscribed !== rightSubscribed) return leftSubscribed - rightSubscribed
        return new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
      }),
    [strategies],
  )

  const fmt = (chaos: number): string => formatCurrencyAmount(chaos, display, divinePrice)
  const showsPoe1PlanningFields = !!capabilities?.supportsScarabStrategies

  const handleSubscribe = async (strategyId: string) => {
    if (!activeGroupId) return
    await subscribeToStrategy({
      groupId: activeGroupId,
      sourceStrategyId: strategyId,
    })
  }

  const handleUnsubscribe = (strategyId: string) => {
    if (!activeGroupId) return
    deleteStrategy({ id: strategyId, group_id: activeGroupId })
  }

  return (
    <DashboardPage>
      <DashboardPageHeader
        title="Strategies"
        eyebrow="Run planning"
        tone="accent"
        description={
          showsPoe1PlanningFields
            ? 'Coordinate your own plans or browse public strategies from other groups in your league.'
            : 'Coordinate shared plans, notes, and public strategy ideas for your current game and league.'
        }
        actions={
          <>
            <ToggleButtonGroup
              size="sm"
              selectionMode="single"
              disallowEmptySelection
              selectedKeys={new Set([mode])}
              onSelectionChange={(keys) => {
                const [nextMode] = Array.from(keys)
                if (nextMode === 'own' || nextMode === 'public') setMode(nextMode)
              }}
            >
              <ToggleButton id="own">Own</ToggleButton>
              <ToggleButton id="public">
                <ToggleButtonGroup.Separator />
                Public
              </ToggleButton>
            </ToggleButtonGroup>
            {activeGroupId && myRole !== 'viewer' ? (
              <Button size="sm" onPress={() => setCreateOpen(true)}>
                Create Strategy
              </Button>
            ) : null}
          </>
        }
      />

      <Card>
        <Card.Content className="gap-4 p-5 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1 space-y-2 md:pr-4">
            <p className="text-foreground text-sm font-medium">
              {mode === 'own' ? 'Own strategies' : 'Public strategy library'}
            </p>
            {mode === 'own' ? (
              <>
                <p className="text-default-500 text-sm leading-relaxed">
                  {showsPoe1PlanningFields
                    ? 'Your group can create strategies, set an active plan, and tag snapshots against it.'
                    : 'Your group can create strategies and keep shared notes for the current league.'}
                </p>
                <p className="text-default-500 text-sm leading-relaxed">
                  {showsPoe1PlanningFields
                    ? 'Subscribed strategies stay locked for content edits, but your group can still set them active for snapshot tracking.'
                    : 'PoE2 strategy pages currently keep the shared planning fields front and center while PoE1-only atlas and scarab setup stays hidden.'}
                </p>
              </>
            ) : (
              <>
                <p className="text-default-500 text-sm leading-relaxed">
                  Public strategies include your public entries plus other groups in your current
                  league, with shared strategy setup and benchmark data.
                </p>
                <p className="text-default-500 text-sm leading-relaxed">
                  Subscribe to bring one into your own strategy list as a locked copy that updates
                  while the publisher keeps it public.
                </p>
              </>
            )}
          </div>
          <div className="rounded-large border-primary/25 bg-primary/5 w-full border p-4 md:max-w-xs md:flex-none">
            <div className="flex items-center gap-2">
              <Star size={16} className="fill-primary text-primary" />
              <p className="text-foreground text-sm font-medium">Active strategy tracking</p>
            </div>
            <p className="text-default-500 mt-2 text-sm leading-relaxed">
              Use the star button to choose which strategy new snapshots should attach to. Public
              subscriptions can be active too, but their strategy content stays locked to the
              publisher.
            </p>
          </div>
        </Card.Content>
      </Card>

      {mode === 'own' ? (
        isLoading ? (
          <StrategyCardsSkeleton />
        ) : ownStrategies.length === 0 ? (
          <DashboardEmptyState icon={Target} tone="accent">
            No strategies yet. Create one or subscribe to a public strategy to get started.
          </DashboardEmptyState>
        ) : (
          <div className="flex flex-col gap-4">
            {ownStrategies.map((strategy) => {
              const scarabCost = strategy.scarabs.reduce((sum, scarab) => {
                const price = scarabPriceMap.get(scarab.name)
                return price != null ? sum + price * scarab.quantity : sum
              }, 0)
              const totalCost = showsPoe1PlanningFields ? scarabCost + (strategy.map_cost ?? 0) : 0
              const hasPartialPrices =
                showsPoe1PlanningFields &&
                strategy.scarabs.length > 0 &&
                strategy.scarabs.some((scarab) => !scarabPriceMap.has(scarab.name))

              return (
                <OwnedStrategyCard
                  key={strategy.id}
                  strategy={strategy}
                  currentStrategyId={currentStrategyId}
                  myRole={myRole}
                  activeGroupId={activeGroupId}
                  settingCurrent={settingCurrent}
                  onSetCurrent={(strategyId) =>
                    setCurrentStrategy({
                      groupId: activeGroupId!,
                      strategyId: strategyId === currentStrategyId ? null : strategyId,
                    })
                  }
                  strategyRate={strategyEconomy[strategy.id]}
                  totalCost={totalCost}
                  hasPartialPrices={hasPartialPrices}
                  scarabPriceMap={scarabPriceMap}
                  scarabIconMap={scarabIconMap}
                  fmt={fmt}
                  showsPoe1PlanningFields={showsPoe1PlanningFields}
                />
              )
            })}
          </div>
        )
      ) : publicLoading ? (
        <StrategyCardsSkeleton />
      ) : !publicStrategies?.length ? (
        <DashboardEmptyState icon={Globe} tone="accent">
          No public strategies found for the {activeLeague ?? 'current'} league yet.
        </DashboardEmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {publicStrategies.map((strategy) => (
            <PublicStrategyCard
              key={strategy.id}
              strategy={strategy}
              myRole={myRole}
              isOwned={strategy.group_id === activeGroupId}
              onSubscribe={handleSubscribe}
              onUnsubscribe={handleUnsubscribe}
              subscribePending={subscribePending}
              unsubscribePending={unsubscribePending}
              scarabPriceMap={scarabPriceMap}
              scarabIconMap={scarabIconMap}
              fmt={fmt}
              showsPoe1PlanningFields={showsPoe1PlanningFields}
            />
          ))}
        </div>
      )}

      <CreateStrategyModal isOpen={createOpen} onClose={() => setCreateOpen(false)} />
    </DashboardPage>
  )
}
