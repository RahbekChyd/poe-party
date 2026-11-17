export interface SnapshotPricingSummary {
  status: 'complete' | 'partial' | 'unavailable'
  priced_item_count: number
  unpriced_item_count: number
  failed_categories: string[]
  divine_price: number | null
  priced_at: string
  source: string
  version: number
}

/** Keep stored estimates authoritative; a missing price is never a live quote. */
export function storedSnapshotPrice(item: { price_chaos: number | null; stack_size: number }) {
  const hasPrice = item.price_chaos != null && Number.isFinite(item.price_chaos)
  const total = hasPrice ? item.price_chaos! : 0
  return {
    price_chaos: total,
    unit_price: item.stack_size > 0 ? total / item.stack_size : 0,
    has_price: hasPrice,
  }
}

/** Incomplete valuations and changes in pricing methodology cannot establish a rate. */
export function comparablePricing(points: { pricing_summary?: SnapshotPricingSummary | null }[]) {
  if (points.length < 2) return false
  const version = points[0].pricing_summary?.version ?? null
  if (points[0].pricing_summary && version == null) return false
  return points.every(({ pricing_summary: summary }) =>
    summary == null
      ? version == null
      : summary.status === 'complete' && summary.version === version,
  )
}
