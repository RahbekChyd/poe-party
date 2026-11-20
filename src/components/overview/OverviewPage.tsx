import { comparablePricing } from '../../lib/snapshot-pricing'
import { useMemo, useState } from 'react'
import { Card } from '@heroui/react/card'
import { Button } from '@heroui/react/button'
import { Chip } from '@heroui/react/chip'
import { Skeleton } from '@heroui/react/skeleton'
import { useNinjaPrices } from '../../hooks/useNinjaPrices'
import {
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  Coins,
  Sword,
  Minus,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts'
import { Link } from '@tanstack/react-router'
import { useGroupStore } from '../../store/group-store'
import {
  useActiveGroupContext,
  useGroupMembers,
  useCurrentStrategyId,
  useIsSoloGroup,
} from '../../hooks/useGroups'
import { useLatestSnapshots, useGroupEconomy } from '../../hooks/useSnapshots'
import { useGearSuggestions } from '../../hooks/useGear'
import { useStrategies } from '../../hooks/useStrategies'
import { useGroupWealthHistory } from '../../hooks/useGroupWealthHistory'
import type { GroupWealthDataPoint } from '../../hooks/useGroupWealthHistory'
import { useStrategyHourlyEstimates } from '../../hooks/useStrategyEconomy'
import { useCurrentUser, useMyProfile } from '../../hooks/useCurrentUser'
import { useStashSnapshotFlow } from '../../hooks/useStashSnapshotFlow'
import { useSnapshotStore } from '../../store/snapshot-store'
import {
  calculateChaosPerHour,
  calculateTrendStats,
  formatCurrencyAmount,
  snapshotAge,
} from '../../lib/utils'
import { filterHistoryByRange, formatWealthAxisTick, type WealthHistoryRange } from '../../lib/wealth-history'
import { useCurrencyStore } from '../../store/currency-store'
import { STATUS_COLOR, DIFFICULTY_CHIP, IMPORTANCE_CHIP } from '../../lib/constants'
import { WealthHistoryRangeSelector } from '../economy/WealthHistoryRangeSelector'
import { DashboardPage, DashboardPageHeader } from '../ui/dashboard'
import { QueryStatePanel } from '../ui/QueryStatePanel'

export function OverviewPage() {
  const activeGroupId = useGroupStore((s) => s.activeGroupId)
  const isSolo = useIsSoloGroup(activeGroupId)
  const { game, league: activeLeague, capabilities } = useActiveGroupContext()
  const { data: members } = useGroupMembers(activeGroupId)
  const { data: snapshots, isLoading: snapsLoading } = useLatestSnapshots(activeGroupId)
  const { data: economy, isLoading: economyLoading, isError: economyError } = useGroupEconomy(activeGroupId)
  const { data: groupHistory, isPending: historyPending, isError: historyError } = useGroupWealthHistory(activeGroupId)
  const { data: gear, isLoading: gearLoading } = useGearSuggestions(activeGroupId)
  const { data: strategyList, isLoading: strategiesLoading, isError: strategiesError, refetch: retryStrategies } = useStrategies(activeGroupId)
  const { data: strategyEconomy } = useStrategyHourlyEstimates(activeGroupId)
  const { data: currentUser } = useCurrentUser()
  const { data: profile, isPending: profilePending, isError: profileError } = useMyProfile()
  const { triggerSnapshot, isBusy: openingSnapshot, modal: snapshotModal } = useStashSnapshotFlow()
  const snapshotRunning = useSnapshotStore(({ progress }) =>
    progress.phase === 'characters' || progress.phase === 'stash' || progress.phase === 'pricing',
  )
  const currentStrategyId = useCurrentStrategyId(activeGroupId)
  const [groupHistoryRange, setGroupHistoryRange] = useState<WealthHistoryRange>('7d')

  const { data: ninjaData } = useNinjaPrices(activeLeague, game ?? 'poe1')
  const divinePrice = ninjaData?.divinePrice ?? null
  const display = useCurrencyStore((s) => s.display)
  const isMarketOnly = !capabilities?.supportsGroupEconomy
  const supportsSnapshots = !!capabilities?.supportsStashSnapshots

  const fmt = (chaos: number): string => {
    return formatCurrencyAmount(chaos, display === 'divine' && divinePrice ? 'divine' : 'chaos', divinePrice ?? 1)
  }

  const fmtRate = (chaos: number): string => {
    if (display === 'divine' && divinePrice != null && divinePrice > 0) {
      return `${(chaos / divinePrice).toFixed(1)} div/hr`
    }
    return `${Math.round(chaos).toLocaleString()} chaos/hr`
  }

  const fmtDelta = (chaos: number): string => {
    if (chaos === 0) return fmt(0)
    return `${chaos > 0 ? '+' : '-'}${fmt(Math.abs(chaos))}`
  }

  const totalChaos = economy?.reduce((sum, m) => sum + m.total_chaos, 0) ?? 0
  const syncedCount = snapshots?.length ?? 0
  const visibleGroupHistory = useMemo(
    () => filterHistoryByRange(groupHistory ?? [], groupHistoryRange, (point) => point.created_at),
    [groupHistory, groupHistoryRange],
  )
  const valuationUnavailable = snapshots?.some((snapshot) => snapshot.pricing_summary?.status === 'unavailable') ?? false
  const valuationPartial = snapshots?.some((snapshot) => snapshot.pricing_summary?.status === 'partial') ?? false
  const groupChaosPerHour = valuationUnavailable || !comparablePricing(visibleGroupHistory) ? null : calculateChaosPerHour(
    visibleGroupHistory,
    (point) => point.created_at,
    (point) => point.total_wealth_chaos,
  )
  const groupRateColor =
    groupChaosPerHour == null
      ? 'text-default-400'
      : groupChaosPerHour > 0
        ? 'text-success'
        : groupChaosPerHour < 0
          ? 'text-danger'
          : 'text-default-400'
  const groupTrend = valuationUnavailable || !comparablePricing(visibleGroupHistory) ? null : calculateTrendStats(visibleGroupHistory, (point) => point.total_wealth_chaos)
  const groupTrendColor =
    groupTrend == null
      ? 'text-default-400'
      : groupTrend.delta > 0
        ? 'text-success'
        : groupTrend.delta < 0
          ? 'text-danger'
          : 'text-default-400'
  const groupTrendLabel = (() => {
    if (!groupTrend) return 'No trend'
    const percentLabel =
      groupTrend.percentChange == null
        ? null
        : `${groupTrend.percentChange > 0 ? '+' : ''}${groupTrend.percentChange.toFixed(1)}%`
    return percentLabel
      ? `${fmtDelta(groupTrend.delta)} · ${percentLabel}`
      : fmtDelta(groupTrend.delta)
  })()
  const GroupTrendIcon =
    groupTrend == null
      ? Minus
      : groupTrend.delta > 0
        ? ArrowUpRight
        : groupTrend.delta < 0
          ? ArrowDownRight
          : Minus

  const stalestMember = useMemo(() => {
    if (!members?.length) return null
    const snapByUser = new Map(snapshots?.map((s) => [s.user_id, s]) ?? [])
    // Sort members: no snapshot first, then oldest completed_at first
    const sorted = [...members].sort((a, b) => {
      const aSnap = snapByUser.get(a.user.id)
      const bSnap = snapByUser.get(b.user.id)
      if (!aSnap && !bSnap) return 0
      if (!aSnap) return -1
      if (!bSnap) return 1
      return (aSnap.completed_at ?? '').localeCompare(bSnap.completed_at ?? '')
    })
    const m = sorted[0]
    const snap = snapByUser.get(m.user.id)
    return {
      name: m.user.display_name ?? m.user.poe_account_name ?? 'Unknown',
      age: snapshotAge(snap?.completed_at ?? null),
    }
  }, [members, snapshots])

  const myGearCount = useMemo(() => {
    if (!gear || !currentUser) return 0
    return gear.filter((g) => g.target_user_id === currentUser.id).length
  }, [gear, currentUser])

  const sortedGear = useMemo(() => {
    if (!gear) return []
    const uid = currentUser?.id
    return [...gear].sort((a, b) => {
      const aForMe = a.target_user_id === uid ? 0 : 1
      const bForMe = b.target_user_id === uid ? 0 : 1
      if (aForMe !== bForMe) return aForMe - bForMe
      const importanceRank = { high: 0, medium: 1, low: 2 } as const
      const importanceDiff = importanceRank[a.importance] - importanceRank[b.importance]
      if (importanceDiff !== 0) return importanceDiff
      return a.created_at < b.created_at ? 1 : -1
    })
  }, [gear, currentUser?.id])

  const activeStrategy = strategyList?.find((strategy) => strategy.id === currentStrategyId)
  const libraryStrategies = strategyList?.filter((strategy) => strategy.id !== currentStrategyId) ?? []
  const latestResult = supportsSnapshots && activeStrategy
    ? groupHistory?.reduce<GroupWealthDataPoint | undefined>(
        (latest, point) => point.strategy_id === activeStrategy.id ? point : latest,
        undefined,
      )
    : undefined
  const resultPricing = latestResult?.pricing_summary
  const resultDivinePrice = resultPricing?.divine_price
  const resultValue = latestResult && formatCurrencyAmount(
    latestResult.total_wealth_chaos,
    display === 'divine' && resultDivinePrice ? 'divine' : 'chaos',
    resultDivinePrice ?? 1,
  )
  const canCapture = Boolean(
    supportsSnapshots && activeGroupId && activeLeague && profile?.poe_token_expires_at,
  )
  const resultDate = latestResult && new Date(latestResult.created_at).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
  const wealthValue = valuationUnavailable
    ? 'Pricing unavailable'
    : economy?.length
      ? fmt(totalChaos)
      : economyError ? 'Could not load value' : 'No valuation yet'
  const wealthLabel = valuationPartial && !valuationUnavailable ? 'Priced subtotal' : isSolo ? 'Stash value' : 'Group value'

  let captureMessage = 'The next stash snapshot will be linked to this strategy.'
  if (historyPending || profilePending) captureMessage = 'Checking linked snapshots…'
  else if (historyError) captureMessage = 'Could not load linked snapshots.'
  else if (profileError) captureMessage = 'Could not check account access for snapshots.'
  else if (!profile?.poe_token_expires_at) captureMessage = 'Connect your PoE account in Economy to capture a linked snapshot.'
  else if (!activeLeague) captureMessage = 'An active league is required to capture a linked snapshot.'

  return (
    <DashboardPage>
      <DashboardPageHeader title="Today" />
      {snapshotModal}
      <section aria-labelledby="today-strategy" className="border-divider bg-content1 rounded-xl border p-4 sm:p-5">
        <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div className="min-w-0 space-y-2">
            <h2 id="today-strategy" className="text-foreground text-lg font-semibold">Active strategy</h2>
            {strategiesLoading ? (
              <p className="text-default-500 text-sm" role="status">Loading strategies…</p>
            ) : activeStrategy ? (
              <>
                <Link
                  to="/dashboard/strategies/$strategyId"
                  params={{ strategyId: activeStrategy.id }}
                  className="text-foreground hover:text-brand-readable text-2xl font-semibold tracking-tight wrap-anywhere"
                >
                  {activeStrategy.name}
                </Link>
                {supportsSnapshots && latestResult ? (
                  <div className="text-default-500 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                    <span>{resultPricing?.status === 'partial' ? 'Latest linked priced subtotal' : 'Latest linked snapshot'}</span>
                    <strong className="text-foreground tabular-nums">
                      {resultPricing?.status === 'unavailable' ? 'Pricing unavailable' : resultValue}
                    </strong>
                    <time dateTime={latestResult.created_at}>{resultDate}</time>
                    {resultPricing?.status === 'partial' && (
                      <span>{resultPricing.unpriced_item_count.toLocaleString()} unpriced items</span>
                    )}
                  </div>
                ) : supportsSnapshots ? (
                  <p className="text-default-500 text-sm">{captureMessage}</p>
                ) : null}
              </>
            ) : (
              <p className="text-default-500 text-sm">
                {strategiesError ? 'Could not load the active strategy.' : 'Choose a strategy to use for your next run.'}
              </p>
            )}
          </div>
          {!strategiesLoading && (activeStrategy ? (
            supportsSnapshots && !latestResult && canCapture && !historyPending && !historyError ? (
              <Button
                className="justify-self-start md:justify-self-end"
                isPending={openingSnapshot}
                isDisabled={snapshotRunning}
                onPress={() => {
                  if (activeGroupId && activeLeague) void triggerSnapshot(activeGroupId, activeLeague)
                }}
              >
                {openingSnapshot || snapshotRunning ? 'Taking snapshot…' : 'Snapshot stash'}
              </Button>
            ) : (
              <Link
                to="/dashboard/strategies/$strategyId"
                params={{ strategyId: activeStrategy.id }}
                hash={latestResult ? 'strategy-results' : undefined}
                className="button button--primary justify-self-start md:justify-self-end"
              >
                {latestResult ? 'View strategy results' : 'Open strategy'}
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            )
          ) : (
            <Link to="/dashboard/strategies" className="button button--primary justify-self-start md:justify-self-end">
              Browse strategies <ArrowRight size={16} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>

      {!isMarketOnly && valuationPartial && (
        <p role="status" className="text-warning text-sm">Partial pricing: some items have no price estimate.</p>
      )}
      <dl className="border-divider grid grid-cols-2 gap-4 border-b pb-5 md:grid-cols-4">
        <div className="min-w-0">
          <dt className="text-default-500 text-sm">{isMarketOnly ? 'Market' : wealthLabel}</dt>
          <dd className="mt-1">
            {isMarketOnly ? (
              <Link to="/dashboard/economy" className="text-foreground hover:text-brand-readable text-base font-semibold">
                Market overview
              </Link>
            ) : snapsLoading || economyLoading ? (
              <Skeleton className="h-6 w-24 rounded-md" />
            ) : (
              <Link
                to="/dashboard/economy"
                className="text-foreground hover:text-brand-readable text-base font-semibold wrap-anywhere tabular-nums"
              >
                {wealthValue}
              </Link>
            )}
          </dd>
        </div>

        {!isSolo && (
          <div className="min-w-0">
            <dt className="text-default-500 text-sm">{isMarketOnly ? 'Party members' : 'Synced members'}</dt>
            <dd className="text-foreground mt-1 text-base font-semibold tabular-nums">
              {!isMarketOnly && snapsLoading ? (
                <Skeleton className="h-6 w-16 rounded-md" />
              ) : (
                isMarketOnly ? (members?.length ?? '—') : syncedCount + ' / ' + (members?.length ?? '—')
              )}
            </dd>
          </div>
        )}

        <div className="min-w-0">
          <dt className="text-default-500 text-sm">Gear for me</dt>
          <dd className="mt-1">
            {gearLoading ? (
              <Skeleton className="h-6 w-14 rounded-md" />
            ) : (
              <Link to="/dashboard/gear" className="text-foreground hover:text-brand-readable text-base font-semibold tabular-nums">
                {myGearCount}
              </Link>
            )}
          </dd>
        </div>

        {!isSolo && !isMarketOnly && (
          <div className="min-w-0">
            <dt className="text-default-500 text-sm" title="The member who has gone the longest without taking a snapshot">Oldest snapshot</dt>
            <dd className="mt-1">
              {snapsLoading ? (
                <Skeleton className="h-6 w-20 rounded-md" />
              ) : stalestMember ? (
                <>
                  <p className="text-foreground text-base font-semibold">{stalestMember.age.label}</p>
                  <p className="text-default-500 text-xs wrap-anywhere">{stalestMember.name}</p>
                </>
              ) : (
                <p className="text-default-500 text-sm">No snapshots</p>
              )}
            </dd>
          </div>
        )}
      </dl>

      {/* Group Wealth History */}
      {!isMarketOnly && groupHistory && groupHistory.length > 0 && (
        <Card className="p-0">
          <Card.Header className="px-4 pt-4 pb-0">
            <div className="flex w-full flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h2 className="text-foreground text-sm font-semibold">
                  {isSolo ? 'Wealth history' : 'Group wealth history'}
                </h2>
                <WealthHistoryRangeSelector
                  value={groupHistoryRange}
                  onChange={setGroupHistoryRange}
                />
              </div>
              <div className="flex items-center justify-center gap-3">
                <p className={`text-base font-semibold ${groupRateColor}`}>
                  {groupChaosPerHour == null ? 'Rate unavailable' : fmtRate(groupChaosPerHour)}
                </p>
                <div
                  className={`border-divider/60 flex items-center gap-1.5 border-l pl-3 text-xs ${groupTrendColor}`}
                >
                  <GroupTrendIcon size={13} aria-hidden="true" />
                  <span>{groupTrendLabel}</span>
                </div>
              </div>
            </div>
          </Card.Header>
          <Card.Content className="px-2 pt-2 pb-3">
            <p className="text-default-500 px-2 text-xs">Stash value (chaos)</p>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart
                title="Stash value in Chaos Orbs"
                desc="Use the left and right arrow keys to read snapshot values."
                data={visibleGroupHistory}
                margin={{ top: 4, right: 12, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="overviewWealthGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--wealth-series)" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="var(--wealth-series)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--separator)" />
                <XAxis
                  dataKey="created_at"
                  tickFormatter={(v: string) => {
                    const d = new Date(v)
                    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                  }}
                  tick={{ fontSize: 11, fill: 'var(--muted-text)' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={formatWealthAxisTick}
                  tick={{ fontSize: 11, fill: 'var(--muted-text)' }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                />
                <RechartsTooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const point = payload[0].payload as GroupWealthDataPoint
                    const label = new Date(point.created_at).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                    return (
                      <div role="status" className="bg-overlay border-divider rounded-lg border px-3 py-2 text-xs shadow-lg">
                        <p className="text-default-400 mb-1">{label}</p>
                        <p className="text-foreground font-semibold">
                          {point.pricing_summary?.status === 'unavailable'
                            ? 'Pricing unavailable'
                            : point.pricing_summary?.status === 'partial'
                              ? `Priced subtotal: ${fmt(point.total_wealth_chaos)}`
                              : fmt(point.total_wealth_chaos)}
                        </p>
                        {!isSolo && (
                          <>
                            <p className="text-default-400 mt-0.5">
                              {point.member_count} member{point.member_count !== 1 ? 's' : ''}
                            </p>
                            {point.member_wealth_breakdown.map((m) => (
                              <p key={m.user_id} className="text-default-500 text-xs">
                                {m.display_name}: {fmt(m.total_chaos)}
                              </p>
                            ))}
                          </>
                        )}
                      </div>
                    )
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="total_wealth_chaos"
                  name="Stash value"
                  stroke="var(--wealth-series)"
                  fill="url(#overviewWealthGrad)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: 'var(--wealth-series)' }}
                  activeDot={{ r: 6, fill: 'var(--wealth-series)', stroke: 'var(--foreground)', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </Card.Content>
        </Card>
      )}

      <div className="@container">
        <div className="grid items-start gap-4 @min-[52rem]:grid-cols-2">
          <Card className="min-w-0 gap-0 p-0">
            <Card.Header className="border-divider flex-row flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
              <h2 className="text-foreground text-sm font-semibold">Strategy library</h2>
              <Link to="/dashboard/strategies" className="button button--sm button--tertiary">
                View strategies
              </Link>
            </Card.Header>
            {strategiesLoading ? (
              <div className="space-y-3 p-4" role="status" aria-label="Loading strategies">
                <Skeleton className="h-8 w-full rounded-md" />
                <Skeleton className="h-8 w-full rounded-md" />
              </div>
            ) : strategiesError && !strategyList ? (
              <QueryStatePanel kind="error" title="Couldn’t load strategies" description="Try again to view your strategies." onRetry={retryStrategies} />
            ) : libraryStrategies.length > 0 ? (
              <ul className="divide-divider divide-y">
                {libraryStrategies.map((strategy) => {
                  const diff = DIFFICULTY_CHIP[strategy.difficulty] ?? DIFFICULTY_CHIP.normal
                  const strategyScope = strategy.source_strategy_id
                    ? 'Subscribed'
                    : strategy.visibility === 'public'
                      ? 'Public'
                      : 'Private'
                  const rateEstimate = strategyEconomy[strategy.id]
                  const rateColor = !rateEstimate
                    ? 'text-default-500'
                    : rateEstimate.chaosPerHour > 0
                      ? 'text-success'
                      : rateEstimate.chaosPerHour < 0
                        ? 'text-danger'
                        : 'text-default-500'

                  return (
                    <li key={strategy.id}>
                      <Link
                        to="/dashboard/strategies/$strategyId"
                        params={{ strategyId: strategy.id }}
                        className="hover:bg-default-100/50 focus-visible:outline-primary flex min-w-0 items-center gap-3 px-4 py-3 transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start gap-2">
                            <p className="text-foreground text-sm font-medium wrap-anywhere">{strategy.name}</p>
                          </div>
                          <div className="text-default-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                            <span>{strategyScope}</span>
                            <Chip size="sm" variant="soft" color={diff.color}>{diff.label}</Chip>
                            {strategy.map_cost != null && strategy.map_cost > 0 && (
                              <span className="inline-flex items-center gap-1 tabular-nums">
                                <Coins size={11} aria-hidden="true" /> ~{fmt(strategy.map_cost)}/map
                              </span>
                            )}
                            <span className={rateColor}>{rateEstimate ? fmtRate(rateEstimate.chaosPerHour) : 'No estimate'}</span>
                          </div>
                        </div>
                        <ArrowRight size={16} className="text-default-400 shrink-0" aria-hidden="true" />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-default-500 px-4 py-3 text-sm">{activeStrategy ? 'No other strategies yet.' : 'No strategies yet.'}</p>
            )}
          </Card>

          <Card className="min-w-0 gap-0 p-0">
            <Card.Header className="border-divider flex-row flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
              <h2 className="text-foreground text-sm font-semibold">Gear suggestions</h2>
              <Link to="/dashboard/gear" className="button button--sm button--tertiary">
                View suggestions
              </Link>
            </Card.Header>
            {gearLoading ? (
              <div className="space-y-3 p-4" role="status" aria-label="Loading gear suggestions">
                <Skeleton className="h-8 w-full rounded-md" />
                <Skeleton className="h-8 w-full rounded-md" />
              </div>
            ) : sortedGear.length > 0 ? (
              <ul className="divide-divider divide-y">
                {sortedGear.slice(0, 10).map((suggestion) => {
                  const importance = IMPORTANCE_CHIP[suggestion.importance] ?? IMPORTANCE_CHIP.medium

                  return (
                    <li key={suggestion.id} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
                      {suggestion.item_data?.icon_url ? (
                        <img src={suggestion.item_data.icon_url} alt="" className="size-8 shrink-0 object-contain" />
                      ) : (
                        <Sword size={16} className="text-default-400 shrink-0" aria-hidden="true" />
                      )}
                      <div className="min-w-0 flex-1">
                        <Link
                          to="/dashboard/gear/$suggestionId"
                          params={{ suggestionId: suggestion.id }}
                          className="text-foreground focus-visible:outline-primary hover:text-brand-readable rounded-sm text-sm font-medium wrap-anywhere hover:underline focus-visible:outline-2"
                        >
                          {suggestion.item_name ?? 'Unnamed item'}
                        </Link>
                        <p className="text-default-500 mt-0.5 text-xs wrap-anywhere">
                          For {suggestion.target_user.display_name ?? suggestion.target_user.poe_account_name}
                          {' · By '}
                          {suggestion.suggester.display_name ?? suggestion.suggester.poe_account_name}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Chip size="sm" variant="soft" color={importance.color}>{importance.label}</Chip>
                        <Chip size="sm" variant="soft" color={STATUS_COLOR[suggestion.status]} className="capitalize">
                          {suggestion.status}
                        </Chip>
                        {suggestion.item_trade_link && (
                          <a href={suggestion.item_trade_link} target="_blank" rel="noopener noreferrer" className="button button--sm button--tertiary">
                            Trade link
                          </a>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-default-500 px-4 py-3 text-sm">No gear suggestions yet.</p>
            )}
          </Card>
        </div>
      </div>
    </DashboardPage>
  )
}
