import type { ReactNode } from 'react'
import './run-summary.css'

export function RunSummary({
  strategy,
  result,
  resultTitle,
  action,
}: {
  strategy: ReactNode
  result: ReactNode
  resultTitle: string
  action: ReactNode
}) {
  return (
    <section className="run-summary" aria-label="Run summary">
      <div className="run-summary__strategy run-summary__content">
        <h2>Active strategy</h2>
        {strategy}
      </div>
      <div className="run-summary__result">
        <div className="run-summary__content">
          <h2>{resultTitle}</h2>
          {result}
        </div>
        <div className="run-summary__action">{action}</div>
      </div>
    </section>
  )
}

export function RunOverviewData({ history, metrics }: { history?: ReactNode; metrics: ReactNode }) {
  return (
    <div className="run-overview-data" data-history={history ? '' : undefined}>
      {history}
      <dl className="run-overview-data__metrics">{metrics}</dl>
    </div>
  )
}
