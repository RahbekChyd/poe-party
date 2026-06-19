import { createFileRoute } from '@tanstack/react-router'
import { GuestStrategiesPage } from '../../../components/preview/GuestStrategiesPage'
import { createPublicSeoHead } from '../../../lib/public-seo-head'
export const Route = createFileRoute('/preview/strategies/')({
  head: () => createPublicSeoHead('/preview/strategies'),
  component: GuestStrategiesPage,
})
