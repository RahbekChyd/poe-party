import {
  useEffect,
  useState,
  type ChangeEventHandler,
  type ComponentProps,
  type ReactNode,
} from 'react'
import { Button } from '@heroui/react/button'
import { Card } from '@heroui/react/card'
import { Checkbox } from '@heroui/react/checkbox'
import { Chip } from '@heroui/react/chip'
import { Description } from '@heroui/react/description'
import { FieldError } from '@heroui/react/field-error'
import { Input } from '@heroui/react/input'
import { Label } from '@heroui/react/label'
import { ListBox } from '@heroui/react/list-box'
import { Modal } from '@heroui/react/modal'
import { Select } from '@heroui/react/select'
import { Separator } from '@heroui/react/separator'
import { TextArea } from '@heroui/react/textarea'
import { TextField } from '@heroui/react/textfield'
import { ChevronLeft, Trash2 } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useGroupStore } from '../../store/group-store'
import { useMyProfile } from '../../hooks/useCurrentUser'
import { useCreateService } from '../../hooks/useServices'
import {
  AVAILABILITY_OPTIONS,
  REGION_OPTIONS,
  SERVICE_TYPE_COLOUR_CLASSES,
  SERVICE_TYPE_OPTIONS,
  buildDefaultDetails,
  buildDefaultWhisperTemplate,
  regionToQuery,
  type ServiceAvailability,
  type ServiceDetails,
  type ServiceType,
  type ServiceVisibility,
} from '../../lib/service-types'
import { cn } from '../../lib/utils'
const availabilitySchema = z.enum(['available', 'busy', 'offline'])
const visibilitySchema = z.enum(['group_only', 'public'])

const nullableDivine = z.number().nonnegative().nullable()

const bossDetailsSchema = z.object({
  service_type: z.literal('boss_carry'),
  map_mode: z.enum(['my_map_my_loot', 'your_map_your_loot', 'both']),
  bosses: z
    .array(
      z.object({
        name: z.string().min(1, 'Boss name required').max(80),
        price_divine: nullableDivine,
        note: z.string().max(200).nullable(),
      }),
    )
    .max(32),
})

const mapDetailsSchema = z.object({
  service_type: z.literal('map_carry'),
  variant: z.enum(['valdo', 'general']),
  price_non_void_min_divine: nullableDivine,
  price_non_void_max_divine: nullableDivine,
  price_void_min_divine: nullableDivine,
  price_void_max_divine: nullableDivine,
  extras: z
    .array(
      z.object({
        label: z.string().min(1, 'Label required').max(80),
        price_divine: nullableDivine,
      }),
    )
    .max(16),
  refund_policy: z.string().max(120).nullable(),
})

const fiveWayDetailsSchema = z.object({
  service_type: z.literal('five_way_host'),
  runs_per_bundle: z.number().int().positive().max(50),
  guaranteed_kills: z.number().int().nonnegative().nullable(),
  aurabot_resist_pct: z.number().int().min(0).max(100).nullable(),
  extra_guarantees: z.array(z.string().min(1).max(160)).max(8),
  party: z.object({
    clients: z.object({
      current: z.number().int().nonnegative(),
      capacity: z.number().int().positive().max(12),
    }),
    resetter: z.object({
      current: z.number().int().nonnegative(),
      capacity: z.number().int().positive().max(4),
    }),
    aurabot: z.object({
      current: z.number().int().nonnegative(),
      capacity: z.number().int().positive().max(4),
    }),
  }),
})

const goldRotaDetailsSchema = z.object({
  service_type: z.literal('gold_rota'),
  maps_per_run: z.string().max(16).nullable(),
  gold_guaranteed_millions: nullableDivine,
  party: z.object({
    current: z.number().int().nonnegative(),
    capacity: z.number().int().positive().max(12),
  }),
  extra_info: z.string().max(500).nullable(),
  trade_only_with: z.string().max(64).nullable(),
})

const detailsSchema = z.discriminatedUnion('service_type', [
  bossDetailsSchema,
  mapDetailsSchema,
  fiveWayDetailsSchema,
  goldRotaDetailsSchema,
])

const schema = z.object({
  service_type: z.enum(['boss_carry', 'map_carry', 'five_way_host', 'gold_rota']),
  title: z.string().min(2, 'Title is required').max(80),
  description: z.string().max(1000).optional(),
  region: z.string().max(16).optional(),
  price_divine: nullableDivine,
  poe_ign: z.string().min(1, 'PoE IGN is required').max(32),
  whisper_template: z.string().max(400).optional(),
  availability: availabilitySchema,
  visibility: visibilitySchema,
  mod_exclusions: z.array(z.string().min(1).max(48)).max(32),
  details: detailsSchema,
})

type FormValues = z.infer<typeof schema>
type ServiceForm = ReturnType<typeof useForm<FormValues>>

interface FieldInputProps extends Omit<
  ComponentProps<typeof Input>,
  'className' | 'size' | 'onChange'
> {
  className?: string
  description?: ReactNode
  errorMessage?: ReactNode
  isInvalid?: boolean
  label?: ReactNode
  onChange?: ChangeEventHandler<HTMLInputElement>
  onValueChange?: (value: string) => void
  size?: 'sm' | 'md' | 'lg'
}

function FieldInput({
  className,
  description,
  errorMessage,
  isInvalid,
  label,
  onChange,
  onValueChange,
  size,
  ...props
}: FieldInputProps) {
  return (
    <TextField isInvalid={isInvalid} className={className}>
      {label ? <Label>{label}</Label> : null}
      <Input
        className={size === 'sm' ? 'min-h-9' : undefined}
        onChange={(event) => {
          onChange?.(event)
          onValueChange?.(event.target.value)
        }}
        {...props}
      />
      {description ? <Description>{description}</Description> : null}
      {isInvalid && errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
    </TextField>
  )
}

interface FieldTextAreaProps extends Omit<
  ComponentProps<typeof TextArea>,
  'className' | 'size' | 'onChange'
> {
  className?: string
  description?: ReactNode
  errorMessage?: ReactNode
  isInvalid?: boolean
  label?: ReactNode
  minRows?: number
  onChange?: ChangeEventHandler<HTMLTextAreaElement>
  onValueChange?: (value: string) => void
  size?: 'sm' | 'md' | 'lg'
}

function FieldTextArea({
  className,
  description,
  errorMessage,
  isInvalid,
  label,
  minRows,
  onChange,
  onValueChange,
  ...props
}: FieldTextAreaProps) {
  return (
    <TextField isInvalid={isInvalid} className={className}>
      {label ? <Label>{label}</Label> : null}
      <TextArea
        rows={minRows}
        onChange={(event) => {
          onChange?.(event)
          onValueChange?.(event.target.value)
        }}
        {...props}
      />
      {description ? <Description>{description}</Description> : null}
      {isInvalid && errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
    </TextField>
  )
}

interface SelectFieldProps extends Omit<ComponentProps<typeof Select>, 'children'> {
  children: ReactNode
  description?: ReactNode
  label: ReactNode
}

function SelectField({ children, description, label, ...props }: SelectFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <Select {...props}>
        <span className="text-foreground text-sm font-medium">{label}</span>
        <Select.Trigger>
          <Select.Value />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>{children}</ListBox>
        </Select.Popover>
      </Select>
      {description ? <p className="text-default-500 text-xs">{description}</p> : null}
    </div>
  )
}

interface Props {
  isOpen: boolean
  onClose: () => void
}

type Step = 'type' | 'common' | 'details'

export function CreateServiceModal({ isOpen, onClose }: Props) {
  const activeGroupId = useGroupStore((s) => s.activeGroupId)
  const { data: profile } = useMyProfile()
  const { mutate: createService, isPending } = useCreateService()
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>('type')

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      service_type: 'boss_carry',
      title: '',
      description: '',
      region: 'Any',
      price_divine: null,
      poe_ign: profile?.poe_account_name ?? '',
      whisper_template: '',
      availability: 'available',
      visibility: 'public',
      mod_exclusions: [],
      details: buildDefaultDetails('boss_carry') as FormValues['details'],
    },
  })

  const {
    handleSubmit,
    control,
    watch,
    setValue,
    register,
    trigger,
    reset,
    formState: { errors },
  } = form

  const currentType = watch('service_type')

  useEffect(() => {
    if (profile?.poe_account_name && !watch('poe_ign')) {
      setValue('poe_ign', profile.poe_account_name)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.poe_account_name])

  function handleClose() {
    reset()
    setStep('type')
    onClose()
  }

  function pickType(type: ServiceType) {
    setValue('service_type', type)
    setValue('details', buildDefaultDetails(type) as FormValues['details'])
    setValue('price_divine', null)
    setStep('common')
  }

  async function goToDetails() {
    const ok = await trigger(['title', 'poe_ign', 'availability', 'visibility', 'region'])
    if (ok) setStep('details')
  }

  function onSubmit(values: FormValues) {
    if (!activeGroupId) return

    const description = values.description?.trim() ? values.description.trim() : null
    const whisper = values.whisper_template?.trim() ? values.whisper_template.trim() : null
    const region = regionToQuery(values.region ?? 'Any')

    createService(
      {
        group_id: activeGroupId,
        service_type: values.service_type,
        title: values.title.trim(),
        description,
        region,
        price_divine:
          values.service_type === 'five_way_host' || values.service_type === 'gold_rota'
            ? values.price_divine
            : null,
        price_min_divine: null,
        price_max_divine: null,
        poe_ign: values.poe_ign.trim(),
        whisper_template: whisper,
        availability: values.availability as ServiceAvailability,
        mod_exclusions: values.mod_exclusions,
        details: values.details as ServiceDetails,
        visibility: values.visibility as ServiceVisibility,
      },
      {
        onSuccess: (data) => {
          handleClose()
          navigate({
            to: '/dashboard/services/$serviceId',
            params: { serviceId: data.id },
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
          if (!open) {
            handleClose()
          }
        }}
      >
        <Modal.Container>
          <Modal.Dialog>
            <form onSubmit={handleSubmit(onSubmit)}>
              <Modal.Header className="flex items-center gap-3">
                {step !== 'type' ? (
                  <Button
                    isIconOnly
                    size="sm"
                    variant="tertiary"
                    onPress={() => setStep(step === 'details' ? 'common' : 'type')}
                    aria-label="Back"
                  >
                    <ChevronLeft size={18} />
                  </Button>
                ) : null}
                <Modal.Heading>
                  {step === 'type'
                    ? 'What kind of service?'
                    : step === 'common'
                      ? 'Service details'
                      : 'Service specifics'}
                </Modal.Heading>
                <Chip size="sm" variant="soft" className="ml-auto">
                  Step {step === 'type' ? 1 : step === 'common' ? 2 : 3} of 3
                </Chip>
              </Modal.Header>

              <Modal.Body className="gap-4">
                {step === 'type' ? <StepType onPick={pickType} /> : null}
                {step === 'common' ? (
                  <StepCommon
                    form={form}
                    register={register}
                    control={control}
                    errors={errors}
                    ignPlaceholder={profile?.poe_account_name ?? 'YourIGN'}
                  />
                ) : null}
                {step === 'details' ? <StepDetails type={currentType} form={form} /> : null}
              </Modal.Body>

              <Modal.Footer>
                <Button variant="tertiary" onPress={handleClose}>
                  Cancel
                </Button>
                {step === 'common' ? (
                  <Button onPress={goToDetails} className="min-w-24">
                    Next
                  </Button>
                ) : null}
                {step === 'details' ? (
                  <Button type="submit" isPending={isPending} className="min-w-24">
                    Create
                  </Button>
                ) : null}
              </Modal.Footer>
            </form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  )
}

function StepType({ onPick }: { onPick: (type: ServiceType) => void }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {SERVICE_TYPE_OPTIONS.map((option) => {
        const Icon = option.icon
        return (
          <Card key={option.id} className="hover:bg-default-100 transition-colors">
            <button type="button" className="w-full text-left" onClick={() => onPick(option.id)}>
              <Card.Content className="gap-2 p-4">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'rounded-medium inline-flex h-9 w-9 items-center justify-center',
                      SERVICE_TYPE_COLOUR_CLASSES[option.colour],
                    )}
                  >
                    <Icon size={18} />
                  </span>
                  <p className="text-foreground text-base font-semibold">{option.label}</p>
                </div>
                <p className="text-default-500 text-sm">{option.description}</p>
              </Card.Content>
            </button>
          </Card>
        )
      })}
    </div>
  )
}

function StepCommon({
  form,
  register,
  control,
  errors,
  ignPlaceholder,
}: {
  form: ServiceForm
  register: ServiceForm['register']
  control: ServiceForm['control']
  errors: ServiceForm['formState']['errors']
  ignPlaceholder: string
}) {
  const ign = form.watch('poe_ign') || ignPlaceholder
  const title = form.watch('title')
  const currentType = form.watch('service_type')
  const previewWhisper = buildDefaultWhisperTemplate(ign, currentType, title || null)

  return (
    <div className="flex flex-col gap-4">
      <FieldInput
        label="Title"
        placeholder="e.g. Aul's Crypt boss kills — cheap & fast"
        isInvalid={!!errors.title}
        errorMessage={errors.title?.message}
        {...register('title')}
      />

      <FieldTextArea
        label="Description"
        placeholder="Optional — anything buyers should know upfront"
        minRows={2}
        isInvalid={!!errors.description}
        errorMessage={errors.description?.message}
        {...register('description')}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FieldInput
          label="PoE IGN"
          description="The character buyers should whisper"
          isInvalid={!!errors.poe_ign}
          errorMessage={errors.poe_ign?.message}
          {...register('poe_ign')}
        />

        <Controller
          control={control}
          name="region"
          render={({ field }) => (
            <SelectField
              label="Region"
              selectedKey={field.value ?? 'Any'}
              onSelectionChange={(value) =>
                field.onChange(typeof value === 'string' ? value : 'Any')
              }
            >
              {REGION_OPTIONS.map((opt) => (
                <ListBox.Item key={opt} id={opt} textValue={opt}>
                  {opt}
                </ListBox.Item>
              ))}
            </SelectField>
          )}
        />

        <Controller
          control={control}
          name="availability"
          render={({ field }) => (
            <SelectField
              label="Availability"
              selectedKey={field.value}
              onSelectionChange={(value) => {
                if (value === 'available' || value === 'busy' || value === 'offline') {
                  field.onChange(value)
                }
              }}
            >
              {AVAILABILITY_OPTIONS.map((opt) => (
                <ListBox.Item key={opt.id} id={opt.id} textValue={opt.label}>
                  {opt.label}
                </ListBox.Item>
              ))}
            </SelectField>
          )}
        />

        <Controller
          control={control}
          name="visibility"
          render={({ field }) => (
            <SelectField
              label="Visibility"
              selectedKey={field.value}
              onSelectionChange={(value) => {
                if (value === 'public' || value === 'group_only') field.onChange(value)
              }}
              description={
                field.value === 'public'
                  ? 'Visible to everyone browsing the public listings'
                  : 'Only visible to your group members'
              }
            >
              <ListBox.Item id="public" textValue="Public">
                Public
              </ListBox.Item>
              <ListBox.Item id="group_only" textValue="Group only">
                Group only
              </ListBox.Item>
            </SelectField>
          )}
        />
      </div>

      <Separator />

      <FieldTextArea
        label="Custom whisper template"
        placeholder={previewWhisper}
        description="Leave blank to auto-generate from the service type + IGN"
        minRows={1}
        {...register('whisper_template')}
      />
      <p className="text-default-400 font-mono text-xs break-all">Preview: {previewWhisper}</p>
    </div>
  )
}

function StepDetails({ type, form }: { type: ServiceType; form: ServiceForm }) {
  if (type === 'boss_carry') return <BossDetailsFields form={form} />
  if (type === 'map_carry') return <MapDetailsFields form={form} />
  if (type === 'five_way_host') return <FiveWayDetailsFields form={form} />
  return <GoldRotaDetailsFields form={form} />
}

function BossDetailsFields({ form }: { form: ServiceForm }) {
  const { control, register } = form
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'details.bosses',
  })

  return (
    <div className="flex flex-col gap-4">
      <Controller
        control={control}
        name="details.map_mode"
        render={({ field }) => (
          <SelectField
            label="Map mode"
            selectedKey={field.value}
            onSelectionChange={(value) => {
              const val = value as 'my_map_my_loot' | 'your_map_your_loot' | 'both' | undefined
              if (val) field.onChange(val)
            }}
          >
            <ListBox.Item id="my_map_my_loot" textValue="My map - my loot">
              My map - my loot
            </ListBox.Item>
            <ListBox.Item id="your_map_your_loot" textValue="Your map - your loot">
              Your map - your loot
            </ListBox.Item>
            <ListBox.Item id="both" textValue="Both map modes">
              Both map modes
            </ListBox.Item>
          </SelectField>
        )}
      />

      <div className="flex items-center justify-between">
        <p className="text-foreground text-sm font-medium">Bosses & pricing</p>
        <Button
          size="sm"
          variant="tertiary"
          onPress={() => append({ name: '', price_divine: null, note: null })}
        >
          Add boss
        </Button>
      </div>

      {fields.length === 0 ? (
        <p className="text-default-400 text-sm">
          No bosses yet. Add your first boss to start pricing.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {fields.map((field, idx) => (
            <Card key={field.id}>
              <Card.Content className="gap-2 p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px_auto]">
                  <FieldInput
                    size="sm"
                    label="Boss"
                    placeholder="e.g. Uber Maven"
                    {...register(`details.bosses.${idx}.name` as const)}
                  />
                  <Controller
                    control={control}
                    name={`details.bosses.${idx}.price_divine` as const}
                    render={({ field: priceField }) => (
                      <FieldInput
                        size="sm"
                        type="number"
                        label="Price (div)"
                        min={0}
                        value={priceField.value == null ? '' : String(priceField.value)}
                        onChange={(e) => {
                          const val = e.target.value
                          priceField.onChange(val === '' ? null : Number(val))
                        }}
                      />
                    )}
                  />
                  <Button
                    isIconOnly
                    size="sm"
                    variant="danger-soft"
                    className="self-end"
                    onPress={() => remove(idx)}
                    aria-label="Remove boss"
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
                <FieldInput
                  size="sm"
                  label="Note (optional)"
                  placeholder="e.g. Boss ready, fragments provided"
                  {...register(`details.bosses.${idx}.note` as const)}
                />
              </Card.Content>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function DivineInput({
  label,
  form,
  name,
}: {
  label: string
  form: ServiceForm
  name:
    | 'details.price_non_void_min_divine'
    | 'details.price_non_void_max_divine'
    | 'details.price_void_min_divine'
    | 'details.price_void_max_divine'
    | 'details.gold_guaranteed_millions'
}) {
  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field }) => (
        <FieldInput
          size="sm"
          type="number"
          label={label}
          min={0}
          value={field.value == null ? '' : String(field.value)}
          onChange={(e) => {
            const val = e.target.value
            field.onChange(val === '' ? null : Number(val))
          }}
        />
      )}
    />
  )
}

function ServicePriceInput({ form, label }: { form: ServiceForm; label: string }) {
  return (
    <Controller
      control={form.control}
      name="price_divine"
      render={({ field }) => (
        <FieldInput
          size="sm"
          type="number"
          label={label}
          min={0}
          value={field.value == null ? '' : String(field.value)}
          onChange={(e) => {
            const val = e.target.value
            field.onChange(val === '' ? null : Number(val))
          }}
        />
      )}
    />
  )
}

function MapDetailsFields({ form }: { form: ServiceForm }) {
  const { control, register } = form
  const {
    fields: extraFields,
    append: appendExtra,
    remove: removeExtra,
  } = useFieldArray({
    control,
    name: 'details.extras',
  })
  const modExclusions = form.watch('mod_exclusions')
  const [modDraft, setModDraft] = useState('')

  function addMod() {
    const trimmed = modDraft.trim()
    if (!trimmed) return
    if (modExclusions.includes(trimmed)) {
      setModDraft('')
      return
    }
    form.setValue('mod_exclusions', [...modExclusions, trimmed])
    setModDraft('')
  }

  return (
    <div className="flex flex-col gap-4">
      <Controller
        control={control}
        name="details.variant"
        render={({ field }) => (
          <SelectField
            label="Variant"
            selectedKey={field.value}
            onSelectionChange={(value) => {
              const val = value as 'valdo' | 'general' | undefined
              if (val) field.onChange(val)
            }}
          >
            <ListBox.Item id="valdo" textValue="Valdo maps">
              Valdo maps
            </ListBox.Item>
            <ListBox.Item id="general" textValue="General maps">
              General maps
            </ListBox.Item>
          </SelectField>
        )}
      />

      <div>
        <p className="text-foreground mb-2 text-sm font-medium">Non-void pricing</p>
        <div className="grid grid-cols-2 gap-3">
          <DivineInput label="Min (div)" form={form} name="details.price_non_void_min_divine" />
          <DivineInput label="Max (div)" form={form} name="details.price_non_void_max_divine" />
        </div>
      </div>

      <div>
        <p className="text-foreground mb-2 text-sm font-medium">Void pricing</p>
        <div className="grid grid-cols-2 gap-3">
          <DivineInput label="Min (div)" form={form} name="details.price_void_min_divine" />
          <DivineInput label="Max (div)" form={form} name="details.price_void_max_divine" />
        </div>
      </div>

      <FieldInput
        label="Refund policy"
        placeholder="e.g. Full refund on fail"
        {...register('details.refund_policy')}
      />

      <Separator />

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-foreground text-sm font-medium">Extras</p>
          <Button
            size="sm"
            variant="tertiary"
            onPress={() => appendExtra({ label: '', price_divine: null })}
          >
            Add extra
          </Button>
        </div>
        {extraFields.length === 0 ? (
          <p className="text-default-400 text-sm">No extras added.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {extraFields.map((field, idx) => (
              <div key={field.id} className="grid grid-cols-[1fr_140px_auto] items-end gap-2">
                <FieldInput
                  size="sm"
                  label="Label"
                  placeholder="e.g. Jewels"
                  {...register(`details.extras.${idx}.label` as const)}
                />
                <Controller
                  control={control}
                  name={`details.extras.${idx}.price_divine` as const}
                  render={({ field: priceField }) => (
                    <FieldInput
                      size="sm"
                      type="number"
                      label="Price (div)"
                      min={0}
                      value={priceField.value == null ? '' : String(priceField.value)}
                      onChange={(e) => {
                        const val = e.target.value
                        priceField.onChange(val === '' ? null : Number(val))
                      }}
                    />
                  )}
                />
                <Button
                  isIconOnly
                  size="sm"
                  variant="danger-soft"
                  onPress={() => removeExtra(idx)}
                  aria-label="Remove extra"
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Separator />

      <div>
        <p className="text-foreground mb-2 text-sm font-medium">Mods I don't run</p>
        <div className="flex gap-2">
          <FieldInput
            size="sm"
            value={modDraft}
            onChange={(e) => setModDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addMod()
              }
            }}
            placeholder="e.g. No regen"
          />
          <Button size="sm" variant="tertiary" onPress={addMod}>
            Add
          </Button>
        </div>
        {modExclusions.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {modExclusions.map((mod) => (
              <Chip key={mod} size="sm" variant="soft" color="danger">
                {mod}
              </Chip>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function PartySlotInputs({
  label,
  form,
  name,
}: {
  label: string
  form: ServiceForm
  name:
    | 'details.party.clients'
    | 'details.party.resetter'
    | 'details.party.aurabot'
    | 'details.party'
}) {
  return (
    <div>
      <p className="text-default-400 mb-1 text-xs font-medium tracking-wide uppercase">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        <Controller
          control={form.control}
          name={`${name}.current` as const}
          render={({ field }) => (
            <FieldInput
              size="sm"
              type="number"
              label="Current"
              min={0}
              value={String(field.value ?? 0)}
              onChange={(e) => field.onChange(Number(e.target.value || 0))}
            />
          )}
        />
        <Controller
          control={form.control}
          name={`${name}.capacity` as const}
          render={({ field }) => (
            <FieldInput
              size="sm"
              type="number"
              label="Capacity"
              min={1}
              value={String(field.value ?? 1)}
              onChange={(e) => field.onChange(Number(e.target.value || 1))}
            />
          )}
        />
      </div>
    </div>
  )
}

function FixedPartyRoleCheckbox({
  label,
  form,
  name,
}: {
  label: string
  form: ServiceForm
  name: 'details.party.resetter' | 'details.party.aurabot'
}) {
  return (
    <Controller
      control={form.control}
      name={`${name}.current` as const}
      render={({ field }) => (
        <Checkbox
          id={`service-role-${label.toLowerCase().replace(/\s+/g, '-')}`}
          isSelected={(field.value ?? 0) > 0}
          onChange={(selected) => {
            field.onChange(selected ? 1 : 0)
            form.setValue(`${name}.capacity` as const, 1)
          }}
        >
          <Checkbox.Control>
            <Checkbox.Indicator />
          </Checkbox.Control>
          <Checkbox.Content>
            <Label>{label}</Label>
          </Checkbox.Content>
        </Checkbox>
      )}
    />
  )
}

function FiveWayDetailsFields({ form }: { form: ServiceForm }) {
  const { control } = form
  const guarantees = form.watch('details.extra_guarantees') as string[]
  const [draft, setDraft] = useState('')

  function addGuarantee() {
    const trimmed = draft.trim()
    if (!trimmed) return
    form.setValue('details.extra_guarantees', [...guarantees, trimmed])
    setDraft('')
  }

  function removeGuarantee(idx: number) {
    form.setValue(
      'details.extra_guarantees',
      guarantees.filter((_, i) => i !== idx),
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-foreground mb-2 text-sm font-medium">Pricing</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ServicePriceInput form={form} label="Bundle price (div)" />
          <Controller
            control={control}
            name="details.runs_per_bundle"
            render={({ field }) => (
              <FieldInput
                size="sm"
                type="number"
                label="Runs per bundle"
                min={1}
                value={String(field.value ?? 5)}
                onChange={(e) => field.onChange(Number(e.target.value || 1))}
              />
            )}
          />
        </div>
      </div>

      <Separator />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Controller
          control={control}
          name="details.guaranteed_kills"
          render={({ field }) => (
            <FieldInput
              size="sm"
              type="number"
              label="Guaranteed kills"
              min={0}
              value={field.value == null ? '' : String(field.value)}
              onChange={(e) => {
                const val = e.target.value
                field.onChange(val === '' ? null : Number(val))
              }}
            />
          )}
        />
        <Controller
          control={control}
          name="details.aurabot_resist_pct"
          render={({ field }) => (
            <FieldInput
              size="sm"
              type="number"
              label="Aurabot resist %"
              min={0}
              max={100}
              value={field.value == null ? '' : String(field.value)}
              onChange={(e) => {
                const val = e.target.value
                field.onChange(val === '' ? null : Number(val))
              }}
            />
          )}
        />
      </div>

      <Separator />

      <p className="text-foreground text-sm font-medium">Party composition</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
        <PartySlotInputs label="Clients" form={form} name="details.party.clients" />
        <FixedPartyRoleCheckbox
          label="Resetter present"
          form={form}
          name="details.party.resetter"
        />
        <FixedPartyRoleCheckbox label="Aurabot present" form={form} name="details.party.aurabot" />
      </div>

      <Separator />

      <div>
        <p className="text-foreground mb-2 text-sm font-medium">Guarantees</p>
        <div className="flex gap-2">
          <FieldInput
            size="sm"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addGuarantee()
              }
            }}
            placeholder="e.g. Free run if I die before 1 min"
          />
          <Button size="sm" variant="tertiary" onPress={addGuarantee}>
            Add
          </Button>
        </div>
        {guarantees.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {guarantees.map((g, idx) => (
              <li
                key={idx}
                className="rounded-medium bg-default-50/50 text-default-600 flex items-center justify-between px-3 py-1.5 text-sm"
              >
                <span>{g}</span>
                <Button
                  isIconOnly
                  size="sm"
                  variant="danger-soft"
                  onPress={() => removeGuarantee(idx)}
                  aria-label="Remove guarantee"
                >
                  <Trash2 size={14} />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}

function GoldRotaDetailsFields({ form }: { form: ServiceForm }) {
  const { control, register } = form
  const modExclusions = form.watch('mod_exclusions')
  const [modDraft, setModDraft] = useState('')

  function addMod() {
    const trimmed = modDraft.trim()
    if (!trimmed) return
    if (modExclusions.includes(trimmed)) {
      setModDraft('')
      return
    }
    form.setValue('mod_exclusions', [...modExclusions, trimmed])
    setModDraft('')
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-foreground mb-2 text-sm font-medium">Pricing</p>
        <ServicePriceInput form={form} label="Price (div)" />
      </div>

      <Separator />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Controller
          control={control}
          name="details.maps_per_run"
          render={({ field }) => (
            <FieldInput
              size="sm"
              label="Maps per run"
              placeholder="e.g. 2-3"
              value={field.value ?? ''}
              onChange={(e) => field.onChange(e.target.value || null)}
            />
          )}
        />
        <DivineInput
          label="Gold guaranteed (millions)"
          form={form}
          name="details.gold_guaranteed_millions"
        />
      </div>

      <PartySlotInputs label="Party fill" form={form} name="details.party" />

      <FieldInput
        label="Trade only with"
        placeholder="e.g. IGN Luvfinss"
        {...register('details.trade_only_with')}
      />

      <FieldTextArea
        label="Extra info"
        placeholder="e.g. stay close, remove Gravebind gloves"
        minRows={2}
        {...register('details.extra_info')}
      />

      <Separator />

      <div>
        <p className="text-foreground mb-2 text-sm font-medium">Mod exclusions</p>
        <div className="flex gap-2">
          <FieldInput
            size="sm"
            value={modDraft}
            onChange={(e) => setModDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addMod()
              }
            }}
            placeholder="e.g. No regen"
          />
          <Button size="sm" variant="tertiary" onPress={addMod}>
            Add
          </Button>
        </div>
        {modExclusions.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {modExclusions.map((mod) => (
              <Chip key={mod} size="sm" variant="soft" color="danger">
                {mod}
              </Chip>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
