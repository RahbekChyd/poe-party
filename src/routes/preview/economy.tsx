import { createFileRoute } from '@tanstack/react-router'
import { TeaserEconomyPage } from '../../components/preview/TeaserEconomyPage'
import { createPublicSeoHead } from '../../lib/public-seo-head'
export const Route = createFileRoute('/preview/economy')({
  head: () => createPublicSeoHead('/preview/economy'),
  component: TeaserEconomyPage,
})
