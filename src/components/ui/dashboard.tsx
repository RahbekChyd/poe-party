import { useId, type CSSProperties, type ElementType, type ReactNode } from 'react'
import { Card } from '@heroui/react/card'
import { cn } from '../../lib/utils'
import './dashboard-content.css'

export type DashboardTone =
  | 'accent'
  | 'arcane'
  | 'currency'
  | 'danger'
  | 'default'
  | 'success'
  | 'warning'

const dashboardToneVars: Record<DashboardTone, CSSProperties> = {
  accent: {
    '--dashboard-tone': 'var(--accent)',
    '--dashboard-tone-border': 'color-mix(in oklab, var(--accent) 34%, var(--separator) 66%)',
    '--dashboard-tone-soft': 'var(--accent-soft)',
  } as CSSProperties,
  arcane: {
    '--dashboard-tone': 'var(--arcane)',
    '--dashboard-tone-border': 'var(--arcane-border)',
    '--dashboard-tone-soft': 'var(--arcane-soft)',
  } as CSSProperties,
  currency: {
    '--dashboard-tone': 'var(--currency)',
    '--dashboard-tone-border': 'var(--currency-border)',
    '--dashboard-tone-soft': 'var(--currency-soft)',
  } as CSSProperties,
  danger: {
    '--dashboard-tone': 'var(--danger)',
    '--dashboard-tone-border': 'color-mix(in oklab, var(--danger) 36%, var(--separator) 64%)',
    '--dashboard-tone-soft': 'var(--danger-soft)',
  } as CSSProperties,
  default: {
    '--dashboard-tone': 'var(--muted)',
    '--dashboard-tone-border': 'color-mix(in oklab, var(--separator) 86%, transparent)',
    '--dashboard-tone-soft': 'color-mix(in oklab, var(--default) 55%, var(--background) 45%)',
  } as CSSProperties,
  success: {
    '--dashboard-tone': 'var(--success)',
    '--dashboard-tone-border': 'color-mix(in oklab, var(--success) 34%, var(--separator) 66%)',
    '--dashboard-tone-soft': 'var(--success-soft)',
  } as CSSProperties,
  warning: {
    '--dashboard-tone': 'var(--warning)',
    '--dashboard-tone-border': 'color-mix(in oklab, var(--warning) 36%, var(--separator) 64%)',
    '--dashboard-tone-soft': 'var(--warning-soft)',
  } as CSSProperties,
}

function dashboardToneStyle(tone: DashboardTone): CSSProperties {
  return dashboardToneVars[tone]
}

export function DashboardPage({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mx-auto flex w-full min-w-0 max-w-[96rem] flex-col gap-6', className)}>
      {children}
    </div>
  )
}

export function DashboardPageHeader({
  actions,
  className,
  description,
  title,
}: {
  actions?: ReactNode
  className?: string
  description?: ReactNode
  title: ReactNode
}) {
  return (
    <header
      className={cn(
        'dashboard-page-header flex flex-col gap-x-6 gap-y-3 md:flex-row md:flex-wrap md:items-end md:justify-between',
        className,
      )}
    >
      <div className="min-w-0 md:flex-[1_1_22rem]">
        <h1 className="dashboard-page-title wrap-anywhere">
          {title}
        </h1>
        {description ? (
          <p className="text-default-500 mt-1 max-w-3xl text-sm leading-5 wrap-anywhere">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

export function ActiveStrategySummary({
  children,
  result,
  action,
}: {
  children: ReactNode
  result?: ReactNode
  action?: ReactNode
}) {
  const headingId = useId()

  return (
    <section aria-labelledby={headingId} data-result={result ? '' : undefined} className="workspace-lead">
      <div className="workspace-lead-context">
        <h2 id={headingId} className="text-default-500 text-sm font-medium">Active strategy</h2>
        {children}
      </div>
      {result || action ? (
        <div className="workspace-lead-side">
          {result}
          {action}
        </div>
      ) : null}
    </section>
  )
}

export function DashboardNotice({
  children,
  icon: Icon,
  title,
  tone = 'default',
}: {
  children: ReactNode
  icon?: ElementType
  title?: ReactNode
  tone?: DashboardTone
}) {
  return (
    <div
      style={dashboardToneStyle(tone)}
      className="flex items-start gap-3 rounded-lg border border-[color:var(--dashboard-tone-border)] bg-[color:var(--dashboard-tone-soft)] px-4 py-3 text-[color:var(--dashboard-tone)]"
    >
      {Icon ? <Icon size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> : null}
      <div className="min-w-0">
        {title ? <p className="text-foreground text-sm font-semibold">{title}</p> : null}
        <div className="text-default-600 text-sm leading-5">{children}</div>
      </div>
    </div>
  )
}

export function DashboardEmptyState({
  action,
  children,
  icon: Icon,
  tone = 'default',
}: {
  action?: ReactNode
  children: ReactNode
  icon?: ElementType
  tone?: DashboardTone
}) {
  return (
    <Card className="p-0">
      <Card.Content
        style={dashboardToneStyle(tone)}
        className="flex flex-col items-center gap-3 p-6 text-center sm:p-8"
      >
        {Icon ? (
          <Icon size={32} className="text-[color:var(--dashboard-tone)]" aria-hidden="true" />
        ) : null}
        <p className="text-default-500 max-w-md text-sm leading-5">{children}</p>
        {action ? <div className="mt-1">{action}</div> : null}
      </Card.Content>
    </Card>
  )
}

export function DashboardPanel({
  children,
  className,
  contentClassName,
  tone = 'default',
}: {
  children: ReactNode
  className?: string
  contentClassName?: string
  tone?: DashboardTone
}) {
  return (
    <Card
      style={dashboardToneStyle(tone)}
      className={cn('p-0', tone !== 'default' && 'border-[color:var(--dashboard-tone-border)]', className)}
    >
      <Card.Content className={cn('gap-4 p-4 sm:p-5', contentClassName)}>{children}</Card.Content>
    </Card>
  )
}
