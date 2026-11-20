import { useEffect, useState } from 'react'
import { Button } from '@heroui/react/button'
import { Description } from '@heroui/react/description'
import { Dropdown } from '@heroui/react/dropdown'
import { Header } from '@heroui/react/header'
import { Label } from '@heroui/react/label'
import { Modal } from '@heroui/react/modal'
import { Separator } from '@heroui/react/separator'
import { Spinner } from '@heroui/react/spinner'
import { Copy, LogIn, LogOut, Plus, Trash2 } from 'lucide-react'
import { useDeleteGroup, useLeaveGroup, useMyGroups } from '../../hooks/useGroups'
import { useGroupStore } from '../../store/group-store'
import { getPoeGameShortLabel } from '../../lib/poe-game'
import { DropdownCaret } from '../ui/heroui-native'
import { CreateGroupModal } from './CreateGroupModal'
import { JoinGroupModal } from './JoinGroupModal'

type GroupActionIntent = 'leave' | 'delete'
type GroupAction = { intent: GroupActionIntent; id: string; name: string }

export function GroupSwitcher() {
  const { data: memberships, isLoading } = useMyGroups()
  const activeGroupId = useGroupStore((s) => s.activeGroupId)
  const setActiveGroupId = useGroupStore((s) => s.setActiveGroupId)
  const leaveGroup = useLeaveGroup()
  const deleteGroup = useDeleteGroup()

  const [createOpen, setCreateOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<GroupAction | null>(null)
  const [inviteFeedback, setInviteFeedback] = useState('')

  const activeMembership = memberships?.find((membership) => membership.group.id === activeGroupId)
  const activeGroup = activeMembership?.group
  const scopeLabel = activeGroup ? `${getPoeGameShortLabel(activeGroup.game)} · ${activeGroup.league}` : null
  const isMutating = leaveGroup.isPending || deleteGroup.isPending
  const mutation = pendingAction?.intent === 'delete' ? deleteGroup : leaveGroup
  const destructiveActionLabel = pendingAction?.intent === 'delete' ? 'Delete group' : 'Leave group'

  useEffect(() => {
    if (!inviteFeedback) return
    const timeout = window.setTimeout(() => setInviteFeedback(''), 5000)
    return () => window.clearTimeout(timeout)
  }, [inviteFeedback])

  async function copyInvite(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setInviteFeedback('Invite code copied')
    } catch {
      setInviteFeedback('Couldn’t copy the invite code')
    }
  }

  return (
    <>
      <div className="relative min-w-0">
        <Dropdown>
          <Dropdown.Trigger
            aria-label={activeGroup ? `Switch group, current group: ${activeGroup.name}, ${scopeLabel}` : 'Switch group'}
            className="select__trigger h-auto min-h-10 max-w-full min-w-0 items-center py-1.5 sm:min-h-9 sm:max-w-72 lg:max-w-100"
            isDisabled={isMutating}
          >
            <span className="select__value min-w-0">
              <span className="flex min-w-0 items-center gap-2">
                {isLoading || isMutating ? <Spinner color="current" size="sm" /> : null}
                <span className="flex min-w-0 flex-col items-start sm:flex-row sm:items-center sm:gap-2">
                  <span className="max-w-full truncate font-medium">{activeGroup?.name ?? (isLoading ? 'Loading groups…' : 'Select group')}</span>
                  {scopeLabel ? (
                    <span className="text-default-500 w-full text-left text-xs leading-tight whitespace-normal wrap-anywhere sm:w-auto sm:max-w-36 sm:shrink-0">
                      {scopeLabel}
                    </span>
                  ) : null}
                </span>
              </span>
            </span>
            <DropdownCaret className="select__indicator" />
          </Dropdown.Trigger>
          <Dropdown.Popover placement="bottom start" className="max-w-[calc(100vw-1.5rem)]">
            <Dropdown.Menu
              aria-label="Group switcher"
              selectionMode="single"
              selectedKeys={activeGroupId ? new Set([activeGroupId]) : new Set()}
              disabledKeys={[
                '__empty__',
                ...(isMutating ? ['__leave__', '__delete__'] : []),
              ]}
              onAction={(key) => {
                if (key === '__create__') {
                  setCreateOpen(true)
                } else if (key === '__join__') {
                  setJoinOpen(true)
                } else if (key === '__invite__') {
                  const code = activeGroup?.invite_code
                  if (code) void copyInvite(code)
                } else if (key === '__leave__') {
                  leaveGroup.reset()
                  if (activeGroup) setPendingAction({ intent: 'leave', id: activeGroup.id, name: activeGroup.name })
                } else if (key === '__delete__') {
                  deleteGroup.reset()
                  if (activeGroup) setPendingAction({ intent: 'delete', id: activeGroup.id, name: activeGroup.name })
                } else if (key !== '__empty__' && key !== activeGroupId) {
                  setActiveGroupId(key as string)
                }
              }}
            >
              {memberships && memberships.length > 0 ? (
                <Dropdown.Section>
                  <Header>Your Groups</Header>
                  {memberships.map(({ group, role }) => (
                    <Dropdown.Item key={group.id} id={group.id} textValue={group.name}>
                      <Dropdown.ItemIndicator />
                      <div className="flex min-w-0 flex-col">
                        <Label className="wrap-anywhere">{group.name}</Label>
                        <Description className="wrap-anywhere">
                          {getPoeGameShortLabel(group.game)} - {group.league} - {role}
                        </Description>
                      </div>
                    </Dropdown.Item>
                  ))}
                </Dropdown.Section>
              ) : (
                <Dropdown.Section>
                  <Dropdown.Item
                    id="__empty__"
                    textValue="No groups yet"
                    className="text-default-400"
                  >
                    <Label>No groups yet</Label>
                  </Dropdown.Item>
                </Dropdown.Section>
              )}
              <Separator />
              <Dropdown.Section>
                {activeGroup && !activeGroup.is_solo ? (
                  <Dropdown.Item id="__invite__" textValue="Copy Invite Code">
                    <Copy size={14} className="text-muted shrink-0" />
                    <Label>Copy Invite Code</Label>
                  </Dropdown.Item>
                ) : null}
                {activeGroup && activeMembership?.role !== 'admin' ? (
                  <Dropdown.Item id="__leave__" textValue="Leave Group" variant="danger">
                    <LogOut size={14} className="text-danger shrink-0" />
                    <Label>Leave Group</Label>
                  </Dropdown.Item>
                ) : null}
                {activeGroup && activeMembership?.role === 'admin' ? (
                  <Dropdown.Item id="__delete__" textValue="Delete Group" variant="danger">
                    <Trash2 size={14} className="text-danger shrink-0" />
                    <Label>Delete Group</Label>
                  </Dropdown.Item>
                ) : null}
                <Dropdown.Item id="__create__" textValue="Create Group">
                  <Plus size={14} className="text-muted shrink-0" />
                  <Label>Create Group</Label>
                </Dropdown.Item>
                <Dropdown.Item id="__join__" textValue="Join Group">
                  <LogIn size={14} className="text-muted shrink-0" />
                  <Label>Join Group</Label>
                </Dropdown.Item>
              </Dropdown.Section>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
        <div
          role="status"
          className={inviteFeedback ? 'border-divider bg-content1 text-foreground absolute top-full left-0 z-20 mt-1 w-max max-w-[calc(100vw-1.5rem)] rounded-md border px-3 py-2 text-sm shadow-sm' : 'sr-only'}
        >
          {inviteFeedback}
        </div>
      </div>

      <CreateGroupModal isOpen={createOpen} onClose={() => setCreateOpen(false)} />
      <JoinGroupModal isOpen={joinOpen} onClose={() => setJoinOpen(false)} />
      <>
        <Modal.Backdrop
          isOpen={pendingAction !== null}
          onOpenChange={(open) => {
            if (!open && !isMutating) setPendingAction(null)
          }}
        >
          <Modal.Container>
            <Modal.Dialog>
              <Modal.Header>
                <Modal.Heading>{destructiveActionLabel}</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="gap-3">
                <p className="text-default-600 text-sm wrap-anywhere">
                  {pendingAction?.intent === 'delete'
                    ? `Permanently delete “${pendingAction.name}” and its data for everyone?`
                    : pendingAction && `Leave “${pendingAction.name}”? You’ll need an invite code to rejoin.`}
                </p>
                {mutation.isError && (
                  <p role="alert" className="text-danger text-sm">
                    {pendingAction?.intent === 'delete' ? 'Couldn’t delete the group. Try again.' : 'Couldn’t leave the group. Try again.'}
                  </p>
                )}
              </Modal.Body>
              <Modal.Footer>
                <Button
                  variant="tertiary"
                  onPress={() => setPendingAction(null)}
                  isDisabled={isMutating}
                >
                  Cancel
                </Button>
                <Button
                  isPending={mutation.isPending}
                  onPress={() => {
                    if (!pendingAction) return
                    mutation.mutate(pendingAction.id, {
                      onSuccess: () => setPendingAction(null),
                    })
                  }}
                  variant="danger"
                >
                  {({ isPending }) => (
                    <>
                      {isPending ? <Spinner color="current" size="sm" /> : null}
                      {destructiveActionLabel}
                    </>
                  )}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </>
    </>
  )
}
