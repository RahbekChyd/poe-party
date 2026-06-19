import { createFileRoute } from '@tanstack/react-router'
import { TeaserGearPage } from '../../components/preview/TeaserGearPage'
import { createPublicSeoHead } from '../../lib/public-seo-head'
export const Route = createFileRoute('/preview/gear')({
  head: () => createPublicSeoHead('/preview/gear'),
  component: TeaserGearPage,
})
