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
import { MobileBottomNav } from './MobileBottomNav'
interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const open = useEarlyAccessNoticeStore((s) => s.open)
  const close = useEarlyAccessNoticeStore((s) => s.close)
  const { data: user, isLoading: userLoading } = useCurrentUser()
  const { data: profile, isLoading: profileLoading } = useMyProfile()

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
      <div className="bg-background/85 flex h-dvh overflow-hidden pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
        <a
          href="#main-content"
          className="button button--primary sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
        >
          Skip to main content
        </a>
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Navbar />
          <main
            id="main-content"
            tabIndex={-1}
            className="flex min-h-0 flex-1 flex-col overflow-y-auto"
          >
            <EarlyAccessNoticeModal />
            <div className="min-w-0 flex-1 p-4 md:p-6">
              <ErrorBoundary resetKey={pathname}>
                <SnapshotIntervalRunner />
                <CharacterProfileSyncRunner />
                {children}
              </ErrorBoundary>
            </div>
            <Footer />
          </main>
          <MobileBottomNav />
        </div>
      </div>
    </GroupGate>
  )
}
