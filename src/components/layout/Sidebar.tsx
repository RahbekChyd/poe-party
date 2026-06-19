import { Link, useRouterState } from '@tanstack/react-router'
import {
  Handshake,
  LayoutDashboard,
  Search,
  Sparkles,
  Sword,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import logo from '../../assets/poe-party-logo.png'
import { useGroupStore } from '../../store/group-store'
import { useIsSoloGroup } from '../../hooks/useGroups'
import { HoverTooltip } from '../ui/hover-tooltip'
const navItems = [{ label: 'Overview', to: '/dashboard', icon: LayoutDashboard, exact: true }]

const navSections = [
  {
    label: 'Workspace',
    items: [
      { label: 'Economy', to: '/dashboard/economy', icon: TrendingUp, exact: false },
      { label: 'Analysis', to: '/dashboard/analysis', icon: Sparkles, exact: false },
      { label: 'Gear Planning', to: '/dashboard/gear', icon: Sword, exact: false },
      { label: 'Members', to: '/dashboard/members', icon: Users, exact: false },
    ],
  },
  {
    label: 'Community',
    items: [
      { label: 'Directory', to: '/dashboard/search', icon: Search, exact: false },
      { label: 'Services', to: '/dashboard/services', icon: Handshake, exact: false },
      { label: 'Strategies', to: '/dashboard/strategies', icon: Target, exact: false },
    ],
  },
]

export function Sidebar() {
  const { location } = useRouterState()
  const activeGroupId = useGroupStore((s) => s.activeGroupId)
  const isSolo = useIsSoloGroup(activeGroupId)

  return (
    <aside className="border-divider/70 bg-content1/90 flex h-full w-16 shrink-0 flex-col border-r backdrop-blur lg:w-60">
      <div className="border-divider/50 flex shrink-0 items-center justify-center gap-2 border-b px-3 py-5 lg:justify-start lg:px-4">
        <img src={logo} alt="PoE Party" className="h-8 w-8 rounded-lg" />
        <span className="text-foreground hidden text-base font-semibold tracking-tight lg:inline">
          PoE Party
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-4 px-2 py-2">
        {navItems.map(({ label: rawLabel, to, icon: Icon, exact }) => {
          const label = isSolo && to === '/dashboard/members' ? 'Characters' : rawLabel
          const isActive = exact ? location.pathname === to : location.pathname.startsWith(to)

          return (
            <HoverTooltip
              key={to}
              as="span"
              className="block"
              content={label}
              contentClassName="lg:hidden"
              placement="right"
            >
              <Link
                to={to}
                className={cn(
                  'relative flex min-h-9 items-center justify-center gap-3 overflow-hidden rounded-lg px-3 py-2 text-sm font-medium transition-colors lg:justify-start',
                  isActive
                    ? 'bg-warning/15 text-warning ring-warning/20 ring-1'
                    : 'text-default-500 hover:bg-default-100 hover:text-default-800',
                )}
                title={label}
              >
                <span
                  className={cn(
                    'bg-warning absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-r-full transition-opacity',
                    isActive ? 'opacity-100' : 'opacity-0',
                  )}
                  aria-hidden="true"
                />
                <Icon size={16} className="shrink-0" />
                <span className="hidden truncate lg:inline">{label}</span>
              </Link>
            </HoverTooltip>
          )
        })}

        {navSections.map((section) => (
          <div
            key={section.label}
            className="border-divider/40 flex flex-col gap-0.5 border-t pt-4 lg:border-t-0 lg:pt-0"
          >
            <p className="text-default-400 hidden px-3 text-xs font-semibold tracking-wide uppercase lg:block">
              {section.label}
            </p>
            {section.items.map(({ label: rawLabel, to, icon: Icon, exact }) => {
              const label = isSolo && to === '/dashboard/members' ? 'Characters' : rawLabel
              const isActive = exact ? location.pathname === to : location.pathname.startsWith(to)

              return (
                <HoverTooltip
                  key={to}
                  as="span"
                  className="block"
                  content={label}
                  contentClassName="lg:hidden"
                  placement="right"
                >
                  <Link
                    to={to}
                    className={cn(
                      'relative flex min-h-9 items-center justify-center gap-3 overflow-hidden rounded-lg px-3 py-2 text-sm font-medium transition-colors lg:justify-start',
                      isActive
                        ? 'bg-warning/15 text-warning ring-warning/20 ring-1'
                        : 'text-default-500 hover:bg-default-100 hover:text-default-800',
                    )}
                    title={label}
                  >
                    <span
                      className={cn(
                        'bg-warning absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-r-full transition-opacity',
                        isActive ? 'opacity-100' : 'opacity-0',
                      )}
                      aria-hidden="true"
                    />
                    <Icon size={16} className="shrink-0" />
                    <span className="hidden truncate lg:inline">{label}</span>
                  </Link>
                </HoverTooltip>
              )
            })}
          </div>
        ))}
      </nav>
    </aside>
  )
}
