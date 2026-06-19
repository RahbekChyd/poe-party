import { createFileRoute, Outlet } from '@tanstack/react-router'
import { PreviewShell } from '../../components/preview/PreviewShell'
export const Route = createFileRoute('/poe-strategies')({
  component: PoeStrategiesLayout,
})

function PoeStrategiesLayout() {
  return (
    <PreviewShell>
      <Outlet />
    </PreviewShell>
  )
}
