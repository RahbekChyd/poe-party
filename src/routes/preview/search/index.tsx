import { createFileRoute } from '@tanstack/react-router'
import { GuestDirectoryPage } from '../../../components/preview/GuestDirectoryPage'
import { createPublicSeoHead } from '../../../lib/public-seo-head'
export const Route = createFileRoute('/preview/search/')({
  head: () => createPublicSeoHead('/preview/search'),
  component: GuestDirectoryPage,
})
