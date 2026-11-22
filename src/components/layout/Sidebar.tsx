import { Link, useRouterState } from '@tanstack/react-router'
import { Check } from 'lucide-react'
import { cn } from '../../lib/utils'
import logo from '../../assets/poe-party-logo.png'
import { useGroupStore } from '../../store/group-store'
import { useIsSoloGroup } from '../../hooks/useGroups'
import { dashboardNavigation, isDashboardNavItemActive } from './dashboard-navigation'

export function Sidebar() {
  const { location } = useRouterState()
  const activeGroupId = useGroupStore((s) => s.activeGroupId)
  const isSolo = useIsSoloGroup(activeGroupId)

  return (
    <aside className="workspace-rail">
      <div className="workspace-rail-brand">
        <img src={logo} alt="" className="h-8 w-8 rounded-lg" />
        <span className="text-foreground hidden text-base font-semibold tracking-tight lg:inline">
          PoE Party
        </span>
      </div>

      <nav
        aria-label="Primary dashboard"
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pt-1 pb-3"
      >
        {dashboardNavigation.map((section) => (
          <div key={section.label} className="flex flex-col gap-0.5">
            {section.label !== 'Today' && (
              <p className="text-default-500 px-3 text-xs font-medium">{section.label}</p>
            )}
            {section.items.map((item) => {
              const { label: rawLabel, to, icon: Icon } = item
              const label = isSolo && to === '/dashboard/members' ? 'Characters' : rawLabel
              const isActive = isDashboardNavItemActive(location.pathname, item)

              return (
                <Link
                  key={to}
                  to={to}
                  activeOptions={{ exact: true }}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'relative flex min-h-10 items-center gap-3 rounded-lg border border-transparent px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'border-control bg-selected text-highlight font-semibold forced-colors:border-[Highlight]'
                      : 'text-default-500 hover:bg-default-100 hover:text-default-800',
                  )}
                >
                  <Icon size={16} className="shrink-0" aria-hidden="true" />
                  <span className="truncate">{label}</span>
                  {isActive && <Check size={14} className="ml-auto shrink-0" aria-hidden="true" />}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>
    </aside>
  )
}
