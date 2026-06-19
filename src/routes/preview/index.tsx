import { createFileRoute } from '@tanstack/react-router'
import { TeaserOverviewPage } from '../../components/preview/TeaserOverviewPage'
import { createPublicSeoHead } from '../../lib/public-seo-head'
export const Route = createFileRoute('/preview/')({
  head: () => createPublicSeoHead('/preview'),
  component: TeaserOverviewPage,
})
