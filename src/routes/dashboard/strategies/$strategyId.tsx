import { createFileRoute } from '@tanstack/react-router'
import { StrategyDetailPage } from '../../../components/strategies/StrategyDetailPage'
export const Route = createFileRoute('/dashboard/strategies/$strategyId')({
  component: StrategyDetailPage,
})
