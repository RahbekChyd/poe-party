import { useId, type ReactNode } from 'react'

export function EconomySnapshotSummary({
  valueLabel,
  amount,
  metadata,
  pricing,
  actions,
}: {
  valueLabel: string
  amount?: ReactNode
  metadata?: ReactNode
  pricing?: ReactNode
  actions: ReactNode
}) {
  const heading = useId()

  return (
    <section className="economy-snapshot-summary" aria-labelledby={heading}>
      <div className="economy-snapshot-summary__value">
        <h2 id={heading} className="text-default-600 text-sm font-medium">{valueLabel}</h2>
        {amount}
        {metadata && <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-default-600">{metadata}</div>}
      </div>
      {pricing && <div className="economy-snapshot-summary__pricing">{pricing}</div>}
      <div className="economy-snapshot-summary__actions">{actions}</div>
    </section>
  )
}
