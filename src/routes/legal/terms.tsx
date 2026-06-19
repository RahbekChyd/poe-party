import { createFileRoute } from '@tanstack/react-router'
import { TermsOfServicePage } from '../../components/legal/TermsOfServicePage'
import { createPublicSeoHead } from '../../lib/public-seo-head'
export const Route = createFileRoute('/legal/terms')({
  head: () => createPublicSeoHead('/legal/terms'),
  component: TermsOfServicePage,
})
