import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { SearchPage } from '../../../components/search/SearchPage'
export const Route = createFileRoute('/dashboard/search/')({
  validateSearch: z.object({
    tab: z.enum(['characters', 'groups']).optional(),
  }),
  component: SearchPage,
})
