import { createFileRoute } from '@tanstack/react-router'
import { FaqPage } from '../../components/legal/FaqPage'
import { createPublicSeoHead } from '../../lib/public-seo-head'
import { GITHUB_URL } from '../../lib/seo'
const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What is PoE Party?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'PoE Party is an independent Path of Exile tool for solo or party economy tracking, stash snapshots, strategy coordination, service listings, gear planning, and upgrade analysis.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is PoE Party open source?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: `Yes. PoE Party is open source under Apache-2.0, and the source is available on GitHub at ${GITHUB_URL}. The public repo includes the application, Supabase schema/functions, optimizer worker, analyser/scoring logic, local tooling, and validation workflows. Hosted production data, secrets, deploy automation, billing repair tools, and abuse-sensitive operations material stay private.`,
      },
    },
    {
      '@type': 'Question',
      name: 'Does PoE Party support PoE 1 and Path of Exile 2?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'PoE Party currently supports Path of Exile 1. Path of Exile 2 support is under development and is not available in the public app yet.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can I use PoE Party as a solo player?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. PoE Party works for solo players as well as groups. You can create a solo workspace, track your own stash snapshots and wealth history, organize strategies, plan upgrades, and keep character progress in one place.',
      },
    },
    {
      '@type': 'Question',
      name: 'How is group wealth calculated?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'PoE Party sums each synced member latest completed priced snapshot for the selected Path of Exile group. Excluded items and members without completed snapshots do not contribute to the total.',
      },
    },
    {
      '@type': 'Question',
      name: 'How is currency per hour calculated on strategies?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'PoE Party estimates strategy currency per hour from strategy-linked group wealth history points. It compares consecutive group wealth values over elapsed time and aggregates the tagged intervals.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can I be in more than one workspace or group?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. You can create a solo workspace, create shared Path of Exile groups, join other groups by invite code, and switch between them in the app.',
      },
    },
    {
      '@type': 'Question',
      name: 'What happens when I reach the max number of snapshots?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'When a new snapshot completes and the account is already at its capacity limit, PoE Party removes the oldest completed raw snapshot automatically while durable summary history can remain available.',
      },
    },
    {
      '@type': 'Question',
      name: 'What changes if I become a Supporter?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Supporter costs $5/month and helps fund hosting, optimizer worker capacity, public tools, and ongoing open-source development. It includes up to 15 retained raw snapshots, interval/Mix snapshot scheduling, and no app-enforced daily authenticated upgrade-analysis queue cap. Community includes 5 retained raw snapshots and 3 authenticated upgrade-analysis queues per UTC day.',
      },
    },
    {
      '@type': 'Question',
      name: 'How does Supporter billing work?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Community accounts can start a Supporter subscription through Stripe Checkout from the Support PoE Party page. Supporters can manage eligible subscriptions through the Stripe billing portal. Supporter access syncs from trusted Stripe billing events or support grants.',
      },
    },
  ],
}

export const Route = createFileRoute('/legal/faq')({
  head: () => createPublicSeoHead('/legal/faq', { jsonLd: faqJsonLd }),
  component: FaqPage,
})
