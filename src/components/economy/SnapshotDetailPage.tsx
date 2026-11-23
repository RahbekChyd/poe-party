import { SnapshotPricingNotice } from './SnapshotPricingNotice'
import { SnapshotEmptyState } from './SnapshotEmptyState'
import './economy-data.css'
import { storedSnapshotPrice, comparablePricing } from '../../lib/snapshot-pricing'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@heroui/react/button'
import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { Dropdown } from '@heroui/react/dropdown'
import { Spinner } from '@heroui/react/spinner'
import { useNinjaPrices } from '../../hooks/useNinjaPrices'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import {
  TrendingUp,
  Archive,
  Trophy,
  Check,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Search,
  Package,
  Target,
  X,
  ArrowUpRight,
  ArrowDownRight,
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
import { Link, useNavigate } from '@tanstack/react-router'
import { Route } from '../../routes/dashboard/economy/$userId'
import {
  useSetSnapshotItemExcluded,
  useSetSnapshotItemExcludedAllHistory,
  useSnapshotItems,
} from '../../hooks/useSnapshotItems'
import { useSnapshotHistory, type SnapshotDataPoint } from '../../hooks/useSnapshotHistory'
import { QueryStatePanel } from '../ui/QueryStatePanel'
import { useGroupMembers, useMyGroups } from '../../hooks/useGroups'
import { useLatestSnapshots, useLinkSnapshotStrategy } from '../../hooks/useSnapshots'
import { useStrategies } from '../../hooks/useStrategies'
import { useStashSnapshotFlow } from '../../hooks/useStashSnapshotFlow'
import {
  calculateChaosPerHour,
  calculateTrendStats,
  snapshotAge,
  contrastColor,
} from '../../lib/utils'
import { filterHistoryByRange, formatWealthAxisTick, type WealthHistoryRange } from '../../lib/wealth-history'
import { useCurrencyStore } from '../../store/currency-store'
import { useGroupStore } from '../../store/group-store'
import { KpiCardsSkeleton, ItemTableSkeleton } from '../layout/Skeletons'
import { useCurrentUser, useMyProfile } from '../../hooks/useCurrentUser'
import { WealthHistoryRangeSelector } from './WealthHistoryRangeSelector'
import { SNAPSHOT_LIMITS, hasActiveProAccess } from '../../lib/billing'
import { DropdownCaret, FieldInput, SimplePagination } from '../ui/heroui-native'
type SortKey = 'display_name' | 'stack_size' | 'unit_price' | 'price_chaos' | 'tab_name'

type PricedItem = {
  id: string
  name: string
  type_line: string
  base_type: string | null
  frame_type: number
  ilvl: number
  icon_url: string | null
  stack_size: number
  tab_name: string
  tab_type: string
  colour_r: number | null
  colour_g: number | null
  colour_b: number | null
  display_name: string
  unit_price: number
  price_chaos: number
  has_price: boolean
  is_excluded: boolean
  excluded_reason: string | null
}

const PAGE_SIZE = 25
const MISSING_SNAPSHOT_ID = '00000000-0000-0000-0000-000000000000'

export function SnapshotDetailPage() {
  const { userId } = Route.useParams()
  const { historyId } = Route.useSearch()
  const navigate = useNavigate()
  const activeGroupId = useGroupStore((s) => s.activeGroupId)

  const { data: snapshots } = useLatestSnapshots(activeGroupId)
  const latestSnapshot = snapshots?.find((snapshot) => snapshot.user_id === userId)
  const { data: history } = useSnapshotHistory(activeGroupId, userId)
  const [historyRange, setHistoryRange] = useState<WealthHistoryRange>('7d')
  const selectedHistoryId = historyId ?? null
  const selectedHistory = selectedHistoryId
    ? (history?.find((entry) => entry.id === selectedHistoryId) ?? null)
    : null
  const currentHistoryPoint =
    selectedHistory ?? (history?.find((point) => point.snapshot_id === latestSnapshot?.id) ?? null)
  const effectiveSnapshotId = selectedHistoryId
    ? (currentHistoryPoint?.snapshot_id ?? MISSING_SNAPSHOT_ID)
    : null
  const historicalSnapshotOptions = useMemo(() => {
    if (!history || history.length <= 1) return []
    return [...history]
      .slice(0, -1)
      .reverse()
  }, [history])
  const setSelectedHistoryId = (nextHistoryId: string | null) => {
    navigate({
      to: '/dashboard/economy/$userId',
      params: { userId },
      search: nextHistoryId ? { historyId: nextHistoryId } : {},
      replace: true,
    })
  }
  const visibleHistory = useMemo(
    () => filterHistoryByRange(history ?? [], historyRange, (point) => point.completed_at),
    [history, historyRange],
  )

  const { data: rawItems, isLoading, isError, refetch } = useSnapshotItems(activeGroupId, userId, effectiveSnapshotId)
  const { data: members } = useGroupMembers(activeGroupId)
  const { data: myGroups } = useMyGroups()
  const { data: strategyList } = useStrategies(activeGroupId)
  const { mutate: linkStrategy, isPending: linkingStrategy, isError: linkError } = useLinkSnapshotStrategy()
  const { mutate: setItemExcluded, isPending: updatingExclusion, isError: exclusionError } = useSetSnapshotItemExcluded(
    activeGroupId,
    userId,
    effectiveSnapshotId,
  )
  const { mutate: setItemExcludedAllHistory, isPending: updatingExclusionAllHistory, isError: allHistoryError } =
    useSetSnapshotItemExcludedAllHistory(activeGroupId, userId, effectiveSnapshotId)
  const display = useCurrencyStore((s) => s.display)
  const { triggerSnapshot, isBusy, modal } = useStashSnapshotFlow()
  const { data: myProfile } = useMyProfile()
  const { data: currentUser } = useCurrentUser()
  const isPro = hasActiveProAccess(myProfile)

  const membership = myGroups?.find((g) => g.group.id === activeGroupId)
  const activeLeague = membership?.group.league ?? null
  const isSnapshotOwner = currentUser?.id === userId
  const canLinkStrategy = isSnapshotOwner || membership?.role === 'admin' || membership?.role === 'editor'
  const canSnapshot = !!myProfile?.poe_token_expires_at && !!activeLeague

  const { data: ninjaData } = useNinjaPrices(activeLeague)
  const capturePricing = selectedHistoryId ? currentHistoryPoint?.pricing_summary : latestSnapshot?.pricing_summary
  const divinePrice = capturePricing ? capturePricing.divine_price : ninjaData?.divinePrice ?? null
  const showDivine = display === 'divine' && divinePrice != null && divinePrice > 0

  // Stored snapshot estimates remain authoritative as markets change.
  const items = useMemo<PricedItem[]>(() => (rawItems ?? []).map((item) => ({
    ...item,
    display_name: item.name || item.type_line,
    ...storedSnapshotPrice(item),
  })), [rawItems])

  // Min value stored in chaos internally; displayed in current currency unit
  const [minValueChaos, setMinValueChaos] = useState(0)
  const [search, setSearch] = useState('')
  const searchInput = useRef<HTMLInputElement>(null)
  const debouncedSearch = useDebouncedValue(search)
  const [tabFilters, setTabFilters] = useState<string[]>([])
  const [sortKey, setSortKey] = useState<SortKey>('price_chaos')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [excludeAllPrompt, setExcludeAllPrompt] = useState<{
    itemId: string
    expiresAt: number
  } | null>(null)
  const [promptNow, setPromptNow] = useState(() => Date.now())

  // tab name → { r, g, b } colour, built from item data
  const tabColours = useMemo(() => {
    const map = new Map<string, { r: number; g: number; b: number }>()
    for (const item of items) {
      if (!map.has(item.tab_name) && item.colour_r != null) {
        map.set(item.tab_name, { r: item.colour_r, g: item.colour_g!, b: item.colour_b! })
      }
    }
    return map
  }, [items])

  const fmt = (chaos: number) =>
    showDivine
      ? `${(chaos / (divinePrice ?? 1)).toFixed(1)} div`
      : `${Math.round(chaos).toLocaleString()}c`

  const fmtRate = (chaos: number) =>
    showDivine
      ? `${(chaos / (divinePrice ?? 1)).toFixed(1)} div/hr`
      : `${Math.round(chaos).toLocaleString()} chaos/hr`

  const fmtDelta = (chaos: number) =>
    chaos === 0 ? fmt(0) : `${chaos > 0 ? '+' : '-'}${fmt(Math.abs(chaos))}`

  const fmtUnit = (chaos: number) =>
    showDivine
      ? `${(chaos / (divinePrice ?? 1)).toFixed(1)} div`
      : chaos < 1
        ? `${chaos.toFixed(1)}c`
        : `${Math.round(chaos).toLocaleString()}c`

  // The input value shown to the user respects current display mode
  const minValueDisplay =
    showDivine ? (minValueChaos / (divinePrice ?? 1)).toFixed(1) : String(minValueChaos)

  const handleMinValueChange = (v: string) => {
    const parsed = parseFloat(v) || 0
    setMinValueChaos(showDivine ? parsed * (divinePrice ?? 1) : parsed)
    setPage(1)
  }

  // Member / snapshot lookup
  const member = members?.find((m) => m.user.id === userId)
  const snap = snapshots?.find((s) => s.user_id === userId)
  const displayName = member?.user.display_name ?? member?.user.poe_account_name ?? '…'
  const capturedAt = selectedHistoryId ? currentHistoryPoint?.completed_at : snap?.completed_at
  const age = snapshotAge(capturedAt ?? null)

  // KPIs
  const valuationUnavailable = capturePricing?.status === 'unavailable'
  const totalChaos =
    selectedHistoryId && currentHistoryPoint ? currentHistoryPoint.total_chaos : items.reduce((s, i) => s + (i.is_excluded ? 0 : i.price_chaos), 0)
  const snapshotChaosPerHour = latestSnapshot?.pricing_summary?.status === 'unavailable' || !comparablePricing(visibleHistory) ? null : calculateChaosPerHour(
    visibleHistory,
    (point) => point.completed_at,
    (point) => point.total_chaos,
  )
  const snapshotRateColor =
    snapshotChaosPerHour == null
      ? 'text-default-400'
      : snapshotChaosPerHour > 0
        ? 'text-success'
        : snapshotChaosPerHour < 0
          ? 'text-danger'
          : 'text-default-400'
  const snapshotTrend = comparablePricing(visibleHistory) ? calculateTrendStats(visibleHistory, (point) => point.total_chaos) : null
  const snapshotTrendColor =
    snapshotTrend == null
      ? 'text-default-400'
      : snapshotTrend.delta > 0
        ? 'text-success'
        : snapshotTrend.delta < 0
          ? 'text-danger'
          : 'text-default-400'
  const snapshotTrendLabel = (() => {
    if (!snapshotTrend) return 'No trend'
    const percentLabel =
      snapshotTrend.percentChange == null
        ? null
        : `${snapshotTrend.percentChange > 0 ? '+' : ''}${snapshotTrend.percentChange.toFixed(1)}%`
    return percentLabel
      ? `${fmtDelta(snapshotTrend.delta)} · ${percentLabel}`
      : fmtDelta(snapshotTrend.delta)
  })()
  const SnapshotTrendIcon =
    snapshotTrend == null
      ? Minus
      : snapshotTrend.delta > 0
        ? ArrowUpRight
        : snapshotTrend.delta < 0
          ? ArrowDownRight
          : Minus
  const includedItems = useMemo(() => items.filter((item) => !item.is_excluded), [items])

  const topItem = includedItems.reduce<PricedItem | null>(
    (best, i) => (i.price_chaos > (best?.price_chaos ?? 0) ? i : best),
    null,
  )

  // Highest-value tab
  const topTab = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of includedItems) {
      if (!item.has_price) continue
      map.set(item.tab_name, (map.get(item.tab_name) ?? 0) + item.price_chaos)
    }
    let best: { tab_name: string; value: number } | null = null
    for (const [tab_name, value] of map) {
      if (!best || value > best.value) best = { tab_name, value }
    }
    return best
  }, [includedItems])

  // Unique tab list for the filter dropdown
  const uniqueTabs = useMemo(() => [...new Set(items.map((i) => i.tab_name))].sort(), [items])

  // KPI click: toggle filter on/off
  const handleTopItemClick = () => {
    if (!topItem) return
    setSearch((prev) => (prev === topItem.display_name ? '' : topItem.display_name))
    setPage(1)
  }

  const handleTopTabClick = () => {
    if (!topTab) return
    setTabFilters((prev) =>
      prev.length === 1 && prev[0] === topTab.tab_name ? [] : [topTab.tab_name],
    )
    setPage(1)
  }

  const selectSnapshot = (nextHistoryId: string | null) => {
    setSelectedHistoryId(nextHistoryId)
    setTabFilters([])
    setPage(1)
  }

  // Active filter indicators for KPI cards
  const topItemActive = !!topItem && search === topItem.display_name
  const topTabActive = !!topTab && tabFilters.length === 1 && tabFilters[0] === topTab.tab_name

  // Apply filters
  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase()
    return items.filter(
      (i) =>
        i.price_chaos >= minValueChaos &&
        (!q || i.display_name.toLowerCase().includes(q)) &&
        (!tabFilters.length || tabFilters.includes(i.tab_name)),
    )
  }, [items, debouncedSearch, minValueChaos, tabFilters])

  // Apply sort
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: number | string
      let bv: number | string
      switch (sortKey) {
        case 'display_name':
          av = a.display_name
          bv = b.display_name
          break
        case 'stack_size':
          av = a.stack_size
          bv = b.stack_size
          break
        case 'unit_price':
          av = a.unit_price
          bv = b.unit_price
          break
        case 'tab_name':
          av = a.tab_name
          bv = b.tab_name
          break
        default:
          av = a.price_chaos
          bv = b.price_chaos
      }
      if (typeof av === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv as string) : (bv as string).localeCompare(av)
      }
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })
  }, [filtered, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('desc')
    }
    setPage(1)
  }

  const sortIcon = (col: SortKey) => {
    if (sortKey !== col) return <ChevronsUpDown size={12} className="text-default-400" aria-hidden="true" />
    return sortDir === 'asc' ? (
      <ChevronUp size={12} className="text-highlight" aria-hidden="true" />
    ) : (
      <ChevronDown size={12} className="text-highlight" aria-hidden="true" />
    )
  }

  const canEditExclusions = isSnapshotOwner && !!currentHistoryPoint?.snapshot_id
  const promptMsRemaining = excludeAllPrompt
    ? Math.max(0, excludeAllPrompt.expiresAt - promptNow)
    : 0

  useEffect(() => {
    if (!excludeAllPrompt) return
    const timer = window.setInterval(() => {
      setPromptNow(Date.now())
    }, 100)
    return () => window.clearInterval(timer)
  }, [excludeAllPrompt])

  useEffect(() => {
    if (!excludeAllPrompt || promptMsRemaining > 0) return
    setExcludeAllPrompt(null)
  }, [excludeAllPrompt, promptMsRemaining])

  useEffect(() => {
    if (!history) return
    if (!selectedHistoryId) return
    if (visibleHistory.some((point) => point.id === selectedHistoryId)) return
    if (history.some((point) => point.id === selectedHistoryId)) {
      setHistoryRange('all')
      return
    }
    navigate({
      to: '/dashboard/economy/$userId',
      params: { userId },
      search: {},
      replace: true,
    })
  }, [history, navigate, selectedHistoryId, userId, visibleHistory])

  return (
    <>
      {modal}
      <DashboardPage>
        <DashboardPageHeader
          backLink={
            <Link to="/dashboard/economy" className="button button--sm button--tertiary">
              Back to Economy
            </Link>
          }
          title={`${displayName}’s snapshot`}
          description={`${activeLeague ?? '…'} · ${age.label}`}
          actions={canSnapshot && (
            <Button
              size="sm"
              isPending={isBusy}
              isDisabled={!activeGroupId}
              onPress={() => triggerSnapshot(activeGroupId!, activeLeague)}
            >
              {({ isPending }) => (
                <>
                  {isPending ? <Spinner color="current" size="sm" /> : null}
                  {isPending ? 'Taking snapshot…' : 'Snapshot stash'}
                </>
              )}
            </Button>
          )}
        />

        {(snap || currentHistoryPoint) && !isLoading && (
          <SnapshotPricingNotice summaries={[capturePricing]}
            priced={capturePricing?.priced_item_count ?? items.filter((item) => item.has_price).length}
            unknown={capturePricing?.unpriced_item_count ?? items.filter((item) => !item.has_price).length} />
        )}

        {/* Strategy link */}
        {(() => {
          if (!currentHistoryPoint) return null
          const snapshotStrategyId = currentHistoryPoint.strategy_id ?? null
          const linkedStrategy = strategyList?.find((s) => s.id === snapshotStrategyId)
          const canEditLink = canLinkStrategy && !!currentHistoryPoint.snapshot_id
          return (
            <div className="rounded-large border-divider flex min-w-0 flex-wrap items-center gap-3 border px-4 py-3">
              <Target size={16} className="text-default-400 shrink-0" />
              <span className="text-default-400 shrink-0 text-sm">Strategy:</span>
              {linkedStrategy ? (
                <span className="bg-selected text-highlight min-w-0 rounded px-2 py-0.5 text-sm wrap-anywhere">
                  {linkedStrategy.name}
                </span>
              ) : (
                <span className="text-default-500 text-sm">None</span>
              )}
              {canEditLink ? (
                <Dropdown>
                  <Dropdown.Trigger
                    className="button button--sm button--tertiary"
                    isDisabled={linkingStrategy}
                  >
                    {linkingStrategy ? <Spinner color="current" size="sm" /> : null}
                    {snapshotStrategyId ? 'Change strategy' : 'Link strategy'}
                    <DropdownCaret className="ml-1" />
                  </Dropdown.Trigger>
                  <Dropdown.Popover className="max-w-[calc(100dvw-2rem)]">
                    <Dropdown.Menu
                      aria-label="Link strategy"
                      selectionMode="single"
                      selectedKeys={new Set([snapshotStrategyId ?? '__none'])}
                      onAction={(key) => {
                        const strategyId = key === '__none' ? null : (key as string)
                        linkStrategy({ snapshotId: currentHistoryPoint.snapshot_id!, strategyId })
                      }}
                    >
                      {snapshotStrategyId ? (
                        <Dropdown.Item id="__none" textValue="Unlink" variant="danger">
                          <Dropdown.ItemIndicator />
                          Unlink
                        </Dropdown.Item>
                      ) : null}
                      {(strategyList ?? []).map((s) => (
                        <Dropdown.Item key={s.id} id={s.id} textValue={s.name}>
                          <Dropdown.ItemIndicator />
                          <span className="min-w-0 wrap-anywhere">{s.name}</span>
                        </Dropdown.Item>
                      ))}
                    </Dropdown.Menu>
                  </Dropdown.Popover>
                </Dropdown>
              ) : !currentHistoryPoint.snapshot_id ? (
                <span className="text-default-400 text-xs">Raw snapshot removed by retention</span>
              ) : null}
              {linkError && <p role="alert" className="text-danger text-sm">Couldn’t update the strategy link. Try again.</p>}
            </div>
          )
        })()}

        {(exclusionError || allHistoryError) && (
          <p role="alert" className="text-danger text-sm">
            {allHistoryError ? 'Couldn’t apply the exclusion to history.' : 'Couldn’t update the item.'} Try again.
          </p>
        )}
        {isLoading ? (
          <>
            <p role="status" className="text-default-500 text-sm">Loading stash items…</p>
            <KpiCardsSkeleton />
            <ItemTableSkeleton />
          </>
        ) : isError && !rawItems ? (
          <QueryStatePanel kind="error" title="Couldn’t load the snapshot" description="Try again to view stash items." onRetry={refetch} />
        ) : !items.length && !currentHistoryPoint ? (
          <SnapshotEmptyState
            game={membership?.group.game ?? null}
            league={activeLeague}
            message="No stash items in this snapshot."
          />
        ) : (
          <>
            {!items.length && selectedHistoryId && !currentHistoryPoint?.snapshot_id && (
              <Card className="p-0">
                <Card.Content className="flex flex-col items-center gap-3 p-8 text-center">
                  <Package size={28} className="text-default-300" />
                  <p className="text-default-400 text-sm">
                    Raw snapshot data has been removed by retention. Summary value and strategy link
                    are still preserved.
                  </p>
                </Card.Content>
              </Card>
            )}

            {/* KPI cards */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {/* Total Value */}
              <Card className="p-0">
                <Card.Content className="flex flex-row items-center gap-3 p-4">
                  <div className="bg-wealth-series/15 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                    <TrendingUp size={18} className="text-wealth-series" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-default-400 text-xs">{capturePricing?.status === 'partial' ? 'Priced subtotal' : 'Total Value'}</p>
                    <p className="text-foreground text-lg font-bold wrap-anywhere tabular-nums">{valuationUnavailable ? 'Pricing unavailable' : fmt(totalChaos)}</p>
                    <p className="text-default-400 text-xs">{divinePrice == null ? 'Divine conversion unavailable' : `1 div = ${divinePrice.toFixed(0)}c`}</p>
                    {capturedAt && <time className="text-default-500 mt-1 block text-xs" dateTime={capturedAt}>{new Date(capturedAt).toLocaleString()}</time>}
                  </div>
                </Card.Content>
              </Card>

              {/* Highest Value Tab — clickable */}
              <Card className={topTabActive ? 'border-highlight bg-selected p-0' : 'p-0'}>
                <button type="button" aria-pressed={topTabActive} disabled={!topTab} className="w-full rounded-large text-left" onClick={handleTopTabClick}>
                  <Card.Content className="flex flex-row items-center gap-3 p-4">
                    <div className="bg-content2 text-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                      <Archive size={18} aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-default-400 text-xs">
                        Top Tab {topTabActive && <span className="text-highlight font-semibold">· filtered</span>}
                      </p>
                      {topTab ? (
                        <>
                          <p className="text-foreground text-sm font-bold wrap-anywhere">
                            {topTab.tab_name}
                          </p>
                          <p className="text-default-400 text-xs">{fmt(topTab.value)}</p>
                        </>
                      ) : (
                        <p className="text-default-400 text-sm">—</p>
                      )}
                    </div>
                  </Card.Content>
                </button>
              </Card>

              {/* Top Item — clickable */}
              <Card className={topItemActive ? 'border-highlight bg-selected p-0' : 'p-0'}>
                <button type="button" aria-pressed={topItemActive} disabled={!topItem} className="w-full rounded-large text-left" onClick={handleTopItemClick}>
                  <Card.Content className="flex flex-row items-center gap-3 p-4">
                    <div className="bg-content2 text-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                      <Trophy size={18} aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-default-400 text-xs">
                        Top Item {topItemActive && <span className="text-highlight font-semibold">· filtered</span>}
                      </p>
                      {topItem ? (
                        <>
                          <p className="text-foreground text-sm font-bold wrap-anywhere">
                            {topItem.display_name}
                          </p>
                          <p className="text-default-400 text-xs">{fmt(topItem.price_chaos)}</p>
                        </>
                      ) : (
                        <p className="text-default-400 text-sm">—</p>
                      )}
                    </div>
                  </Card.Content>
                </button>
              </Card>
            </div>

            {/* Wealth History */}
            {history && history.length > 0 && (
              <Card>
                <Card.Header className="flex flex-row flex-wrap items-center justify-between gap-3 px-4 pt-4 pb-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-foreground text-sm font-semibold">Wealth History</h2>
                    <WealthHistoryRangeSelector value={historyRange} onChange={setHistoryRange} />
                    {selectedHistoryId && (
                      <Button
                        size="sm"
                        variant="tertiary"
                        className="h-5 min-w-0 px-2 text-xs"
                        onPress={() => selectSnapshot(null)}
                      >
                        Back to latest
                      </Button>
                    )}
                  </div>
                  <div className="flex items-center justify-center gap-3">
                    <p className={`text-base font-semibold ${snapshotRateColor}`}>
                      {snapshotChaosPerHour == null ? 'No data' : fmtRate(snapshotChaosPerHour)}
                    </p>
                    <div
                      className={`border-divider/60 flex items-center gap-1.5 border-l pl-3 text-xs ${snapshotTrendColor}`}
                    >
                      <SnapshotTrendIcon size={13} />
                      <span>{snapshotTrendLabel}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {history.length === 1 && !isPro ? (
                      <Link to="/dashboard/support" className="inline-flex">
                        <Chip
                          className="bg-info-soft text-info cursor-pointer px-3"
                          size="sm"
                          variant="soft"
                        >
                          Community keeps {SNAPSHOT_LIMITS.free}. Supporter keeps{' '}
                          {SNAPSHOT_LIMITS.pro}.
                        </Chip>
                      </Link>
                    ) : (
                      <span className="text-default-400 text-xs">
                        {selectedHistoryId
                          ? new Date(
                              history.find((h) => h.id === selectedHistoryId)?.completed_at ?? '',
                            ).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Viewing latest capture'}
                      </span>
                    )}
                  </div>
                </Card.Header>
                <Card.Content className="px-2 pt-2 pb-3">
                  <ResponsiveContainer width="100%" height={160}>
                    <AreaChart
                      data={visibleHistory}
                      title="Stash wealth in chaos orbs"
                      desc="Use the left and right arrow keys to read snapshot values. Use Select snapshot to browse a capture."
                      margin={{ top: 4, right: 12, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="wealthGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--wealth-series)" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="var(--wealth-series)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--separator)" />
                      <XAxis
                        dataKey="completed_at"
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
                        unit="c"
                        tick={{ fontSize: 10, fill: 'var(--muted-text)' }}
                        axisLine={false}
                        tickLine={false}
                        width={44}
                      />
                      <RechartsTooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null
                          const point = payload[0].payload as SnapshotDataPoint
                          const label = new Date(point.completed_at).toLocaleString(undefined, {
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
                                    ? `Priced subtotal: ${fmt(point.total_chaos)}`
                                    : fmt(point.total_chaos)}
                              </p>
                              {point.excluded_chaos_total > 0 && (
                                <p className="text-default-400 mt-0.5">
                                  Excluded: {fmt(point.excluded_chaos_total)}
                                </p>
                              )}
                              {visibleHistory.length > 1 && (
                                <p className="text-default-400 mt-0.5">
                                  {point.snapshot_id ? 'View snapshot items' : 'Summary only'}
                                </p>
                              )}
                            </div>
                          )
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="total_chaos"
                        stroke="var(--wealth-series)"
                        fill="url(#wealthGrad)"
                        strokeWidth={2}
                        dot={(props: { cx?: number; cy?: number; payload: { id: string } }) => {
                          if (props.cx == null || props.cy == null) return null
                          const latestId = visibleHistory[visibleHistory.length - 1]?.id
                          const effectiveId = selectedHistoryId ?? latestId
                          const active = props.payload.id === effectiveId
                          const nextId = active || props.payload.id === latestId ? null : props.payload.id
                          return (
                            <g
                              key={props.payload.id}
                              className={visibleHistory.length > 1 ? 'cursor-pointer' : undefined}
                              onClick={visibleHistory.length > 1 ? () => selectSnapshot(nextId) : undefined}
                              aria-hidden="true"
                            >
                              <circle cx={props.cx} cy={props.cy} r={12} fill="currentColor" opacity={0} />
                              <circle
                                cx={props.cx}
                                cy={props.cy}
                                r={active ? 5 : 3}
                                fill="var(--wealth-series)"
                                stroke={active ? 'var(--surface)' : 'none'}
                                strokeWidth={active ? 2 : 0}
                              />
                            </g>
                          )
                        }}
                        activeDot={{ r: 6, fill: 'var(--wealth-series)', stroke: 'var(--surface)', strokeWidth: 2, pointerEvents: 'none' }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </Card.Content>
              </Card>
            )}

            {/* Filters */}
            <Card className="p-0">
              <Card.Content className="flex flex-row flex-wrap items-center gap-3 p-3">
                <FieldInput
                  ref={searchInput}
                  size="sm"
                  aria-label="Search items"
                  placeholder="Search items…"
                  value={search}
                  onValueChange={(v) => {
                    setSearch(v)
                    setPage(1)
                  }}
                  startContent={<Search size={14} className="text-default-400" />}
                  className="w-52"
                  isClearable
                  onClear={() => {
                    setSearch('')
                    setPage(1)
                  }}
                />
                <FieldInput
                  size="sm"
                  type="number"
                  aria-label={`Minimum value in ${showDivine ? 'divines' : 'chaos'}`}
                  placeholder="0"
                  value={minValueDisplay}
                  onValueChange={handleMinValueChange}
                  endContent={
                    <span className="text-default-400 text-xs">
                      {showDivine ? 'div' : 'c'}
                    </span>
                  }
                  className="w-40"
                  min={0}
                />
                <Dropdown>
                  <Dropdown.Trigger className="select__trigger min-h-10 min-w-0 max-w-full items-center sm:min-w-40">
                    <span className="select__value min-w-0">
                      {tabFilters.length === 0 ? (
                        <span className="truncate">All tabs</span>
                      ) : tabFilters.length <= 3 ? (
                        <span className="flex min-w-0 flex-wrap items-center gap-1">
                          {tabFilters.map((tab) => {
                            const col = tabColours.get(tab)
                            return col ? (
                              <span
                                key={tab}
                                className="inline-flex min-w-0 max-w-full items-center rounded px-1.5 py-0.5 text-xs font-medium wrap-anywhere"
                                style={{
                                  backgroundColor: `rgb(${col.r},${col.g},${col.b})`,
                                  color: contrastColor(col.r, col.g, col.b),
                                }}
                              >
                                {tab}
                              </span>
                            ) : (
                              <span
                                key={tab}
                                className="bg-default-200 min-w-0 rounded px-1.5 py-0.5 text-xs wrap-anywhere"
                              >
                                {tab}
                              </span>
                            )
                          })}
                        </span>
                      ) : (
                        <span className="truncate">{tabFilters.length} tabs</span>
                      )}
                    </span>
                    <DropdownCaret className="select__indicator" />
                  </Dropdown.Trigger>
                  <Dropdown.Popover className="max-h-64 max-w-[calc(100dvw-2rem)] overflow-y-auto">
                    <Dropdown.Menu
                      aria-label="Filter by tab"
                      selectionMode="multiple"
                      selectedKeys={new Set(tabFilters)}
                      onSelectionChange={(keys) => {
                        setTabFilters(keys === 'all' ? uniqueTabs : [...(keys as Set<string>)])
                        setPage(1)
                      }}
                    >
                      {uniqueTabs.map((tab) => {
                        const col = tabColours.get(tab)
                        const isSelected = tabFilters.includes(tab)
                        return (
                          <Dropdown.Item
                            key={tab}
                            id={tab}
                            textValue={tab}
                            className={isSelected ? 'bg-selected' : undefined}
                          >
                            <span className="flex w-full min-w-0 items-center gap-3">
                              {col ? (
                                <span
                                  className="min-w-0 rounded px-1.5 py-0.5 text-xs font-medium wrap-anywhere"
                                  style={{
                                    backgroundColor: `rgb(${col.r},${col.g},${col.b})`,
                                    color: contrastColor(col.r, col.g, col.b),
                                  }}
                                >
                                  {tab}
                                </span>
                              ) : (
                                <span className="min-w-0 wrap-anywhere">{tab}</span>
                              )}
                              <span
                                aria-hidden="true"
                                className={`ml-auto inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-all duration-150 ${
                                  isSelected
                                    ? 'text-highlight border border-current'
                                    : 'scale-90 opacity-0'
                                }`}
                              >
                                <Check size={12} strokeWidth={3} />
                              </span>
                            </span>
                          </Dropdown.Item>
                        )
                      })}
                    </Dropdown.Menu>
                  </Dropdown.Popover>
                </Dropdown>

                {/* Snapshot selector */}
                {history && historicalSnapshotOptions.length > 0 && (
                  <Dropdown>
                    <Dropdown.Trigger className="select__trigger h-10 min-h-10 min-w-0 max-w-full items-center sm:min-w-44">
                      <span className="select__value min-w-0 truncate">
                        <span className="sr-only">Select snapshot: </span>
                        {selectedHistoryId
                          ? new Date(
                              history.find((h) => h.id === selectedHistoryId)?.completed_at ?? '',
                            ).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Latest snapshot'}
                      </span>
                      <DropdownCaret className="select__indicator" />
                    </Dropdown.Trigger>
                    <Dropdown.Popover className="max-h-64 max-w-[calc(100dvw-2rem)] overflow-y-auto">
                      <Dropdown.Menu
                        aria-label="Select snapshot"
                        selectionMode="single"
                        selectedKeys={new Set([selectedHistoryId ?? '__latest'])}
                        onAction={(key) => selectSnapshot(key === '__latest' ? null : String(key))}
                      >
                        <Dropdown.Item id="__latest" textValue="Latest snapshot">
                          <Dropdown.ItemIndicator />
                          Latest snapshot
                        </Dropdown.Item>
                        {historicalSnapshotOptions.map((snap) => {
                          const label = new Date(snap.completed_at).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                          return (
                            <Dropdown.Item key={snap.id} id={snap.id} textValue={label}>
                              <Dropdown.ItemIndicator />
                              <span className="flex min-w-0 flex-wrap items-center gap-2">
                                <span>{label}</span>
                                <span className="text-default-400 text-xs">
                                  {Math.round(snap.total_chaos).toLocaleString()}c
                                </span>
                                {!snap.snapshot_id && (
                                  <span className="text-default-500 text-[10px] tracking-wide uppercase">
                                    summary only
                                  </span>
                                )}
                              </span>
                            </Dropdown.Item>
                          )
                        })}
                      </Dropdown.Menu>
                    </Dropdown.Popover>
                  </Dropdown>
                )}

                <span role="status" className="text-default-400 ml-auto text-xs tabular-nums">
                  {filtered.length.toLocaleString()} item{filtered.length !== 1 ? 's' : ''}
                  {filtered.length !== items.length && ` of ${items.length.toLocaleString()}`}
                </span>
              </Card.Content>
            </Card>

            {/* Table — columns: Icon | Item | Tab | Stack | Unit | Total */}
            <Card className="gap-0 overflow-visible p-0">
              <Card.Content className="p-0">
                <div className="economy-data" role="region" aria-label="Snapshot stash items">
                  <table className="economy-stash" role="table">
                    <thead role="rowgroup">
                      <tr role="row" className="border-divider border-b">
                        <th
                          scope="col"
                          role="columnheader"
                          className="w-20 text-default-400 px-2 py-3 text-center text-xs font-medium tracking-wider uppercase"
                        >
                          Included
                        </th>
                        <th scope="col" role="columnheader" className="w-12 px-4 py-3" />
                        <th
                          scope="col"
                          role="columnheader"
                          aria-sort={
                            sortKey === 'display_name'
                              ? sortDir === 'asc'
                                ? 'ascending'
                                : 'descending'
                              : undefined
                          }
                          className="text-default-400 px-4 py-3 text-left text-xs font-medium tracking-wider uppercase"
                        >
                          <button
                            className="hover:text-foreground flex items-center gap-1"
                            onClick={() => handleSort('display_name')}
                          >
                            Item {sortIcon('display_name')}
                          </button>
                        </th>
                        <th
                          scope="col"
                          role="columnheader"
                          aria-sort={
                            sortKey === 'tab_name'
                              ? sortDir === 'asc'
                                ? 'ascending'
                                : 'descending'
                              : undefined
                          }
                          className="w-[20%] text-default-400 px-4 py-3 text-left text-xs font-medium tracking-wider uppercase"
                        >
                          <button
                            className="hover:text-foreground flex items-center gap-1"
                            onClick={() => handleSort('tab_name')}
                          >
                            Tab {sortIcon('tab_name')}
                          </button>
                        </th>
                        <th
                          scope="col"
                          role="columnheader"
                          aria-sort={
                            sortKey === 'stack_size'
                              ? sortDir === 'asc'
                                ? 'ascending'
                                : 'descending'
                              : undefined
                          }
                          className="w-18 text-default-400 px-4 py-3 text-right text-xs font-medium tracking-wider uppercase"
                        >
                          <button
                            className="hover:text-foreground ml-auto flex items-center gap-1"
                            onClick={() => handleSort('stack_size')}
                          >
                            Stack {sortIcon('stack_size')}
                          </button>
                        </th>
                        <th
                          scope="col"
                          role="columnheader"
                          aria-sort={
                            sortKey === 'unit_price'
                              ? sortDir === 'asc'
                                ? 'ascending'
                                : 'descending'
                              : undefined
                          }
                          className="w-30 text-default-400 px-2 py-3 text-right text-xs font-medium tracking-wider uppercase"
                        >
                          <button
                            className="hover:text-foreground ml-auto flex items-center gap-1"
                            onClick={() => handleSort('unit_price')}
                          >
                            Unit {sortIcon('unit_price')}
                          </button>
                        </th>
                        <th
                          scope="col"
                          role="columnheader"
                          aria-sort={
                            sortKey === 'price_chaos'
                              ? sortDir === 'asc'
                                ? 'ascending'
                                : 'descending'
                              : undefined
                          }
                          className="w-32 text-default-400 px-3 py-3 text-right text-xs font-medium tracking-wider uppercase"
                        >
                          <button
                            className="hover:text-foreground ml-auto flex items-center gap-1"
                            onClick={() => handleSort('price_chaos')}
                          >
                            Total {sortIcon('price_chaos')}
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody role="rowgroup">
                      {paginated.map((item, i) => {
                        const showUnit = item.unit_price > 0
                        const tabStyle =
                          item.colour_r != null
                            ? {
                                backgroundColor: `rgb(${item.colour_r},${item.colour_g},${item.colour_b})`,
                                color: contrastColor(item.colour_r, item.colour_g!, item.colour_b!),
                              }
                            : undefined
                        const promptActive = excludeAllPrompt?.itemId === item.id
                        const promptProgress = excludeAllPrompt
                          ? Math.max(0, Math.min(1, promptMsRemaining / 5000))
                          : 0
                        return (
                          <Fragment key={item.id}>
                            <tr
                              role="row"
                              className={i < paginated.length - 1 ? 'border-divider border-b' : undefined}
                            >
                              <td role="cell" data-cell="include" className="px-2 py-2 text-center">
                                <span className="economy-data-label" aria-hidden="true">
                                  Included
                                </span>
                                {canEditExclusions ? (
                                  <div className="relative inline-flex items-center justify-center">
                                    <button
                                      type="button"
                                      aria-label={item.is_excluded ? 'Include item' : 'Exclude item'}
                                      title={item.is_excluded ? 'Include item' : 'Exclude item'}
                                      disabled={updatingExclusion || updatingExclusionAllHistory}
                                      onClick={() =>
                                        setItemExcluded(
                                          {
                                            itemId: item.id,
                                            isExcluded: !item.is_excluded,
                                            reason: item.is_excluded ? null : 'manual',
                                          },
                                          {
                                            onSuccess: () => {
                                              if (item.is_excluded) {
                                                setExcludeAllPrompt(null)
                                                return
                                              }
                                              setPromptNow(Date.now())
                                              setExcludeAllPrompt({
                                                itemId: item.id,
                                                expiresAt: Date.now() + 5000,
                                              })
                                            },
                                          },
                                        )
                                      }
                                      className={`economy-inclusion-toggle border-control inline-flex h-6 w-6 items-center justify-center rounded-md border text-xs font-semibold transition-colors ${
                                        item.is_excluded
                                          ? 'bg-warning/15 text-warning hover:bg-warning/20'
                                          : 'bg-success/10 text-success hover:bg-success/15'
                                      } ${updatingExclusion || updatingExclusionAllHistory ? 'cursor-wait opacity-60' : ''}`}
                                    >
                                      {item.is_excluded ? <X size={12} aria-hidden="true" /> : <Check size={12} aria-hidden="true" />}
                                    </button>
                                  </div>
                                ) : item.is_excluded ? (
                                  <Chip size="sm" color="warning" variant="soft">
                                    Off
                                  </Chip>
                                ) : (
                                  <span className="text-default-300 text-xs">-</span>
                                )}
                              </td>
                              <td role="cell" data-cell="icon" className="p-2">
                                {item.icon_url ? (
                                  <img
                                    src={item.icon_url}
                                    alt=""
                                    className="h-8 w-8 object-contain"
                                    loading="lazy"
                                  />
                                ) : (
                                  <div className="bg-default-100 h-8 w-8 rounded" />
                                )}
                              </td>
                              <td role="cell" data-cell="item" className="px-4 py-2">
                                <p className={`text-sm ${item.is_excluded ? 'text-default-500' : 'text-foreground'}`}>{item.display_name}</p>
                                {item.is_excluded && <p className="text-default-500 text-xs">Excluded from totals</p>}
                                {item.base_type && item.base_type !== item.display_name && (
                                  <p className="text-default-400 text-xs">{item.base_type}</p>
                                )}
                              </td>
                              <td role="cell" data-cell="tab" className="px-4 py-2">
                                <button
                                  type="button"
                                  aria-pressed={tabFilters.includes(item.tab_name)}
                                  className="bg-default-100 text-default-700 max-w-full cursor-pointer rounded px-2 py-0.5 text-left text-xs font-medium wrap-anywhere hover:underline aria-pressed:underline"
                                  style={tabStyle}
                                  onClick={() => {
                                    setTabFilters((prev) =>
                                      prev.includes(item.tab_name)
                                        ? prev.filter((t) => t !== item.tab_name)
                                        : [...prev, item.tab_name],
                                    )
                                    setPage(1)
                                  }}
                                >
                                  {item.tab_name}
                                </button>
                              </td>
                              <td role="cell" data-cell="quantity" className="px-4 py-2 text-right tabular-nums">
                                <span className="economy-data-label" aria-hidden="true">
                                  Stack
                                </span>
                                <span className="text-foreground text-sm">
                                  {item.stack_size.toLocaleString()}
                                </span>
                              </td>
                              <td role="cell" data-cell="unit" className="px-2 py-2 text-right tabular-nums">
                                <span className="economy-data-label" aria-hidden="true">
                                  Unit
                                </span>
                                <span
                                  className={`text-sm ${
                                    item.is_excluded
                                      ? 'text-default-500 line-through'
                                      : 'text-default-400'
                                  }`}
                                >
                                  {showUnit ? fmtUnit(item.unit_price) : '—'}
                                </span>
                              </td>
                              <td role="cell" data-cell="value" className="px-3 py-2 text-right tabular-nums">
                                <span className="economy-data-label" aria-hidden="true">
                                  Total
                                </span>
                                <span
                                  className={`text-sm font-semibold ${
                                    item.price_chaos > 0
                                      ? item.is_excluded
                                        ? 'text-default-500 line-through'
                                        : 'text-foreground'
                                      : 'text-default-500'
                                  }`}
                                >
                                  {item.has_price ? fmt(item.price_chaos) : 'Unknown'}
                                </span>
                              </td>
                            </tr>
                            {promptActive && (
                              <tr role="row" className="border-divider border-b">
                                <td role="cell" colSpan={7} className="px-4 py-2">
                                  <div className="bg-default-50 border-divider rounded-lg overflow-hidden border">
                                    <div className="px-3 py-2 text-left">
                                      <p
                                        className="text-foreground text-xs font-medium"
                                        role="status"
                                      >
                                        Exclude from all snapshots?
                                      </p>
                                      <p className="text-default-400 mt-0.5 text-[11px] leading-relaxed">
                                        Apply this to matching items in your saved history.
                                      </p>
                                      <div className="mt-2 flex flex-wrap items-center gap-2">
                                        <Button
                                          size="sm"
                                          variant="tertiary"
                                          className="h-7 min-w-0 px-2 text-xs"
                                          isPending={updatingExclusionAllHistory}
                                          onPress={() =>
                                            setItemExcludedAllHistory(
                                              {
                                                itemId: item.id,
                                                isExcluded: true,
                                                reason: 'manual',
                                              },
                                              {
                                                onSuccess: () => setExcludeAllPrompt(null),
                                              },
                                            )
                                          }
                                        >
                                          {({ isPending }) => (
                                            <>
                                              {isPending ? (
                                                <Spinner color="current" size="sm" />
                                              ) : null}
                                              All snapshots
                                            </>
                                          )}
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="tertiary"
                                          className="h-7 min-w-0 px-2 text-xs"
                                          onPress={() => setExcludeAllPrompt(null)}
                                        >
                                          Dismiss
                                        </Button>
                                        <span className="text-default-400 ml-auto text-[11px] tabular-nums">
                                          {(promptMsRemaining / 1000).toFixed(1)}s
                                        </span>
                                      </div>
                                    </div>
                                    <div className="bg-warning/20 h-1 w-full">
                                      <div
                                        className="bg-warning linear h-full origin-left transition-[width] duration-100"
                                        style={{ width: `${promptProgress * 100}%` }}
                                      />
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        )
                      })}
                      {paginated.length === 0 && (
                        <tr role="row">
                          <td
                            role="cell"
                            colSpan={7}
                            className="economy-empty-cell"
                          >
                            {items.length > 0 ? (
                              <div className="economy-empty-results">
                                <p>No results match these filters.</p>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="min-h-11"
                                  onPress={() => {
                                    searchInput.current?.focus()
                                    setSearch('')
                                    setMinValueChaos(0)
                                    setTabFilters([])
                                    setPage(1)
                                  }}
                                >
                                  Clear filters
                                </Button>
                              </div>
                            ) : (
                              <p>No stash items in this snapshot.</p>
                            )}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card.Content>
              {totalPages > 1 && (
                <Card.Footer className="border-divider border-t px-3 py-2">
                  <SimplePagination total={totalPages} page={page} onChange={setPage} />
                </Card.Footer>
              )}
            </Card>
          </>
        )}
      </DashboardPage>
    </>
  )
}
import { DashboardPage, DashboardPageHeader } from '../ui/dashboard'
