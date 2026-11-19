import { useState, useEffect, type ReactNode } from 'react'
import { Card } from '@heroui/react/card'
import { Spinner } from '@heroui/react/spinner'
import { Plus, LogIn, User } from 'lucide-react'
import { useMyGroups } from '../../hooks/useGroups'
import { useGroupStore } from '../../store/group-store'
import { CreateGroupModal } from './CreateGroupModal'
import { JoinGroupModal } from './JoinGroupModal'
import { SoloGroupModal } from './SoloGroupModal'
import { QueryStatePanel } from '../ui/QueryStatePanel'

interface GroupGateProps {
  children: ReactNode
}

export function GroupGate({ children }: GroupGateProps) {
  const { data: memberships, isLoading, isFetching, isError, refetch } = useMyGroups()
  const activeGroupId = useGroupStore((s) => s.activeGroupId)
  const setActiveGroupId = useGroupStore((s) => s.setActiveGroupId)
  const [createOpen, setCreateOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const [soloOpen, setSoloOpen] = useState(false)

  // Auto-select first group if activeGroupId is null or stale
  useEffect(() => {
    if (isFetching || isError || !memberships?.length) return
    const isValid = memberships.some((m) => m.group.id === activeGroupId)
    if (!isValid) {
      setActiveGroupId(memberships[0].group.id)
    }
  }, [memberships, isFetching, isError, activeGroupId, setActiveGroupId])

  let content: ReactNode

  if (isLoading) {
    content = (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Spinner size="lg" aria-label="Loading groups" />
      </div>
    )
  } else if (isError && !memberships) {
    content = (
      <main id="main-content" className="bg-background flex min-h-dvh items-center justify-center p-4">
        <QueryStatePanel
          kind="error"
          title="Couldn’t load your groups"
          description="Try again to open your workspace."
          onRetry={refetch}
        />
      </main>
    )
  } else if (memberships && memberships.length === 0) {
    content = (
      <main id="main-content" className="flex min-h-dvh items-center justify-center bg-background px-4 py-6">
        <div className="flex w-full max-w-md flex-col items-center gap-6">
          <div className="text-center">
            <h1 className="text-foreground text-2xl font-bold">Welcome to PoE Party</h1>
            <p className="text-default-400 mt-2 text-sm">
              Join friends or set up a solo workspace.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3">
            <div className="flex w-full flex-col gap-3 sm:flex-row">
              <Card className="flex-1 cursor-pointer transition-colors hover:bg-default-50">
                <button type="button" className="h-full w-full cursor-pointer rounded-lg text-left focus-visible:outline-2 focus-visible:outline-primary" onClick={() => setCreateOpen(true)}>
                  <Card.Content className="flex flex-col items-center gap-3 p-6 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent/15">
                      <Plus size={24} className="text-accent" />
                    </div>
                    <div>
                      <p className="text-foreground font-medium">Create Group</p>
                      <p className="text-default-400 mt-1 text-xs">
                        Start a new group and invite your friends
                      </p>
                    </div>
                  </Card.Content>
                </button>
              </Card>

              <Card className="flex-1 cursor-pointer transition-colors hover:bg-default-50">
                <button type="button" className="h-full w-full cursor-pointer rounded-lg text-left focus-visible:outline-2 focus-visible:outline-primary" onClick={() => setJoinOpen(true)}>
                  <Card.Content className="flex flex-col items-center gap-3 p-6 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-success/15">
                      <LogIn size={24} className="text-success" />
                    </div>
                    <div>
                      <p className="text-foreground font-medium">Join Group</p>
                      <p className="text-default-400 mt-1 text-xs">
                        Enter an invite code from your party
                      </p>
                    </div>
                  </Card.Content>
                </button>
              </Card>
            </div>

            <Card className="w-full cursor-pointer transition-colors hover:bg-default-50">
              <button type="button" className="w-full cursor-pointer rounded-lg text-left focus-visible:outline-2 focus-visible:outline-primary" onClick={() => setSoloOpen(true)}>
                <Card.Content className="flex flex-row items-center gap-4 px-6 py-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/15">
                    <User size={20} className="text-accent" />
                  </div>
                  <div>
                    <p className="text-foreground font-medium">Play Solo</p>
                    <p className="text-default-400 text-xs">
                      Track your own progress without a group
                    </p>
                  </div>
                </Card.Content>
              </button>
            </Card>
          </div>
        </div>
      </main>
    )
  } else {
    content = children
  }

  return (
    <>
      {content}
      <CreateGroupModal isOpen={createOpen} onClose={() => setCreateOpen(false)} />
      <JoinGroupModal isOpen={joinOpen} onClose={() => setJoinOpen(false)} />
      <SoloGroupModal isOpen={soloOpen} onClose={() => setSoloOpen(false)} />
    </>
  )
}
