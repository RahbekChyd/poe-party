import { createFileRoute } from '@tanstack/react-router'
import { EconomyPage } from '../../../components/economy/EconomyPage'
export const Route = createFileRoute('/dashboard/economy/')({
  component: EconomyPage,
})
