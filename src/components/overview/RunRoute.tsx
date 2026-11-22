import type { ReactNode } from 'react'
import './run-route.css'

export function RunRoute({
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
  const stops = [
    { title: 'Active strategy', content: strategy },
    { title: resultTitle, content: result },
    { title: 'Next action', content: action },
  ]

  return (
    <ol className="run-route" aria-label="Run progress" role="list">
      {stops.map(({ title, content }) => (
        <li className="run-route__stop" key={title}>
          <span className="run-route__marker" aria-hidden="true" />
          <div className="run-route__surface">
            <h2>{title}</h2>
            {content}
          </div>
        </li>
      ))}
    </ol>
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
