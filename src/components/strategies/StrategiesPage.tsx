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
import { type ThreadEntry, useThreadData } from '../../hooks/useThreadData'
import { useCurrencyStore } from '../../store/currency-store'
import { CreateStrategyModal } from './CreateStrategyModal'
import { DIFFICULTY_CHIP } from '../../lib/constants'
import { StrategyCardsSkeleton } from '../layout/Skeletons'
import { cn, formatCurrencyAmount } from '../../lib/utils'
import { DashboardEmptyState, DashboardPage, DashboardPageHeader } from '../ui/dashboard'
import { StrategyInfoSection } from './StrategyInfoSection'
import { StrategyMetadataBadges } from './StrategyMetadataBadges'
import { QueryFreshnessNotice, QueryStatePanel } from '../ui/QueryStatePanel'
import { ResponsiveFilter } from '../ui/ResponsiveFilter'
import {
  STRATEGY_STAGE_FILTER_OPTIONS,
  type StrategyContentStage,
} from '../../lib/public-strategy-content'
type Mode = 'own' | 'public'
type StageFilter = StrategyContentStage | 'all'
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
  threadPriceMap,
  threadIconMap,
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
  threadPriceMap: Map<string, number | null>
  threadIconMap: Map<string, ThreadEntry['icon']>
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
  const hasAlternativeThreads = strategy.threads.some((thread) => thread.alternatives.length > 0)

  return (
    <Card
      className={cn('cursor-pointer', strategy.id === currentStrategyId && 'ring-primary ring-2')}
    >
      <Card.Content
        className="gap-0 p-0"
        onClick={(event) => {
          const target = event.target as HTMLElement
          if (target.closest('button, a, summary, [role="button"]')) return
          navigate({
            to: '/dashboard/strategies/$strategyId',
            params: { strategyId: strategy.id },
          })
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-4">
          <div className="min-w-0 basis-full wrap-anywhere sm:flex-1">
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
                  {hasAlternativeThreads ? (
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
              <StrategyMetadataBadges
                metadata={strategy.content_metadata}
                includeVerified={false}
              />
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
          legacyScarabs={showsPoe1PlanningFields ? strategy.scarabs : []}
          atlasTreeUrl={showsPoe1PlanningFields ? strategy.atlas_tree_url : null}
          threads={showsPoe1PlanningFields ? strategy.threads : []}
          mapTradeLink={showsPoe1PlanningFields ? strategy.map_trade_link : null}
          mapRequirements={showsPoe1PlanningFields ? strategy.map_requirements : {}}
          threadPriceMap={threadPriceMap}
          threadIconMap={threadIconMap}
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
  threadPriceMap,
  threadIconMap,
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
  threadPriceMap: Map<string, number | null>
  threadIconMap: Map<string, ThreadEntry['icon']>
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
    <Card className="hover:bg-default-50 p-0 transition-colors">
      <Card.Content className="gap-0 p-0">
        <div className="flex flex-wrap items-start justify-between gap-3 p-4">
          <div className="min-w-0 basis-full wrap-anywhere sm:flex-1">
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
              <Chip size="sm" variant="soft" color={benchmarkColor}>
                {strategy.benchmark_chaos_per_hour == null
                  ? 'No benchmark'
                  : `${fmt(strategy.benchmark_chaos_per_hour)}/hr`}
              </Chip>
              {showsPoe1PlanningFields && strategy.map_cost != null ? (
                <Chip size="sm" variant="soft">
                  ~{fmt(strategy.map_cost)}/map
                </Chip>
              ) : null}
              <StrategyMetadataBadges
                metadata={strategy.content_metadata}
                includeVerified={false}
              />
              {isSubscribed ? (
                <Chip size="sm" variant="soft" color="success">
                  Subscribed
                </Chip>
              ) : null}
            </div>
            <p className="text-default-500 mt-2 text-xs">
              {strategy.group_name} · {strategy.group_league}
              {strategy.benchmark_sample_count > 0
                ? ` · ${strategy.benchmark_sample_count.toLocaleString()} benchmark ${strategy.benchmark_sample_count === 1 ? 'sample' : 'samples'}`
                : ''}
            </p>
          </div>
          <div className="flex max-w-full flex-wrap items-center gap-2">
            {!isOwned ? (
              <Link
                to="/dashboard/strategies/public/$strategyId"
                params={{ strategyId: strategy.id }}
                className="button button--sm button--tertiary"
              >
                View strategy
              </Link>
            ) : null}
            {isOwned ? (
              <Link
                to="/dashboard/strategies/$strategyId"
                params={{ strategyId: strategy.id }}
                className="button button--sm button--tertiary"
              >
                Open strategy
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
                aria-expanded={expanded}
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
          legacyScarabs={showsPoe1PlanningFields ? strategy.scarabs : []}
          atlasTreeUrl={showsPoe1PlanningFields ? strategy.atlas_tree_url : null}
          threads={showsPoe1PlanningFields ? strategy.threads : []}
          mapTradeLink={null}
          mapRequirements={{}}
          threadPriceMap={threadPriceMap}
          threadIconMap={threadIconMap}
        />

        {expanded ? (
          <>
            <Separator />
            {strategy.description ? (
              <div className="px-5 py-4">
                <p className="text-default-600 text-sm leading-relaxed wrap-anywhere whitespace-pre-wrap">{strategy.description}</p>
              </div>
            ) : null}
            <StrategyInfoSection
              atlasTreeUrl={null}
              threads={[]}
              mapTradeLink={showsPoe1PlanningFields ? strategy.map_trade_link : null}
              mapRequirements={showsPoe1PlanningFields ? strategy.map_requirements : {}}
              threadPriceMap={threadPriceMap}
              threadIconMap={threadIconMap}
            />
          </>
        ) : null}
      </Card.Content>
    </Card>
  )
}

export function StrategiesPage() {
  const activeGroupId = useGroupStore((state) => state.activeGroupId)
  const strategiesQuery = useStrategies(activeGroupId)
  const publicQuery = usePublicStrategies(activeGroupId)
  const { data: strategies } = strategiesQuery
  const { data: publicStrategies } = publicQuery
  const { game, league: activeLeague, capabilities } = useActiveGroupContext()
  const myRole = useMyGroupRole(activeGroupId)
  const { mutate: subscribeToStrategy, isPending: subscribePending, isError: subscribeFailed } = useSubscribeToStrategy()
  const { mutate: deleteStrategy, isPending: unsubscribePending, isError: unsubscribeFailed } = useDeleteStrategy()
  const currentStrategyId = useCurrentStrategyId(activeGroupId)
  const { mutate: setCurrentStrategy, isPending: settingCurrent } = useSetCurrentStrategy()
  const { data: strategyEconomy } = useStrategyHourlyEstimates(activeGroupId)
  const [createOpen, setCreateOpen] = useState(false)
  const [stageFilter, setStageFilter] = useState<StageFilter>('all')
  const { tab } = Route.useSearch()
  const mode = tab ?? 'own'
  const activeQuery = mode === 'own' ? strategiesQuery : publicQuery
  const hasResults = Boolean(activeQuery.data?.length)
  const navigate = useNavigate()

  const setMode = (tab: Mode) => {
    navigate({
      to: '/dashboard/strategies',
      search: { tab },
      replace: true,
    })
  }

  const display = useCurrencyStore((state) => state.display)
  const { data: threadData = [] } = useThreadData(activeLeague, game ?? 'poe1')
  const { data: ninjaData } = useNinjaPrices(activeLeague, game ?? 'poe1')
  const divinePrice = ninjaData?.divinePrice ?? null

  const threadPriceMap = useMemo(
    () => new Map(threadData.map((thread) => [thread.name, thread.chaosValue])),
    [threadData],
  )
  const threadIconMap = useMemo(
    () => new Map(threadData.map((thread) => [thread.name, thread.icon])),
    [threadData],
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
  const filteredPublicStrategies = useMemo(
    () =>
      stageFilter === 'all'
        ? (publicStrategies ?? [])
        : (publicStrategies ?? []).filter(
            (strategy) => strategy.content_metadata?.stage === stageFilter,
          ),
    [publicStrategies, stageFilter],
  )

  const fmt = (chaos: number): string => formatCurrencyAmount(chaos, divinePrice == null ? 'chaos' : display, divinePrice ?? 1)
  const showsPoe1PlanningFields = !!capabilities?.supportsMapInvestmentPlanning

  const handleSubscribe = (strategyId: string) => {
    if (!activeGroupId) return
    subscribeToStrategy({
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
        tone="accent"
        description="Plan runs with your group or browse strategies from your league."
        actions={
          <>
            <ToggleButtonGroup
              size="sm"
              aria-label="Strategy source"
              selectionMode="single"
              disallowEmptySelection
              selectedKeys={new Set([mode])}
              onSelectionChange={(keys) => {
                const [nextMode] = Array.from(keys)
                if (nextMode === 'own' || nextMode === 'public') setMode(nextMode)
              }}
            >
              <ToggleButton id="own">Your strategies</ToggleButton>
              <ToggleButton id="public">
                <ToggleButtonGroup.Separator />
                Public
              </ToggleButton>
            </ToggleButtonGroup>
            {activeGroupId && myRole !== 'viewer' ? (
              <Button size="sm" onPress={() => setCreateOpen(true)}>
                Create strategy
              </Button>
            ) : null}
          </>
        }
      />

      {mode === 'public' ? (
        <Card className="p-3 sm:p-4">
          <Card.Content className="gap-2">
            <ResponsiveFilter
              label="Strategy stage"
              options={STRATEGY_STAGE_FILTER_OPTIONS}
              value={stageFilter}
              onChange={setStageFilter}
            />
            <p className="text-default-500 text-sm">
              Subscriptions follow the original while it’s public.
            </p>
          </Card.Content>
        </Card>
      ) : showsPoe1PlanningFields ? (
        <p className="text-default-500 text-sm">
          Star a strategy to link new snapshots to it.
        </p>
      ) : null}

      {mode === 'public' && (subscribeFailed || unsubscribeFailed) ? (
        <p className="text-danger text-sm" role="alert">
          {subscribeFailed
            ? 'Could not subscribe to this strategy. Try again.'
            : 'Could not unsubscribe from this strategy. Try again.'}
        </p>
      ) : null}

      <QueryFreshnessNotice
        isRefreshing={activeQuery.isFetching && hasResults}
        refreshFailed={activeQuery.isError && hasResults}
        onRetry={activeQuery.refetch}
      />

      {activeQuery.isLoading ? (
        <StrategyCardsSkeleton />
      ) : activeQuery.isError && !hasResults ? (
        <QueryStatePanel kind="error" title="Could not load strategies" description="Try again to reload the strategy list." onRetry={activeQuery.refetch} />
      ) : mode === 'own' ? (
        ownStrategies.length === 0 ? (
          <DashboardEmptyState icon={Target} tone="accent">
            No strategies yet. Create one or subscribe to a public strategy to get started.
          </DashboardEmptyState>
        ) : (
          <div className="flex flex-col gap-4">
            {ownStrategies.map((strategy) => {
              const threadCost = strategy.threads.reduce((sum, thread) => {
                const price = threadPriceMap.get(thread.name)
                return price != null ? sum + price * thread.quantity : sum
              }, 0)
              const totalCost = showsPoe1PlanningFields ? threadCost + (strategy.map_cost ?? 0) : 0
              const hasPartialPrices =
                showsPoe1PlanningFields &&
                strategy.threads.length > 0 &&
                strategy.threads.some((thread) => threadPriceMap.get(thread.name) == null)

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
                  threadPriceMap={threadPriceMap}
                  threadIconMap={threadIconMap}
                  fmt={fmt}
                  showsPoe1PlanningFields={showsPoe1PlanningFields}
                />
              )
            })}
          </div>
        )
      ) : !publicStrategies?.length ? (
        <DashboardEmptyState icon={Globe} tone="accent">
          No public strategies found for the {activeLeague ?? 'current'} league yet.
        </DashboardEmptyState>
      ) : filteredPublicStrategies.length === 0 ? (
        <DashboardEmptyState icon={Globe} tone="accent">
          No public strategies matched this stage for the {activeLeague ?? 'current'} league.
        </DashboardEmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {filteredPublicStrategies.map((strategy) => (
            <PublicStrategyCard
              key={strategy.id}
              strategy={strategy}
              myRole={myRole}
              isOwned={strategy.group_id === activeGroupId}
              onSubscribe={handleSubscribe}
              onUnsubscribe={handleUnsubscribe}
              subscribePending={subscribePending}
              unsubscribePending={unsubscribePending}
              threadPriceMap={threadPriceMap}
              threadIconMap={threadIconMap}
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
