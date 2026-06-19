import { createFileRoute } from '@tanstack/react-router'
import { PublicStrategyDetailPage } from '../../../../components/strategies/PublicStrategyDetailPage'
export const Route = createFileRoute('/dashboard/strategies/public/$strategyId')({
  component: PublicStrategyDetailPage,
})
