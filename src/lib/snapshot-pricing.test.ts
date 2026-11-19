import { describe, expect, it } from 'vitest'
import {
  comparablePricing,
  storedSnapshotPrice,
  type SnapshotPricingSummary,
} from './snapshot-pricing'
const summary = (
  status: SnapshotPricingSummary['status'],
  version = 1,
): SnapshotPricingSummary => ({
  status,
  version,
  priced_item_count: 1,
  unpriced_item_count: 0,
  failed_categories: [],
  divine_price: null,
  priced_at: '',
  source: 'poe.ninja',
})
describe('stored snapshot valuations', () => {
  it('retains stored stack totals and distinguishes zero from unknown', () => {
    expect(storedSnapshotPrice({ price_chaos: 12, stack_size: 3 })).toEqual({
      price_chaos: 12,
      unit_price: 4,
      has_price: true,
    })
    expect(storedSnapshotPrice({ price_chaos: null, stack_size: 3 }).has_price).toBe(false)
    expect(storedSnapshotPrice({ price_chaos: 0, stack_size: 3 }).has_price).toBe(true)
  })
  it('does not calculate rates across incomplete or differently valued captures', () => {
    expect(
      comparablePricing([
        { pricing_summary: summary('complete') },
        { pricing_summary: summary('complete') },
      ]),
    ).toBe(true)
    expect(
      comparablePricing([
        { pricing_summary: summary('complete') },
        { pricing_summary: summary('partial') },
      ]),
    ).toBe(false)
    expect(
      comparablePricing([
        { pricing_summary: summary('complete') },
        { pricing_summary: summary('complete', 2) },
      ]),
    ).toBe(false)
    expect(comparablePricing([{}, { pricing_summary: summary('complete') }])).toBe(false)
  })
})
