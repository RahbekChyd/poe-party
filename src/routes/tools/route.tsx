import { createFileRoute, Outlet } from '@tanstack/react-router'
import { PreviewShell } from '../../components/preview/PreviewShell'
export const Route = createFileRoute('/tools')({
  component: ToolsLayout,
})

function ToolsLayout() {
  return (
    <PreviewShell>
      <Outlet />
    </PreviewShell>
  )
}
