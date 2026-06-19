import { useEffect, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@heroui/react/button'
import { Header } from '@heroui/react/header'
import { Modal } from '@heroui/react/modal'
import { Spinner } from '@heroui/react/spinner'
import { useCreateGroup } from '../../hooks/useGroups'
import { usePoeGameAccess } from '../../hooks/usePoeGameAccess'
import { usePoeLeagues, type PoeLeagueOption } from '../../hooks/usePoeLeagues'
import { CharacterPickerStep } from './CharacterPickerStep'
import type { PoeGame } from '../../lib/poe-game'
import { FieldInput, FieldTextArea, ListBox, SelectField } from '../ui/heroui-native'
const schema = z.object({
  name: z.string().min(1, 'Group name is required').max(64, 'Name must be 64 characters or less'),
  game: z.enum(['poe1', 'poe2']),
  league: z.string().min(1, 'League is required'),
  description: z.string().max(256, 'Description must be 256 characters or less').optional(),
})

type FormValues = z.infer<typeof schema>

interface LeagueSection {
  title: string
  items: PoeLeagueOption[]
}

interface CreateGroupModalProps {
  isOpen: boolean
  onClose: () => void
}

export function CreateGroupModal({ isOpen, onClose }: CreateGroupModalProps) {
  const createGroup = useCreateGroup()
  const { canUsePoe2, availableGames } = usePoeGameAccess()
  const [createdGroupId, setCreatedGroupId] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    setValue,
    clearErrors,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      game: 'poe1',
    },
  })
  const selectedGame = watch('game') as PoeGame
  const {
    data: leagues,
    isLoading: leaguesLoading,
    isError: leaguesFailed,
  } = usePoeLeagues(selectedGame)

  useEffect(() => {
    if (canUsePoe2 || selectedGame !== 'poe2') return
    setValue('game', 'poe1', { shouldValidate: true })
    setValue('league', '', { shouldValidate: true })
  }, [canUsePoe2, selectedGame, setValue])

  const handleClose = () => {
    reset()
    createGroup.reset()
    setCreatedGroupId(null)
    onClose()
  }

  const onSubmit = async (values: FormValues) => {
    const group = await createGroup.mutateAsync(values)
    setCreatedGroupId(group.id)
  }

  const leagueSections: LeagueSection[] = leagues
    ? [
        { title: 'Current', items: leagues.filter((league) => league.group === 'current') },
        { title: 'Previous', items: leagues.filter((league) => league.group === 'recent') },
        { title: 'Permanent', items: leagues.filter((league) => league.group === 'permanent') },
      ].filter((section) => section.items.length > 0)
    : []

  return (
    <>
      <Modal.Backdrop
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (!open) handleClose()
        }}
        isDismissable={!createdGroupId}
        isKeyboardDismissDisabled={!!createdGroupId}
      >
        <Modal.Container>
          <Modal.Dialog>
            {createdGroupId ? (
              <CharacterPickerStep groupId={createdGroupId} onDone={handleClose} />
            ) : (
              <form onSubmit={handleSubmit(onSubmit)}>
                <Modal.Header>
                  <Modal.Heading>Create a Group</Modal.Heading>
                </Modal.Header>
                <Modal.Body className="gap-4">
                  <FieldInput
                    label="Group Name"
                    placeholder="The Exiles"
                    isInvalid={!!errors.name}
                    errorMessage={errors.name?.message}
                    {...register('name')}
                  />

                  <Controller
                    name="game"
                    control={control}
                    render={({ field: { value, onChange, onBlur } }) => (
                      <SelectField
                        label="Game"
                        selectedKey={value}
                        onSelectionChange={(key) => {
                          if (key !== 'poe1' && key !== 'poe2') return
                          onChange(key)
                          setValue('league', '', {
                            shouldDirty: true,
                            shouldTouch: true,
                            shouldValidate: true,
                          })
                        }}
                        onBlur={onBlur}
                        isInvalid={!!errors.game}
                        errorMessage={errors.game?.message}
                      >
                        {availableGames.map((game) => (
                          <ListBox.Item key={game.id} id={game.id} textValue={game.label}>
                            {game.label}
                          </ListBox.Item>
                        ))}
                      </SelectField>
                    )}
                  />

                  {leaguesFailed ? (
                    <FieldInput
                      label="League"
                      placeholder={
                        selectedGame === 'poe2'
                          ? 'e.g. Dawn of the Hunt, Standard'
                          : 'e.g. Mercenaries, Standard'
                      }
                      isInvalid={!!errors.league}
                      errorMessage={errors.league?.message}
                      {...register('league')}
                    />
                  ) : (
                    <Controller
                      name="league"
                      control={control}
                      render={({ field: { value, onChange, onBlur } }) => (
                        <SelectField
                          label="League"
                          selectedKey={value || undefined}
                          onSelectionChange={(key) => {
                            if (typeof key !== 'string') return
                            const league = key ?? ''
                            onChange(league)
                            setValue('league', league, {
                              shouldDirty: true,
                              shouldTouch: true,
                              shouldValidate: true,
                            })
                            if (league) clearErrors('league')
                          }}
                          onBlur={onBlur}
                          isDisabled={leaguesLoading}
                          isInvalid={!!errors.league}
                          errorMessage={errors.league?.message}
                          popoverClassName="!max-h-64 overflow-y-auto overscroll-contain"
                          popoverProps={{ shouldFlip: false }}
                        >
                          {leagueSections.map((section) => (
                            <ListBox.Section key={section.title}>
                              <Header>{section.title}</Header>
                              {section.items.map((league) => (
                                <ListBox.Item
                                  key={league.id}
                                  id={league.id}
                                  textValue={league.label}
                                >
                                  {league.label}
                                </ListBox.Item>
                              ))}
                            </ListBox.Section>
                          ))}
                        </SelectField>
                      )}
                    />
                  )}

                  <FieldTextArea
                    label="Description"
                    placeholder="Optional - what is the group about?"
                    isInvalid={!!errors.description}
                    errorMessage={errors.description?.message}
                    {...register('description')}
                  />
                  {createGroup.error && (
                    <p className="text-danger text-sm">
                      {createGroup.error instanceof Error
                        ? createGroup.error.message
                        : 'Something went wrong'}
                    </p>
                  )}
                </Modal.Body>
                <Modal.Footer>
                  <Button variant="tertiary" onPress={handleClose}>
                    Cancel
                  </Button>
                  <Button type="submit" isPending={createGroup.isPending}>
                    {({ isPending }) => (
                      <>
                        {isPending ? <Spinner color="current" size="sm" /> : null}
                        Create Group
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
