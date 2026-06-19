import { useState } from 'react'
import { Button } from '@heroui/react/button'
import { Modal } from '@heroui/react/modal'
import { Spinner } from '@heroui/react/spinner'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useCreateGearSuggestion } from '../../hooks/useGear'
import { type GroupMember } from '../../hooks/useGroups'
import { useGroupStore } from '../../store/group-store'
import { IMPORTANCE_OPTIONS } from '../../lib/constants'
import { ItemSearchAutocomplete, type SelectedItem } from '../shared/ItemSearchAutocomplete'
import { FieldInput, FieldTextArea, ListBox, SelectField } from '../ui/heroui-native'

const schema = z.object({
  target_user_id: z.string().min(1, 'Select a member'),
  item_name: z.string().max(128).optional(),
  item_trade_link: z.string().optional(),
  notes: z.string().max(1000).optional(),
  importance: z.enum(['high', 'medium', 'low']),
})

type FormValues = z.infer<typeof schema>

interface Props {
  isOpen: boolean
  onClose: () => void
  members: GroupMember[] | undefined
  membersLoading: boolean
}

export function CreateGearSuggestionModal({ isOpen, onClose, members, membersLoading }: Props) {
  const activeGroupId = useGroupStore((s) => s.activeGroupId)
  const { mutate: create, isPending, error } = useCreateGearSuggestion()
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null)

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { importance: 'medium' },
  })

  function handleClose() {
    reset()
    setSelectedItem(null)
    onClose()
  }

  function onSubmit(values: FormValues) {
    if (!activeGroupId) return
    create(
      {
        group_id: activeGroupId,
        target_user_id: values.target_user_id,
        item_name: values.item_name || undefined,
        item_data: selectedItem ? { icon_url: selectedItem.icon } : undefined,
        item_trade_link: values.item_trade_link || undefined,
        notes: values.notes || undefined,
        importance: values.importance,
      },
      { onSuccess: handleClose },
    )
  }

  const selectableMembers = members ?? []

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
                <Modal.Heading>Suggest an Upgrade</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="gap-4">
                <Controller
                  control={control}
                  name="target_user_id"
                  render={({ field }) => (
                    <SelectField
                      label="For"
                      description={membersLoading ? 'Loading members...' : undefined}
                      selectedKey={field.value || undefined}
                      onSelectionChange={(key) => {
                        if (typeof key === 'string') field.onChange(key)
                      }}
                      onBlur={field.onBlur}
                      isInvalid={!!errors.target_user_id}
                      errorMessage={errors.target_user_id?.message}
                      isDisabled={membersLoading || selectableMembers.length === 0}
                    >
                      {selectableMembers.map((member) => {
                        const name = member.user.display_name ?? member.user.poe_account_name
                        return (
                          <ListBox.Item key={member.user.id} id={member.user.id} textValue={name}>
                            {name}
                          </ListBox.Item>
                        )
                      })}
                    </SelectField>
                  )}
                />
                <Controller
                  control={control}
                  name="item_name"
                  render={({ field }) => (
                    <ItemSearchAutocomplete
                      label="Item name"
                      value={field.value ?? ''}
                      onValueChange={field.onChange}
                      onItemSelect={setSelectedItem}
                      isInvalid={!!errors.item_name}
                      errorMessage={errors.item_name?.message}
                    />
                  )}
                />
                <FieldInput
                  label="Trade link"
                  placeholder="https://www.pathofexile.com/trade/..."
                  isInvalid={!!errors.item_trade_link}
                  errorMessage={errors.item_trade_link?.message}
                  {...register('item_trade_link')}
                />
                <FieldTextArea
                  label="Notes"
                  placeholder="Why this upgrade? What slot? Any context..."
                  minRows={2}
                  isInvalid={!!errors.notes}
                  errorMessage={errors.notes?.message}
                  {...register('notes')}
                />
                <Controller
                  control={control}
                  name="importance"
                  render={({ field }) => (
                    <SelectField
                      label="Importance"
                      selectedKey={field.value}
                      onSelectionChange={(key) => {
                        if (key === 'high' || key === 'medium' || key === 'low') field.onChange(key)
                      }}
                      onBlur={field.onBlur}
                      isInvalid={!!errors.importance}
                      errorMessage={errors.importance?.message}
                    >
                      {IMPORTANCE_OPTIONS.map((opt) => (
                        <ListBox.Item key={opt.value} id={opt.value} textValue={opt.label}>
                          {opt.label}
                        </ListBox.Item>
                      ))}
                    </SelectField>
                  )}
                />
                {error && (
                  <p className="text-danger text-sm">
                    {error instanceof Error ? error.message : 'Something went wrong'}
                  </p>
                )}
              </Modal.Body>
              <Modal.Footer>
                <Button variant="tertiary" onPress={handleClose}>
                  Cancel
                </Button>
                <Button type="submit" isPending={isPending}>
                  {({ isPending }) => (
                    <>
                      {isPending ? <Spinner color="current" size="sm" /> : null}
                      Suggest
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
