import { comparablePricing } from '../../lib/snapshot-pricing'
import { useMemo, useState } from 'react'
import { Button } from '@heroui/react/button'
import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { Skeleton } from '@heroui/react/skeleton'
import { useNinjaPrices } from '../../hooks/useNinjaPrices'
import {
  TrendingUp,
  Users,
  Target,
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
import { CarouselSkeleton } from '../layout/Skeletons'
import {
  calculateChaosPerHour,
  calculateTrendStats,
  formatCurrencyAmount,
  snapshotAge,
} from '../../lib/utils'
import { filterHistoryByRange, type WealthHistoryRange } from '../../lib/wealth-history'
import { useCurrencyStore } from '../../store/currency-store'
import { STATUS_COLOR, DIFFICULTY_CHIP, IMPORTANCE_CHIP } from '../../lib/constants'
import { getAvatarColor } from '../../lib/utils'
import { WealthHistoryRangeSelector } from '../economy/WealthHistoryRangeSelector'
import { IconTooltip, UserAvatar } from '../ui/heroui-native'
import { DashboardPage, DashboardPageHeader } from '../ui/dashboard'
export function OverviewPage() {
  const activeGroupId = useGroupStore((s) => s.activeGroupId)
  const isSolo = useIsSoloGroup(activeGroupId)
  const { game, league: activeLeague, capabilities } = useActiveGroupContext()
  const { data: members } = useGroupMembers(activeGroupId)
  const { data: snapshots, isLoading: snapsLoading } = useLatestSnapshots(activeGroupId)
  const { data: economy } = useGroupEconomy(activeGroupId)
  const { data: groupHistory } = useGroupWealthHistory(activeGroupId)
  const { data: gear, isLoading: gearLoading } = useGearSuggestions(activeGroupId)
  const { data: strategyList, isLoading: strategiesLoading } = useStrategies(activeGroupId)
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
            ? 'Your current character, wealth, strategy, and upgrade queue at a glance.'
            : 'Group situational awareness across wealth, strategy, members, and upgrades.'
        }
      />

      {!isMarketOnly && valuationPartial && (
        <p role="status" className="text-warning text-sm">Partial pricing: this subtotal excludes items without available price estimates.</p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Link to="/dashboard/economy" className="block h-30">
          <Card className="hover:bg-default-50 h-full cursor-pointer transition-colors">
            <Card.Content className="flex h-full flex-row items-center gap-3 p-4 md:gap-4 md:p-5">
              <div className="bg-success/15 flex h-12 w-12 shrink-0 items-center justify-center rounded-lg">
                <TrendingUp size={26} className="text-success" />
              </div>
              <div>
                <p className="text-default-400 text-xs tracking-wider uppercase">
                  {isMarketOnly ? 'Market Overview' : valuationPartial ? 'Priced subtotal' : isSolo ? 'Your Wealth' : 'Group Value'}
                </p>
                {snapsLoading ? (
                  <Skeleton className="mt-1 h-7 w-24 rounded-md" />
                ) : (
                  <p className="text-foreground text-2xl font-bold">
                    {isMarketOnly ? 'Live' : valuationUnavailable ? 'Pricing unavailable' : fmt(totalChaos)}
                  </p>
                )}
              </div>
            </Card.Content>
          </Card>
        </Link>

        {!isSolo && (
          <Card className="h-30">
            <Card.Content className="flex h-full flex-row items-center gap-3 p-4 md:gap-4 md:p-5">
              <div className="bg-primary/15 flex h-12 w-12 shrink-0 items-center justify-center rounded-lg">
                <Users size={26} className="text-primary" />
              </div>
              <div>
                <p className="text-default-400 text-xs tracking-wider uppercase">Synced Members</p>
                {snapsLoading ? (
                  <Skeleton className="mt-1 h-7 w-16 rounded-md" />
                ) : (
                  <p className="text-foreground text-2xl font-bold">
                    {syncedCount}
                    <span className="text-default-400 text-base font-normal">
                      /{members?.length ?? '…'}
                    </span>
                  </p>
                )}
              </div>
            </Card.Content>
          </Card>
        )}

        <Link to="/dashboard/gear" className="block h-30">
          <Card className="hover:bg-default-50 h-full cursor-pointer transition-colors">
            <Card.Content className="flex h-full flex-row items-center gap-3 p-4 md:gap-4 md:p-5">
              <div className="bg-warning/15 flex h-12 w-12 shrink-0 items-center justify-center rounded-lg">
                <Sword size={26} className="text-warning" />
              </div>
              <div>
                <p className="text-default-400 text-xs tracking-wider uppercase">Gear For Me</p>
                <p className="text-foreground text-2xl font-bold">{myGearCount}</p>
              </div>
            </Card.Content>
          </Card>
        </Link>

        {!isSolo && (
          <Card className="h-30">
            <Card.Content className="flex h-full flex-row items-center gap-3 p-4 md:gap-4 md:p-5">
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${
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
                  size={26}
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
                  Stalest Snapshot
                  <IconTooltip content="The group member who has gone the longest without taking a snapshot">
                    <Info size={12} className="text-default-300 shrink-0 cursor-help" />
                  </IconTooltip>
                </p>
                {snapsLoading ? (
                  <Skeleton className="mt-1 h-7 w-20 rounded-md" />
                ) : stalestMember ? (
                  <>
                    <p className="text-foreground truncate text-sm font-bold">
                      {stalestMember.name}
                    </p>
                    <p className="text-default-400 text-xs">{stalestMember.age.label}</p>
                  </>
                ) : (
                  <p className="text-default-400 text-sm">—</p>
                )}
              </div>
            </Card.Content>
          </Card>
        )}
      </div>

      {/* Group Wealth History */}
      {groupHistory && groupHistory.length > 0 && (
        <Card>
          <Card.Header className="px-4 pt-4 pb-0">
            <div className="grid w-full grid-cols-[1fr_auto_1fr] items-start gap-4">
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

      {/* Strategies Carousel */}
      {strategiesLoading ? (
        <div>
          <h2 className="text-foreground mb-3 text-sm font-semibold">Strategies</h2>
          <CarouselSkeleton cards={3} width="w-60" />
        </div>
      ) : sortedStrategies.length > 0 ? (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-foreground text-sm font-semibold">Strategies</h2>
            <Link to="/dashboard/strategies">
              <Button size="sm" variant="tertiary">
                View All
              </Button>
            </Link>
          </div>
          <div
            className="-mx-0.5 flex items-stretch gap-3 overflow-x-auto px-0.5 pt-0.5 pb-2"
            style={{ scrollSnapType: 'x mandatory' }}
          >
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
                ? 'default'
                : rateEstimate.chaosPerHour > 0
                  ? 'success'
                  : rateEstimate.chaosPerHour < 0
                    ? 'danger'
                    : 'default'

              return (
                <Link
                  key={strategy.id}
                  to="/dashboard/strategies/$strategyId"
                  params={{ strategyId: strategy.id }}
                  className="block h-full shrink-0"
                  style={{ scrollSnapAlign: 'start' }}
                >
                  <Card
                    className={`hover:bg-default-50 h-full w-60 cursor-pointer transition-colors ${
                      isCurrent ? 'ring-primary ring-2' : ''
                    }`}
                  >
                    <Card.Content className="gap-1.5 p-4">
                      <div className="flex items-center gap-2">
                        {isCurrent && (
                          <Star size={14} className="fill-primary text-primary shrink-0" />
                        )}
                        <p className="text-foreground flex-1 truncate text-sm font-medium">
                          {strategy.name}
                        </p>
                        <Chip size="sm" variant="soft" color={diff.color}>
                          {diff.label}
                        </Chip>
                      </div>
                      <div className="mt-1 flex items-center justify-between">
                        {strategy.map_cost != null && strategy.map_cost > 0 ? (
                          <span className="text-default-400 flex items-center gap-1 text-xs">
                            <Coins size={10} /> ~{fmt(strategy.map_cost)}/map
                          </span>
                        ) : (
                          <span />
                        )}
                        <span className="text-default-400 text-xs">{strategyScope}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Chip size="sm" variant="soft" color={rateColor}>
                          {rateEstimate ? `${fmt(rateEstimate.chaosPerHour)}/hr` : 'No data'}
                        </Chip>
                        <Chip
                          size="sm"
                          variant="soft"
                          color="accent"
                          className={isCurrent ? '' : 'invisible'}
                        >
                          Active
                        </Chip>
                      </div>
                    </Card.Content>
                  </Card>
                </Link>
              )
            })}
          </div>
        </div>
      ) : (
        <div>
          <h2 className="text-foreground mb-3 text-sm font-semibold">Strategies</h2>
          <Card>
            <Card.Content className="flex flex-col items-center gap-3 p-8 text-center">
              <Target size={24} className="text-default-300" />
              <p className="text-default-400 text-sm">No strategies yet.</p>
              <Link to="/dashboard/strategies">
                <Button size="sm" variant="tertiary">
                  Create Strategy
                </Button>
              </Link>
            </Card.Content>
          </Card>
        </div>
      )}

      {/* Gear Suggestions Carousel */}
      {gearLoading ? (
        <div>
          <h2 className="text-foreground mb-3 text-sm font-semibold">Gear Suggestions</h2>
          <CarouselSkeleton cards={4} width="w-56" />
        </div>
      ) : sortedGear.length > 0 ? (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-foreground text-sm font-semibold">Gear Suggestions</h2>
            <Link to="/dashboard/gear">
              <Button size="sm" variant="tertiary">
                View All
              </Button>
            </Link>
          </div>
          <div
            className="-mx-1 flex items-stretch gap-3 overflow-x-auto px-1 pt-0.5 pb-2"
            style={{ scrollSnapType: 'x mandatory' }}
          >
            {sortedGear.slice(0, 10).map((s) => {
              const importance = IMPORTANCE_CHIP[s.importance] ?? IMPORTANCE_CHIP.medium
              return (
                <Card
                  key={s.id}
                  className="hover:bg-default-50 h-full w-72 shrink-0 transition-colors"
                  style={{ scrollSnapAlign: 'start' }}
                >
                  <Card.Content className="gap-1.5 p-4">
                    <div className="flex items-center gap-2">
                      {s.item_data?.icon_url ? (
                        <img
                          src={s.item_data.icon_url}
                          alt=""
                          className="h-8 w-8 bg-transparent object-contain"
                        />
                      ) : (
                        <Sword size={14} className="text-default-400 shrink-0" />
                      )}
                      <p className="text-foreground flex-1 truncate text-sm font-medium">
                        {s.item_name ?? 'Unnamed item'}
                      </p>
                      <Chip size="sm" variant="soft" color={importance.color}>
                        {importance.label}
                      </Chip>
                    </div>
                    <div className="text-default-400 flex items-center gap-1.5 truncate text-xs">
                      <UserAvatar
                        src={s.target_user.avatar_url ?? undefined}
                        name={(s.target_user.display_name ?? s.target_user.poe_account_name)
                          .slice(0, 1)
                          .toUpperCase()}
                        size="sm"
                        className="h-5 w-5 shrink-0"
                        style={{
                          backgroundColor: getAvatarColor(
                            s.target_user.id,
                            s.target_user.avatar_color,
                          ),
                        }}
                        fallbackClassName="text-[10px] font-semibold text-white"
                      />
                      <span className="truncate">
                        For {s.target_user.display_name ?? s.target_user.poe_account_name}
                      </span>
                    </div>
                    <div className="mt-auto flex items-center justify-between pt-2">
                      <p className="text-default-400 truncate text-xs">
                        by {s.suggester.display_name ?? s.suggester.poe_account_name}
                      </p>
                      <Chip
                        size="sm"
                        color={STATUS_COLOR[s.status]}
                        variant="soft"
                        className="capitalize"
                      >
                        {s.status}
                      </Chip>
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-2">
                      {s.item_trade_link ? (
                        <a href={s.item_trade_link} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="tertiary" type="button">
                            Trade link
                          </Button>
                        </a>
                      ) : (
                        <span />
                      )}
                      <Link to="/dashboard/gear/$suggestionId" params={{ suggestionId: s.id }}>
                        <Button size="sm" variant="tertiary">
                          Open
                        </Button>
                      </Link>
                    </div>
                  </Card.Content>
                </Card>
              )
            })}
          </div>
        </div>
      ) : null}
    </DashboardPage>
  )
}
