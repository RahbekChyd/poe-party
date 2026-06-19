import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { StrategiesPage } from '../../../components/strategies/StrategiesPage'
export const Route = createFileRoute('/dashboard/strategies/')({
  validateSearch: z.object({
    tab: z.enum(['own', 'public']).optional(),
  }),
  component: StrategiesPage,
})
