import {
  Compass,
  Handshake,
  LayoutDashboard,
  Search,
  Sparkles,
  Sword,
  Target,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react'

export type DashboardRoute =
  | '/dashboard'
  | '/dashboard/economy'
  | '/dashboard/analysis'
  | '/dashboard/gear'
  | '/dashboard/members'
  | '/dashboard/search'
  | '/dashboard/services'
  | '/dashboard/strategies'

export interface DashboardNavItem {
  label: string
  to: DashboardRoute
  icon: LucideIcon
  match: readonly string[]
}

export interface DashboardNavSection {
  label: 'Today' | 'Runs' | 'Builds' | 'Party' | 'Discover'
  icon: LucideIcon
  items: readonly DashboardNavItem[]
}

export const dashboardNavigation: readonly DashboardNavSection[] = [
  {
    label: 'Today',
    icon: LayoutDashboard,
    items: [
      {
        label: 'Today',
        to: '/dashboard',
        icon: LayoutDashboard,
        match: ['/dashboard'],
      },
    ],
  },
  {
    label: 'Runs',
    icon: Target,
    items: [
      {
        label: 'Strategies',
        to: '/dashboard/strategies',
        icon: Target,
        match: ['/dashboard/strategies'],
      },
      {
        label: 'Economy',
        to: '/dashboard/economy',
        icon: TrendingUp,
        match: ['/dashboard/economy'],
      },
    ],
  },
  {
    label: 'Builds',
    icon: Sparkles,
    items: [
      {
        label: 'Analysis',
        to: '/dashboard/analysis',
        icon: Sparkles,
        match: ['/dashboard/analysis'],
      },
      {
        label: 'Gear Planning',
        to: '/dashboard/gear',
        icon: Sword,
        match: ['/dashboard/gear'],
      },
    ],
  },
  {
    label: 'Party',
    icon: Users,
    items: [
      {
        label: 'Members',
        to: '/dashboard/members',
        icon: Users,
        match: ['/dashboard/members'],
      },
    ],
  },
  {
    label: 'Discover',
    icon: Compass,
    items: [
      {
        label: 'Directory',
        to: '/dashboard/search',
        icon: Search,
        match: ['/dashboard/search'],
      },
      {
        label: 'Services',
        to: '/dashboard/services',
        icon: Handshake,
        match: ['/dashboard/services'],
      },
    ],
  },
] as const

export function isDashboardNavItemActive(pathname: string, item: DashboardNavItem) {
  if (item.to === '/dashboard') return pathname === '/dashboard' || pathname === '/dashboard/'
  return item.match.some((prefix) => pathname.startsWith(prefix))
}

export function isDashboardSectionActive(pathname: string, section: DashboardNavSection) {
  return section.items.some((item) => isDashboardNavItemActive(pathname, item))
}
