import { createFileRoute } from '@tanstack/react-router'
import { PublicSeoLandingPage } from '../../components/seo/PublicSeoLandingPage'
import { createSeoHead } from '../../lib/seo'
import { findSeoRouteBySlug } from '../../lib/public-seo-pages'
export const Route = createFileRoute('/poe-strategies/$strategySlug')({
  head: ({ params }) => {
    const route = findSeoRouteBySlug('strategy', params.strategySlug)
    return createSeoHead({
      title: route?.title ?? 'Path of Exile farming strategies',
      description:
        route?.description ??
        'Explore PoE Party farming strategy pages for Path of Exile planning, investment tracking, public sharing, and snapshot-linked results.',
      path: route?.path ?? `/poe-strategies/${params.strategySlug}`,
    })
  },
  component: StrategySeoRoute,
})

function StrategySeoRoute() {
  const { strategySlug } = Route.useParams()
  return <PublicSeoLandingPage contentType="strategy" slug={strategySlug} />
}
