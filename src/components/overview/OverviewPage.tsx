import { comparablePricing } from '../../lib/snapshot-pricing'
import { useMemo, useState } from 'react'
import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { Skeleton } from '@heroui/react/skeleton'
import { useNinjaPrices } from '../../hooks/useNinjaPrices'
import {
  TrendingUp,
  Users,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  Star,
  Coins,
  Sword,
  Clock,
  Info,
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
import { useCurrentUser } from '../../hooks/useCurrentUser'
import {
  calculateChaosPerHour,
  calculateTrendStats,
  formatCurrencyAmount,
  snapshotAge,
} from '../../lib/utils'
import { filterHistoryByRange, type WealthHistoryRange } from '../../lib/wealth-history'
import { useCurrencyStore } from '../../store/currency-store'
import { STATUS_COLOR, DIFFICULTY_CHIP, IMPORTANCE_CHIP } from '../../lib/constants'
import { WealthHistoryRangeSelector } from '../economy/WealthHistoryRangeSelector'
import { IconTooltip } from '../ui/heroui-native'
import { DashboardPage, DashboardPageHeader } from '../ui/dashboard'
import { QueryStatePanel } from '../ui/QueryStatePanel'
export function OverviewPage() {
  const activeGroupId = useGroupStore((s) => s.activeGroupId)
  const isSolo = useIsSoloGroup(activeGroupId)
  const { game, league: activeLeague, capabilities } = useActiveGroupContext()
  const { data: members } = useGroupMembers(activeGroupId)
  const { data: snapshots, isLoading: snapsLoading } = useLatestSnapshots(activeGroupId)
  const { data: economy } = useGroupEconomy(activeGroupId)
  const { data: groupHistory } = useGroupWealthHistory(activeGroupId)
  const { data: gear, isLoading: gearLoading } = useGearSuggestions(activeGroupId)
  const { data: strategyList, isLoading: strategiesLoading, isError: strategiesError, refetch: retryStrategies } = useStrategies(activeGroupId)
  const { data: strategyEconomy } = useStrategyHourlyEstimates(activeGroupId)
  const { data: currentUser } = useCurrentUser()
  const currentStrategyId = useCurrentStrategyId(activeGroupId)
  const [groupHistoryRange, setGroupHistoryRange] = useState<WealthHistoryRange>('7d')

  const { data: ninjaData } = useNinjaPrices(activeLeague, game ?? 'poe1')
  const divinePrice = ninjaData?.divinePrice ?? null
  const display = useCurrencyStore((s) => s.display)
  const isMarketOnly = !capabilities?.supportsGroupEconomy

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

  const sortedStrategies = useMemo(() => {
    if (!strategyList) return []
    return [...strategyList].sort((a, b) => {
      if (a.id === currentStrategyId) return -1
      if (b.id === currentStrategyId) return 1
      return 0
    })
  }, [strategyList, currentStrategyId])

  return (
    <DashboardPage>
      <DashboardPageHeader
        title="Overview"
        eyebrow={isSolo ? 'Solo workspace' : 'Group workspace'}
        tone="accent"
        description={
          isSolo
            ? 'Your economy, strategies, and suggested upgrades.'
            : 'Party economy, strategies, and suggested upgrades.'
        }
      />

      {!isMarketOnly && valuationPartial && (
        <p role="status" className="text-warning text-sm">Partial pricing: some items have no price estimate.</p>
      )}
      <div className="@container">
        <div className="grid grid-cols-2 gap-3 @min-[52rem]:grid-cols-4">
          <Link
            to="/dashboard/economy"
            className="focus-visible:outline-primary block min-w-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <Card className="hover:bg-default-50 h-full p-0 transition-colors">
              <Card.Content className="flex h-full flex-col items-start gap-2 p-3 @min-[35rem]:flex-row @min-[35rem]:items-center @min-[35rem]:gap-3 @min-[35rem]:p-4">
                <div className="bg-success/15 flex size-8 shrink-0 items-center justify-center rounded-lg">
                  <TrendingUp size={18} className="text-success" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-default-400 text-xs tracking-wider uppercase">
                    {isMarketOnly
                      ? 'Market Overview'
                      : valuationPartial
                        ? 'Priced subtotal'
                        : isSolo
                          ? 'Your Wealth'
                          : 'Group Value'}
                  </p>
                  {snapsLoading ? (
                    <Skeleton className="mt-1 h-7 w-24 rounded-md" />
                  ) : (
                    <p className="text-foreground text-2xl font-bold wrap-anywhere">
                      {isMarketOnly
                        ? 'Live'
                        : valuationUnavailable
                          ? 'Pricing unavailable'
                          : fmt(totalChaos)}
                    </p>
                  )}
                </div>
              </Card.Content>
            </Card>
          </Link>

          {!isSolo && (
            <Card className="h-full min-w-0 p-0">
              <Card.Content className="flex h-full flex-col items-start gap-2 p-3 @min-[35rem]:flex-row @min-[35rem]:items-center @min-[35rem]:gap-3 @min-[35rem]:p-4">
                <div className="bg-primary/15 flex size-8 shrink-0 items-center justify-center rounded-lg">
                  <Users size={18} className="text-primary" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-default-400 text-xs tracking-wider uppercase">
                    {isMarketOnly ? 'Party members' : 'Synced members'}
                  </p>
                  {!isMarketOnly && snapsLoading ? (
                    <Skeleton className="mt-1 h-7 w-16 rounded-md" />
                  ) : (
                    <p className="text-foreground text-2xl font-bold">
                      {isMarketOnly ? (members?.length ?? '…') : syncedCount}
                      {!isMarketOnly && (
                        <span className="text-default-400 text-base font-normal">
                          /{members?.length ?? '…'}
                        </span>
                      )}
                    </p>
                  )}
                </div>
              </Card.Content>
            </Card>
          )}

          <Link
            to="/dashboard/gear"
            className="focus-visible:outline-primary block min-w-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <Card className="hover:bg-default-50 h-full p-0 transition-colors">
              <Card.Content className="flex h-full flex-col items-start gap-2 p-3 @min-[35rem]:flex-row @min-[35rem]:items-center @min-[35rem]:gap-3 @min-[35rem]:p-4">
                <div className="bg-warning/15 flex size-8 shrink-0 items-center justify-center rounded-lg">
                  <Sword size={18} className="text-warning" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-default-400 text-xs tracking-wider uppercase">Gear For Me</p>
                  <p className="text-foreground text-2xl font-bold">{myGearCount}</p>
                </div>
              </Card.Content>
            </Card>
          </Link>

          {!isSolo && !isMarketOnly && (
            <Card className="h-full min-w-0 p-0">
              <Card.Content className="flex h-full flex-col items-start gap-2 p-3 @min-[35rem]:flex-row @min-[35rem]:items-center @min-[35rem]:gap-3 @min-[35rem]:p-4">
                <div
                  className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
                    stalestMember?.age.color === 'success'
                      ? 'bg-success/15'
                      : stalestMember?.age.color === 'warning'
                        ? 'bg-warning/15'
                        : stalestMember?.age.color === 'danger'
                          ? 'bg-danger/15'
                          : 'bg-default/15'
                  }`}
                >
                  <Clock
                    size={18}
                    aria-hidden="true"
                    className={
                      stalestMember?.age.color === 'success'
                        ? 'text-success'
                        : stalestMember?.age.color === 'warning'
                          ? 'text-warning'
                          : stalestMember?.age.color === 'danger'
                            ? 'text-danger'
                            : 'text-default-400'
                    }
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-default-400 flex items-center gap-1 text-xs tracking-wider uppercase">
                    Oldest snapshot
                    <IconTooltip content="The group member who has gone the longest without taking a snapshot">
                      <Info size={12} className="text-default-300 shrink-0 cursor-help" />
                    </IconTooltip>
                  </p>
                  {snapsLoading ? (
                    <Skeleton className="mt-1 h-7 w-20 rounded-md" />
                  ) : stalestMember ? (
                    <>
                      <p className="text-foreground text-lg font-bold">{stalestMember.age.label}</p>
                      <p
                        className="text-default-400 line-clamp-2 text-xs wrap-anywhere"
                        title={stalestMember.name}
                      >
                        {stalestMember.name}
                      </p>
                    </>
                  ) : (
                    <p className="text-default-400 text-sm">—</p>
                  )}
                </div>
              </Card.Content>
            </Card>
          )}
        </div>
      </div>

      {/* Group Wealth History */}
      {groupHistory && groupHistory.length > 0 && (
        <Card className="p-0">
          <Card.Header className="px-4 pt-4 pb-0">
            <div className="flex w-full flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <h2 className="text-foreground text-sm font-semibold">
                  {isSolo ? 'Wealth History' : 'Group Wealth History'}
                </h2>
                <WealthHistoryRangeSelector
                  value={groupHistoryRange}
                  onChange={setGroupHistoryRange}
                />
              </div>
              <div className="flex items-center justify-center gap-3">
                <p className={`text-base font-semibold ${groupRateColor}`}>
                  {groupChaosPerHour == null ? 'No data' : fmtRate(groupChaosPerHour)}
                </p>
                <div
                  className={`border-divider/60 flex items-center gap-1.5 border-l pl-3 text-xs ${groupTrendColor}`}
                >
                  <GroupTrendIcon size={13} />
                  <span>{groupTrendLabel}</span>
                </div>
              </div>
              <div />
            </div>
          </Card.Header>
          <Card.Content className="px-2 pt-2 pb-3">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart
                data={visibleGroupHistory}
                margin={{ top: 4, right: 12, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="overviewWealthGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#17c964" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#17c964" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  dataKey="created_at"
                  tickFormatter={(v: string) => {
                    const d = new Date(v)
                    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                  }}
                  tick={{ fontSize: 10, fill: '#888' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v: number) =>
                    v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(Math.round(v))
                  }
                  tick={{ fontSize: 10, fill: '#888' }}
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
                      <div className="bg-content1 border-divider rounded-lg border px-3 py-2 text-xs shadow-lg">
                        <p className="text-default-400 mb-1">{label}</p>
                        <p className="text-foreground font-semibold">
                          {fmt(point.total_wealth_chaos)}
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
                  stroke="#17c964"
                  fill="url(#overviewWealthGrad)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#17c964' }}
                  activeDot={{ r: 6, fill: '#17c964', stroke: 'white', strokeWidth: 2 }}
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
              <h2 className="text-foreground text-sm font-semibold">Strategies</h2>
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
            ) : sortedStrategies.length > 0 ? (
              <ul className="divide-divider divide-y">
                {sortedStrategies.map((strategy) => {
                  const isCurrent = strategy.id === currentStrategyId
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
                            {isCurrent && <Star size={14} className="fill-primary text-primary mt-0.5 shrink-0" aria-hidden="true" />}
                            <p className="text-foreground text-sm font-medium wrap-anywhere">{strategy.name}</p>
                          </div>
                          <div className="text-default-500 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                            <span>{strategyScope}</span>
                            {isCurrent && <span className="text-warning font-medium">Active</span>}
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
              <p className="text-default-500 px-4 py-3 text-sm">No strategies yet.</p>
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
