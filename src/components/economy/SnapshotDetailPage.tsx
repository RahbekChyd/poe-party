import { useEffect, useMemo, useState } from 'react'
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
import { filterHistoryByRange, type WealthHistoryRange } from '../../lib/wealth-history'
import { useCurrencyStore } from '../../store/currency-store'
import { useGroupStore } from '../../store/group-store'
import { KpiCardsSkeleton, ItemTableSkeleton } from '../layout/Skeletons'
import { useMyProfile } from '../../hooks/useCurrentUser'
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

  const { data: history } = useSnapshotHistory(activeGroupId, userId)
  const [historyRange, setHistoryRange] = useState<WealthHistoryRange>('7d')
  const selectedHistoryId = historyId ?? null
  const selectedHistory = selectedHistoryId
    ? (history?.find((entry) => entry.id === selectedHistoryId) ?? null)
    : null
  const currentHistoryPoint =
    selectedHistory ?? (history && history.length > 0 ? history[history.length - 1] : null)
  const effectiveSnapshotId = selectedHistoryId
    ? (currentHistoryPoint?.snapshot_id ?? MISSING_SNAPSHOT_ID)
    : null
  const historicalSnapshotOptions = useMemo(() => {
    if (!history || history.length <= 1) return []
    return [...history]
      .slice(0, -1)
      .filter((entry) => !!entry.snapshot_id)
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

  const { data: rawItems, isLoading } = useSnapshotItems(activeGroupId, userId, effectiveSnapshotId)
  const { data: members } = useGroupMembers(activeGroupId)
  const { data: myGroups } = useMyGroups()
  const { data: snapshots } = useLatestSnapshots(activeGroupId)
  const { data: strategyList } = useStrategies(activeGroupId)
  const { mutate: linkStrategy, isPending: linkingStrategy } = useLinkSnapshotStrategy()
  const { mutate: setItemExcluded, isPending: updatingExclusion } = useSetSnapshotItemExcluded(
    activeGroupId,
    userId,
    effectiveSnapshotId,
  )
  const { mutate: setItemExcludedAllHistory, isPending: updatingExclusionAllHistory } =
    useSetSnapshotItemExcludedAllHistory(activeGroupId, userId, effectiveSnapshotId)
  const display = useCurrencyStore((s) => s.display)
  const { triggerSnapshot, isBusy, modal } = useStashSnapshotFlow()
  const { data: myProfile } = useMyProfile()
  const isPro = hasActiveProAccess(myProfile)

  const activeLeague = myGroups?.find((g) => g.group.id === activeGroupId)?.group.league ?? null
  const canSnapshot = !!myProfile?.poe_token_expires_at && !!activeLeague

  const { data: ninjaData } = useNinjaPrices(activeLeague)
  const divinePrice = ninjaData?.divinePrice ?? 200

  // Apply client-side pricing using ninja price map
  const items = useMemo<PricedItem[]>(() => {
    if (!rawItems) return []
    return rawItems.map((item) => {
      const key = item.frame_type === 3 ? item.name : item.type_line
      const storedPrice = item.price_chaos ?? 0
      const fallbackUnitPrice = ninjaData?.byName.get(key) ?? 0
      const unitPrice =
        item.stack_size > 0
          ? storedPrice > 0
            ? storedPrice / item.stack_size
            : fallbackUnitPrice
          : 0
      return {
        ...item,
        display_name: item.name || item.type_line,
        unit_price: unitPrice,
        price_chaos: storedPrice > 0 ? storedPrice : unitPrice * item.stack_size,
      }
    })
  }, [rawItems, ninjaData])

  // Min value stored in chaos internally; displayed in current currency unit
  const [minValueChaos, setMinValueChaos] = useState(0)
  const [search, setSearch] = useState('')
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
    display === 'divine'
      ? `${(chaos / divinePrice).toFixed(1)} div`
      : `${Math.round(chaos).toLocaleString()}c`

  const fmtRate = (chaos: number) =>
    display === 'divine'
      ? `${(chaos / divinePrice).toFixed(1)} div/hr`
      : `${Math.round(chaos).toLocaleString()} chaos/hr`

  const fmtDelta = (chaos: number) =>
    chaos === 0 ? fmt(0) : `${chaos > 0 ? '+' : '-'}${fmt(Math.abs(chaos))}`

  const fmtUnit = (chaos: number) =>
    display === 'divine'
      ? `${(chaos / divinePrice).toFixed(1)} div`
      : chaos < 1
        ? `${chaos.toFixed(1)}c`
        : `${Math.round(chaos).toLocaleString()}c`

  // The input value shown to the user respects current display mode
  const minValueDisplay =
    display === 'divine' ? (minValueChaos / divinePrice).toFixed(1) : String(minValueChaos)

  const handleMinValueChange = (v: string) => {
    const parsed = parseFloat(v) || 0
    setMinValueChaos(display === 'divine' ? parsed * divinePrice : parsed)
    setPage(1)
  }

  // Member / snapshot lookup
  const member = members?.find((m) => m.user.id === userId)
  const snap = snapshots?.find((s) => s.user_id === userId)
  const displayName = member?.user.display_name ?? member?.user.poe_account_name ?? '…'
  const age = snapshotAge(snap?.completed_at ?? null)

  // KPIs
  const totalChaos =
    currentHistoryPoint?.total_chaos ?? items.reduce((s, i) => s + i.price_chaos, 0)
  const snapshotChaosPerHour = calculateChaosPerHour(
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
  const snapshotTrend = calculateTrendStats(visibleHistory, (point) => point.total_chaos)
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
    if (sortKey !== col) return <ChevronsUpDown size={12} className="text-default-300" />
    return sortDir === 'asc' ? (
      <ChevronUp size={12} className="text-primary" />
    ) : (
      <ChevronDown size={12} className="text-primary" />
    )
  }

  const canEditExclusions = !!currentHistoryPoint?.snapshot_id
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
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link to="/dashboard/economy">
              <Button variant="tertiary" size="sm" className="mb-2 -ml-2">
                Economy
              </Button>
            </Link>
            <h1 className="text-foreground text-2xl font-semibold">{displayName}'s Snapshot</h1>
            <p className="text-default-400 mt-1 text-sm">
              {activeLeague ?? '…'} · {age.label}
            </p>
          </div>
          {canSnapshot && (
            <Button
              size="sm"
              variant="tertiary"
              isPending={isBusy}
              isDisabled={!activeGroupId}
              onPress={() => triggerSnapshot(activeGroupId!, activeLeague)}
              className="mt-8 shrink-0"
            >
              {({ isPending }) => (
                <>
                  {isPending ? <Spinner color="current" size="sm" /> : null}
                  {isPending ? 'Snapshotting...' : 'Snapshot'}
                </>
              )}
            </Button>
          )}
        </div>

        {/* Strategy link */}
        {(() => {
          if (!currentHistoryPoint) return null
          const snapshotStrategyId = currentHistoryPoint.strategy_id ?? null
          const linkedStrategy = strategyList?.find((s) => s.id === snapshotStrategyId)
          const canEditLink = !!currentHistoryPoint.snapshot_id
          return (
            <div className="rounded-large border-divider flex items-center gap-3 border px-4 py-3">
              <Target size={16} className="text-default-400 shrink-0" />
              <span className="text-default-400 shrink-0 text-sm">Strategy:</span>
              {linkedStrategy ? (
                <Chip size="sm" variant="soft" color="accent">
                  {linkedStrategy.name}
                </Chip>
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
                    {snapshotStrategyId ? 'Change' : 'Link'}
                    <DropdownCaret className="ml-1" />
                  </Dropdown.Trigger>
                  <Dropdown.Popover>
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
                          {s.name}
                        </Dropdown.Item>
                      ))}
                    </Dropdown.Menu>
                  </Dropdown.Popover>
                </Dropdown>
              ) : (
                <span className="text-default-400 text-xs">Raw snapshot removed by retention</span>
              )}
            </div>
          )
        })()}

        {isLoading ? (
          <>
            <KpiCardsSkeleton />
            <ItemTableSkeleton />
          </>
        ) : !items.length && !currentHistoryPoint ? (
          <Card>
            <Card.Content className="flex flex-col items-center gap-3 p-12 text-center">
              <Package size={32} className="text-default-300" />
              <p className="text-default-400 text-sm">
                No items found. Snapshot the stash from the Economy page first.
              </p>
            </Card.Content>
          </Card>
        ) : (
          <>
            {!items.length && selectedHistoryId && !currentHistoryPoint?.snapshot_id && (
              <Card>
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
              <Card>
                <Card.Content className="flex flex-row items-center gap-3 p-4">
                  <div className="bg-success/15 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                    <TrendingUp size={18} className="text-success" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-default-400 text-xs">Total Value</p>
                    <p className="text-foreground truncate text-lg font-bold">{fmt(totalChaos)}</p>
                    <p className="text-default-400 text-xs">1 div = {divinePrice.toFixed(0)}c</p>
                  </div>
                </Card.Content>
              </Card>

              {/* Highest Value Tab — clickable */}
              <Card className={topTabActive ? 'ring-primary ring-2' : ''}>
                <button type="button" className="w-full text-left" onClick={handleTopTabClick}>
                  <Card.Content className="flex flex-row items-center gap-3 p-4">
                    <div className="bg-primary/15 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                      <Archive size={18} className="text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-default-400 text-xs">
                        Top Tab {topTabActive && <span className="text-primary">· filtered</span>}
                      </p>
                      {topTab ? (
                        <>
                          <p className="text-foreground truncate text-sm font-bold">
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
              <Card className={topItemActive ? 'ring-warning ring-2' : ''}>
                <button type="button" className="w-full text-left" onClick={handleTopItemClick}>
                  <Card.Content className="flex flex-row items-center gap-3 p-4">
                    <div className="bg-warning/15 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                      <Trophy size={18} className="text-warning" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-default-400 text-xs">
                        Top Item {topItemActive && <span className="text-warning">· filtered</span>}
                      </p>
                      {topItem ? (
                        <>
                          <p className="text-foreground truncate text-sm font-bold">
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
                <Card.Header className="grid grid-cols-[1fr_auto_1fr] items-start gap-4 px-4 pt-4 pb-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-foreground text-sm font-semibold">Wealth History</h2>
                    <WealthHistoryRangeSelector value={historyRange} onChange={setHistoryRange} />
                    {selectedHistoryId && (
                      <Button
                        size="sm"
                        variant="tertiary"
                        className="h-5 min-w-0 px-2 text-xs"
                        onPress={() => {
                          setSelectedHistoryId(null)
                          setTabFilters([])
                          setPage(1)
                        }}
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
                          className="cursor-pointer px-3"
                          size="sm"
                          color="warning"
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
                          : 'Latest · click a point to browse'}
                      </span>
                    )}
                  </div>
                </Card.Header>
                <Card.Content className="px-2 pt-2 pb-3">
                  <ResponsiveContainer width="100%" height={160}>
                    <AreaChart
                      data={visibleHistory}
                      margin={{ top: 4, right: 12, left: 0, bottom: 0 }}
                      onClick={(chartData) => {
                        if (visibleHistory.length <= 1) return
                        const point = (
                          chartData as
                            | { activePayload?: { payload?: { id: string } }[] }
                            | undefined
                        )?.activePayload?.[0]?.payload
                        if (!point?.id) return
                        const latestId = visibleHistory[visibleHistory.length - 1].id
                        const next = point.id === (selectedHistoryId ?? latestId) ? null : point.id
                        setSelectedHistoryId(next)
                        setTabFilters([])
                        setPage(1)
                      }}
                      style={{ cursor: visibleHistory.length > 1 ? 'pointer' : 'default' }}
                    >
                      <defs>
                        <linearGradient id="wealthGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#17c964" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#17c964" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis
                        dataKey="completed_at"
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
                          const point = payload[0].payload as SnapshotDataPoint
                          const label = new Date(point.completed_at).toLocaleString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                          return (
                            <div className="bg-content1 border-divider rounded-lg border px-3 py-2 text-xs shadow-lg">
                              <p className="text-default-400 mb-1">{label}</p>
                              <p className="text-foreground font-semibold">
                                {fmt(point.total_chaos)}
                              </p>
                              {point.excluded_chaos_total > 0 && (
                                <p className="text-default-400 mt-0.5">
                                  Excluded: {fmt(point.excluded_chaos_total)}
                                </p>
                              )}
                              {visibleHistory.length > 1 && (
                                <p className="text-default-400 mt-0.5">
                                  {point.snapshot_id ? 'Click to view items' : 'Summary only'}
                                </p>
                              )}
                            </div>
                          )
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="total_chaos"
                        stroke="#17c964"
                        fill="url(#wealthGrad)"
                        strokeWidth={2}
                        dot={(props: { cx?: number; cy?: number; payload: { id: string } }) => {
                          if (props.cx == null || props.cy == null) return null
                          const effectiveId =
                            selectedHistoryId ?? visibleHistory[visibleHistory.length - 1]?.id
                          const active = props.payload.id === effectiveId
                          return (
                            <circle
                              key={props.payload.id}
                              cx={props.cx}
                              cy={props.cy}
                              r={active ? 5 : 3}
                              fill="#17c964"
                              stroke={active ? 'white' : 'none'}
                              strokeWidth={active ? 2 : 0}
                            />
                          )
                        }}
                        activeDot={{ r: 6, fill: '#17c964', stroke: 'white', strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </Card.Content>
              </Card>
            )}

            {/* Filters */}
            <Card>
              <Card.Content className="flex flex-row flex-wrap items-center gap-3 p-3">
                <FieldInput
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
                  aria-label={`Minimum value in ${display === 'divine' ? 'divines' : 'chaos'}`}
                  placeholder="0"
                  value={minValueDisplay}
                  onValueChange={handleMinValueChange}
                  endContent={
                    <span className="text-default-400 text-xs">
                      {display === 'divine' ? 'div' : 'c'}
                    </span>
                  }
                  className="w-40"
                  min={0}
                />
                <Dropdown>
                  <Dropdown.Trigger className="select__trigger min-h-10 min-w-40 items-center">
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
                                className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium"
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
                                className="bg-default-200 inline-flex items-center rounded px-1.5 py-0.5 text-xs"
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
                  <Dropdown.Popover className="max-h-64 overflow-y-auto">
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
                            className={isSelected ? 'bg-accent-soft/70' : undefined}
                          >
                            <span className="flex w-full min-w-0 items-center gap-3">
                              {col ? (
                                <span
                                  className="inline-flex min-w-0 items-center truncate rounded px-1.5 py-0.5 text-xs font-medium"
                                  style={{
                                    backgroundColor: `rgb(${col.r},${col.g},${col.b})`,
                                    color: contrastColor(col.r, col.g, col.b),
                                  }}
                                >
                                  {tab}
                                </span>
                              ) : (
                                <span className="min-w-0 truncate">{tab}</span>
                              )}
                              <span
                                aria-hidden="true"
                                className={`ml-auto inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-all duration-150 ${
                                  isSelected
                                    ? 'bg-accent text-accent-foreground ring-accent/20 shadow-sm ring-1'
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
                    <Dropdown.Trigger className="select__trigger h-10 min-h-10 min-w-44 items-center">
                      <span className="select__value min-w-0 truncate">
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
                    <Dropdown.Popover>
                      <Dropdown.Menu
                        aria-label="Select snapshot"
                        selectionMode="single"
                        selectedKeys={new Set([selectedHistoryId ?? '__latest'])}
                        onAction={(key) => {
                          setSelectedHistoryId(key === '__latest' ? null : (key as string))
                          setTabFilters([])
                          setPage(1)
                        }}
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
                              <span className="flex items-center gap-2">
                                <span>{label}</span>
                                <span className="text-default-400 text-xs">
                                  {Math.round(snap.total_chaos).toLocaleString()}c
                                </span>
                                {!snap.snapshot_id && (
                                  <span className="text-warning text-[10px] tracking-wide uppercase">
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

                <span className="text-default-400 ml-auto text-xs">
                  {filtered.length.toLocaleString()} item{filtered.length !== 1 ? 's' : ''}
                  {filtered.length !== items.length && ` of ${items.length.toLocaleString()}`}
                </span>
              </Card.Content>
            </Card>

            {/* Table — columns: Icon | Item | Tab | Stack | Unit | Total */}
            <Card>
              <Card.Content className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-divider border-b">
                        <th className="text-default-400 w-20 px-2 py-3 text-center text-xs font-medium tracking-wider uppercase">
                          Included
                        </th>
                        <th className="w-10 px-4 py-3" />
                        <th className="text-default-400 px-4 py-3 text-left text-xs font-medium tracking-wider uppercase">
                          <button
                            className="hover:text-foreground flex items-center gap-1"
                            onClick={() => handleSort('display_name')}
                          >
                            Item {sortIcon('display_name')}
                          </button>
                        </th>
                        <th className="text-default-400 hidden px-4 py-3 text-left text-xs font-medium tracking-wider uppercase md:table-cell">
                          <button
                            className="hover:text-foreground flex items-center gap-1"
                            onClick={() => handleSort('tab_name')}
                          >
                            Tab {sortIcon('tab_name')}
                          </button>
                        </th>
                        <th className="text-default-400 px-4 py-3 text-right text-xs font-medium tracking-wider uppercase">
                          <button
                            className="hover:text-foreground ml-auto flex items-center gap-1"
                            onClick={() => handleSort('stack_size')}
                          >
                            Stack {sortIcon('stack_size')}
                          </button>
                        </th>
                        <th className="text-default-400 hidden px-4 py-3 text-right text-xs font-medium tracking-wider uppercase md:table-cell">
                          <button
                            className="hover:text-foreground ml-auto flex items-center gap-1"
                            onClick={() => handleSort('unit_price')}
                          >
                            Unit {sortIcon('unit_price')}
                          </button>
                        </th>
                        <th className="text-default-400 px-4 py-3 text-right text-xs font-medium tracking-wider uppercase">
                          <button
                            className="hover:text-foreground ml-auto flex items-center gap-1"
                            onClick={() => handleSort('price_chaos')}
                          >
                            Total {sortIcon('price_chaos')}
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.map((item, i) => {
                        const showUnit = item.unit_price > 0
                        const promptActive = excludeAllPrompt?.itemId === item.id
                        const promptProgress = excludeAllPrompt
                          ? Math.max(0, Math.min(1, promptMsRemaining / 5000))
                          : 0
                        return (
                          <tr
                            key={item.id}
                            className={`${i < paginated.length - 1 ? 'border-divider border-b' : ''} ${
                              item.is_excluded && !promptActive ? 'opacity-70' : ''
                            }`}
                          >
                            <td className="relative z-10 px-2 py-2 text-center">
                              {canEditExclusions ? (
                                <div className="relative inline-flex items-center justify-center">
                                  <div
                                    className={`absolute top-1/2 left-full z-30 ml-2 w-52 -translate-y-1/2 transition-all duration-300 ${
                                      promptActive
                                        ? 'pointer-events-auto translate-x-0 opacity-100'
                                        : 'pointer-events-none -translate-x-2 opacity-0'
                                    }`}
                                  >
                                    <div className="bg-content1 border-divider rounded-large overflow-hidden border shadow-lg">
                                      <div className="px-3 py-2 text-left">
                                        <p className="text-foreground text-xs font-medium">
                                          Exclude across stored snapshots?
                                        </p>
                                        <p className="text-default-400 mt-0.5 text-[11px] leading-relaxed">
                                          Apply this exclusion to matching copies of this item in
                                          your saved history.
                                        </p>
                                        <div className="mt-2 flex items-center gap-2">
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
                                  </div>
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
                                    className={`inline-flex h-6 w-6 items-center justify-center rounded-md border text-xs font-semibold transition-colors ${
                                      item.is_excluded
                                        ? 'border-warning/50 bg-warning/15 text-warning'
                                        : 'border-success/40 bg-success/10 text-success hover:bg-success/15'
                                    } ${updatingExclusion || updatingExclusionAllHistory ? 'cursor-wait opacity-60' : ''}`}
                                  >
                                    {item.is_excluded ? <X size={12} /> : <Check size={12} />}
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
                            <td className="p-2">
                              {item.icon_url ? (
                                <img
                                  src={item.icon_url}
                                  alt={item.display_name}
                                  className="h-8 w-8 object-contain"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="bg-default-100 h-8 w-8 rounded" />
                              )}
                            </td>
                            <td className="px-4 py-2">
                              <p className="text-foreground text-sm">{item.display_name}</p>
                              {item.base_type && item.base_type !== item.display_name && (
                                <p className="text-default-400 text-xs">{item.base_type}</p>
                              )}
                            </td>
                            <td className="hidden px-4 py-2 md:table-cell">
                              {item.colour_r != null ? (
                                <span
                                  className="inline-flex cursor-pointer items-center rounded px-2 py-0.5 text-xs font-medium"
                                  style={{
                                    backgroundColor: `rgb(${item.colour_r},${item.colour_g},${item.colour_b})`,
                                    color: contrastColor(
                                      item.colour_r,
                                      item.colour_g!,
                                      item.colour_b!,
                                    ),
                                  }}
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
                                </span>
                              ) : (
                                <Chip
                                  size="sm"
                                  variant="soft"
                                  color="default"
                                  className="cursor-pointer"
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
                                </Chip>
                              )}
                            </td>
                            <td className="px-4 py-2 text-right">
                              <span className="text-foreground text-sm">
                                {item.stack_size.toLocaleString()}
                              </span>
                            </td>
                            <td className="hidden px-4 py-2 text-right md:table-cell">
                              <span
                                className={`text-sm ${
                                  item.is_excluded
                                    ? 'text-default-300 line-through'
                                    : 'text-default-400'
                                }`}
                              >
                                {showUnit ? fmtUnit(item.unit_price) : '—'}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right">
                              <span
                                className={`text-sm font-semibold ${
                                  item.price_chaos > 0
                                    ? item.is_excluded
                                      ? 'text-default-300 line-through'
                                      : 'text-foreground'
                                    : 'text-default-300'
                                }`}
                              >
                                {item.price_chaos > 0 ? fmt(item.price_chaos) : '—'}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                      {paginated.length === 0 && (
                        <tr>
                          <td colSpan={7} className="text-default-400 py-12 text-center text-sm">
                            No items match the current filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card.Content>
            </Card>

            {totalPages > 1 && (
              <div className="flex justify-center">
                <SimplePagination total={totalPages} page={page} onChange={setPage} />
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
