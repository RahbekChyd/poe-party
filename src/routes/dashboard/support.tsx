import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { SupportPage } from '../../components/subscription/SubscriptionPage'

export const Route = createFileRoute('/dashboard/support')({
  validateSearch: z.object({
    checkout: z.enum(['success', 'cancel']).optional(),
    session_id: z.string().optional(),
  }),
  component: SupportPage,
})
