import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { SnapshotDetailPage } from '../../../components/economy/SnapshotDetailPage'
export const Route = createFileRoute('/dashboard/economy/$userId')({
  validateSearch: z.object({
    historyId: z.string().optional(),
  }),
  component: SnapshotDetailPage,
})
