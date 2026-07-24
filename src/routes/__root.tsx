import { createRootRoute, Outlet, redirect } from '@tanstack/react-router'
import { DocumentHead } from '../components/layout/DocumentHead'
import { supabase } from '../lib/supabase'
import {
  DEFAULT_SEO_DESCRIPTION,
  SITE_NAME,
  createSeoHead,
  organizationJsonLd,
  softwareApplicationJsonLd,
} from '../lib/seo'
export const Route = createRootRoute({
  head: () =>
    createSeoHead({
      title: `${SITE_NAME} - Path of Exile group tools`,
      description: DEFAULT_SEO_DESCRIPTION,
      path: '/',
      jsonLd: [organizationJsonLd, softwareApplicationJsonLd],
      includeCanonical: false,
    }),
  beforeLoad: async ({ location }) => {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    const isPublicRoute =
      location.pathname === '/' ||
      location.pathname.startsWith('/auth') ||
      location.pathname.startsWith('/legal') ||
      location.pathname.startsWith('/preview') ||
      location.pathname.startsWith('/tools') ||
      location.pathname.startsWith('/poe-strategies')

    if (!session && !isPublicRoute) {
      throw redirect({ to: '/preview/analysis' })
    }

    if (session && !isPublicRoute) {
      // Validate the JWT against the auth server to catch stale tokens
      // (e.g. after a DB reset where auth.users was wiped)
      const { error } = await supabase.auth.getUser()
      if (error) {
        await supabase.auth.signOut()
        throw redirect({ to: '/auth/login' })
      }
    }

    if (session && location.pathname === '/auth/login') {
      throw redirect({ to: '/dashboard' })
    }
  },
  component: () => (
    <>
      <DocumentHead />
      <Outlet />
    </>
  ),
})
