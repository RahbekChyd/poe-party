import { Route } from '../../routes/preview/search/characters/$profileId'
import { PublicCharacterDetailView } from '../search/PublicCharacterDetailPage'

export function GuestPublicCharacterDetailPage() {
  const { profileId } = Route.useParams()
  return <PublicCharacterDetailView profileId={profileId} variant="preview" />
}
