import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { useRouterState } from '@tanstack/react-router'
import type { LucideIcon } from 'lucide-react'
import { leagueThemeDetails, useLeagueTheme, type LeagueTheme } from '../../lib/league-theme'
import './workspace-frame.css'

interface WorkspaceFrameProps {
  leagueTheme: LeagueTheme | null
  route: ReactNode
  masthead: ReactNode
  dock?: ReactNode
  footer: ReactNode
  children: ReactNode
}

export function WorkspaceFrame({ leagueTheme, route, masthead, dock, footer, children }: WorkspaceFrameProps) {
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
    ? ({ '--workspace-engraving-art': `url("${artwork}")` } as CSSProperties)
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
      {route}
      <div ref={reading} className="workspace-reading">
        <main id="main-content" tabIndex={-1} className="workspace-content">
          {children}
        </main>
        {footer}
      </div>
      {dock}
    </div>
  )
}

export function WorkspaceRoute({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="workspace-route">
      <nav className="workspace-route-navigation" aria-label={label}>
        {children}
      </nav>
      <div className="workspace-engraving" aria-hidden="true" />
    </div>
  )
}

export function WorkspaceRouteMarker({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <>
      <span className="workspace-route-marker">
        <Icon size={16} aria-hidden="true" />
      </span>
      <span className="workspace-route-label">{children}</span>
    </>
  )
}
