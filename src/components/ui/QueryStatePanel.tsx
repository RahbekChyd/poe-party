import { Button } from '@heroui/react/button'
import { Card } from '@heroui/react/card'
import { AlertTriangle, Inbox, LoaderCircle, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'

type QueryStateKind = 'loading' | 'error' | 'empty'

interface QueryStatePanelProps {
  kind: QueryStateKind
  title: string
  description: string
  onRetry?: () => unknown
  icon?: ReactNode
}

export function QueryStatePanel({
  kind,
  title,
  description,
  onRetry,
  icon,
}: QueryStatePanelProps) {
  const defaultIcon =
    kind === 'loading' ? (
      <LoaderCircle size={28} className="animate-spin text-info" aria-hidden="true" />
    ) : kind === 'error' ? (
      <AlertTriangle size={28} className="text-danger" aria-hidden="true" />
    ) : (
      <Inbox size={28} className="text-default-300" aria-hidden="true" />
    )

  return (
    <Card className="p-0">
      <Card.Content
        role={kind === 'error' ? 'alert' : kind === 'loading' ? 'status' : undefined}
        aria-live={kind === 'loading' ? 'polite' : undefined}
        className="flex flex-col items-center gap-3 p-6 text-center sm:p-10"
      >
        {icon ?? defaultIcon}
        <div className="min-w-0 max-w-lg wrap-anywhere">
          <p className="text-foreground text-sm font-semibold">{title}</p>
          <p className="text-default-500 mt-1 text-sm leading-relaxed">{description}</p>
        </div>
        {kind === 'error' && onRetry ? (
          <Button size="sm" variant="tertiary" onPress={() => void onRetry()}>
            <RefreshCw size={15} aria-hidden="true" /> Try again
          </Button>
        ) : null}
      </Card.Content>
    </Card>
  )
}

interface QueryFreshnessNoticeProps {
  isRefreshing: boolean
  refreshFailed: boolean
  onRetry: () => unknown
}

export function QueryFreshnessNotice({
  isRefreshing,
  refreshFailed,
  onRetry,
}: QueryFreshnessNoticeProps) {
  if (!isRefreshing && !refreshFailed) return null

  return (
    <div
      role={refreshFailed ? 'status' : undefined}
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
        refreshFailed
          ? 'border-warning/25 bg-warning/8 text-default-600'
          : 'border-divider bg-default-50 text-default-500'
      }`}
    >
      <span className="inline-flex min-w-0 items-center gap-2">
        {refreshFailed ? (
          <AlertTriangle size={15} className="text-warning" aria-hidden="true" />
        ) : (
          <LoaderCircle size={15} className="animate-spin text-info" aria-hidden="true" />
        )}
        {refreshFailed
          ? 'Refresh failed. Showing the last loaded results.'
          : 'Refreshing results…'}
      </span>
      {refreshFailed ? (
        <Button size="sm" variant="tertiary" onPress={() => void onRetry()}>
          Retry refresh
        </Button>
      ) : null}
    </div>
  )
}
