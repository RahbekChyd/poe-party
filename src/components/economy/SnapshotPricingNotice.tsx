import type { SnapshotPricingSummary } from '../../lib/snapshot-pricing'

export function SnapshotPricingNotice({
  summaries,
  priced,
  unknown,
}: {
  summaries: (SnapshotPricingSummary | null | undefined)[]
  priced: number
  unknown: number
}) {
  const unavailable = summaries.some((summary) => summary?.status === 'unavailable')
  const partial = summaries.some((summary) => summary?.status === 'partial')
  const legacy = summaries.some((summary) => summary == null)
  return (
    <div
      role="status"
      className="border-default-200 text-default-500 rounded-lg border px-4 py-3 text-sm"
    >
      {unavailable
        ? 'Pricing is unavailable for this capture. '
        : partial
          ? 'Some price feeds were unavailable. '
          : ''}
      Stored estimates: {priced.toLocaleString()} priced items; {unknown.toLocaleString()} unpriced.{' '}
      Totals include priced, included items only.
      {legacy ? ' Older captures have no recorded pricing coverage.' : ''}
    </div>
  )
}
