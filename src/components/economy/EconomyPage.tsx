import { useLatestSnapshots, type LatestSnapshot } from '../../hooks/useSnapshots'
import { comparablePricing } from '../../lib/snapshot-pricing'
import { useMemo, useState } from 'react'
import { Button } from '@heroui/react/button'
import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { Spinner } from '@heroui/react/spinner'
import { Popover } from '@heroui/react/popover'
import { useNinjaPrices } from '../../hooks/useNinjaPrices'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarClock, Minus, TrendingUp } from 'lucide-react'
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
import { useGroupMembers, useMyGroups } from '../../hooks/useGroups'
import { useActiveCharacters, useGroupEconomy } from '../../hooks/useSnapshots'
import { useGroupWealthHistory } from '../../hooks/useGroupWealthHistory'
import type { GroupWealthDataPoint } from '../../hooks/useGroupWealthHistory'
import { useStashSnapshotFlow } from '../../hooks/useStashSnapshotFlow'
import {
  calculateChaosPerHour,
  calculateTrendStats,
  formatCurrencyAmount,
  getAvatarColor,
  snapshotAge,
} from '../../lib/utils'
import { filterHistoryByRange, formatWealthAxisTick, type WealthHistoryRange } from '../../lib/wealth-history'
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
import { getLoginHref } from '../../lib/auth-redirect'
import { ListBox, SelectField, UserAvatar } from '../ui/heroui-native'
import { DashboardEmptyState, DashboardPage, DashboardPageHeader } from '../ui/dashboard'
import { QueryStatePanel } from '../ui/QueryStatePanel'
import { EconomySnapshotSummary } from './EconomySnapshotSummary'
import { SnapshotTalisman } from './SnapshotEmptyState'
import { resolveLeagueTheme } from '../../lib/league-theme'
import './economy-data.css'
const SNAPSHOT_INTERVAL_OPTIONS: { value: SnapshotIntervalHours; label: string }[] = [
  { value: 1, label: 'Every hour' },
  { value: 2, label: 'Every 2 hours' },
  { value: 3, label: 'Every 3 hours' },
  { value: 6, label: 'Every 6 hours' },
]

function isValidDivineRate(rate: number | null | undefined): rate is number {
  return rate != null && Number.isFinite(rate) && rate > 0
}

function latestSnapshotDivineRate(snapshots: LatestSnapshot[]): number | null {
  let latest: { rate: number; completedAt: string } | null = null
  for (const { completed_at, pricing_summary } of snapshots) {
    const rate = pricing_summary?.divine_price
    if (isValidDivineRate(rate) && completed_at && (!latest || completed_at > latest.completedAt)) {
      latest = { rate, completedAt: completed_at }
    }
  }
  return latest?.rate ?? null
}

export function EconomyPage() {
  const { game, league } = useActiveGroupContext()

  if (game === 'poe2') {
    return <Poe2EconomyPage league={league} />
  }

  return <Poe1EconomyPage />
}

function Poe1EconomyPage() {
  const activeGroupId = useGroupStore((s) => s.activeGroupId)
  const { data: members } = useGroupMembers(activeGroupId)
  const { data: economy, isLoading, isError, refetch } = useGroupEconomy(activeGroupId)
  const { data: latestSnapshots, isPending: coveragePending, isError: coverageError } = useLatestSnapshots(activeGroupId)
  const { data: groupHistory } = useGroupWealthHistory(activeGroupId)
  const { data: characters } = useActiveCharacters(activeGroupId)
  const { data: myGroups } = useMyGroups()
  const { data: myProfile, isPending: profilePending, isError: profileError, refetch: retryProfile } = useMyProfile()
  const { triggerSnapshot, isBusy, modal } = useStashSnapshotFlow()
  const display = useCurrencyStore((s) => s.display)
  const snapshotMode = useSnapshotPreferencesStore((s) => s.mode)
  const snapshotIntervalHours = useSnapshotPreferencesStore((s) => s.intervalHours)
  const setSnapshotMode = useSnapshotPreferencesStore((s) => s.setMode)
  const setSnapshotIntervalHours = useSnapshotPreferencesStore((s) => s.setIntervalHours)
  const resetSnapshotTimer = useSnapshotPreferencesStore((s) => s.resetTimer)
  const { countdownLabel, blockingReason, isEligible } = useSnapshotSchedule(activeGroupId)
  const [groupHistoryRange, setGroupHistoryRange] = useState<WealthHistoryRange>('7d')

  const activeGroup = myGroups?.find((g) => g.group.id === activeGroupId)?.group
  const activeLeague = activeGroup?.league ?? null
  const isPro = hasActiveProAccess(myProfile)
  const canSnapshot = !!myProfile?.poe_token_expires_at && !!activeLeague

  const { data: ninjaData } = useNinjaPrices(activeLeague)
  const liveDivineRate = ninjaData?.divinePrice
  const hasLiveRate = isValidDivineRate(liveDivineRate)
  const divinePrice = hasLiveRate ? liveDivineRate : latestSnapshotDivineRate(latestSnapshots ?? [])
  const displayDivineRate = display === 'divine' ? divinePrice : null

  const handleSnapshot = () => {
    if (!activeGroupId || !activeLeague) return
    triggerSnapshot(activeGroupId, activeLeague)
  }

  const fmt = (chaos: number) => formatCurrencyAmount(chaos, display, divinePrice ?? Number.NaN)

  const fmtRate = (chaos: number) => displayDivineRate != null
    ? `${fmt(chaos)}/hr`
    : `${Math.round(chaos).toLocaleString()} chaos/hr`

  const fmtDelta = (chaos: number): string => {
    if (chaos === 0) return fmt(0)
    return `${chaos > 0 ? '+' : '-'}${fmt(Math.abs(chaos))}`
  }

  const charByUser = Object.fromEntries((characters ?? []).map((c) => [c.user_id, c]))
  const memberByUser = Object.fromEntries((members ?? []).map((m) => [m.user.id, m.user]))

  const totalChaos = economy?.reduce((sum, m) => sum + m.total_chaos, 0) ?? 0
  const sorted = [...(economy ?? [])].sort((a, b) => b.total_chaos - a.total_chaos)
  const latestCapture = sorted.reduce<string | null>(
    (latest, row) => row.completed_at && (!latest || row.completed_at > latest) ? row.completed_at : latest,
    null,
  )
  const freshness = snapshotAge(latestCapture)
  const visibleGroupHistory = useMemo(
    () => filterHistoryByRange(groupHistory ?? [], groupHistoryRange, (point) => point.created_at),
    [groupHistory, groupHistoryRange],
  )
  const valuationUnavailable = latestSnapshots?.some((snapshot) => snapshot.pricing_summary?.status === 'unavailable') ?? false
  const valuationPartial = latestSnapshots?.some((snapshot) => snapshot.pricing_summary?.status === 'partial') ?? false
  const pricingCoverage = latestSnapshots?.length && latestSnapshots.every((snapshot) => snapshot.pricing_summary)
    ? latestSnapshots.reduce(({ priced, unpriced }, snapshot) => ({
        priced: priced + (snapshot.pricing_summary?.priced_item_count ?? 0),
        unpriced: unpriced + (snapshot.pricing_summary?.unpriced_item_count ?? 0),
      }), { priced: 0, unpriced: 0 })
    : null
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
      <DashboardPage className="@container">
        <DashboardPageHeader
          title="Economy"
          description="Review stash value, capture history, and member coverage."
        />

        <EconomySnapshotSummary
          valueLabel={!sorted.length || valuationUnavailable ? 'Stash value' : valuationPartial ? 'Priced subtotal' : 'Total Group Wealth'}
          amount={sorted.length > 0 ? (
            valuationUnavailable
              ? <p className="text-foreground text-xl font-semibold">Pricing unavailable</p>
              : <p className="workspace-lead-amount">{fmt(totalChaos)}</p>
          ) : null}
          metadata={sorted.length > 0 && (
            <>
              <span>{sorted.length} member{sorted.length !== 1 ? 's' : ''} synced</span>
              <Chip size="sm" color={freshness.color} variant="soft">
                {latestCapture ? `Last snapshot ${freshness.label}` : freshness.label}
              </Chip>
              <Link to="/dashboard/economy/group" className="text-brand-readable rounded-sm font-medium hover:underline">
                Stash details <ArrowUpRight size={12} className="inline" aria-hidden="true" />
              </Link>
            </>
          )}
          pricing={sorted.length > 0 && (
            <>
              <h3 className="text-foreground text-sm font-semibold">Pricing coverage</h3>
              {valuationPartial && !valuationUnavailable && (
                <p role="status" className="text-warning flex items-start gap-2 text-sm">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                  Partial pricing: this subtotal excludes items without available price estimates.
                </p>
              )}
              <p className="text-default-600 text-xs">
                {pricingCoverage
                  ? `${pricingCoverage.priced.toLocaleString()} priced · ${pricingCoverage.unpriced.toLocaleString()} unpriced`
                  : coveragePending
                    ? 'Checking pricing coverage…'
                    : coverageError
                      ? 'Could not load pricing coverage'
                      : 'Pricing coverage not recorded for every capture'}
              </p>
              <p className="text-default-600 text-xs">
                {divinePrice == null
                  ? 'Divine conversion unavailable'
                  : `1 div = ${divinePrice.toFixed(0)}c${hasLiveRate ? '' : ' · snapshot rate'}`}
              </p>
            </>
          )}
          actions={
            <>
              <Popover>
                <Button size="sm" variant="tertiary">
                  <CalendarClock size={14} aria-hidden="true" /> Snapshot schedule
                </Button>
                <Popover.Content placement="bottom end" className="w-80 max-w-[calc(100vw-2rem)] p-4">
                  <Popover.Dialog className="flex flex-col gap-3">
                    <Popover.Heading className="text-foreground text-sm font-semibold">
                      Snapshot schedule
                    </Popover.Heading>
                    <div role="group" aria-label="Snapshot mode" className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="tertiary"
                        className="aria-pressed:bg-selected aria-pressed:text-highlight aria-pressed:underline"
                        aria-pressed={snapshotMode === 'manual'}
                        onPress={() => setSnapshotMode('manual')}
                      >
                        Manual only
                      </Button>
                      <Button
                        size="sm"
                        variant="tertiary"
                        className="aria-pressed:bg-selected aria-pressed:text-highlight aria-pressed:underline"
                        aria-pressed={snapshotMode === 'mix'}
                        isDisabled={!isPro}
                        onPress={() => setSnapshotMode('mix')}
                      >
                        Mix
                      </Button>
                    </div>

                    {snapshotMode === 'mix' && isPro ? (
                      <>
                        <SelectField
                          label="Snapshot interval"
                          selectedKey={String(snapshotIntervalHours)}
                          onSelectionChange={(key) => {
                            if (typeof key === 'string') {
                              setSnapshotIntervalHours(Number(key) as SnapshotIntervalHours)
                            }
                          }}
                        >
                          {SNAPSHOT_INTERVAL_OPTIONS.map((option) => (
                            <ListBox.Item key={option.value} id={String(option.value)} textValue={option.label}>
                              {option.label}
                            </ListBox.Item>
                          ))}
                        </SelectField>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-default-600 text-xs">
                            {isEligible && countdownLabel ? 'Next snapshot in ' + countdownLabel : 'Timer paused'}
                          </p>
                          <Button size="sm" variant="tertiary" onPress={() => resetSnapshotTimer()}>
                            Reset timer
                          </Button>
                        </div>
                        {blockingReason && (
                          <p className="text-default-500 text-xs">{blockingReason}</p>
                        )}
                      </>
                    ) : (
                      <p className="text-default-500 text-xs">
                        {isPro ? 'Mix takes snapshots on demand and at regular intervals.' : (
                          <><Link to="/dashboard/support" className="text-brand-readable hover:underline">Supporter access</Link> enables scheduled snapshots.</>
                        )}
                      </p>
                    )}
                  </Popover.Dialog>
                </Popover.Content>
              </Popover>
              {canSnapshot && (
                <Button size="sm" isPending={isBusy} isDisabled={!activeGroupId} onPress={handleSnapshot}>
                  {({ isPending }) => (
                    <>
                      {isPending ? <Spinner color="current" size="sm" /> : null}
                      {isPending ? 'Taking snapshot…' : 'Snapshot stash'}
                    </>
                  )}
                </Button>
              )}
              {sorted.length > 0 && activeLeague && !profilePending && !profileError && !canSnapshot && (
                <a href={getLoginHref('/dashboard/economy')} className="button button--sm button--tertiary">
                  Reconnect PoE account
                </a>
              )}
            </>
          }
        />

        {isLoading ? (
          <>
            <p role="status" className="text-default-500 text-sm">Loading economy data…</p>
            <TableSkeleton rows={4} cols={5} />
          </>
        ) : isError && !economy ? (
          <QueryStatePanel kind="error" title="Couldn’t load economy data" description="Try again to view your stash values." onRetry={refetch} />
        ) : !sorted.length ? (
          <DashboardEmptyState
            icon={canSnapshot && resolveLeagueTheme(activeGroup?.game ?? null, activeLeague) === 'covens'
              ? SnapshotTalisman
              : TrendingUp}
            tone="currency"
            action={
              profileError ? (
                <Button size="sm" variant="tertiary" onPress={() => void retryProfile()}>Try again</Button>
              ) : activeLeague && !profilePending && !canSnapshot ? (
                <a href={getLoginHref('/dashboard/economy')} className="button button--sm button--primary">
                  Reconnect PoE account
                </a>
              ) : null
            }
          >
            {profileError
              ? 'Could not check your stash access. Try again to continue.'
              : profilePending
                ? 'Checking account access…'
                : !activeLeague
                  ? 'Choose a workspace with a league to take stash snapshots.'
                  : canSnapshot
                    ? 'No snapshots yet. Choose Snapshot stash to capture your first value.'
                    : 'Reconnect your PoE account to give PoE Party access to your stash.'}
          </DashboardEmptyState>
        ) : (
          <>
            {/* Group wealth history chart */}
            {groupHistory && groupHistory.length > 0 && (
              <Card className="p-0">
                <Card.Header className="px-4 pt-4 pb-0">
                  <div className="flex w-full flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
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
                        {groupChaosPerHour == null ? 'Rate unavailable' : fmtRate(groupChaosPerHour)}
                      </p>
                      <div
                        className={`border-divider/60 flex items-center gap-1.5 border-l pl-3 text-xs ${groupTrendColor}`}
                      >
                        <GroupTrendIcon size={13} />
                        <span>{groupTrendLabel}</span>
                      </div>
                    </div>
                  </div>
                </Card.Header>
                <Card.Content className="px-2 pt-2 pb-3">
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart
                      data={visibleGroupHistory}
                      title={displayDivineRate != null ? 'Group wealth in divine orbs' : 'Group wealth in chaos orbs'}
                      desc="Use the left and right arrow keys to read snapshot values."
                      margin={{ top: 4, right: 12, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="groupWealthGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--wealth-series)" stopOpacity={0.25} />
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
                        tick={{ fontSize: 10, fill: 'var(--muted-text)' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={formatWealthAxisTick}
                        unit={displayDivineRate != null ? ' div' : 'c'}
                        tick={{ fontSize: 10, fill: 'var(--muted-text)' }}
                        axisLine={false}
                        tickLine={false}
                        width={displayDivineRate != null ? 'auto' : 44}
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
                        isAnimationActive={false}
                        dataKey={(point: GroupWealthDataPoint) => point.total_wealth_chaos / (displayDivineRate ?? 1)}
                        stroke="var(--wealth-series)"
                        fill="url(#groupWealthGrad)"
                        strokeWidth={2}
                        dot={{ r: 3, fill: 'var(--wealth-series)' }}
                        activeDot={{ r: 6, fill: 'var(--wealth-series)', stroke: 'var(--surface)', strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </Card.Content>
              </Card>
            )}

            {/* Per-member table */}
            <Card className="min-w-0 gap-0 p-0">
              <Card.Header className="px-4 pt-4 pb-0">
                <h2 className="text-foreground text-sm font-semibold" id="economy-members">Member breakdown</h2>
              </Card.Header>
              <Card.Content
                className="economy-data block min-w-0 p-0"
                role="region"
                aria-labelledby="economy-members"
              >
                <table className="economy-members" role="table">
                  <thead role="rowgroup">
                    <tr className="border-divider border-b" role="row">
                      <th className="text-default-400 w-1/4 px-4 py-3 text-left text-xs font-medium tracking-wider uppercase" role="columnheader" scope="col">
                        Member
                      </th>
                      <th className="text-default-400 w-1/4 px-4 py-3 text-left text-xs font-medium tracking-wider uppercase" role="columnheader" scope="col">
                        Character
                      </th>
                      <th className="text-default-400 w-40 px-4 py-3 text-right text-xs font-medium tracking-wider uppercase" role="columnheader" scope="col">
                        Value
                      </th>
                      <th className="text-default-400 px-4 py-3 text-left text-xs font-medium tracking-wider uppercase" role="columnheader" scope="col">
                        Tabs
                      </th>
                      <th className="text-default-400 w-28 px-4 py-3 text-right text-xs font-medium tracking-wider uppercase" role="columnheader" scope="col">
                        Snapshot
                      </th>
                    </tr>
                  </thead>
                  <tbody role="rowgroup">
                    {sorted.map((row, i) => {
                      const user = memberByUser[row.user_id]
                      const char = charByUser[row.user_id]
                      const age = snapshotAge(row.completed_at)
                      const pct = totalChaos > 0 ? (row.total_chaos / totalChaos) * 100 : 0

                      return (
                        <tr
                          key={row.user_id}
                          role="row"
                          className={`hover:bg-default-50 transition-colors ${i < sorted.length - 1 ? 'border-divider border-b' : ''}`}
                        >
                          <td className="px-4 py-3" data-cell="member" role="cell">
                            <Link
                              to="/dashboard/economy/$userId"
                              params={{ userId: row.user_id }}
                              className="flex min-w-0 items-center gap-2 rounded-sm"
                            >
                              <UserAvatar
                                className="shrink-0"
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
                              <div className="min-w-0">
                                <p className="text-foreground text-sm font-medium break-words">
                                  {user?.display_name ?? user?.poe_account_name ?? 'View snapshot'}
                                </p>
                                <p className="text-default-400 text-xs">
                                  {pct.toFixed(1)}% of group
                                </p>
                              </div>
                            </Link>
                          </td>

                          <td className="px-4 py-3" data-cell="character" role="cell">
                            {char ? (
                              <div>
                                <p className="text-foreground text-sm break-words">{char.name}</p>
                                <p className="text-default-400 text-xs">
                                  {char.class} {char.level}
                                </p>
                              </div>
                            ) : (
                              <span className="text-default-300 text-sm">—</span>
                            )}
                          </td>

                          <td className="px-4 py-3 text-right" data-cell="value" role="cell">
                            <span className="economy-data-label">Value</span>
                            <p className="text-foreground text-sm font-semibold tabular-nums">
                              {fmt(row.total_chaos)}
                            </p>
                          </td>

                          <td className="px-4 py-3" data-cell="tabs" role="cell">
                            <div className="flex flex-wrap gap-1">
                              {row.tabs.map((t) => (
                                <span key={t.name} className="bg-default-100 text-default-600 max-w-full rounded-md px-2 py-1 text-xs wrap-anywhere">
                                  {t.name}
                                  <span className="text-default-400 ml-1 inline-block max-w-full text-xs tabular-nums">
                                    {fmt(t.value)}
                                  </span>
                                </span>
                              ))}
                            </div>
                          </td>

                          <td className="px-4 py-3 text-right" data-cell="snapshot" role="cell">
                            <span className="economy-data-label">Snapshot</span>
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
