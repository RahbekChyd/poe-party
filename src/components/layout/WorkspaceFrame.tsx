import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { leagueThemeDetails, useLeagueTheme, type LeagueTheme } from '../../lib/league-theme'
import { cn } from '../../lib/utils'
import logo from '../../assets/poe-party-logo.png'
import './workspace-frame.css'

interface WorkspaceFrameProps {
  leagueTheme: LeagueTheme | null
  sidebar: ReactNode
  masthead: ReactNode
  dock?: ReactNode
  footer: ReactNode
  children: ReactNode
}

export function WorkspaceFrame({ leagueTheme, sidebar, masthead, dock, footer, children }: WorkspaceFrameProps) {
  useLeagueTheme(leagueTheme)
  const { pathname, hash } = useRouterState({
    select: (state) => state.resolvedLocation ?? state.location,
  })
  const reading = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!hash) reading.current?.scrollTo({ top: 0, left: 0 })
  }, [pathname, hash])

  const artwork = leagueTheme ? leagueThemeDetails[leagueTheme].artwork.workspace : null
  const frameStyle = artwork
    ? ({ '--workspace-masthead-art': `url("${artwork}")` } as CSSProperties)
    : undefined

  return (
    <div className="workspace-frame" data-workspace-art={artwork ? '' : undefined} style={frameStyle}>
      <a
        href="#main-content"
        className="button button--primary sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
      >
        Skip to main content
      </a>
      {masthead}
      <div className="workspace-body">
        <div ref={reading} className="workspace-reading">
          <div className="workspace-sidebar-rail">{sidebar}</div>
          <main id="main-content" tabIndex={-1} className="workspace-content">
            {children}
          </main>
          {footer}
        </div>
      </div>
      {dock}
    </div>
  )
}

export function WorkspaceBrand({ to, className }: { to: '/' | '/dashboard'; className?: string }) {
  return (
    <Link
      to={to}
      activeOptions={{ exact: true }}
      aria-label={to === '/' ? 'PoE Party home' : 'PoE Party dashboard'}
      className={cn('workspace-brand', className)}
    >
      <img src={logo} alt="" className="size-8 rounded-lg" />
      <span className="hidden lg:inline">PoE Party</span>
    </Link>
  )
}

export function WorkspaceSidebarGroup({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="workspace-sidebar-group" role={label ? 'group' : undefined} aria-label={label}>
      {label && <p className="workspace-sidebar-label" aria-hidden="true">{label}</p>}
      {children}
    </div>
  )
}
