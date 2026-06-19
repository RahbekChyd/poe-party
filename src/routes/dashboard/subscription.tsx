import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'
export const Route = createFileRoute('/dashboard/subscription')({
  validateSearch: z.object({
    checkout: z.enum(['success', 'cancel']).optional(),
    session_id: z.string().optional(),
  }),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: '/dashboard/support',
      search: {
        checkout: search.checkout,
        session_id: search.session_id,
      },
      replace: true,
    })
  },
})
