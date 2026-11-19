import { useLatestSnapshots } from '../../hooks/useSnapshots'
import { comparablePricing } from '../../lib/snapshot-pricing'
import { useMemo, useState } from 'react'
import { Button } from '@heroui/react/button'
import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { Spinner } from '@heroui/react/spinner'
import { useNinjaPrices } from '../../hooks/useNinjaPrices'
import { ArrowDownRight, ArrowUpRight, Minus, TrendingUp } from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts'
import { Link, useNavigate } from '@tanstack/react-router'
import { useGroupMembers, useMyGroups } from '../../hooks/useGroups'
import { useActiveCharacters, useGroupEconomy } from '../../hooks/useSnapshots'
import { useGroupWealthHistory } from '../../hooks/useGroupWealthHistory'
import type { GroupWealthDataPoint } from '../../hooks/useGroupWealthHistory'
import { useStashSnapshotFlow } from '../../hooks/useStashSnapshotFlow'
import {
  calculateChaosPerHour,
  calculateTrendStats,
  getAvatarColor,
  snapshotAge,
} from '../../lib/utils'
import { filterHistoryByRange, type WealthHistoryRange } from '../../lib/wealth-history'
import { useCurrencyStore } from '../../store/currency-store'
import { TableSkeleton } from '../layout/Skeletons'
import { useGroupStore } from '../../store/group-store'
import { useMyProfile } from '../../hooks/useCurrentUser'
import { useSnapshotSchedule } from '../../hooks/useSnapshotSchedule'
import {
  useSnapshotPreferencesStore,
  type SnapshotIntervalHours,
} from '../../store/snapshot-preferences-store'
import { WealthHistoryRangeSelector } from './WealthHistoryRangeSelector'
import { useActiveGroupContext } from '../../hooks/useGroups'
import { Poe2EconomyPage } from './Poe2EconomyPage'
import { hasActiveProAccess } from '../../lib/billing'
import { ListBox, SelectField, UserAvatar } from '../ui/heroui-native'
import { DashboardEmptyState, DashboardPage, DashboardPageHeader } from '../ui/dashboard'
const SNAPSHOT_INTERVAL_OPTIONS: { value: SnapshotIntervalHours; label: string }[] = [
  { value: 1, label: 'Every hour' },
  { value: 2, label: 'Every 2 hours' },
  { value: 3, label: 'Every 3 hours' },
  { value: 6, label: 'Every 6 hours' },
]

export function EconomyPage() {
  const { game, league } = useActiveGroupContext()

  if (game === 'poe2') {
    return <Poe2EconomyPage league={league} />
  }

  return <Poe1EconomyPage />
}

function Poe1EconomyPage() {
  const navigate = useNavigate()
  const activeGroupId = useGroupStore((s) => s.activeGroupId)
  const { data: members } = useGroupMembers(activeGroupId)
  const { data: economy, isLoading } = useGroupEconomy(activeGroupId)
  const { data: latestSnapshots } = useLatestSnapshots(activeGroupId)
  const { data: groupHistory } = useGroupWealthHistory(activeGroupId)
  const { data: characters } = useActiveCharacters(activeGroupId)
  const { data: myGroups } = useMyGroups()
  const { data: myProfile } = useMyProfile()
  const { triggerSnapshot, isBusy, modal } = useStashSnapshotFlow()
  const display = useCurrencyStore((s) => s.display)
  const snapshotMode = useSnapshotPreferencesStore((s) => s.mode)
  const snapshotIntervalHours = useSnapshotPreferencesStore((s) => s.intervalHours)
  const setSnapshotMode = useSnapshotPreferencesStore((s) => s.setMode)
  const setSnapshotIntervalHours = useSnapshotPreferencesStore((s) => s.setIntervalHours)
  const resetSnapshotTimer = useSnapshotPreferencesStore((s) => s.resetTimer)
  const { countdownLabel, blockingReason, isEligible, mode } = useSnapshotSchedule(activeGroupId)
  const [groupHistoryRange, setGroupHistoryRange] = useState<WealthHistoryRange>('7d')

  const activeLeague = myGroups?.find((g) => g.group.id === activeGroupId)?.group.league ?? null
  const isPro = hasActiveProAccess(myProfile)
  const canSnapshot = !!myProfile?.poe_token_expires_at && !!activeLeague

  // Live divine price from poe.ninja — 30 min stale time
  const { data: ninjaData } = useNinjaPrices(activeLeague)
  const divinePrice = ninjaData?.divinePrice ?? null

  const handleSnapshot = () => {
    if (!activeGroupId || !activeLeague) return
    triggerSnapshot(activeGroupId, activeLeague)
  }

  // Format a chaos value according to the current display mode
  const fmt = (chaos: number): string => {
    if (display === 'divine' && divinePrice != null && divinePrice > 0) {
      return `${(chaos / divinePrice).toFixed(1)} div`
    }
    return `${Math.round(chaos).toLocaleString()}c`
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

  const charByUser = Object.fromEntries((characters ?? []).map((c) => [c.user_id, c]))
  const memberByUser = Object.fromEntries((members ?? []).map((m) => [m.user.id, m.user]))

  const totalChaos = economy?.reduce((sum, m) => sum + m.total_chaos, 0) ?? 0
  const sorted = [...(economy ?? [])].sort((a, b) => b.total_chaos - a.total_chaos)
  const visibleGroupHistory = useMemo(
    () => filterHistoryByRange(groupHistory ?? [], groupHistoryRange, (point) => point.created_at),
    [groupHistory, groupHistoryRange],
  )
  const valuationUnavailable = latestSnapshots?.some((snapshot) => snapshot.pricing_summary?.status === 'unavailable') ?? false
  const valuationPartial = latestSnapshots?.some((snapshot) => snapshot.pricing_summary?.status === 'partial') ?? false
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

  return (
    <>
      {modal}
      <DashboardPage>
        <DashboardPageHeader
          title="Economy"
          eyebrow="Stash intelligence"
          tone="currency"
          description="Shared stash value, snapshot schedule, and per-member wealth movement."
          actions={
            canSnapshot ? (
              <Button
                size="sm"
                variant="tertiary"
                isPending={isBusy}
                isDisabled={!activeGroupId}
                onPress={handleSnapshot}
              >
                {({ isPending }) => (
                  <>
                    {isPending ? <Spinner color="current" size="sm" /> : null}
                    {isPending ? 'Snapshotting...' : 'Snapshot'}
                  </>
                )}
              </Button>
            ) : null
          }
        />

        <Card>
          <Card.Content className="gap-4 p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-foreground text-sm font-semibold">Snapshot schedule</p>
                <p className="text-default-400 mt-1 text-sm">
                  Manual only is the default. Supporters can switch to Mix and set an interval.
                </p>
              </div>
              {!isPro && (
                <Link to="/dashboard/support" className="inline-flex">
                  <Chip className="cursor-pointer px-3" color="warning" variant="soft">
                    Supporter capacity
                  </Chip>
                </Link>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={() => setSnapshotMode('manual')}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  snapshotMode === 'manual'
                    ? 'border-primary bg-primary/10'
                    : 'border-divider bg-content2 hover:bg-default-100'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-foreground text-sm font-medium">Manual only</p>
                    <p className="text-default-400 mt-1 text-xs">
                      Snapshots run only when you trigger them yourself.
                    </p>
                  </div>
                  {snapshotMode === 'manual' && (
                    <Chip size="sm" color="accent" variant="soft">
                      Active
                    </Chip>
                  )}
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!isPro) return
                  setSnapshotMode('mix')
                }}
                disabled={!isPro}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  snapshotMode === 'mix'
                    ? 'border-primary bg-primary/10'
                    : 'border-divider bg-content2 hover:bg-default-100'
                } ${!isPro ? 'hover:bg-content2 cursor-not-allowed opacity-60' : ''}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-foreground text-sm font-medium">Mix</p>
                    <p className="text-default-400 mt-1 text-xs">
                      Keep manual snapshots and allow interval-based snapshotting.
                    </p>
                  </div>
                  {snapshotMode === 'mix' ? (
                    <Chip size="sm" color="accent" variant="soft">
                      Active
                    </Chip>
                  ) : !isPro ? (
                    <Chip size="sm" variant="soft">
                      Supporter
                    </Chip>
                  ) : null}
                </div>
              </button>
            </div>

            {snapshotMode === 'mix' && (
              <div className="flex flex-col gap-2 md:max-w-xs">
                <SelectField
                  label="Snapshot interval"
                  selectedKey={String(snapshotIntervalHours)}
                  onSelectionChange={(key) => {
                    if (typeof key !== 'string') return
                    setSnapshotIntervalHours(Number(key) as SnapshotIntervalHours)
                  }}
                >
                  {SNAPSHOT_INTERVAL_OPTIONS.map((option) => (
                    <ListBox.Item
                      key={String(option.value)}
                      id={String(option.value)}
                      textValue={option.label}
                    >
                      {option.label}
                    </ListBox.Item>
                  ))}
                </SelectField>
                <p className="text-default-400 text-xs">
                  Current interval:{' '}
                  {
                    SNAPSHOT_INTERVAL_OPTIONS.find(
                      (option) => option.value === snapshotIntervalHours,
                    )?.label
                  }
                </p>
                <div className="flex items-center gap-2">
                  <Chip size="sm" color={isEligible ? 'accent' : 'default'} variant="soft">
                    {isEligible && countdownLabel
                      ? `Next snapshot in ${countdownLabel}`
                      : 'Timer paused'}
                  </Chip>
                  <Button size="sm" variant="tertiary" onPress={() => resetSnapshotTimer()}>
                    Reset timer
                  </Button>
                </div>
                {mode === 'mix' && blockingReason && (
                  <p className="text-default-400 text-xs">{blockingReason}</p>
                )}
              </div>
            )}
          </Card.Content>
        </Card>

        {isLoading ? (
          <TableSkeleton rows={4} cols={5} />
        ) : !sorted.length ? (
          <DashboardEmptyState
            icon={TrendingUp}
            tone="currency"
            action={
              canSnapshot ? (
                <Button
                  size="sm"
                  variant="tertiary"
                  isPending={isBusy}
                  isDisabled={!activeLeague}
                  onPress={handleSnapshot}
                >
                  {({ isPending }) => (
                    <>
                      {isPending ? <Spinner color="current" size="sm" /> : null}
                      {isPending ? 'Snapshotting...' : 'Snapshot stash'}
                    </>
                  )}
                </Button>
              ) : null
            }
          >
            Snapshot your stash to see economy data.
          </DashboardEmptyState>
        ) : (
          <>
            {valuationPartial && (
              <p role="status" className="text-warning text-sm">Partial pricing: this subtotal excludes items without available price estimates.</p>
            )}
            {/* Group total */}
            <Card>
              <button
                type="button"
                className="w-full text-left"
                onClick={() => navigate({ to: '/dashboard/economy/group' })}
              >
                <Card.Content className="flex flex-row flex-wrap items-center gap-4 p-5">
                  <div className="bg-success/15 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                    <TrendingUp size={20} className="text-success" />
                  </div>
                  <div>
                    <p className="text-default-400 text-xs tracking-wider uppercase">
                      {valuationPartial ? 'Priced subtotal' : 'Total Group Wealth'}
                    </p>
                    <p className="text-foreground text-2xl font-bold">{valuationUnavailable ? 'Pricing unavailable' : fmt(totalChaos)}</p>
                  </div>
                  <div className="flex w-full items-center justify-between gap-4 sm:ml-auto sm:w-auto">
                    <div className="text-right">
                      <p className="text-default-400 text-xs">
                        {sorted.length} member{sorted.length !== 1 ? 's' : ''} synced
                      </p>
                      <p className="text-default-500 text-xs">{divinePrice == null ? 'Divine conversion unavailable' : `1 div = ${divinePrice.toFixed(0)}c`}</p>
                    </div>
                    <span className="text-default-600 inline-flex h-8 items-center rounded-md px-3 text-sm">
                      Details
                    </span>
                  </div>
                </Card.Content>
              </button>
            </Card>

            {/* Group wealth history chart */}
            {groupHistory && groupHistory.length > 0 && (
              <Card>
                <Card.Header className="px-4 pt-4 pb-0">
                  <div className="grid w-full grid-cols-[1fr_auto_1fr] items-start gap-4">
                    <div className="flex items-center gap-3">
                      <h2 className="text-foreground text-sm font-semibold">
                        Group Wealth History
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
                        <linearGradient id="groupWealthGrad" x1="0" y1="0" x2="0" y2="1">
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
                              <p className="text-default-400 mt-0.5">
                                {point.member_count} member{point.member_count !== 1 ? 's' : ''}
                              </p>
                              {point.member_wealth_breakdown.map((m) => (
                                <p key={m.user_id} className="text-default-500 text-xs">
                                  {m.display_name}: {fmt(m.total_chaos)}
                                </p>
                              ))}
                            </div>
                          )
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="total_wealth_chaos"
                        stroke="#17c964"
                        fill="url(#groupWealthGrad)"
                        strokeWidth={2}
                        dot={{ r: 3, fill: '#17c964' }}
                        activeDot={{ r: 6, fill: '#17c964', stroke: 'white', strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </Card.Content>
              </Card>
            )}

            {/* Per-member table */}
            <Card>
              <Card.Header className="px-4 pt-4 pb-0">
                <h2 className="text-foreground text-sm font-semibold">Member Breakdown</h2>
              </Card.Header>
              <Card.Content className="p-0">
                <table className="w-full">
                  <thead>
                    <tr className="border-divider border-b">
                      <th className="text-default-400 px-4 py-3 text-left text-xs font-medium tracking-wider uppercase">
                        Member
                      </th>
                      <th className="text-default-400 px-4 py-3 text-left text-xs font-medium tracking-wider uppercase">
                        Character
                      </th>
                      <th className="text-default-400 px-4 py-3 text-right text-xs font-medium tracking-wider uppercase">
                        Value
                      </th>
                      <th className="text-default-400 hidden px-4 py-3 text-left text-xs font-medium tracking-wider uppercase md:table-cell">
                        Tabs
                      </th>
                      <th className="text-default-400 px-4 py-3 text-right text-xs font-medium tracking-wider uppercase">
                        Snapshot
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((row, i) => {
                      const user = memberByUser[row.user_id]
                      const char = charByUser[row.user_id]
                      const age = snapshotAge(row.completed_at)
                      const pct = totalChaos > 0 ? (row.total_chaos / totalChaos) * 100 : 0

                      return (
                        <tr
                          key={row.user_id}
                          className={`hover:bg-default-50 cursor-pointer transition-colors ${i < sorted.length - 1 ? 'border-divider border-b' : ''}`}
                          onClick={() =>
                            navigate({
                              to: '/dashboard/economy/$userId',
                              params: { userId: row.user_id },
                            })
                          }
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <UserAvatar
                                src={user?.avatar_url ?? undefined}
                                name={user?.display_name ?? user?.poe_account_name ?? '?'}
                                size="sm"
                                style={
                                  user
                                    ? {
                                        backgroundColor: getAvatarColor(user.id, user.avatar_color),
                                      }
                                    : undefined
                                }
                              />
                              <div>
                                <p className="text-foreground text-sm font-medium">
                                  {user?.display_name ?? user?.poe_account_name ?? '—'}
                                </p>
                                <p className="text-default-400 text-xs">
                                  {pct.toFixed(1)}% of group
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            {char ? (
                              <div>
                                <p className="text-foreground text-sm">{char.name}</p>
                                <p className="text-default-400 text-xs">
                                  {char.class} {char.level}
                                </p>
                              </div>
                            ) : (
                              <span className="text-default-300 text-sm">—</span>
                            )}
                          </td>

                          <td className="px-4 py-3 text-right">
                            <p className="text-foreground text-sm font-semibold">
                              {fmt(row.total_chaos)}
                            </p>
                          </td>

                          <td className="hidden px-4 py-3 md:table-cell">
                            <div className="flex flex-wrap gap-1">
                              {row.tabs.map((t) => (
                                <Chip key={t.name} size="sm" variant="soft" color="default">
                                  {t.name}
                                  <span className="text-default-400 ml-1 text-xs">
                                    {Math.round(t.value).toLocaleString()}c
                                  </span>
                                </Chip>
                              ))}
                            </div>
                          </td>

                          <td className="px-4 py-3 text-right">
                            <Chip size="sm" color={age.color} variant="soft">
                              {age.label}
                            </Chip>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </Card.Content>
            </Card>
          </>
        )}
      </DashboardPage>
    </>
  )
}
