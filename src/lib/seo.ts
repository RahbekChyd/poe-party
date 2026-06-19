import type { AnyRouteMatch } from '@tanstack/react-router'
export const SITE_NAME = 'PoE Party'
export const SITE_URL = 'https://poe-party.com'
export const SITE_LOGO_URL = `${SITE_URL}/poe-party-logo.png`
export const CONTACT_EMAIL = 'support@poe-party.com'
export const CONTACT_MAILTO = `mailto:${CONTACT_EMAIL}`
export const DISCORD_URL = 'https://discord.gg/hSMV2r83mU'

export const DEFAULT_SEO_DESCRIPTION =
  'PoE Party is a Path of Exile group tool for party economy tracking, stash snapshots, public strategies, service listings, gear planning, and upgrade analysis for PoE 1 and Path of Exile 2.'

type RouteMeta = NonNullable<AnyRouteMatch['meta']>
type RouteLinks = NonNullable<AnyRouteMatch['links']>

type JsonLd = Record<string, unknown>

interface SeoHeadOptions {
  title: string
  description: string
  path: string
  image?: string
  noIndex?: boolean
  jsonLd?: JsonLd | JsonLd[]
  includeCanonical?: boolean
}

function absoluteUrl(path: string) {
  return new URL(path, SITE_URL).toString()
}

function formatTitle(title: string) {
  return title === SITE_NAME ? SITE_NAME : `${title} | ${SITE_NAME}`
}

export function createSeoHead({
  title,
  description,
  path,
  image = SITE_LOGO_URL,
  noIndex = false,
  jsonLd,
  includeCanonical = true,
}: SeoHeadOptions): { meta: RouteMeta; links: RouteLinks } {
  const canonicalUrl = absoluteUrl(path)
  const fullTitle = formatTitle(title)
  const meta: RouteMeta = [
    { title: fullTitle },
    { name: 'description', content: description },
    { name: 'robots', content: noIndex ? 'noindex, nofollow' : 'index, follow' },
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: SITE_NAME },
    { property: 'og:title', content: fullTitle },
    { property: 'og:description', content: description },
    { property: 'og:url', content: canonicalUrl },
    { property: 'og:image', content: image },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: fullTitle },
    { name: 'twitter:description', content: description },
    { name: 'twitter:image', content: image },
  ]

  const jsonLdEntries = Array.isArray(jsonLd) ? jsonLd : jsonLd ? [jsonLd] : []
  for (const entry of jsonLdEntries) {
    meta.push({ 'script:ld+json': entry } as RouteMeta[number])
  }

  return {
    meta,
    links: includeCanonical ? [{ rel: 'canonical', href: canonicalUrl }] : [],
  }
}

export const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE_NAME,
  url: SITE_URL,
  logo: SITE_LOGO_URL,
  sameAs: [DISCORD_URL],
}

export const softwareApplicationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: SITE_NAME,
  url: SITE_URL,
  image: SITE_LOGO_URL,
  applicationCategory: 'GameApplication',
  operatingSystem: 'Web',
  description: DEFAULT_SEO_DESCRIPTION,
  keywords:
    'Path of Exile tool, PoE group tool, PoE economy tracker, PoE stash snapshot, PoE gear planner, Path of Exile 2 tools',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
  publisher: {
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
  },
}
