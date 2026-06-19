import { createFileRoute } from '@tanstack/react-router'
import { PublicCharacterDetailPage } from '../../../../components/search/PublicCharacterDetailPage'
export const Route = createFileRoute('/dashboard/search/characters/$profileId')({
  component: PublicCharacterDetailPage,
})
