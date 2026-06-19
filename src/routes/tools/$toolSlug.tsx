import { createFileRoute } from '@tanstack/react-router'
import { PublicSeoLandingPage } from '../../components/seo/PublicSeoLandingPage'
import { createSeoHead } from '../../lib/seo'
import { findSeoRouteBySlug } from '../../lib/public-seo-pages'
export const Route = createFileRoute('/tools/$toolSlug')({
  head: ({ params }) => {
    const route = findSeoRouteBySlug('tool', params.toolSlug)
    return createSeoHead({
      title: route?.title ?? 'Path of Exile tools',
      description:
        route?.description ??
        'Explore PoE Party tools for Path of Exile stash tracking, group economy, strategies, services, and gear planning.',
      path: route?.path ?? `/tools/${params.toolSlug}`,
    })
  },
  component: ToolSeoRoute,
})

function ToolSeoRoute() {
  const { toolSlug } = Route.useParams()
  return <PublicSeoLandingPage contentType="tool" slug={toolSlug} />
}
