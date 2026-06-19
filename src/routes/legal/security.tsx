import { createFileRoute } from '@tanstack/react-router'
import { SecurityTrustPage } from '../../components/legal/SecurityTrustPage'
import { createPublicSeoHead } from '../../lib/public-seo-head'
export const Route = createFileRoute('/legal/security')({
  head: () => createPublicSeoHead('/legal/security'),
  component: SecurityTrustPage,
})
