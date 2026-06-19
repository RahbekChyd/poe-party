import { useState } from 'react'
import { Button } from '@heroui/react/button'
import { Modal } from '@heroui/react/modal'
import { Spinner } from '@heroui/react/spinner'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useJoinGroup } from '../../hooks/useGroups'
import { CharacterPickerStep } from './CharacterPickerStep'
import { FieldInput } from '../ui/heroui-native'
const schema = z.object({
  inviteCode: z.string().min(1, 'Invite code is required'),
})

type FormValues = z.infer<typeof schema>

interface JoinGroupModalProps {
  isOpen: boolean
  onClose: () => void
}

export function JoinGroupModal({ isOpen, onClose }: JoinGroupModalProps) {
  const joinGroup = useJoinGroup()
  const [joinedGroupId, setJoinedGroupId] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  const handleClose = () => {
    reset()
    joinGroup.reset()
    setJoinedGroupId(null)
    onClose()
  }

  const onSubmit = async (values: FormValues) => {
    const groupId = await joinGroup.mutateAsync(values.inviteCode)
    setJoinedGroupId(groupId)
  }

  return (
    <>
      <Modal.Backdrop
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (!open) handleClose()
        }}
        isDismissable={!joinedGroupId}
      >
        <Modal.Container>
          <Modal.Dialog>
            {joinedGroupId ? (
              <CharacterPickerStep groupId={joinedGroupId} onDone={handleClose} />
            ) : (
              <form onSubmit={handleSubmit(onSubmit)}>
                <Modal.Header>
                  <Modal.Heading>Join a Group</Modal.Heading>
                </Modal.Header>
                <Modal.Body className="gap-4">
                  <FieldInput
                    label="Invite Code"
                    placeholder="e.g. a1b2c3d4"
                    isInvalid={!!errors.inviteCode}
                    errorMessage={errors.inviteCode?.message}
                    {...register('inviteCode')}
                  />
                  {joinGroup.error && (
                    <p className="text-danger text-sm">
                      {joinGroup.error instanceof Error &&
                      joinGroup.error.message.includes('Invalid')
                        ? 'Invalid invite code — double-check and try again.'
                        : 'Something went wrong'}
                    </p>
                  )}
                </Modal.Body>
                <Modal.Footer>
                  <Button variant="tertiary" onPress={handleClose}>
                    Cancel
                  </Button>
                  <Button type="submit" isPending={joinGroup.isPending}>
                    {({ isPending }) => (
                      <>
                        {isPending ? <Spinner color="current" size="sm" /> : null}
                        Join Group
                      </>
                    )}
                  </Button>
                </Modal.Footer>
              </form>
            )}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  )
}
