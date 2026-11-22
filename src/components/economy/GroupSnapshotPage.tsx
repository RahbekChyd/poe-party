import { SnapshotPricingNotice } from './SnapshotPricingNotice'
import { SnapshotEmptyState } from './SnapshotEmptyState'
import './economy-data.css'
import { storedSnapshotPrice } from '../../lib/snapshot-pricing'
import { useState, useMemo, useRef } from 'react'
import { Button } from '@heroui/react/button'
import { Card } from '@heroui/react/card'
import { Dropdown } from '@heroui/react/dropdown'
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
} from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useLatestSnapshots } from '../../hooks/useSnapshots'
import { useGroupSnapshotItems } from '../../hooks/useSnapshotItems'
import { useGroupMembers, useMyGroups } from '../../hooks/useGroups'
import { contrastColor, getAvatarColor } from '../../lib/utils'
import { useCurrencyStore } from '../../store/currency-store'
import { useGroupStore } from '../../store/group-store'
import { KpiCardsSkeleton, ItemTableSkeleton } from '../layout/Skeletons'
import { QueryStatePanel } from '../ui/QueryStatePanel'
import { DropdownCaret, FieldInput, SimplePagination, UserAvatar } from '../ui/heroui-native'
type SortKey = 'display_name' | 'stack_size' | 'unit_price' | 'price_chaos' | 'tab_name' | 'member'

type PricedItem = {
  id: string
  user_id: string
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
}

const PAGE_SIZE = 25

export function GroupSnapshotPage() {
  const activeGroupId = useGroupStore((s) => s.activeGroupId)
  const { data: rawItems, isLoading, isError, refetch } = useGroupSnapshotItems(activeGroupId)
  const { data: snapshots } = useLatestSnapshots(activeGroupId)
  const { data: members } = useGroupMembers(activeGroupId)
  const { data: myGroups } = useMyGroups()
  const display = useCurrencyStore((s) => s.display)

  const activeGroup = myGroups?.find((g) => g.group.id === activeGroupId)?.group
  const activeLeague = activeGroup?.league ?? null

  const { data: ninjaData } = useNinjaPrices(activeLeague)
  const divinePrice = ninjaData?.divinePrice ?? null
  const showDivine = display === 'divine' && divinePrice != null && divinePrice > 0

  const memberByUserId = useMemo(
    () => Object.fromEntries((members ?? []).map((m) => [m.user.id, m.user])),
    [members],
  )

  const items = useMemo<PricedItem[]>(() => (rawItems ?? []).map((item) => ({
    ...item,
    display_name: item.name || item.type_line,
    ...storedSnapshotPrice(item),
  })), [rawItems])

  const [minValueChaos, setMinValueChaos] = useState(0)
  const [search, setSearch] = useState('')
  const searchInput = useRef<HTMLInputElement>(null)
  const debouncedSearch = useDebouncedValue(search)
  const [tabFilters, setTabFilters] = useState<string[]>([])
  const [memberFilter, setMemberFilter] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('price_chaos')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)

  const fmt = (chaos: number) =>
    showDivine
      ? `${(chaos / (divinePrice ?? 1)).toFixed(1)} div`
      : `${Math.round(chaos).toLocaleString()}c`

  const fmtUnit = (chaos: number) =>
    showDivine
      ? `${(chaos / (divinePrice ?? 1)).toFixed(1)} div`
      : chaos < 1
        ? `${chaos.toFixed(1)}c`
        : `${Math.round(chaos).toLocaleString()}c`

  const minValueDisplay =
    showDivine ? (minValueChaos / (divinePrice ?? 1)).toFixed(1) : String(minValueChaos)

  const handleMinValueChange = (v: string) => {
    const parsed = parseFloat(v) || 0
    setMinValueChaos(showDivine ? parsed * (divinePrice ?? 1) : parsed)
    setPage(1)
  }

  const includedItems = useMemo(() => items.filter((item) => !item.is_excluded), [items])

  // KPIs
  const valuationUnavailable = snapshots?.some((snapshot) => snapshot.pricing_summary?.status === 'unavailable') ?? false
  const valuationPartial = snapshots?.some((snapshot) => snapshot.pricing_summary?.status === 'partial') ?? false
  const latestCapture = snapshots?.reduce<string | null>(
    (latest, snapshot) => snapshot.completed_at && (!latest || snapshot.completed_at > latest) ? snapshot.completed_at : latest,
    null,
  )
  const totalChaos = includedItems.reduce((s, i) => s + i.price_chaos, 0)

  const topItem = includedItems.reduce<PricedItem | null>(
    (best, i) => (i.price_chaos > (best?.price_chaos ?? 0) ? i : best),
    null,
  )

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

  const uniqueTabs = useMemo(() => [...new Set(items.map((i) => i.tab_name))].sort(), [items])

  const tabColours = useMemo(() => {
    const map = new Map<string, { r: number; g: number; b: number }>()
    for (const item of items) {
      if (!map.has(item.tab_name) && item.colour_r != null) {
        map.set(item.tab_name, { r: item.colour_r, g: item.colour_g!, b: item.colour_b! })
      }
    }
    return map
  }, [items])

  const uniqueMembers = useMemo(() => {
    const seen = new Set<string>()
    return (members ?? []).filter((m) => {
      if (seen.has(m.user.id)) return false
      seen.add(m.user.id)
      return items.some((i) => i.user_id === m.user.id)
    })
  }, [members, items])

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

  const topItemActive = !!topItem && search === topItem.display_name
  const topTabActive = !!topTab && tabFilters.length === 1 && tabFilters[0] === topTab.tab_name

  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase()
    return items.filter(
      (i) =>
        i.price_chaos >= minValueChaos &&
        (!q || i.display_name.toLowerCase().includes(q)) &&
        (!tabFilters.length || tabFilters.includes(i.tab_name)) &&
        (!memberFilter || i.user_id === memberFilter),
    )
  }, [items, debouncedSearch, minValueChaos, tabFilters, memberFilter])

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
        case 'member': {
          const ua = memberByUserId[a.user_id]
          const ub = memberByUserId[b.user_id]
          av = ua?.display_name ?? ua?.poe_account_name ?? ''
          bv = ub?.display_name ?? ub?.poe_account_name ?? ''
          break
        }
        default:
          av = a.price_chaos
          bv = b.price_chaos
      }
      if (typeof av === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv as string) : (bv as string).localeCompare(av)
      }
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })
  }, [filtered, sortKey, sortDir, memberByUserId])

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

  const memberDropdownItems = useMemo(
    () => [
      { key: '__all', label: 'All members' },
      ...uniqueMembers.map((m) => ({
        key: m.user.id,
        label: m.user.display_name ?? m.user.poe_account_name,
      })),
    ],
    [uniqueMembers],
  )

  const activeMemberLabel = memberFilter
    ? (memberByUserId[memberFilter]?.display_name ??
      memberByUserId[memberFilter]?.poe_account_name ??
      'Member')
    : 'All members'

  return (
    <DashboardPage>
      <DashboardPageHeader
        backLink={
          <Link to="/dashboard/economy" className="button button--sm button--tertiary">
            Back to Economy
          </Link>
        }
        title="Group snapshot"
        description={
          <>
            {activeLeague ?? '…'}
            {rawItems && ` · ${items.length.toLocaleString()} items across ${uniqueMembers.length} member${uniqueMembers.length !== 1 ? 's' : ''}`}
          </>
        }
      />

      {snapshots?.length && !isLoading ? (
        <SnapshotPricingNotice summaries={snapshots.map((snapshot) => snapshot.pricing_summary)}
          priced={items.filter((item) => item.has_price).length} unknown={items.filter((item) => !item.has_price).length} />
      ) : null}

      {isLoading ? (
        <>
          <p role="status" className="text-default-500 text-sm">Loading stash items…</p>
          <KpiCardsSkeleton />
          <ItemTableSkeleton />
        </>
      ) : isError && !rawItems ? (
        <QueryStatePanel kind="error" title="Couldn’t load the group snapshot" description="Try again to view stash items." onRetry={refetch} />
      ) : !items.length ? (
        <SnapshotEmptyState
          game={activeGroup?.game ?? null}
          league={activeLeague}
          message="No stash items yet."
        />
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card className="p-0">
              <Card.Content className="flex flex-row items-center gap-3 p-4">
                <div className="bg-wealth-series/15 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                  <TrendingUp size={18} className="text-wealth-series" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-default-400 text-xs">{valuationPartial && !valuationUnavailable ? 'Priced subtotal' : 'Total Group Wealth'}</p>
                  <p className="text-foreground text-lg font-bold wrap-anywhere tabular-nums">{valuationUnavailable ? 'Pricing unavailable' : fmt(totalChaos)}</p>
                  <p className="text-default-400 text-xs">{divinePrice == null ? 'Divine conversion unavailable' : `1 div = ${divinePrice.toFixed(0)}c`}</p>
                  {latestCapture && (
                    <p className="text-default-500 mt-1 text-xs">
                      Latest capture <time dateTime={latestCapture}>{new Date(latestCapture).toLocaleString()}</time>
                    </p>
                  )}
                </div>
              </Card.Content>
            </Card>

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
              <Dropdown>
                <Dropdown.Trigger className="select__trigger h-10 min-h-10 min-w-40 items-center">
                  <span className="select__value min-w-0 truncate">{activeMemberLabel}</span>
                  <DropdownCaret className="select__indicator" />
                </Dropdown.Trigger>
                <Dropdown.Popover className="max-h-64 max-w-[calc(100dvw-2rem)] overflow-y-auto">
                  <Dropdown.Menu
                    aria-label="Filter by member"
                    selectionMode="single"
                    selectedKeys={new Set([memberFilter || '__all'])}
                    onAction={(key) => {
                      setMemberFilter(key === '__all' ? '' : (key as string))
                      setPage(1)
                    }}
                  >
                    {memberDropdownItems.map(({ key, label }) => (
                      <Dropdown.Item key={key} id={key} textValue={label}>
                        <Dropdown.ItemIndicator />
                        <span className="min-w-0 wrap-anywhere">{label}</span>
                      </Dropdown.Item>
                    ))}
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown>
              <span role="status" className="text-default-400 ml-auto text-xs tabular-nums">
                {filtered.length.toLocaleString()} item{filtered.length !== 1 ? 's' : ''}
                {filtered.length !== items.length && ` of ${items.length.toLocaleString()}`}
              </span>
            </Card.Content>
          </Card>

          {/* Table */}
          <Card className="overflow-visible p-0">
            <Card.Content className="p-0">
              <div className="economy-data" role="region" aria-label="Group stash items">
                <table className="economy-stash" role="table">
                  <thead role="rowgroup">
                    <tr role="row" className="border-divider border-b">
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
                          sortKey === 'member'
                            ? sortDir === 'asc'
                              ? 'ascending'
                              : 'descending'
                            : undefined
                        }
                        className="w-[17%] text-default-400 px-4 py-3 text-left text-xs font-medium tracking-wider uppercase"
                      >
                        <button
                          className="hover:text-foreground flex items-center gap-1"
                          onClick={() => handleSort('member')}
                        >
                          Member {sortIcon('member')}
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
                        className="w-[16%] text-default-400 px-4 py-3 text-left text-xs font-medium tracking-wider uppercase"
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
                      const user = memberByUserId[item.user_id]
                      const showUnit = item.unit_price > 0
                      const tabStyle =
                        item.colour_r != null
                          ? {
                              backgroundColor: `rgb(${item.colour_r},${item.colour_g},${item.colour_b})`,
                              color: contrastColor(item.colour_r, item.colour_g!, item.colour_b!),
                            }
                          : undefined
                      return (
                        <tr
                          role="row"
                          key={item.id}
                          className={i < paginated.length - 1 ? 'border-divider border-b' : ''}
                        >
                          <td role="cell" data-cell="icon" className="p-2">
                            {item.icon_url ? (
                              <img
                                src={item.icon_url}
                                alt=""
                                className="h-8 w-8 object-contain"
                                loading="lazy"
                              />
                            ) : (
                              <div className="bg-default-100 h-6 w-6 rounded" />
                            )}
                          </td>
                          <td role="cell" data-cell="item" className="px-4 py-2">
                            <p
                              className={`text-sm ${item.is_excluded ? 'text-default-400 line-through' : 'text-foreground'}`}
                            >
                              {item.display_name}
                            </p>
                            {item.is_excluded && (
                              <p className="text-default-500 text-xs">Excluded from totals</p>
                            )}
                            {item.base_type && item.base_type !== item.display_name && (
                              <p className="text-default-400 text-xs">{item.base_type}</p>
                            )}
                          </td>
                          <td role="cell" data-cell="member" className="px-4 py-2">
                            <button
                              className="flex min-w-0 items-center gap-1.5 rounded-sm text-left hover:underline aria-pressed:underline"
                              type="button"
                              aria-pressed={memberFilter === item.user_id}
                              onClick={() => {
                                setMemberFilter((prev) =>
                                  prev === item.user_id ? '' : item.user_id,
                                )
                                setPage(1)
                              }}
                            >
                              <UserAvatar
                                src={user?.avatar_url ?? undefined}
                                name={user?.display_name ?? user?.poe_account_name ?? '?'}
                                size="sm"
                                className="text-tiny size-5 shrink-0"
                                style={
                                  user
                                    ? {
                                        backgroundColor: getAvatarColor(user.id, user.avatar_color),
                                      }
                                    : undefined
                                }
                              />
                              <span className="text-foreground text-sm">
                                {user?.display_name ?? user?.poe_account_name ?? '—'}
                              </span>
                            </button>
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
                          <td
                            role="cell"
                            data-cell="unit"
                            className="px-2 py-2 text-right tabular-nums"
                          >
                            <span className="economy-data-label" aria-hidden="true">
                              Unit
                            </span>
                            <span className="text-default-400 text-sm">
                              {showUnit ? fmtUnit(item.unit_price) : '—'}
                            </span>
                          </td>
                          <td role="cell" data-cell="value" className="px-3 py-2 text-right">
                            <span className="economy-data-label" aria-hidden="true">
                              Total
                            </span>
                            <span
                              className={`text-sm font-semibold tabular-nums ${item.price_chaos > 0 ? 'text-foreground' : 'text-default-500'}`}
                            >
                              {item.has_price ? fmt(item.price_chaos) : 'Unknown'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                    {paginated.length === 0 && (
                      <tr role="row">
                        <td
                          role="cell"
                          colSpan={7}
                          className="economy-empty-cell"
                        >
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
                                setMemberFilter('')
                                setPage(1)
                              }}
                            >
                              Clear filters
                            </Button>
                          </div>
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
    </DashboardPage>
  )
}
import { DashboardPage, DashboardPageHeader } from '../ui/dashboard'
