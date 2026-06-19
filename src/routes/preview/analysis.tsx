import { createFileRoute } from '@tanstack/react-router'
import { GuestAnalysisPage } from '../../components/preview/GuestAnalysisPage'
import { createPublicSeoHead } from '../../lib/public-seo-head'
export const Route = createFileRoute('/preview/analysis')({
  head: () => createPublicSeoHead('/preview/analysis'),
  component: GuestAnalysisPage,
})
