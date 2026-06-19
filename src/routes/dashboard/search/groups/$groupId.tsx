import { createFileRoute } from '@tanstack/react-router'
import { PublicGroupDetailPage } from '../../../../components/search/PublicGroupDetailPage'
export const Route = createFileRoute('/dashboard/search/groups/$groupId')({
  component: PublicGroupDetailPage,
})
