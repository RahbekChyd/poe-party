import { useEffect, type ReactNode } from 'react'
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
interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
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
    if (profile?.has_seen_early_access_notice) {
      close()
      return
    }
    open()
  }, [close, open, profile?.has_seen_early_access_notice, profileLoading, user?.id, userLoading])

  return (
    <>
      <EarlyAccessNoticeModal />
      <GroupGate>
        <div className="bg-background/85 flex h-screen overflow-hidden">
          <Sidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <Navbar />
            <main className="flex flex-1 flex-col overflow-y-auto">
              <div className="flex-1 p-4 md:p-6">
                <ErrorBoundary>
                  <SnapshotIntervalRunner />
                  <CharacterProfileSyncRunner />
                  {children}
                </ErrorBoundary>
              </div>
              <Footer />
            </main>
          </div>
        </div>
      </GroupGate>
    </>
  )
}
