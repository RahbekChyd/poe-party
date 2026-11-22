import { Link, useRouterState } from '@tanstack/react-router'
import { useGroupStore } from '../../store/group-store'
import { useIsSoloGroup } from '../../hooks/useGroups'
import { dashboardNavigation, isDashboardNavItemActive } from './dashboard-navigation'
import { WorkspaceSidebarGroup } from './WorkspaceFrame'

export function DashboardSidebar() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const activeGroupId = useGroupStore((s) => s.activeGroupId)
  const isSolo = useIsSoloGroup(activeGroupId)

  return (
    <nav className="workspace-sidebar" aria-label="Primary dashboard">
      {dashboardNavigation.map((section) => (
        <WorkspaceSidebarGroup key={section.label} label={section.label === 'Today' ? undefined : section.label}>
          {section.items.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: true }}
                aria-current={isDashboardNavItemActive(pathname, item) ? 'page' : undefined}
                className="workspace-sidebar-link"
              >
                <Icon size={16} aria-hidden="true" />
                {isSolo && item.to === '/dashboard/members' ? 'Characters' : item.label}
              </Link>
            )
          })}
        </WorkspaceSidebarGroup>
      ))}
    </nav>
  )
}
