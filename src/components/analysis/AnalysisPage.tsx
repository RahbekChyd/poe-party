import { Button } from '@heroui/react/button'
import { Chip } from '@heroui/react/chip'
import { Link } from '@tanstack/react-router'
import { ChevronRight, FlaskConical, Plus } from 'lucide-react'
import { useCurrentUser } from '../../hooks/useCurrentUser'
import { useMyAnalysisRunHistory, type AnalysisRunListEntry } from '../../hooks/useGearOptimizer'
import { useActiveGroupContext } from '../../hooks/useGroups'
import { CardListSkeleton } from '../layout/Skeletons'
import { DashboardPage, DashboardPageHeader } from '../ui/dashboard'
import { QueryFreshnessNotice, QueryStatePanel } from '../ui/QueryStatePanel'

const formatDate = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const formatMetric = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 })

function getStatus(run: AnalysisRunListEntry) {
  if (run.staleReason === 'user-cancelled') return { label: 'Cancelled', color: 'default' } as const
  switch (run.status) {
    case 'completed': return { label: 'Completed', color: 'success' } as const
    case 'partial': return { label: 'Partial results', color: 'warning' } as const
    case 'failed': return { label: 'Failed', color: 'danger' } as const
    case 'stale': return { label: 'Outdated', color: 'warning' } as const
    case 'running': return { label: 'Running', color: 'default' } as const
    case 'queued': return { label: 'Queued', color: 'default' } as const
  }
}

function NewAnalysisLink() {
  return (
    <Link to="/dashboard/analysis/new" className="button button--primary min-h-11">
      <Plus size={17} aria-hidden="true" /> New analysis
    </Link>
  )
}

export function AnalysisPage() {
  const { group, groupId, capabilities, role } = useActiveGroupContext()
  const { data: user } = useCurrentUser()
  const supported = capabilities?.supportsOptimizer === true
  const canQueue = role === 'admin' || role === 'editor'
  const history = useMyAnalysisRunHistory(supported ? groupId : null, user?.id ?? null)
  const runs = [...new Map(history.data?.pages.flatMap((page) =>
    page.runs.map((run) => [run.id, run] as const),
  )).values()]

  if (!group || !user) {
    return <DashboardPage><CardListSkeleton rows={3} /></DashboardPage>
  }

  if (!supported) {
    return (
      <DashboardPage>
        <DashboardPageHeader
          title="Analysis"
          description="The optimizer is available in Path of Exile 1 workspaces. Use Gear Planning to share upgrade suggestions in PoE2."
          actions={
            <Link to="/dashboard/gear" className="button button--sm button--tertiary">
              Open Gear Planning
            </Link>
          }
        />
      </DashboardPage>
    )
  }

  return (
    <DashboardPage>
      <DashboardPageHeader
        title="Analysis"
        description="Find upgrades by comparing your character with a Path of Building target."
        actions={canQueue ? <NewAnalysisLink /> : null}
      />

      <section aria-labelledby="analysis-history-title" className="min-w-0 space-y-3">
        <h2 id="analysis-history-title" className="text-foreground text-base font-semibold">Run history</h2>
        {history.isPending ? (
          <div role="status" className="overflow-hidden">
            <span className="sr-only">Loading run history</span>
            <CardListSkeleton rows={3} />
          </div>
        ) : history.isError && !history.data ? (
          <QueryStatePanel
            kind="error"
            title="Could not load run history"
            description="Try refreshing the saved analyses for this workspace."
            onRetry={history.refetch}
          />
        ) : !runs.length ? (
          <QueryStatePanel
            kind="empty"
            icon={<FlaskConical size={28} className="text-default-500" aria-hidden="true" />}
            title="No analyses yet"
            description={canQueue
              ? 'Start an analysis to compare your gear, skills, and passive tree with a PoB target.'
              : 'An editor or admin can start analyses in this workspace.'}
          />
        ) : (
          <>
            <QueryFreshnessNotice
              refreshFailed={history.isRefetchError}
              isRefreshing={false}
              onRetry={history.refetch}
            />
            <ul className="@container space-y-2">
              {runs.map((run) => {
                const status = getStatus(run)
                const date = new Date(run.createdAt)
                const showMetrics = run.staleReason !== 'user-cancelled' &&
                  (run.status === 'completed' || run.status === 'partial' ||
                    (run.status === 'stale' && !!run.completedAt))
                const metrics = showMetrics ? [
                  { label: 'Recommendations', value: run.recommendationCount },
                  { label: 'Baseline Hit DPS', value: run.hitDps },
                  { label: 'Baseline EHP', value: run.effectiveHitPool },
                ].filter((metric): metric is { label: string; value: number } => metric.value !== null) : []
                return (
                  <li key={run.id}>
                    <Link
                      to="/dashboard/analysis/runs/$runId"
                      params={{ runId: run.id }}
                      className="border-divider bg-surface hover:bg-content1 hover:border-control focus-visible:outline-accent grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-xl border px-4 py-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 @min-[42rem]:grid-cols-[minmax(12rem,1fr)_auto_auto] @min-[42rem]:gap-x-6"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-foreground min-w-0 wrap-anywhere font-semibold">
                            {run.characterName ?? 'Character unavailable'}
                          </span>
                          <Chip size="sm" color={status.color} variant="soft" className={run.status === 'running' ? 'bg-info-soft text-info' : undefined}>
                            {status.label}
                          </Chip>
                        </div>
                        <div className="text-default-600 min-w-0 wrap-anywhere text-sm">{run.targetName ?? 'PoB target'}</div>
                        <div className="text-default-500 flex flex-wrap gap-x-2 gap-y-0.5 text-xs">
                          <span>{run.mode === 'thorough' ? 'Live market' : 'Quick overview'}</span>
                          {Number.isFinite(date.getTime()) ? (
                            <time dateTime={run.createdAt}>{formatDate.format(date)}</time>
                          ) : null}
                        </div>
                      </div>
                      {metrics.length ? (
                        <dl className="col-start-1 row-start-2 flex min-w-0 flex-wrap gap-x-5 gap-y-2 @min-[42rem]:col-start-2 @min-[42rem]:row-start-1">
                          {metrics.map(({ label, value }) => (
                            <div key={label} className="flex flex-col-reverse">
                              <dt className="text-default-500 text-xs">{label}</dt>
                              <dd className="text-foreground text-sm font-medium tabular-nums">{formatMetric.format(value)}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : null}
                      <ChevronRight size={18} className="text-default-500 col-start-2 row-start-1 @min-[42rem]:col-start-3" aria-hidden="true" />
                    </Link>
                  </li>
                )
              })}
            </ul>
            {history.hasNextPage ? (
              <Button variant="secondary" isPending={history.isFetchingNextPage} onPress={() => void history.fetchNextPage()}>
                {history.isFetchNextPageError ? 'Retry loading more runs' : 'Load more runs'}
              </Button>
            ) : null}
          </>
        )}
      </section>
    </DashboardPage>
  )
}
