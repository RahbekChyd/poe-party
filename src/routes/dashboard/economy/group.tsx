import { createFileRoute } from '@tanstack/react-router'
import { GroupSnapshotPage } from '../../../components/economy/GroupSnapshotPage'
export const Route = createFileRoute('/dashboard/economy/group')({
  component: GroupSnapshotPage,
})
