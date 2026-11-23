import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { AnalysisPage } from '../../../components/analysis/AnalysisPage'
export const Route = createFileRoute('/dashboard/analysis/')({
  validateSearch: z.object({
    runId: z.guid().optional().catch(undefined),
    buildTargetId: z.guid().optional().catch(undefined),
  }),
  beforeLoad: ({ search }) => {
    if (search.runId) {
      throw redirect({
        to: '/dashboard/analysis/runs/$runId',
        params: { runId: search.runId },
        replace: true,
      })
    }
  },
  component: AnalysisPage,
})
