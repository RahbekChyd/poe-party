import { Link, getRouteApi } from '@tanstack/react-router'
import { useCallback } from 'react'
import { useActiveGroupContext } from '../../hooks/useGroups'
import { GearRecommendationsPanel } from '../gear/GearRecommendationsPanel'
import { DashboardPage, DashboardPageHeader } from '../ui/dashboard'

const analysisRoute = getRouteApi('/dashboard/analysis/')

export function AnalysisPage() {
  const { capabilities } = useActiveGroupContext()
  const { runId, buildTargetId } = analysisRoute.useSearch()
  const navigate = analysisRoute.useNavigate()
  const clearRunRequest = useCallback(() => {
    void navigate({ search: {}, replace: true, resetScroll: false })
  }, [navigate])

  if (!capabilities?.supportsOptimizer) {
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
        description="Compare a character with a Path of Building target to find upgrades."
        actions={
          <Link to="/dashboard/gear" className="button button--sm button--tertiary">
            Open Gear Planning
          </Link>
        }
      />

      <p className="text-default-500 text-sm">
        Analysis is in development. We use analysis data to improve recommendations.
      </p>

      <GearRecommendationsPanel
        requestedRunId={runId}
        requestedBuildTargetId={buildTargetId}
        onRunRequestHandled={clearRunRequest}
      />
    </DashboardPage>
  )
}
