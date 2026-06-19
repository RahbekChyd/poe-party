import { createFileRoute } from '@tanstack/react-router'
import { TeaserMembersPage } from '../../components/preview/TeaserMembersPage'
import { createPublicSeoHead } from '../../lib/public-seo-head'
export const Route = createFileRoute('/preview/members')({
  head: () => createPublicSeoHead('/preview/members'),
  component: TeaserMembersPage,
})
