import { createFileRoute } from '@tanstack/react-router'
import { GearSuggestionDetailPage } from '../../../components/gear/GearSuggestionDetailPage'
export const Route = createFileRoute('/dashboard/gear/$suggestionId')({
  component: GearSuggestionDetailPage,
})
