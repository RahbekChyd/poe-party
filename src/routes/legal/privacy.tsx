import { createFileRoute } from '@tanstack/react-router'
import { PrivacyPolicyPage } from '../../components/legal/PrivacyPolicyPage'
import { createPublicSeoHead } from '../../lib/public-seo-head'
export const Route = createFileRoute('/legal/privacy')({
  head: () => createPublicSeoHead('/legal/privacy'),
  component: PrivacyPolicyPage,
})
