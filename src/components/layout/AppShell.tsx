import { useEffect, type ReactNode } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { Sidebar } from './Sidebar'
import { Navbar } from './Navbar'
import { Footer } from './Footer'
import { ErrorBoundary } from './ErrorBoundary'
import { GroupGate } from '../groups/GroupGate'
import { SnapshotIntervalRunner } from './SnapshotIntervalRunner'
import { CharacterProfileSyncRunner } from './CharacterProfileSyncRunner'
import { EarlyAccessNoticeModal } from './EarlyAccessNoticeModal'
import { useEarlyAccessNoticeStore } from '../../store/early-access-notice-store'
import { useCurrentUser, useMyProfile } from '../../hooks/useCurrentUser'
import { useActiveGroupContext } from '../../hooks/useGroups'
import { resolveLeagueTheme } from '../../lib/league-theme'
import { MobileBottomNav } from './MobileBottomNav'
import { WorkspaceFrame } from './WorkspaceFrame'
interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const open = useEarlyAccessNoticeStore((s) => s.open)
  const close = useEarlyAccessNoticeStore((s) => s.close)
  const { data: user, isLoading: userLoading } = useCurrentUser()
  const { data: profile, isLoading: profileLoading } = useMyProfile()
  const { game, league } = useActiveGroupContext()

  useEffect(() => {
    if (userLoading) return
    if (!user?.id) {
      close()
      return
    }
    if (profileLoading) return
    if (!profile || profile.has_seen_early_access_notice) {
      close()
      return
    }
    open()
  }, [close, open, profile, profileLoading, user?.id, userLoading])

  return (
    <GroupGate>
      <WorkspaceFrame
        leagueTheme={resolveLeagueTheme(game, league)}
        rail={<Sidebar />}
        masthead={<Navbar />}
        dock={<MobileBottomNav />}
        footer={<Footer variant="workspace" />}
      >
        <EarlyAccessNoticeModal />
        <ErrorBoundary resetKey={pathname}>
          <SnapshotIntervalRunner />
          <CharacterProfileSyncRunner />
          {children}
        </ErrorBoundary>
      </WorkspaceFrame>
    </GroupGate>
  )
}
