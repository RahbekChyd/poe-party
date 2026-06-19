import { createFileRoute } from '@tanstack/react-router'
import { CookiePolicyPage } from '../../components/legal/CookiePolicyPage'
import { createPublicSeoHead } from '../../lib/public-seo-head'
export const Route = createFileRoute('/legal/cookies')({
  head: () => createPublicSeoHead('/legal/cookies'),
  component: CookiePolicyPage,
})
