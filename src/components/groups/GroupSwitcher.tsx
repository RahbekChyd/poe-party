import { useState } from 'react'
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

export function GroupSwitcher() {
  const { data: memberships, isLoading } = useMyGroups()
  const activeGroupId = useGroupStore((s) => s.activeGroupId)
  const setActiveGroupId = useGroupStore((s) => s.setActiveGroupId)
  const leaveGroup = useLeaveGroup()
  const deleteGroup = useDeleteGroup()

  const [createOpen, setCreateOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<GroupActionIntent | null>(null)

  const activeMembership = memberships?.find((membership) => membership.group.id === activeGroupId)
  const activeGroup = activeMembership?.group
  const isMutating = leaveGroup.isPending || deleteGroup.isPending
  const destructiveActionLabel = pendingAction === 'delete' ? 'Delete Group' : 'Leave Group'

  const label = isLoading ? <Spinner size="sm" /> : activeGroup ? activeGroup.name : 'Select Group'

  return (
    <>
      <Dropdown>
        <Dropdown.Trigger
          className="select__trigger h-9 min-h-9 max-w-[180px] min-w-0 items-center"
          isDisabled={isMutating}
        >
          {isMutating ? <Spinner color="current" size="sm" /> : null}
          <span className="select__value min-w-0 truncate">{label}</span>
          <DropdownCaret className="select__indicator" />
        </Dropdown.Trigger>
        <Dropdown.Popover placement="bottom start">
          <Dropdown.Menu
            aria-label="Group switcher"
            selectionMode="single"
            selectedKeys={activeGroupId ? new Set([activeGroupId]) : new Set()}
            disabledKeys={[
              '__empty__',
              ...(activeGroupId ? [activeGroupId] : []),
              ...(isMutating ? ['__leave__', '__delete__'] : []),
            ]}
            onAction={(key) => {
              if (key === '__create__') {
                setCreateOpen(true)
              } else if (key === '__join__') {
                setJoinOpen(true)
              } else if (key === '__invite__') {
                const code = activeGroup?.invite_code
                if (code) navigator.clipboard.writeText(code)
              } else if (key === '__leave__') {
                if (activeGroup) setPendingAction('leave')
              } else if (key === '__delete__') {
                if (activeGroup) setPendingAction('delete')
              } else if (key !== '__empty__') {
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
                    <div className="flex flex-col">
                      <Label>{group.name}</Label>
                      <Description>
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
                <p className="text-default-600 text-sm">
                  {pendingAction === 'delete'
                    ? `Delete "${activeGroup?.name}" for everyone? This permanently removes the group and all related data.`
                    : `Leave "${activeGroup?.name}"? You will lose access until you join again with an invite code.`}
                </p>
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
                  isPending={
                    pendingAction === 'delete' ? deleteGroup.isPending : leaveGroup.isPending
                  }
                  onPress={() => {
                    if (!activeGroup || !pendingAction) return

                    if (pendingAction === 'delete') {
                      deleteGroup.mutate(activeGroup.id, {
                        onSuccess: () => setPendingAction(null),
                      })
                      return
                    }

                    leaveGroup.mutate(activeGroup.id, {
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
