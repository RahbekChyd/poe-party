import { Button } from '@heroui/react/button'
import { Card } from '@heroui/react/card'
import { Link } from '@tanstack/react-router'
import { Sparkles, Sword, Target, Wrench } from 'lucide-react'
import { useActiveGroupContext } from '../../hooks/useGroups'
import { GearRecommendationsPanel } from '../gear/GearRecommendationsPanel'
import {
  DashboardNotice,
  DashboardPage,
  DashboardPageHeader,
  DashboardPanel,
} from '../ui/dashboard'

const analysisLanes = [
  {
    icon: Sparkles,
    title: 'Optimizer workflow',
    description:
      'Import target PoBs, choose the layouts that define the target build, and rerun cached analysis against the current character and stash state.',
  },
  {
    icon: Target,
    title: 'Skill tree lane',
    description:
      'This page is where passive tree and ascendancy planning can sit next to the active analysis setup, instead of being buried inside the gear queue.',
  },
  {
    icon: Sword,
    title: 'Gear handoff',
    description:
      'Accepted analysis output can still flow back into Gear Planning as queue items, so build exploration and team execution stay connected.',
  },
] as const

export function AnalysisPage() {
  const { capabilities } = useActiveGroupContext()

  if (!capabilities?.supportsOptimizer) {
    return (
      <DashboardPage>
        <DashboardPageHeader
          title="Analysis"
          eyebrow="Build optimizer"
          tone="arcane"
          description="Optimizer tooling is currently limited to Path of Exile 1 workspaces."
          actions={
            <Link to="/dashboard/gear">
              <Button size="sm" variant="tertiary">
                Open Gear Planning
              </Button>
            </Link>
          }
        />

        <DashboardPanel>
          <div>
            <p className="text-foreground text-sm font-semibold">PoE2 rollout note</p>
            <p className="text-default-600 text-sm leading-relaxed">
              Shared workspaces, character sync, public discovery, and market overview are ready
              first. The optimizer stays PoE1-only until we validate Path of Building compatibility,
              trade-stat support, and party-config behavior for PoE2.
            </p>
          </div>
        </DashboardPanel>
      </DashboardPage>
    )
  }

  return (
    <DashboardPage>
      <DashboardPageHeader
        title="Analysis"
        eyebrow="Build optimizer"
        tone="arcane"
        description="Build setup, optimizer runs, and future skill tree planning."
        actions={
          <Link to="/dashboard/gear">
            <Button size="sm" variant="tertiary">
              Open Gear Planning
            </Button>
          </Link>
        }
      />

      <DashboardNotice icon={Wrench} title="Work in progress" tone="warning">
        <p>
          This feature is still being developed. We use data from your analyses to improve
          recommendations and overall quality.
        </p>
      </DashboardNotice>

      <div className="grid gap-4 lg:grid-cols-3">
        {analysisLanes.map(({ icon: Icon, title, description }) => (
          <Card key={title} className="h-full">
            <Card.Content className="gap-3 p-5">
              <div className="bg-warning/10 text-warning flex h-10 w-10 items-center justify-center rounded-xl">
                <Icon size={18} />
              </div>
              <div>
                <p className="text-foreground text-sm font-semibold">{title}</p>
                <p className="text-default-600 mt-1 text-sm">{description}</p>
              </div>
            </Card.Content>
          </Card>
        ))}
      </div>

      <GearRecommendationsPanel />
    </DashboardPage>
  )
}
