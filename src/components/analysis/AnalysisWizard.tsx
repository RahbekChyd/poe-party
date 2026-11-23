import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import './analysis-flow.css'

export function AnalysisWizard({
  steps,
  activeStep,
  title,
  description,
  focusOnMount,
  backAction,
  primaryAction,
  children,
}: {
  steps: readonly string[]
  activeStep: number
  title: string
  description?: ReactNode
  focusOnMount?: boolean
  backAction?: ReactNode
  primaryAction: ReactNode
  children: ReactNode
}) {
  const headingId = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  const previousStep = useRef(focusOnMount ? -1 : activeStep)

  useEffect(() => {
    if (previousStep.current === activeStep) return
    previousStep.current = activeStep
    heading.current?.focus()
  }, [activeStep])

  return (
    <div className="analysis-wizard">
      <ol className="analysis-wizard-steps" aria-label="Analysis setup steps" role="list">
        {steps.map((step, index) => {
          const isCurrent = index === activeStep
          const isComplete = index < activeStep
          return (
            <li
              key={step}
              aria-current={isCurrent ? 'step' : undefined}
              className="analysis-wizard-step"
              data-complete={isComplete || undefined}
            >
              <span className="analysis-wizard-step-number" aria-hidden="true">
                {isComplete ? <Check size={14} /> : index + 1}
              </span>
              <span>{step}</span>
              {isComplete ? <span className="sr-only">, completed</span> : null}
            </li>
          )
        })}
      </ol>
      <section className="analysis-wizard-body" aria-labelledby={headingId}>
        <div className="analysis-wizard-content">
          <header>
            <h2
              className="text-foreground scroll-mt-6 wrap-anywhere text-xl font-semibold focus:outline-none"
              id={headingId}
              ref={heading}
              tabIndex={-1}
            >
              {title}
            </h2>
            {description ? (
              <div className="text-default-500 mt-1 max-w-prose text-sm">{description}</div>
            ) : null}
          </header>
          <div className="flex min-w-0 flex-col gap-4">{children}</div>
        </div>
        <footer className="analysis-wizard-actions">
          {backAction}
          <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2">{primaryAction}</div>
        </footer>
      </section>
    </div>
  )
}
