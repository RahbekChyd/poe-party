import { createFileRoute } from '@tanstack/react-router'
import { AnalysisRunPage } from '../../../../components/gear/GearRecommendationsPanel'

export const Route = createFileRoute('/dashboard/analysis/runs/$runId')({
  component: AnalysisRunPage,
})
