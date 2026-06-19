import { createFileRoute } from '@tanstack/react-router'
import { GuestServicesPage } from '../../../components/preview/GuestServicesPage'
import { createPublicSeoHead } from '../../../lib/public-seo-head'
export const Route = createFileRoute('/preview/services/')({
  head: () => createPublicSeoHead('/preview/services'),
  component: GuestServicesPage,
})
