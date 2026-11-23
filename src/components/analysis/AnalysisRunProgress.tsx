import type { ReactNode } from 'react'
import { Clock3, FlaskConical } from 'lucide-react'
import './analysis-flow.css'

const statusText = {
  queued: { title: 'Analysis queued', detail: 'Waiting for analysis to start.' },
  running: {
    title: 'Analysis in progress',
    detail: 'Comparing your character with the target build.',
  },
  finalizing: { title: 'Finalizing recommendations', detail: 'Loading the finished results.' },
}

export function AnalysisRunProgress({
  status,
  phase,
  elapsed,
  statusDetail,
  timeline,
  returnNote,
  actions,
  headingLevel = 2,
}: {
  status: keyof typeof statusText
  phase?: string | null
  elapsed?: string | null
  statusDetail?: ReactNode
  timeline?: ReactNode
  returnNote?: ReactNode
  actions?: ReactNode
  headingLevel?: 2 | 3
}) {
  const { title, detail } = statusText[status]
  const StatusIcon = status === 'queued' ? Clock3 : FlaskConical
  const Heading = headingLevel === 3 ? 'h3' : 'h2'

  return (
    <div className="analysis-progress-panel">
      <div className="flex min-w-0 items-start gap-4">
        <div className="analysis-progress-icon" aria-hidden="true">
          <StatusIcon size={23} strokeWidth={1.5} />
        </div>
        <div className="min-w-0 grow">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <Heading className="text-foreground wrap-anywhere text-lg font-semibold">{title}</Heading>
            {elapsed ? (
              <p className="text-default-500 text-sm tabular-nums">Elapsed {elapsed}</p>
            ) : null}
          </div>
          <p role="status" aria-atomic="true" className="text-default-600 mt-1 wrap-anywhere text-sm">
            <span className="sr-only">{title}. </span>
            {phase ?? detail}
          </p>
          {statusDetail ? <div className="text-default-500 mt-2 text-sm">{statusDetail}</div> : null}
        </div>
      </div>
      <div key={status} className="analysis-progress-track" aria-hidden="true" />
      {timeline}
      {returnNote || actions ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {returnNote ? (
            <div className="text-default-600 max-w-prose text-sm">{returnNote}</div>
          ) : null}
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
    </div>
  )
}
