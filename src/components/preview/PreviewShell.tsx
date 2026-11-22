import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { Button } from '@heroui/react/button'
import {
  Check,
  Coins,
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
import { WorkspaceEngraving, WorkspaceFrame } from '../layout/WorkspaceFrame'
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

function isItemActive(pathname: string, item: PreviewNavItem) {
  return pathname === item.to || pathname === `${item.to}/` ||
    (!item.exact && pathname.startsWith(`${item.to}/`))
}

function currentPageMeta(pathname: string): { section: string; page: string } {
  if (pathname === '/preview' || pathname === '/preview/') return { section: 'Workspace sample', page: 'Overview' }
  if (pathname.startsWith('/preview/economy')) return { section: 'Workspace sample', page: 'Economy' }
  if (pathname.startsWith('/preview/members')) return { section: 'Workspace sample', page: 'Members' }
  if (pathname.startsWith('/preview/gear')) return { section: 'Workspace sample', page: 'Gear' }
  if (pathname.startsWith('/preview/analysis')) return { section: 'Public tool', page: 'Analysis' }
  if (/^\/preview\/strategies\/[^/]/.test(pathname)) return { section: 'Public tool', page: 'Strategy' }
  if (pathname.startsWith('/preview/strategies')) return { section: 'Public tool', page: 'Strategies' }
  if (pathname.startsWith('/preview/services')) return { section: 'Public tool', page: 'Services' }
  if (pathname.startsWith('/preview/search')) return { section: 'Public tool', page: 'Directory' }
  return { section: 'Explore', page: 'PoE Party' }
}

function PreviewSidebarSection({ title, items }: { title: string; items: readonly PreviewNavItem[] }) {
  const { location } = useRouterState()

  return (
    <div className="flex flex-col gap-2">
      <p className="text-default-400 px-3 text-[11px] font-semibold tracking-[0.22em] uppercase">
        {title}
      </p>
      <div className="flex flex-col gap-1">
        {items.map((item) => {
          const Icon = item.icon
          const isActive = isItemActive(location.pathname, item)

          return (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: true }}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex min-h-10 items-center gap-3 rounded-xl border border-transparent px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'border-control bg-selected text-highlight font-semibold forced-colors:border-[Highlight]'
                  : 'text-default-500 hover:bg-default-100 hover:text-default-800',
              )}
            >
              <Icon size={16} aria-hidden="true" />
              <span className="truncate">{item.label}</span>
              {isActive && <Check size={14} className="ml-auto shrink-0" aria-hidden="true" />}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

export function PreviewShell({ children }: { children: ReactNode }) {
  const { location } = useRouterState()
  const pathname = location.pathname
  const { theme, toggle } = useThemeStore()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const mobileMenuTrigger = useRef<HTMLButtonElement>(null)
  const isSample = privateWorkspaceItems.some((item) => isItemActive(pathname, item))
  const pageMeta = currentPageMeta(pathname)
  const loginHref =
    typeof window === 'undefined'
      ? '/auth/login'
      : getLoginHref(window.location.pathname + window.location.search + window.location.hash)
  const crossLink = isSample
    ? { to: '/preview/analysis' as const, label: 'Try public Analysis' }
    : { to: '/preview' as const, label: 'Workspace samples' }

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
        rail={
          <aside className="workspace-rail">
            <Link
              to="/"
              activeOptions={{ exact: true }}
              className="workspace-rail-brand rounded-tl-2xl"
            >
              <img src={logo} alt="" className="size-8 rounded-lg" />
              <span className="text-foreground shrink-0 font-semibold">PoE Party</span>
            </Link>
            <nav aria-label="Explore PoE Party" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2.5 pt-1 pb-3">
              {isSample ? (
                <>
                  <PreviewSidebarSection title="Workspace sample" items={privateWorkspaceItems} />
                  <PreviewSidebarSection title="Use now" items={publicItems} />
                </>
              ) : (
                <>
                  <PreviewSidebarSection title="Use now" items={publicItems} />
                  <PreviewSidebarSection title="Workspace samples" items={privateWorkspaceItems} />
                </>
              )}
            </nav>
          </aside>
        }
        masthead={
          <header className="workspace-masthead" onKeyDown={closeMenuOnEscape}>
            <div className="workspace-masthead-identity">
              <div className="flex min-w-0 items-center gap-2">
                <Link
                  to="/"
                  activeOptions={{ exact: true }}
                  aria-label="PoE Party home"
                  className="shrink-0 rounded-lg lg:hidden"
                >
                  <img src={logo} alt="" className="size-8 rounded-lg" />
                </Link>
                <div className="min-w-0">
                  <p className="text-foreground text-sm leading-tight font-semibold wrap-anywhere">
                    {isSample ? previewWorkspace.leagueLabel : pageMeta.page}
                  </p>
                  <p className="text-default-500 mt-0.5 text-xs leading-tight wrap-anywhere">
                    {isSample ? getPoeGameShortLabel(previewWorkspace.game) + ' · Workspace sample' : pageMeta.section}
                  </p>
                </div>
              </div>
            </div>
            <WorkspaceEngraving />
            <div className="workspace-masthead-tools">
              <Button isIconOnly size="sm" variant="tertiary" onPress={toggle} aria-label="Toggle theme">
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </Button>
              <Link
                to={crossLink.to}
                activeOptions={{ exact: true }}
                className="button button--sm button--tertiary hidden sm:inline-flex"
              >
                {crossLink.label}
              </Link>
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
