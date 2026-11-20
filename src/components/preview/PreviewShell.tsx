import { useRef, useState, type ReactNode } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { Button } from '@heroui/react/button'
import {
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
import { useThemeStore } from '../../store/theme-store'
import { GuestGateModal, type PreviewMode } from './PreviewShared'

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
              {item.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function currentMode(pathname: string): PreviewMode {
  if (
    pathname.startsWith('/preview/analysis') ||
    pathname.startsWith('/preview/strategies') ||
    pathname.startsWith('/preview/services') ||
    pathname.startsWith('/preview/search')
  ) {
    return 'public'
  }
  return 'teaser'
}

export function PreviewShell({ children }: { children: ReactNode }) {
  const { location } = useRouterState()
  const { theme, toggle } = useThemeStore()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const mobileMenuTrigger = useRef<HTMLButtonElement>(null)
  const loginHref =
    typeof window === 'undefined'
      ? '/auth/login'
      : getLoginHref(`${window.location.pathname}${window.location.search}${window.location.hash}`)

  const mode = currentMode(location.pathname)
  const pageMeta = currentPageMeta(location.pathname)
  const isPublicMode = mode === 'public'
  const crossLink =
    mode === 'teaser'
      ? { to: '/preview/analysis' as const, label: 'Try public Analysis' }
      : { to: '/preview' as const, label: 'Workspace samples' }

  return (
    <>
      <GuestGateModal />
      <div className="bg-background flex h-dvh overflow-hidden pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]">
        <a href="#main-content" className="button button--primary sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50">
          Skip to main content
        </a>
        <aside className="border-divider bg-navigation hidden h-full w-72 shrink-0 border-r lg:flex lg:flex-col">
          <div className="border-divider border-b px-5 py-5">
            <Link
              to="/"
              activeOptions={{ exact: true }}
              className="flex items-center gap-3 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <img src={logo} alt="" className="h-11 w-11 rounded-2xl shadow-sm" />
              <div>
                <p className="text-foreground text-base font-semibold">PoE Party</p>
                <p className="text-default-400 text-sm">Explore before connecting.</p>
              </div>
            </Link>
          </div>

          <nav aria-label="Explore PoE Party" className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 py-5">
            <PreviewSidebarSection title="Use now" items={publicItems} />
            <PreviewSidebarSection title="Workspace samples" items={privateWorkspaceItems} />

            {mode === 'teaser' ? (
              <div className="border-warning/25 bg-warning/5 mt-auto rounded-2xl border p-4">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-warning" aria-hidden="true" />
                  <p className="text-foreground text-sm font-medium">Bring in your own data</p>
                </div>
                <p className="text-default-500 mt-2 text-sm leading-relaxed">
                  Connect when you want character sync and a private league workspace.
                </p>
                <a
                  className="button button--sm button--tertiary mt-4"
                  href={loginHref}
                  onClick={() =>
                    trackPublicEvent('public_sign_in_click', {
                      source: location.pathname,
                      placement: 'sidebar',
                    })
                  }
                >
                  Connect account
                </a>
              </div>
            ) : null}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header
            className="border-divider bg-navigation relative z-30 shrink-0 border-b"
            onKeyDown={(event) => {
              if (event.key === 'Escape' && mobileMenuOpen) {
                setMobileMenuOpen(false)
                mobileMenuTrigger.current?.focus()
              }
            }}
          >
            <div className="flex min-h-16 items-center gap-2 px-3 sm:px-4 lg:px-6">
              <Link
                to="/"
                activeOptions={{ exact: true }}
                aria-label="PoE Party home"
                className="mr-auto flex min-w-0 items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:hidden"
              >
                <img src={logo} alt="" className="h-9 w-9 rounded-xl" />
                <span className="min-w-0">
                  <span className="text-foreground block truncate text-sm font-semibold">PoE Party</span>
                  <span className="text-default-400 block truncate text-[11px]">{pageMeta.page}</span>
                </span>
              </Link>

              <div className="mr-auto hidden min-w-0 lg:block">
                <p className="text-default-400 text-xs font-medium tracking-[0.16em] uppercase">
                  {pageMeta.section} / {pageMeta.page}
                </p>
              </div>

              <Button
                isIconOnly
                size="sm"
                variant="tertiary"
                onPress={toggle}
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </Button>

              <Link
                to={crossLink.to}
                activeOptions={{ exact: true }}
                className="button button--sm button--tertiary hidden sm:inline-flex"
              >
                {crossLink.label}
              </Link>

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

              <a
                className="button button--sm button--tertiary"
                href={loginHref}
                onClick={() =>
                  trackPublicEvent('public_sign_in_click', {
                    source: location.pathname,
                    placement: 'header',
                  })
                }
              >
                <span className="hidden sm:inline">{isPublicMode ? 'Sign in' : 'Connect account'}</span>
                <span className="sm:hidden">{isPublicMode ? 'Sign in' : 'Connect'}</span>
              </a>
            </div>

            {mobileMenuOpen ? (
              <nav
                id="preview-mobile-menu"
                aria-label="Explore PoE Party on mobile"
                className="border-divider bg-content4 absolute inset-x-0 top-full grid max-h-[calc(100dvh-4rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] gap-5 overflow-y-auto border-y p-4 shadow-lg lg:hidden"
              >
                {[
                  { label: 'Use now', items: publicItems },
                  { label: 'Workspace samples', items: privateWorkspaceItems },
                ].map((section) => (
                  <div key={section.label}>
                    <p className="text-default-400 px-1 text-xs font-semibold tracking-[0.18em] uppercase">
                      {section.label}
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {section.items.map((item) => {
                        const Icon = item.icon
                        const isActive = isItemActive(location.pathname, item)
                        return (
                          <Link
                            key={item.to}
                            to={item.to}
                            activeOptions={{ exact: true }}
                            aria-current={isActive ? 'page' : undefined}
                            onClick={() => setMobileMenuOpen(false)}
                            className={cn(
                              'flex min-h-12 items-center gap-2 rounded-xl border px-3 text-sm font-medium',
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
            ) : null}
          </header>

          <main id="main-content" tabIndex={-1} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="min-w-0 flex-1 p-4 sm:p-6">
              <ErrorBoundary resetKey={location.pathname}>{children}</ErrorBoundary>
            </div>
            <Footer />
          </main>
        </div>
      </div>
    </>
  )
}
