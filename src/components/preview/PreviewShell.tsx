import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createLink, Link, useRouterState } from '@tanstack/react-router'
import { Button } from '@heroui/react/button'
import { Dropdown } from '@heroui/react/dropdown'
import {
  Check,
  Coins,
  Compass,
  Handshake,
  LayoutDashboard,
  Menu,
  Moon,
  Search,
  Sparkles,
  Sun,
  Sword,
  Target,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import logo from '../../assets/poe-party-logo.png'
import { cn } from '../../lib/utils'
import { getLoginHref } from '../../lib/auth-redirect'
import { trackPublicEvent } from '../../lib/analytics'
import { Footer } from '../layout/Footer'
import { ErrorBoundary } from '../layout/ErrorBoundary'
import { WorkspaceFrame, WorkspaceRoute, WorkspaceRouteMarker } from '../layout/WorkspaceFrame'
import { resolveLeagueTheme } from '../../lib/league-theme'
import { getPoeGameShortLabel } from '../../lib/poe-game'
import { previewWorkspace } from '../../lib/preview-fixtures'
import { useThemeStore } from '../../store/theme-store'
import { GuestGateModal } from './PreviewShared'

interface PreviewNavItem {
  label: string
  to:
    | '/preview'
    | '/preview/analysis'
    | '/preview/economy'
    | '/preview/gear'
    | '/preview/members'
    | '/preview/search'
    | '/preview/services'
    | '/preview/strategies'
  icon: LucideIcon
  exact?: boolean
}

const publicItems: readonly PreviewNavItem[] = [
  { label: 'Analysis', to: '/preview/analysis', icon: Sparkles },
  { label: 'Directory', to: '/preview/search', icon: Search },
  { label: 'Services', to: '/preview/services', icon: Handshake },
  { label: 'Strategies', to: '/preview/strategies', icon: Target },
]

const privateWorkspaceItems: readonly PreviewNavItem[] = [
  { label: 'Overview', to: '/preview', icon: LayoutDashboard, exact: true },
  { label: 'Economy', to: '/preview/economy', icon: Coins },
  { label: 'Gear', to: '/preview/gear', icon: Sword },
  { label: 'Members', to: '/preview/members', icon: Users },
]

const MenuLink = createLink(Dropdown.Item)

function isItemActive(pathname: string, item: PreviewNavItem) {
  return pathname === item.to || pathname === `${item.to}/` ||
    (!item.exact && pathname.startsWith(`${item.to}/`))
}

function PreviewRouteLine({ pathname }: { pathname: string }) {
  const isPublicTool = publicItems.some((item) => isItemActive(pathname, item))

  return (
    <WorkspaceRoute label="Workspace sample">
      {privateWorkspaceItems.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          activeOptions={{ exact: true }}
          aria-current={isItemActive(pathname, item) ? 'page' : undefined}
          className="workspace-route-stop"
        >
          <WorkspaceRouteMarker icon={item.icon}>{item.label}</WorkspaceRouteMarker>
        </Link>
      ))}
      <Dropdown>
        <Dropdown.Trigger className="workspace-route-stop" data-current-section={isPublicTool ? '' : undefined}>
          <WorkspaceRouteMarker icon={Compass}>Explore</WorkspaceRouteMarker>
        </Dropdown.Trigger>
        <Dropdown.Popover placement="bottom">
          <Dropdown.Menu aria-label="Explore PoE Party">
            {publicItems.map(({ to, label, icon: Icon }) => {
              const isCurrent = isItemActive(pathname, { to, label, icon: Icon })
              return (
                <MenuLink
                  key={to}
                  id={to}
                  to={to}
                  activeOptions={{ exact: true }}
                  className={isCurrent ? 'bg-selected text-highlight font-semibold' : undefined}
                  textValue={label}
                  render={(props) =>
                    'href' in props ? <a {...props} aria-current={isCurrent ? 'page' : undefined} /> : <div {...props} />
                  }
                >
                  <Icon size={16} aria-hidden="true" />
                  {label}
                  {isCurrent && <Check size={14} className="ml-auto" aria-hidden="true" />}
                </MenuLink>
              )
            })}
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
    </WorkspaceRoute>
  )
}

export function PreviewShell({ children }: { children: ReactNode }) {
  const { location } = useRouterState()
  const pathname = location.pathname
  const { theme, toggle } = useThemeStore()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const mobileMenuTrigger = useRef<HTMLButtonElement>(null)
  const isSample = privateWorkspaceItems.some((item) => isItemActive(pathname, item))
  const publicPage = publicItems.find((item) => isItemActive(pathname, item))
  const loginHref =
    typeof window === 'undefined'
      ? '/auth/login'
      : getLoginHref(window.location.pathname + window.location.search + window.location.hash)

  const closeMenuOnEscape = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && mobileMenuOpen) {
      setMobileMenuOpen(false)
      mobileMenuTrigger.current?.focus()
    }
  }

  const mobileMenu = mobileMenuOpen ? (
    <nav
      id="preview-mobile-menu"
      aria-label="Explore PoE Party on mobile"
      className={cn(
        'border-divider bg-overlay absolute inset-x-0 z-10 grid max-h-[calc(100dvh-8rem)] gap-4 overflow-y-auto rounded-xl border p-3 shadow-lg lg:hidden',
        isSample ? 'bottom-full mb-2' : 'top-full mt-2',
      )}
    >
      {(isSample
        ? [{ label: 'Use now', items: publicItems }]
        : [
            { label: 'Use now', items: publicItems },
            { label: 'Workspace samples', items: privateWorkspaceItems },
          ]
      ).map((section) => (
        <div key={section.label}>
          <p className="text-default-500 px-1 text-xs font-medium">{section.label}</p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {section.items.map((item) => {
              const Icon = item.icon
              const isActive = isItemActive(pathname, item)
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  activeOptions={{ exact: true }}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    'flex min-h-12 items-center gap-2 rounded-lg border px-3 text-sm font-medium',
                    isActive
                      ? 'border-control bg-selected text-highlight font-semibold forced-colors:border-[Highlight]'
                      : 'border-divider bg-default-50 text-default-600',
                  )}
                >
                  <Icon size={16} aria-hidden="true" /> {item.label}
                </Link>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  ) : null

  return (
    <>
      <GuestGateModal />
      <WorkspaceFrame
        leagueTheme={isSample ? resolveLeagueTheme(previewWorkspace.game, previewWorkspace.league) : null}
        route={<PreviewRouteLine pathname={pathname} />}
        masthead={
          <header className="workspace-masthead" onKeyDown={closeMenuOnEscape}>
            <div className="workspace-masthead-identity">
              <div className="flex min-w-0 items-center gap-2">
                <Link
                  to="/"
                  activeOptions={{ exact: true }}
                  aria-label="PoE Party home"
                  className="shrink-0 rounded-lg"
                >
                  <img src={logo} alt="" className="size-8 rounded-lg" />
                </Link>
                <div className="min-w-0">
                  <p className="text-foreground text-sm leading-tight font-semibold wrap-anywhere">
                    {isSample ? previewWorkspace.leagueLabel : publicPage?.label ?? 'PoE Party'}
                  </p>
                  <p className="text-default-500 mt-0.5 text-xs leading-tight wrap-anywhere">
                    {isSample ? getPoeGameShortLabel(previewWorkspace.game) + ' · Workspace sample' : 'Public tool'}
                  </p>
                </div>
              </div>
            </div>
            <div className="workspace-masthead-tools">
              <Button isIconOnly size="sm" variant="tertiary" onPress={toggle} aria-label="Toggle theme">
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </Button>
              {!isSample && (
                <Button
                  ref={mobileMenuTrigger}
                  isIconOnly
                  size="sm"
                  variant="tertiary"
                  onPress={() => setMobileMenuOpen((open) => !open)}
                  aria-label={mobileMenuOpen ? 'Close explore menu' : 'Open explore menu'}
                  aria-expanded={mobileMenuOpen}
                  aria-controls={mobileMenuOpen ? 'preview-mobile-menu' : undefined}
                  className="lg:hidden"
                >
                  {mobileMenuOpen ? <X size={17} /> : <Menu size={17} />}
                </Button>
              )}
              <a
                className="button button--sm button--tertiary"
                href={loginHref}
                onClick={() =>
                  trackPublicEvent('public_sign_in_click', {
                    source: pathname,
                    placement: 'header',
                  })
                }
              >
                {isSample ? <><span className="hidden sm:inline">Connect account</span><span className="sm:hidden">Connect</span></> : 'Sign in'}
              </a>
            </div>
            {!isSample && mobileMenu}
          </header>
        }
        dock={isSample && (
          <div className="workspace-dock lg:hidden" onKeyDown={closeMenuOnEscape}>
            <nav aria-label="Workspace sample" className="grid grid-cols-5">
              {privateWorkspaceItems.map((item) => {
                const Icon = item.icon
                const isActive = isItemActive(pathname, item)

                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    activeOptions={{ exact: true }}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      'mobile-nav-tab flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-transparent px-1 text-[11px] font-medium',
                      isActive
                        ? 'border-control bg-selected text-highlight font-semibold forced-colors:border-[Highlight]'
                        : 'text-default-500',
                    )}
                  >
                    <Icon size={17} aria-hidden="true" />
                    <span>{item.label}</span>
                  </Link>
                )
              })}
              <Button
                ref={mobileMenuTrigger}
                variant="ghost"
                onPress={() => setMobileMenuOpen((open) => !open)}
                aria-label={mobileMenuOpen ? 'Close explore menu' : 'Open explore menu'}
                aria-expanded={mobileMenuOpen}
                aria-controls={mobileMenuOpen ? 'preview-mobile-menu' : undefined}
                className="mobile-nav-tab text-default-500 flex h-auto min-h-12 w-full flex-col gap-1 rounded-xl p-1 text-[11px]"
              >
                {mobileMenuOpen ? <X size={17} aria-hidden="true" /> : <Menu size={17} aria-hidden="true" />}
                Explore
              </Button>
            </nav>
            {mobileMenu}
          </div>
        )}
        footer={<Footer />}
      >
        <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>
      </WorkspaceFrame>
    </>
  )
}
