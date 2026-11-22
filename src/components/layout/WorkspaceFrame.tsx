import { useLayoutEffect, type ReactNode } from 'react'
import type { LeagueTheme } from '../../lib/league-theme'
import './workspace-frame.css'

interface WorkspaceFrameProps {
  leagueTheme: LeagueTheme | null
  rail: ReactNode
  masthead: ReactNode
  dock?: ReactNode
  footer: ReactNode
  children: ReactNode
}

export function WorkspaceFrame({ leagueTheme, rail, masthead, dock, footer, children }: WorkspaceFrameProps) {
  useLayoutEffect(() => {
    // HeroUI portals mount outside the frame and inherit their palette from the root.
    const root = document.documentElement
    if (!leagueTheme) {
      delete root.dataset.leagueTheme
      return
    }

    root.dataset.leagueTheme = leagueTheme
    return () => {
      delete root.dataset.leagueTheme
    }
  }, [leagueTheme])

  return (
    <div className="workspace-frame">
      <a
        href="#main-content"
        className="button button--primary sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
      >
        Skip to main content
      </a>
      {rail}
      <div className="workspace-stage">
        {masthead}
        <div className="workspace-reading">
          <main id="main-content" tabIndex={-1} className="workspace-content">
            {children}
          </main>
          {footer}
        </div>
        {dock}
      </div>
    </div>
  )
}

export function WorkspaceEngraving() {
  return (
    <div className="workspace-engraving" aria-hidden="true">
      <span />
    </div>
  )
}
