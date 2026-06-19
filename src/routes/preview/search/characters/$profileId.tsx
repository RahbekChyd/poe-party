import { createFileRoute } from '@tanstack/react-router'
import { GuestPublicCharacterDetailPage } from '../../../../components/preview/GuestPublicCharacterDetailPage'
import { createSeoHead } from '../../../../lib/seo'

export const Route = createFileRoute('/preview/search/characters/$profileId')({
  head: ({ params }) =>
    createSeoHead({
      title: 'PoE public character preview',
      description:
        'Open a public Path of Exile character preview in PoE Party with read-only gear, tree, and daily snapshot history.',
      path: `/preview/search/characters/${params.profileId}`,
    }),
  component: GuestPublicCharacterDetailPage,
})
