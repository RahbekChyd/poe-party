import { createFileRoute, redirect } from '@tanstack/react-router'
import { ProductHomePage } from '../components/home/ProductHomePage'
import { supabase } from '../lib/supabase'
import { createSeoHead, organizationJsonLd, softwareApplicationJsonLd } from '../lib/seo'

export const Route = createFileRoute('/')({
  head: () =>
    createSeoHead({
      title: 'Plan runs, track outcomes, choose upgrades',
      description:
        'Plan Path of Exile strategies, keep party and character context aligned, track PoE1 stash outcomes, and turn build analysis into the next upgrade.',
      path: '/',
      jsonLd: [organizationJsonLd, softwareApplicationJsonLd],
    }),
  beforeLoad: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (session) throw redirect({ to: '/dashboard' })
  },
  component: ProductHomePage,
})
