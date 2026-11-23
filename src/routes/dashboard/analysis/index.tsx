import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { AnalysisPage } from '../../../components/analysis/AnalysisPage'
export const Route = createFileRoute('/dashboard/analysis/')({
  validateSearch: z.object({
    runId: z.guid().optional().catch(undefined),
    buildTargetId: z.guid().optional().catch(undefined),
  }),
  component: AnalysisPage,
})
