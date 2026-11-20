import { useState, useEffect, type ReactNode } from 'react'
import { Spinner } from '@heroui/react/spinner'
import { ChevronRight, Plus, LogIn, User } from 'lucide-react'
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
        <div className="w-full max-w-md">
          <h1 className="text-foreground text-2xl font-semibold">Welcome to PoE Party</h1>
          <p className="text-default-500 mt-2 text-sm">Choose how you want to play.</p>

          <div className="border-divider divide-divider mt-6 divide-y overflow-hidden rounded-xl border">
            {[
              { id: 'join', title: 'Join Group', description: 'Enter an invite code from your party.', Icon: LogIn, open: setJoinOpen },
              { id: 'create', title: 'Create Group', description: 'Start a group and invite your friends.', Icon: Plus, open: setCreateOpen },
              { id: 'solo', title: 'Play Solo', description: 'Track your own progress in a solo workspace.', Icon: User, open: setSoloOpen },
            ].map(({ id, title, description, Icon, open }) => (
              <button
                key={title}
                type="button"
                className="bg-content1 hover:bg-default-50 focus-visible:outline-primary flex min-h-16 w-full cursor-pointer items-center gap-4 px-4 py-3 text-left focus-visible:outline-2 focus-visible:-outline-offset-2"
                onClick={() => open(true)}
                aria-label={title}
                aria-describedby={`workspace-choice-${id}`}
              >
                <Icon size={19} className="text-default-500 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="text-foreground block text-sm font-semibold">{title}</span>
                  <span id={`workspace-choice-${id}`} className="text-default-500 mt-0.5 block text-sm">{description}</span>
                </span>
                <ChevronRight size={17} className="text-default-500 shrink-0" aria-hidden="true" />
              </button>
            ))}
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
