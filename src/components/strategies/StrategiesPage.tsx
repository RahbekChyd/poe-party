import { useMemo, useState } from 'react'
import { Button } from '@heroui/react/button'
import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { Separator } from '@heroui/react/separator'
import { Spinner } from '@heroui/react/spinner'
import { ToggleButton } from '@heroui/react/toggle-button'
import { ToggleButtonGroup } from '@heroui/react/toggle-button-group'
import { ChevronDown, Globe, Target } from 'lucide-react'
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
import { StrategySearch } from './StrategySearch'
import { QueryFreshnessNotice, QueryStatePanel } from '../ui/QueryStatePanel'
import { ResponsiveFilter } from '../ui/ResponsiveFilter'
import {
  STRATEGY_STAGE_FILTER_OPTIONS,
  type StrategyContentStage,
} from '../../lib/public-strategy-content'
import './strategy-library.css'

type Mode = 'own' | 'public'
type StageFilter = StrategyContentStage | 'all'
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
  const diffChip = DIFFICULTY_CHIP[strategy.difficulty] ?? DIFFICULTY_CHIP.normal
  const rateColor = !strategyRate
    ? 'default'
    : strategyRate.chaosPerHour > 0
      ? 'success'
      : strategyRate.chaosPerHour < 0
        ? 'danger'
        : 'default'
  const isSubscribed = !!strategy.source_strategy_id
  const isActive = strategy.id === currentStrategyId
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
    : 'default'
  const hasAlternativeThreads = strategy.threads.some((thread) => thread.alternatives.length > 0)

  return (
    <Card className={cn('p-0', isActive && 'strategy-active-stop')}>
      <Card.Content className="gap-0 p-0">
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-4">
          <div className="min-w-0 basis-full wrap-anywhere sm:flex-1">
            <h3 className="strategy-name text-foreground mb-2 font-semibold wrap-anywhere">
              <Link
                to="/dashboard/strategies/$strategyId"
                params={{ strategyId: strategy.id }}
                className="hover:text-brand-readable hover:underline underline-offset-4"
              >
                {strategy.name}
              </Link>
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              {isSubscribed && <span className="text-default-500 text-sm">Subscribed copy</span>}
              <Chip size="sm" variant="soft">
                {diffChip.label}
              </Chip>
              <Chip size="sm" variant="soft" color={visibilityColor}>
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
                    <span className="text-warning ml-1 text-xs">(partial)</span>
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
          <div className="flex flex-wrap items-center gap-1">
            {(myRole === 'admin' || myRole === 'editor') && activeGroupId ? (
              <Button
                size="sm"
                variant="tertiary"
                className="min-h-11"
                isPending={settingCurrent}
                onPress={() => onSetCurrent(strategy.id)}
              >
                {isActive ? 'Clear active strategy' : 'Set active'}
              </Button>
            ) : null}
            <Link
              to="/dashboard/strategies/$strategyId"
              params={{ strategyId: strategy.id }}
              className={cn('button button--sm min-h-11', isActive ? 'button--primary' : 'button--tertiary')}
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
    <Card className="p-0">
      <Card.Content className="gap-0 p-0">
        <div className="flex flex-wrap items-start justify-between gap-3 p-4">
          <div className="min-w-0 basis-full wrap-anywhere sm:flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-foreground font-semibold">{strategy.name}</h3>
              <Chip size="sm" variant="soft">
                {diffChip.label}
              </Chip>
              {isOwned ? (
                <Chip size="sm" variant="soft">
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
  const { mutate: setCurrentStrategy, isPending: settingCurrent, isError: setCurrentFailed } = useSetCurrentStrategy()
  const { data: strategyEconomy } = useStrategyHourlyEstimates(activeGroupId)
  const [createOpen, setCreateOpen] = useState(false)
  const [stageFilter, setStageFilter] = useState<StageFilter>('all')
  const [librarySearch, setLibrarySearch] = useState('')
  const [publicSearch, setPublicSearch] = useState('')
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
  const activeStrategy = ownStrategies.find((strategy) => strategy.id === currentStrategyId)
  const libraryStrategies = ownStrategies.filter((strategy) => strategy.id !== currentStrategyId)
  const libraryTerm = librarySearch.trim().toLowerCase()
  const publicTerm = publicSearch.trim().toLowerCase()
  const filteredLibrary = libraryStrategies.filter((strategy) => strategy.name.toLowerCase().includes(libraryTerm))
  const filteredPublicStrategies = useMemo(
    () => (publicStrategies ?? []).filter((strategy) =>
      (stageFilter === 'all' || strategy.content_metadata?.stage === stageFilter) &&
      strategy.name.toLowerCase().includes(publicTerm),
    ),
    [publicStrategies, publicTerm, stageFilter],
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

  const renderOwnedStrategy = (strategy: Strategy) => {
    const threadCost = showsPoe1PlanningFields
      ? strategy.threads.reduce((sum, thread) => sum + (threadPriceMap.get(thread.name) ?? 0) * thread.quantity, 0)
      : 0
    return (
      <OwnedStrategyCard
        key={strategy.id}
        strategy={strategy}
        currentStrategyId={currentStrategyId}
        myRole={myRole}
        activeGroupId={activeGroupId}
        settingCurrent={settingCurrent}
        onSetCurrent={(strategyId) => {
          if (!activeGroupId) return
          setCurrentStrategy({
            groupId: activeGroupId,
            strategyId: strategyId === currentStrategyId ? null : strategyId,
          })
        }}
        strategyRate={strategyEconomy[strategy.id]}
        totalCost={showsPoe1PlanningFields ? threadCost + (strategy.map_cost ?? 0) : 0}
        hasPartialPrices={showsPoe1PlanningFields && strategy.threads.some((thread) => threadPriceMap.get(thread.name) == null)}
        threadPriceMap={threadPriceMap}
        threadIconMap={threadIconMap}
        fmt={fmt}
        showsPoe1PlanningFields={showsPoe1PlanningFields}
      />
    )
  }

  const freshness = (
    <QueryFreshnessNotice
      isRefreshing={activeQuery.isFetching && hasResults}
      refreshFailed={activeQuery.isError && hasResults}
      onRetry={activeQuery.refetch}
    />
  )
  const listState = activeQuery.isLoading ? (
    <StrategyCardsSkeleton />
  ) : activeQuery.isError && !hasResults ? (
    <QueryStatePanel kind="error" title="Could not load strategies" description="Try again to reload the strategy list." onRetry={activeQuery.refetch} />
  ) : null

  return (
    <DashboardPage>
      <DashboardPageHeader
        title="Strategies"
        description="Plan runs with your group or browse strategies from your league."
        actions={(
          <ToggleButtonGroup
            size="sm"
            aria-label="Strategy source"
            className="[&_button]:min-h-11"
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
        )}
      />

      {mode === 'own' ? (
        <>
          {setCurrentFailed ? (
            <p role="alert" className="text-danger text-sm">Could not change the active strategy. Try again.</p>
          ) : null}
          {ownStrategies.length > 0 ? (
            <section aria-labelledby="active-strategy-heading" className="space-y-3">
              <h2 id="active-strategy-heading" className="strategy-active-heading text-foreground">Active strategy</h2>
              {activeStrategy ? renderOwnedStrategy(activeStrategy) : (
                <p className="text-default-500 text-sm">Choose a strategy from your library to use for your next run.</p>
              )}
              {capabilities?.supportsStashSnapshots ? (
                <p className="text-default-500 text-sm">New stash snapshots are linked to the active strategy.</p>
              ) : null}
            </section>
          ) : null}
          <section aria-labelledby="strategy-library-heading" className="flex min-w-0 flex-col gap-3">
            <header className="strategy-library-toolbar">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                <h2 id="strategy-library-heading" className="strategy-library-heading text-foreground">Strategy library</h2>
                {activeGroupId && myRole !== 'viewer' ? (
                  <Button className="min-h-11" onPress={() => setCreateOpen(true)}>Create strategy</Button>
                ) : null}
              </div>
              {libraryStrategies.length > 0 ? <StrategySearch value={librarySearch} onChange={setLibrarySearch} /> : null}
            </header>
            {freshness}
            {listState ?? (ownStrategies.length === 0 ? (
              <DashboardEmptyState icon={Target} tone="arcane">
                No strategies yet. Create one or subscribe to a public strategy to get started.
              </DashboardEmptyState>
            ) : libraryStrategies.length === 0 ? (
              <p className="text-default-500 text-sm">No other strategies yet.</p>
            ) : filteredLibrary.length === 0 ? (
              <p className="text-default-500 text-sm" role="status">No strategies match this name.</p>
            ) : (
              <div className="flex flex-col gap-3">{filteredLibrary.map(renderOwnedStrategy)}</div>
            ))}
          </section>
        </>
      ) : (
        <section aria-labelledby="public-strategies-heading" className="flex min-w-0 flex-col gap-3">
          <header className="strategy-library-toolbar">
            <h2 id="public-strategies-heading" className="strategy-library-heading text-foreground">Public strategies</h2>
            <StrategySearch value={publicSearch} onChange={setPublicSearch} />
            <ResponsiveFilter
              label="Strategy stage"
              options={STRATEGY_STAGE_FILTER_OPTIONS}
              value={stageFilter}
              onChange={setStageFilter}
            />
            <p className="text-default-500 text-sm">Subscriptions follow the original while it’s public.</p>
          </header>
          {subscribeFailed || unsubscribeFailed ? (
            <p className="text-danger text-sm" role="alert">
              {subscribeFailed
                ? 'Could not subscribe to this strategy. Try again.'
                : 'Could not unsubscribe from this strategy. Try again.'}
            </p>
          ) : null}
          {freshness}
          {listState ?? (!publicStrategies?.length ? (
            <DashboardEmptyState icon={Globe} tone="arcane">
              No public strategies found for the {activeLeague ?? 'current'} league yet.
            </DashboardEmptyState>
          ) : filteredPublicStrategies.length === 0 ? (
            <DashboardEmptyState icon={Globe} tone="arcane">
              {publicTerm
                ? 'No public strategies match this search and stage.'
                : `No public strategies matched this stage for the ${activeLeague ?? 'current'} league.`}
            </DashboardEmptyState>
          ) : filteredPublicStrategies.map((strategy) => (
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
          )))}
        </section>
      )}

      <CreateStrategyModal isOpen={createOpen} onClose={() => setCreateOpen(false)} />
    </DashboardPage>
  )
}
