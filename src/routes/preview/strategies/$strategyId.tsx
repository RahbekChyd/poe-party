import { createFileRoute } from '@tanstack/react-router'
import { GuestStrategyDetailPage } from '../../../components/preview/GuestStrategyDetailPage'
import { createSeoHead } from '../../../lib/seo'
export const Route = createFileRoute('/preview/strategies/$strategyId')({
  head: ({ params }) =>
    createSeoHead({
      title: 'PoE strategy preview',
      description:
        'Open a public Path of Exile strategy preview in PoE Party with visible summary data, league context, benchmark estimates, and read-only setup details.',
      path: `/preview/strategies/${params.strategyId}`,
    }),
  component: GuestStrategyDetailPage,
})
