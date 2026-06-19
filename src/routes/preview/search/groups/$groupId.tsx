import { createFileRoute } from '@tanstack/react-router'
import { GuestPublicGroupDetailPage } from '../../../../components/preview/GuestPublicGroupDetailPage'
import { createSeoHead } from '../../../../lib/seo'

export const Route = createFileRoute('/preview/search/groups/$groupId')({
  head: ({ params }) =>
    createSeoHead({
      title: 'PoE public group preview',
      description:
        'Open a public Path of Exile group preview in PoE Party with read-only public member characters and build details.',
      path: `/preview/search/groups/${params.groupId}`,
    }),
  component: GuestPublicGroupDetailPage,
})
