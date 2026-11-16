import { createFileRoute } from '@tanstack/react-router'
import { PublicSeoLandingPage } from '../../components/seo/PublicSeoLandingPage'
import { SITE_NAME, SITE_URL, createSeoHead } from '../../lib/seo'
import { findSeoRouteBySlug } from '../../lib/public-seo-pages'
import { findPublicStrategyContentBySlug } from '../../lib/public-strategy-content'
export const Route = createFileRoute('/poe-strategies/$strategySlug')({
  head: ({ params }) => {
    const route = findSeoRouteBySlug('strategy', params.strategySlug)
    const content = findPublicStrategyContentBySlug(params.strategySlug)
    return createSeoHead({
      title: route?.title ?? 'Path of Exile farming strategies',
      description:
        route?.description ??
        'Explore PoE Party farming strategy pages for Path of Exile planning, investment tracking, public sharing, and snapshot-linked results.',
      path: route?.path ?? `/poe-strategies/${params.strategySlug}`,
      jsonLd: content
        ? {
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: content.seo.title,
            description: content.seo.description,
            mainEntityOfPage: `${SITE_URL}/poe-strategies/${content.slug}`,
            dateModified: content.verifiedAt,
            keywords: content.tags,
            author: {
              '@type': 'Organization',
              name: SITE_NAME,
              url: SITE_URL,
            },
            publisher: {
              '@type': 'Organization',
              name: SITE_NAME,
              url: SITE_URL,
            },
          }
        : undefined,
    })
  },
  component: StrategySeoRoute,
})

function StrategySeoRoute() {
  const { strategySlug } = Route.useParams()
  return <PublicSeoLandingPage contentType="strategy" slug={strategySlug} />
}
