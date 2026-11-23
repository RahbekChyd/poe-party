import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { NewAnalysisPage } from '../../../components/gear/GearRecommendationsPanel'

export const Route = createFileRoute('/dashboard/analysis/new')({
  validateSearch: z.object({ fromRun: z.guid().optional().catch(undefined) }),
  component: NewAnalysisPage,
})
