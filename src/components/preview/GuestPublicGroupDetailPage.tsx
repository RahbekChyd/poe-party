import { Route } from '../../routes/preview/search/groups/$groupId'
import { PublicGroupDetailView } from '../search/PublicGroupDetailPage'

export function GuestPublicGroupDetailPage() {
  const { groupId } = Route.useParams()
  return <PublicGroupDetailView groupId={groupId} variant="preview" />
}
