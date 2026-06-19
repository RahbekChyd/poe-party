import { Button } from '@heroui/react/button'
import { Modal } from '@heroui/react/modal'
import { Spinner } from '@heroui/react/spinner'
import { useNavigate } from '@tanstack/react-router'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useCreateStrategy } from '../../hooks/useStrategies'
import { useGroupStore } from '../../store/group-store'
import { FieldInput, FieldTextArea, ListBox, SelectField } from '../ui/heroui-native'

const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: 'Easy' },
  { value: 'normal', label: 'Normal' },
  { value: 'hard', label: 'Hard' },
] as const

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(64),
  description: z.string().max(1000).optional(),
  difficulty: z.enum(['easy', 'normal', 'hard']),
})

type FormValues = z.infer<typeof schema>

interface Props {
  isOpen: boolean
  onClose: () => void
}

export function CreateStrategyModal({ isOpen, onClose }: Props) {
  const activeGroupId = useGroupStore((s) => s.activeGroupId)
  const { mutate: create, isPending } = useCreateStrategy()
  const navigate = useNavigate()

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { description: '', difficulty: 'normal' },
  })

  function handleClose() {
    reset()
    onClose()
  }

  function onSubmit(values: FormValues) {
    if (!activeGroupId) return
    create(
      {
        group_id: activeGroupId,
        colour: '#6366f1',
        ...values,
        description: values.description?.trim() ? values.description.trim() : null,
      },
      {
        onSuccess: (data) => {
          reset()
          onClose()
          navigate({
            to: '/dashboard/strategies/$strategyId',
            params: { strategyId: data.id },
          })
        },
      },
    )
  }

  return (
    <>
      <Modal.Backdrop
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (!open) handleClose()
        }}
      >
        <Modal.Container>
          <Modal.Dialog>
            <form onSubmit={handleSubmit(onSubmit)}>
              <Modal.Header>
                <Modal.Heading>Create Strategy</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="gap-4">
                <FieldInput
                  label="Name"
                  placeholder="e.g. T16 Harvest Farming"
                  isInvalid={!!errors.name}
                  errorMessage={errors.name?.message}
                  {...register('name')}
                />
                <FieldTextArea
                  label="Description"
                  placeholder="Optional notes, goals, or setup details"
                  minRows={2}
                  isInvalid={!!errors.description}
                  errorMessage={errors.description?.message}
                  {...register('description')}
                />
                <Controller
                  control={control}
                  name="difficulty"
                  render={({ field }) => (
                    <SelectField
                      label="Difficulty"
                      selectedKey={field.value}
                      onSelectionChange={(key) => {
                        if (key === 'easy' || key === 'normal' || key === 'hard') {
                          field.onChange(key)
                        }
                      }}
                      onBlur={field.onBlur}
                    >
                      {DIFFICULTY_OPTIONS.map((opt) => (
                        <ListBox.Item key={opt.value} id={opt.value} textValue={opt.label}>
                          {opt.label}
                        </ListBox.Item>
                      ))}
                    </SelectField>
                  )}
                />
              </Modal.Body>
              <Modal.Footer>
                <Button variant="tertiary" onPress={handleClose}>
                  Cancel
                </Button>
                <Button type="submit" isPending={isPending} className="min-w-24">
                  {({ isPending }) => (
                    <>
                      {isPending ? <Spinner color="current" size="sm" /> : null}
                      Create
                    </>
                  )}
                </Button>
              </Modal.Footer>
            </form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  )
}
