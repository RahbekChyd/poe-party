import { Link, useRouterState } from '@tanstack/react-router'
import { cn } from '../../lib/utils'
import { dashboardNavigation, isDashboardSectionActive } from './dashboard-navigation'

export function MobileBottomNav() {
  const { location } = useRouterState()

  return (
    <nav
      aria-label="Primary dashboard"
      className="border-divider/70 bg-content1/95 grid shrink-0 grid-cols-5 border-t px-1 pb-[max(env(safe-area-inset-bottom),0.25rem)] backdrop-blur lg:hidden"
    >
      {dashboardNavigation.map((section) => {
        const destination = section.items[0]
        const isActive = isDashboardSectionActive(location.pathname, section)
        const Icon = section.icon

        return (
          <Link
            key={section.label}
            to={destination.to}
            activeOptions={{ exact: true }}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary',
              isActive ? 'text-warning' : 'text-default-500 hover:text-default-800',
            )}
          >
            <Icon size={18} aria-hidden="true" />
            <span className="max-w-full truncate">{section.label}</span>
            <span
              aria-hidden="true"
              className={cn(
                'bg-warning absolute inset-x-4 top-0 h-0.5 rounded-b-full transition-opacity',
                isActive ? 'opacity-100' : 'opacity-0',
              )}
            />
          </Link>
        )
      })}
    </nav>
  )
}
