import type { ReactNode } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { Button } from '@heroui/react/button'
import { Chip } from '@heroui/react/chip'
import {
  Coins,
  Handshake,
  LayoutDashboard,
  Moon,
  Search,
  Sparkles,
  Sun,
  Sword,
  Target,
  Users,
} from 'lucide-react'
import logo from '../../assets/poe-party-logo.png'
import { cn } from '../../lib/utils'
import { getLoginHref } from '../../lib/auth-redirect'
import { trackPublicEvent } from '../../lib/analytics'
import { Footer } from '../layout/Footer'
import { ErrorBoundary } from '../layout/ErrorBoundary'
import { useThemeStore } from '../../store/theme-store'
import { GuestGateModal, PreviewModeChip, type PreviewMode } from './PreviewShared'
const publicItems = [
  { label: 'Analysis', to: '/preview/analysis', icon: Sparkles, exact: false },
  { label: 'Directory', to: '/preview/search', icon: Search, exact: false },
  { label: 'Services', to: '/preview/services', icon: Handshake, exact: false },
  { label: 'Strategies', to: '/preview/strategies', icon: Target, exact: false },
]

const privateWorkspaceItems = [
  { label: 'Overview', to: '/preview', icon: LayoutDashboard, exact: true },
  { label: 'Economy', to: '/preview/economy', icon: Coins, exact: false },
  { label: 'Gear', to: '/preview/gear', icon: Sword, exact: false },
  { label: 'Members', to: '/preview/members', icon: Users, exact: false },
]

type PreviewNavItem =
  | (typeof publicItems)[number]
  | (typeof privateWorkspaceItems)[number]

function currentPageMeta(pathname: string): { section: string; page: string } {
  if (pathname === '/preview') return { section: 'Private Workspace', page: 'Overview' }
  if (pathname.startsWith('/preview/economy'))
    return { section: 'Private Workspace', page: 'Economy' }
  if (pathname.startsWith('/preview/members'))
    return { section: 'Private Workspace', page: 'Members' }
  if (pathname.startsWith('/preview/gear')) return { section: 'Private Workspace', page: 'Gear' }
  if (pathname.startsWith('/preview/analysis')) return { section: 'Public', page: 'Analysis' }
  if (pathname.startsWith('/preview/strategies/')) return { section: 'Public', page: 'Strategy' }
  if (pathname.startsWith('/preview/strategies')) return { section: 'Public', page: 'Strategies' }
  if (pathname.startsWith('/preview/services')) return { section: 'Public', page: 'Services' }
  if (pathname.startsWith('/preview/search')) return { section: 'Public', page: 'Directory' }
  if (pathname.startsWith('/tools')) return { section: 'PoE Tools', page: 'Guide' }
  if (pathname.startsWith('/poe-strategies')) return { section: 'PoE Strategies', page: 'Guide' }

  return { section: 'Preview', page: 'Explore' }
}

function PreviewSidebarSection({ title, items }: { title: string; items: readonly PreviewNavItem[] }) {
  const { location } = useRouterState()

  return (
    <div className="flex flex-col gap-2">
      <p className="text-default-400 px-3 text-[11px] font-semibold tracking-[0.24em] uppercase">
        {title}
      </p>
      <div className="flex flex-col gap-1">
        {items.map(({ label, to, icon: Icon, exact }) => {
          const isActive = exact ? location.pathname === to : location.pathname.startsWith(to)

          return (
            <Link
              key={to}
              to={to}
              className={cn(
                'rounded-large flex items-center gap-3 px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-warning/15 text-warning'
                  : 'text-default-500 hover:bg-default-100 hover:text-default-800',
              )}
            >
              <Icon size={16} />
              {label}
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
  const loginHref =
    typeof window === 'undefined'
      ? '/auth/login'
      : getLoginHref(`${window.location.pathname}${window.location.search}${window.location.hash}`)

  const mode = currentMode(location.pathname)
  const pageMeta = currentPageMeta(location.pathname)
  const isPublicMode = mode === 'public'
  const crossLink =
    mode === 'teaser'
      ? { to: '/preview/analysis' as const, label: 'Try Public Analysis' }
      : { to: '/preview' as const, label: 'Workspace Samples' }

  return (
    <>
      <GuestGateModal />
      <div className="bg-background flex h-screen overflow-hidden">
        <aside className="border-divider bg-content1 hidden h-full w-72 shrink-0 border-r lg:flex lg:flex-col">
          <div className="border-divider border-b px-5 py-5">
            <div className="flex items-center gap-3">
              <img src={logo} alt="PoE Party" className="h-11 w-11 rounded-2xl shadow-sm" />
              <div>
                <p className="text-foreground text-base font-semibold">PoE Party</p>
                <p className="text-default-400 text-sm">
                  {isPublicMode
                    ? 'Use public tools without connecting an account.'
                    : 'Sample private workspace views before connecting.'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-6 px-4 py-5">
            <PreviewSidebarSection title="Public" items={publicItems} />
            <PreviewSidebarSection title="Private Workspace" items={privateWorkspaceItems} />

            {mode === 'teaser' ? (
              <div className="border-warning/25 bg-warning/5 mt-auto rounded-2xl border p-4">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-warning" />
                  <p className="text-foreground text-sm font-medium">Private workspace</p>
                </div>
                <p className="text-default-500 mt-2 text-sm leading-relaxed">
                  Connect when you want real stash, roster, and planning data.
                </p>
                <a
                  className="button button--sm button--tertiary mt-4"
                  href={loginHref}
                  onClick={() => {
                    trackPublicEvent('public_sign_in_click', {
                      source: location.pathname,
                      placement: 'sidebar',
                    })
                  }}
                >
                  Connect Account
                </a>
              </div>
            ) : null}
          </div>
        </aside>

        <div className="flex flex-1 flex-col overflow-hidden">
          <header className="border-divider bg-content1/90 border-b backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <PreviewModeChip mode={mode} />
                </div>
                <p className="text-default-400 mt-2 text-xs font-medium tracking-[0.18em] uppercase">
                  {pageMeta.section} / {pageMeta.page}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  isIconOnly
                  size="sm"
                  variant="tertiary"
                  onPress={toggle}
                  aria-label="Toggle theme"
                >
                  {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                </Button>
                <Link to={crossLink.to} className="button button--sm button--tertiary">
                  {crossLink.label}
                </Link>
                <a
                  className="button button--sm button--tertiary"
                  href={loginHref}
                  onClick={() => {
                    trackPublicEvent('public_sign_in_click', {
                      source: location.pathname,
                      placement: 'header',
                    })
                  }}
                >
                  {isPublicMode ? 'Sign In' : 'Connect Account'}
                </a>
              </div>
            </div>

            <div className="border-divider border-t px-4 py-3 lg:hidden">
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  <Chip size="sm" variant="soft">
                    Public
                  </Chip>
                  {publicItems.map(({ label, to, exact }) => (
                    <Link
                      key={to}
                      to={to}
                      className={cn(
                        'shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                        (exact ? location.pathname === to : location.pathname.startsWith(to))
                          ? 'bg-warning/15 text-warning'
                          : 'bg-default-100 text-default-600',
                      )}
                    >
                      {label}
                    </Link>
                  ))}
                </div>
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  <Chip size="sm" variant="soft">
                    Private Workspace
                  </Chip>
                  {privateWorkspaceItems.map(({ label, to, exact }) => (
                    <Link
                      key={to}
                      to={to}
                      className={cn(
                        'shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                        (exact ? location.pathname === to : location.pathname.startsWith(to))
                          ? 'bg-warning/15 text-warning'
                          : 'bg-default-100 text-default-600',
                      )}
                    >
                      {label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </header>

          <main className="flex flex-1 flex-col overflow-y-auto">
            <div className="flex-1 p-6">
              <ErrorBoundary>{children}</ErrorBoundary>
            </div>
            <Footer />
          </main>
        </div>
      </div>
    </>
  )
}
