import { AlertTriangle, Info } from 'lucide-react'
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
  const hasPricingIssue = unavailable || partial
  const NoticeIcon = hasPricingIssue ? AlertTriangle : Info

  return (
    <div
      role="status"
      className={`flex items-start gap-2 rounded-lg px-4 py-3 text-sm ${
        hasPricingIssue ? 'bg-warning-soft text-warning' : 'bg-info-soft text-info'
      }`}
    >
      <NoticeIcon size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>
        {unavailable
          ? 'Pricing is unavailable for this capture. '
          : partial
            ? 'Some price feeds were unavailable. '
            : ''}
        Stored estimates: {priced.toLocaleString()} priced items; {unknown.toLocaleString()} unpriced.{' '}
        Totals include priced, included items only.
        {legacy ? ' Older captures have no recorded pricing coverage.' : ''}
      </span>
    </div>
  )
}
