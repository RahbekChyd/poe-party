import { createFileRoute } from '@tanstack/react-router'
import { GearPage } from '../../../components/gear/GearPage'
export const Route = createFileRoute('/dashboard/gear/')({
  component: GearPage,
})
