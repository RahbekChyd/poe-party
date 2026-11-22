import { Link, useRouterState } from '@tanstack/react-router'
import { useGroupStore } from '../../store/group-store'
import { useIsSoloGroup } from '../../hooks/useGroups'
import { dashboardNavigation, isDashboardNavItemActive } from './dashboard-navigation'
import { WorkspaceRoute, WorkspaceRouteMarker } from './WorkspaceFrame'

const destinations = dashboardNavigation.flatMap((section) => section.items)

export function DashboardRouteLine() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const activeGroupId = useGroupStore((s) => s.activeGroupId)
  const isSolo = useIsSoloGroup(activeGroupId)

  return (
    <WorkspaceRoute label="Primary dashboard">
      {destinations.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          activeOptions={{ exact: true }}
          aria-current={isDashboardNavItemActive(pathname, item) ? 'page' : undefined}
          className="workspace-route-stop"
        >
          <WorkspaceRouteMarker icon={item.icon}>
            {isSolo && item.to === '/dashboard/members' ? 'Characters' : item.label}
          </WorkspaceRouteMarker>
        </Link>
      ))}
    </WorkspaceRoute>
  )
}
