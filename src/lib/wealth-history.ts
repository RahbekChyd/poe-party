export type WealthHistoryRange = '3h' | '6h' | '12h' | '1d' | '3d' | '7d' | 'all'

const wealthAxisFormatter = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
})

export function formatWealthAxisTick(value: number) {
  return wealthAxisFormatter.format(value)
}

export const WEALTH_HISTORY_RANGE_OPTIONS: {
  value: WealthHistoryRange
  label: string
}[] = [
  { value: '3h', label: '3 hours' },
  { value: '6h', label: '6 hours' },
  { value: '12h', label: '12 hours' },
  { value: '1d', label: '1 day' },
  { value: '3d', label: '3 days' },
  { value: '7d', label: '7 days' },
  { value: 'all', label: 'All time' },
]

const RANGE_MS: Record<Exclude<WealthHistoryRange, 'all'>, number> = {
  '3h': 3 * 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '3d': 3 * 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
}

export function filterHistoryByRange<T>(
  points: T[],
  range: WealthHistoryRange,
  getTimestamp: (point: T) => string,
): T[] {
  if (range === 'all' || points.length === 0) return points

  const latestPoint = points[points.length - 1]
  const latestMs = new Date(getTimestamp(latestPoint)).getTime()
  if (!Number.isFinite(latestMs)) return points

  const cutoff = latestMs - RANGE_MS[range]
  const filtered = points.filter((point) => new Date(getTimestamp(point)).getTime() >= cutoff)

  return filtered.length > 0 ? filtered : [latestPoint]
}
