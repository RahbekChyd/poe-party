import { createFileRoute } from '@tanstack/react-router'
import { ServiceDetailPage } from '../../../components/services/ServiceDetailPage'
export const Route = createFileRoute('/dashboard/services/$serviceId')({
  component: ServiceDetailPage,
})
