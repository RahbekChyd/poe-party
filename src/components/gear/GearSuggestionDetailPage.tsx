import { useEffect, useRef, useState } from 'react'
import { Button } from '@heroui/react/button'
import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { Spinner } from '@heroui/react/spinner'
import { ArrowLeft, Check, Lock, Trash2, Unlock } from 'lucide-react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Route } from '../../routes/dashboard/gear/$suggestionId'
import { useGearSuggestion, useDeleteGearSuggestion, useUpdateGearSuggestion, type GearImportance, type GearStatus, type GearSuggestion } from '../../hooks/useGear'
import { useGroupStore } from '../../store/group-store'
import { useMyGroupRole } from '../../hooks/useGroups'
import { DetailPageSkeleton } from '../layout/Skeletons'
import { IMPORTANCE_CHIP, IMPORTANCE_OPTIONS } from '../../lib/constants'
import { getAvatarColor } from '../../lib/utils'
import { ItemSearchAutocomplete, type SelectedItem } from '../shared/ItemSearchAutocomplete'
import { FieldInput, FieldTextArea, ListBox, SelectField, UserAvatar } from '../ui/heroui-native'
type NativeChipColor = 'default' | 'accent' | 'success' | 'warning' | 'danger'

function toNativeChipColor(color: string): NativeChipColor {
  if (color === 'primary' || color === 'secondary') return 'accent'
  return color as NativeChipColor
}

const STATUS_OPTIONS: { key: GearStatus; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'acknowledged', label: 'Acknowledged' },
  { key: 'implemented', label: 'Implemented' },
  { key: 'dismissed', label: 'Dismissed' },
]

function getActionLabel(actionType: GearSuggestion['action_type']): string {
  switch (actionType) {
    case 'passive_node':
      return 'Passive tree'
    case 'skill_gem':
      return 'Skill gem'
    case 'support_gem':
      return 'Support gem'
    case 'config_change':
      return 'Configuration'
    case 'reservation_fix':
      return 'Reservation'
    default:
      return 'Gear item'
  }
}

const schema = z.object({
  item_name: z.string().max(128).optional().nullable(),
  item_trade_link: z.string().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  importance: z.enum(['high', 'medium', 'low']),
  status: z.enum(['open', 'acknowledged', 'implemented', 'dismissed']),
  status_note: z.string().max(500).optional().nullable(),
})

type FormValues = z.infer<typeof schema>

function buildDefaults(s: GearSuggestion): FormValues {
  return {
    item_name: s.item_name ?? '',
    item_trade_link: s.item_trade_link ?? '',
    notes: s.notes ?? '',
    importance: s.importance ?? 'medium',
    status: s.status,
    status_note: s.status_note ?? '',
  }
}

export function GearSuggestionDetailPage() {
  const { suggestionId } = Route.useParams()
  const navigate = useNavigate()
  const activeGroupId = useGroupStore((s) => s.activeGroupId)
  const myRole = useMyGroupRole(activeGroupId)
  const canEdit = myRole === 'admin' || myRole === 'editor'
  const isAdmin = myRole === 'admin'

  const { data: suggestion, isLoading } = useGearSuggestion(suggestionId)
  const { mutate: update, isPending: saving, error: saveError } = useUpdateGearSuggestion()
  const { mutate: deleteSuggestion, isPending: deleting } = useDeleteGearSuggestion()
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [saveFeedback, setSaveFeedback] = useState<'idle' | 'saving' | 'saved'>('idle')

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { importance: 'medium', status: 'open' },
  })
  const isDirtyRef = useRef(isDirty)

  const tradeLink = watch('item_trade_link')

  useEffect(() => {
    isDirtyRef.current = isDirty
  }, [isDirty])

  useEffect(() => {
    if (!suggestion) return

    reset(buildDefaults(suggestion), isDirtyRef.current ? { keepDirtyValues: true } : undefined)
  }, [suggestion, reset])

  useEffect(() => {
    if (isDirty && saveFeedback === 'saved') {
      setSaveFeedback('idle')
    }
  }, [isDirty, saveFeedback])

  function onSubmit(values: FormValues) {
    if (!suggestion) return
    const iconUrl = selectedItem?.icon ?? suggestion.item_data?.icon_url
    setSaveFeedback('saving')
    update({
      id: suggestion.id,
      group_id: suggestion.group_id,
      item_name: values.item_name || null,
      item_data: iconUrl ? { icon_url: iconUrl } : null,
      item_trade_link: values.item_trade_link || null,
      notes: values.notes || null,
      importance: values.importance,
      status: values.status,
      status_note: values.status_note || null,
    }, {
      onSuccess: (data) => {
        reset(buildDefaults(data))
        setSelectedItem(null)
        setSaveFeedback('saved')
      },
      onError: () => {
        setSaveFeedback('idle')
      },
    })
  }

  if (isLoading) {
    return <DetailPageSkeleton />
  }

  if (!suggestion) {
    return (
      <div className="flex flex-col gap-4">
        <Link to="/dashboard/gear" className="self-start">
          <Button variant="tertiary" size="sm">
            <ArrowLeft size={14} />
            Back to Gear
          </Button>
        </Link>
        <p className="text-default-400 text-sm">Suggestion not found.</p>
      </div>
    )
  }

  const importanceChip = IMPORTANCE_CHIP[suggestion.importance] ?? IMPORTANCE_CHIP.medium

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <Link to="/dashboard/gear">
            <Button
              variant="tertiary"
              size="sm"
              className="-ml-2"
              type="button"
              onPress={() => setConfirmingDelete(false)}
            >
              <ArrowLeft size={14} />
              Back to Gear
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <Chip size="sm" variant="soft" color={toNativeChipColor(importanceChip.color)}>
              {importanceChip.label} Importance
            </Chip>
            <Chip size="sm" variant="soft" color="accent">
              {getActionLabel(suggestion.action_type)}
            </Chip>
            {isAdmin && (
              <Button
                isIconOnly
                size="sm"
                variant="tertiary"
                type="button"
                aria-label={suggestion.admin_locked ? 'Unlock suggestion' : 'Lock suggestion (admin only)'}
                onPress={() =>
                  update({
                    id: suggestion.id,
                    group_id: suggestion.group_id,
                    item_name: suggestion.item_name,
                    item_trade_link: suggestion.item_trade_link,
                    notes: suggestion.notes,
                    importance: suggestion.importance,
                    status: suggestion.status,
                    status_note: suggestion.status_note,
                    admin_locked: !suggestion.admin_locked,
                  })
                }
              >
                {suggestion.admin_locked ? <Unlock size={14} /> : <Lock size={14} />}
              </Button>
            )}
            {canEdit && saveError && (
              <p className="text-danger text-xs">
                Failed to save: {(saveError as Error).message}
              </p>
            )}
            {canEdit && (confirmingDelete ? (
              <>
                <span className="text-default-500 text-xs">Delete this gear suggestion?</span>
                <Button
                  size="sm"
                  type="button"
                  isPending={deleting}
                  onPress={() =>
                    deleteSuggestion(
                      { id: suggestion.id, group_id: suggestion.group_id },
                      { onSuccess: () => navigate({ to: '/dashboard/gear' }) },
                    )
                 }
                 variant="danger">
                  {({ isPending }) => (
                    <>
                      {isPending ? <Spinner color="current" size="sm" /> : null}
                      Yes, delete
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="tertiary"
                  type="button"
                  onPress={() => setConfirmingDelete(false)}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="danger-soft"
                  type="button"
                  className="opacity-95 hover:opacity-100"
                  onPress={() => setConfirmingDelete(true)}
                >
                  <Trash2 size={14} />
                  Remove
                </Button>
                {saving || isDirty ? (
                  <Button
                    type="submit"
                    size="sm"
                    isPending={saving}
                    isDisabled={!isDirty}
                    className="min-w-32 transition-all duration-200"
                  >
                    {({ isPending }) => (
                      isPending ? (
                        <>
                          <Spinner color="current" size="sm" />
                          Saving...
                        </>
                      ) : (
                        'Save Changes'
                      )
                    )}
                  </Button>
                ) : saveFeedback === 'saved' ? (
                  <div
                    aria-label="Saved"
                    className="flex min-w-32 items-center justify-center rounded-md border border-success/40 bg-success/10 px-3 py-2 text-success transition-all duration-200"
                  >
                    <Check
                      size={14}
                      className="animate-in zoom-in-50 fade-in duration-200"
                    />
                  </div>
                ) : null}
              </>
            ))}
          </div>
        </div>

        <Card>
          <Card.Header className="px-5 pb-0 pt-5">
            <h2 className="text-foreground text-sm font-semibold">Suggestion Details</h2>
          </Card.Header>
          <Card.Content className="gap-4 px-5 pb-5 pt-3">
            <div className="flex items-center gap-3">
              <UserAvatar
                src={suggestion.target_user.avatar_url ?? undefined}
                name={suggestion.target_user.display_name ?? suggestion.target_user.poe_account_name}
                size="sm"
                style={{ backgroundColor: getAvatarColor(suggestion.target_user.id, suggestion.target_user.avatar_color) }}
              />
              <div>
                <p className="text-default-400 text-xs">For</p>
                <p className="text-foreground text-sm font-medium">
                  {suggestion.target_user.display_name ?? suggestion.target_user.poe_account_name}
                </p>
              </div>
              <div className="ml-6">
                <p className="text-default-400 text-xs">Suggested by</p>
                <p className="text-foreground text-sm font-medium">
                  {suggestion.suggester.display_name ?? suggestion.suggester.poe_account_name}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {(selectedItem?.icon ?? suggestion.item_data?.icon_url) && (
                <img
                  src={selectedItem?.icon ?? suggestion.item_data?.icon_url}
                  alt={selectedItem?.name ?? suggestion.item_name ?? 'Suggested item'}
                  className="h-14 w-14 shrink-0 object-contain bg-transparent"
                />
              )}
              <Controller
                control={control}
                name="item_name"
                render={({ field }) => (
                  <ItemSearchAutocomplete
                    label="Item name"
                    size="sm"
                    value={field.value ?? ''}
                    onValueChange={field.onChange}
                    onItemSelect={setSelectedItem}
                    isReadOnly={!canEdit}
                    isInvalid={!!errors.item_name}
                    errorMessage={errors.item_name?.message}
                  />
                )}
              />
            </div>

            <div className="flex items-center gap-2">
              <FieldInput
                label="Trade link"
                placeholder="https://www.pathofexile.com/trade/..."
                size="sm"
                className="w-full max-w-xs"
                isReadOnly={!canEdit}
                isInvalid={!!errors.item_trade_link}
                errorMessage={errors.item_trade_link?.message}
                {...register('item_trade_link')}
              />
              {tradeLink && (
                <a
                  href={tradeLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  tabIndex={-1}
                  className="shrink-0 self-end"
                >
                  <Button size="sm" variant="tertiary" type="button">
                    Open
                  </Button>
                </a>
              )}
            </div>

            <FieldTextArea
              label="Notes"
              placeholder="Why this upgrade? What slot? Any context..."
              minRows={2}
              size="sm"
              isReadOnly={!canEdit}
              isInvalid={!!errors.notes}
              errorMessage={errors.notes?.message}
              {...register('notes')}
            />
          </Card.Content>
        </Card>

        <Card>
          <Card.Header className="px-5 pb-0 pt-5">
            <h2 className="text-foreground text-sm font-semibold">Status</h2>
          </Card.Header>
          <Card.Content className="gap-3 px-5 pb-5 pt-3">
            <Controller
              control={control}
              name="importance"
              render={({ field }) => (
                <SelectField
                  label="Importance"
                  isDisabled={!canEdit}
                  selectedKey={field.value}
                  onSelectionChange={(key) => field.onChange(key as GearImportance)}
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
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <SelectField
                  label="Status"
                  isDisabled={!canEdit}
                  selectedKey={field.value}
                  onSelectionChange={(key) => field.onChange(key as GearStatus)}
                  isInvalid={!!errors.status}
                  errorMessage={errors.status?.message}
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <ListBox.Item key={opt.key} id={opt.key} textValue={opt.label}>
                      {opt.label}
                    </ListBox.Item>
                  ))}
                </SelectField>
              )}
            />
            <FieldTextArea
              label="Status note"
              placeholder="Optional - add context about the status change..."
              minRows={2}
              size="sm"
              isReadOnly={!canEdit}
              {...register('status_note')}
            />
          </Card.Content>
        </Card>
      </div>
    </form>
  )
}
