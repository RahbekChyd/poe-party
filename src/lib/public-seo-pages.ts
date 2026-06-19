import seoPages from './public-seo-pages.json'
export interface PublicSeoRoute {
  path: string
  title: string
  description: string
  priority: number
  changefreq: 'daily' | 'weekly' | 'monthly'
  prerender: boolean
  llmsSection: string
  contentType?: 'tool' | 'strategy'
  slug?: string
}

interface PublicSeoManifest {
  lastmod: string
  routes: PublicSeoRoute[]
}

export const publicSeoManifest = seoPages as PublicSeoManifest
export const publicSeoRoutes = publicSeoManifest.routes

export function findSeoRouteByPath(path: string) {
  return publicSeoRoutes.find((route) => route.path === path) ?? null
}

export function findSeoRouteBySlug(contentType: 'tool' | 'strategy', slug: string) {
  return (
    publicSeoRoutes.find(
      (route) => route.contentType === contentType && route.slug === slug,
    ) ?? null
  )
}

export const toolSeoRoutes = publicSeoRoutes.filter(
  (route) => route.contentType === 'tool',
)

export const strategySeoRoutes = publicSeoRoutes.filter(
  (route) => route.contentType === 'strategy',
)
