import { createSeoHead } from './seo'
import { findSeoRouteByPath } from './public-seo-pages'
export function createPublicSeoHead(path: string, options?: { jsonLd?: Record<string, unknown> }) {
  const route = findSeoRouteByPath(path)

  return createSeoHead({
    title: route?.title ?? 'Path of Exile tools',
    description:
      route?.description ??
      'Explore PoE Party tools for Path of Exile group economy, stash snapshots, strategies, services, gear planning, and upgrade analysis.',
    path,
    jsonLd: options?.jsonLd,
  })
}
