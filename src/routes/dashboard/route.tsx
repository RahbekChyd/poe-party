import { createFileRoute, Outlet } from '@tanstack/react-router'
import { AppShell } from '../../components/layout/AppShell'
import { createSeoHead } from '../../lib/seo'
export const Route = createFileRoute('/dashboard')({
  head: () =>
    createSeoHead({
      title: 'Dashboard',
      description:
        'PoE Party dashboard for signed-in Path of Exile groups, stash snapshots, economy tracking, strategies, services, and gear planning.',
      path: '/dashboard',
      noIndex: true,
    }),
  component: DashboardLayout,
})

function DashboardLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}
