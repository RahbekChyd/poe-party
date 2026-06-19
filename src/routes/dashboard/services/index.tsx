import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { ServicesPage } from '../../../components/services/ServicesPage'
export const Route = createFileRoute('/dashboard/services/')({
  validateSearch: z.object({
    tab: z.enum(['own', 'public']).optional(),
  }),
  component: ServicesPage,
})
