import { createFileRoute } from '@tanstack/react-router'
import { MembersPage } from '../../../components/members/MembersPage'
export const Route = createFileRoute('/dashboard/members/')({
  component: MembersPage,
})
