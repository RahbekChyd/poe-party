import { Link } from '@tanstack/react-router'
import { Wrench } from 'lucide-react'
import { useActiveGroupContext } from '../../hooks/useGroups'
import { GearRecommendationsPanel } from '../gear/GearRecommendationsPanel'
import { DashboardNotice, DashboardPage, DashboardPageHeader } from '../ui/dashboard'

export function AnalysisPage() {
  const { capabilities } = useActiveGroupContext()

  if (!capabilities?.supportsOptimizer) {
    return (
      <DashboardPage>
        <DashboardPageHeader
          title="Analysis"
          eyebrow="Build optimizer"
          tone="arcane"
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
        eyebrow="Build optimizer"
        tone="arcane"
        description="Compare a character with a Path of Building target to find upgrades."
        actions={
          <Link to="/dashboard/gear" className="button button--sm button--tertiary">
            Open Gear Planning
          </Link>
        }
      />

      <DashboardNotice icon={Wrench} title="Analysis is in development" tone="warning">
        <p>We use analysis data to improve recommendations.</p>
      </DashboardNotice>

      <GearRecommendationsPanel />
    </DashboardPage>
  )
}
