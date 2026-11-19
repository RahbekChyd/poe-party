import {
  useEffect,
  useState,
  type ChangeEventHandler,
  type ComponentProps,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
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
import { Select } from '@heroui/react/select'
import { Separator } from '@heroui/react/separator'
import { TextArea } from '@heroui/react/textarea'
import { TextField } from '@heroui/react/textfield'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Route } from '../../routes/dashboard/services/$serviceId'
import { useDeleteService, useOwnedService, useUpdateService } from '../../hooks/useServices'
import { useServiceAvailabilityControl } from '../../hooks/useServiceAvailabilityControl'
import {
  REGION_OPTIONS,
  BOSS_MAP_MODE_LABELS,
  regionFromSelection,
  regionToQuery,
  type BossMapMode,
  type ServiceDetails,
  type ServiceVisibility,
} from '../../lib/service-types'
import { AvailabilityChip } from './AvailabilityChip'
import { AvailabilitySelector } from './AvailabilitySelector'
import { ServiceDetailSection } from './ServiceDetailSection'
import { ServiceTypeChip } from './ServiceTypeChip'
import { WhisperCopyButton } from './WhisperCopyButton'
import { QueryStatePanel } from '../ui/QueryStatePanel'
const SERVICE_HEADER_CHIP_CLASS_NAME = 'px-3'

interface FieldInputProps extends Omit<
  ComponentProps<typeof Input>,
  'className' | 'size' | 'onChange'
> {
  className?: string
  label?: ReactNode
  description?: ReactNode
  errorMessage?: ReactNode
  isInvalid?: boolean
  onChange?: ChangeEventHandler<HTMLInputElement>
  onValueChange?: (value: string) => void
  size?: 'sm' | 'md' | 'lg'
}

function FieldInput({
  label,
  description,
  errorMessage,
  isInvalid,
  onChange,
  onValueChange,
  size,
  className,
  ...props
}: FieldInputProps) {
  const inputClassName = size === 'sm' ? 'h-9 min-h-9' : size === 'lg' ? 'min-h-12' : 'min-h-10'

  return (
    <TextField isInvalid={isInvalid} className={['w-full', className].filter(Boolean).join(' ')}>
      {label ? <Label>{label}</Label> : null}
      <Input
        className={['w-full', inputClassName].filter(Boolean).join(' ')}
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
  label?: ReactNode
  description?: ReactNode
  errorMessage?: ReactNode
  isInvalid?: boolean
  minRows?: number
  onChange?: ChangeEventHandler<HTMLTextAreaElement>
  onValueChange?: (value: string) => void
  size?: 'sm' | 'md' | 'lg'
}

function FieldTextArea({
  label,
  description,
  errorMessage,
  isInvalid,
  minRows,
  onChange,
  onValueChange,
  className,
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
    <div className="flex w-full flex-col gap-1">
      <Select {...props}>
        <span className="text-foreground text-sm font-medium">{label}</span>
        <Select.Trigger className="w-full">
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

function parseNullableDivine(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function toInputValue(value: number | null): string {
  return value == null ? '' : String(value)
}

function numberOrNull(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function numberOrDefault(value: string, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function ServiceDetailPage() {
  const { serviceId } = Route.useParams()
  const navigate = useNavigate()
  const { data: service, isLoading, isError, refetch } = useOwnedService(serviceId)
  const updateService = useUpdateService()
  const deleteService = useDeleteService()
  const {
    availability: displayAvailability,
    availabilityPending,
    updateAvailability,
  } = useServiceAvailabilityControl(service?.id ?? null, service?.availability ?? null)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [region, setRegion] = useState('Any')
  const [priceDivine, setPriceDivine] = useState('')
  const [ign, setIgn] = useState('')
  const [whisper, setWhisper] = useState('')
  const [visibility, setVisibility] = useState<ServiceVisibility>('public')
  const [isActive, setIsActive] = useState(true)
  const [modExclusions, setModExclusions] = useState<string[]>([])
  const [details, setDetails] = useState<ServiceDetails | null>(null)
  const [saveAttempted, setSaveAttempted] = useState(false)
  const invalidTitle = title.trim().length < 2 || title.trim().length > 80
  const invalidIgn = !ign.trim() || ign.trim().length > 32

  useEffect(() => {
    if (!service) return
    setTitle(service.title)
    setDescription(service.description ?? '')
    setRegion(service.region ?? 'Any')
    setPriceDivine(service.price_divine == null ? '' : String(service.price_divine))
    setIgn(service.poe_ign)
    setWhisper(service.whisper_template ?? '')
    setVisibility(service.visibility)
    setIsActive(service.is_active)
    setModExclusions(service.mod_exclusions)
    setDetails(service.details)
    setSaveAttempted(false)
    // Reset only when switching to a different service; background refetches
    // keep user edits intact.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service?.id])

  if (isLoading) {
    return (
      <QueryStatePanel kind="loading" title="Loading service" description="Getting your listing." />
    )
  }

  const backLink = (
    <Link to="/dashboard/services" className="button button--sm button--tertiary self-start">
      <ArrowLeft size={14} aria-hidden="true" /> Back to services
    </Link>
  )

  if (!service) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <h1 className="text-2xl font-semibold">{isError ? 'Service unavailable' : 'Service not found'}</h1>
        {isError ? (
          <QueryStatePanel kind="error" title="Could not load service" description="Try again to open your listing." onRetry={refetch} />
        ) : (
          <p className="text-default-500 text-sm">This listing may have been deleted.</p>
        )}
      </div>
    )
  }

  function handleSave() {
    setSaveAttempted(true)
    updateService.reset()
    if (invalidTitle || invalidIgn) return
    updateService.mutate({
      id: service!.id,
      patch: {
        title: title.trim(),
        description: description.trim() ? description.trim() : null,
        region: regionToQuery(region),
        price_divine:
          service!.service_type === 'five_way_host' || service!.service_type === 'gold_rota'
            ? parseNullableDivine(priceDivine)
            : service!.price_divine,
        poe_ign: ign.trim(),
        whisper_template: whisper.trim() ? whisper.trim() : null,
        visibility,
        is_active: isActive,
        mod_exclusions: modExclusions,
        details: details ?? service!.details,
      },
    })
  }

  function handleDelete() {
    if (!confirm(`Delete “${service!.title}”? This cannot be undone.`)) return
    deleteService.mutate(
      { id: service!.id, group_id: service!.group_id },
      {
        onSuccess: () => navigate({ to: '/dashboard/services' }),
      },
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-6 wrap-anywhere">
      {backLink}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 basis-full sm:flex-1">
          <h1 className="text-foreground text-2xl font-semibold">{service.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ServiceTypeChip
              type={service.service_type}
              className={SERVICE_HEADER_CHIP_CLASS_NAME}
            />
            <AvailabilityChip
              status={displayAvailability}
              className={SERVICE_HEADER_CHIP_CLASS_NAME}
            />
            <Chip size="sm" variant="soft" className={SERVICE_HEADER_CHIP_CLASS_NAME}>
              {service.visibility === 'public' ? 'Public' : 'Group only'}
            </Chip>
            {!service.is_active ? (
              <Chip
                size="sm"
                variant="soft"
                color="default"
                className={SERVICE_HEADER_CHIP_CLASS_NAME}
              >
                Inactive
              </Chip>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AvailabilitySelector
            availability={displayAvailability}
            isDisabled={availabilityPending}
            onChange={updateAvailability}
          />

          <Button
            size="sm"
            variant="danger-soft"
            onPress={handleDelete}
            isPending={deleteService.isPending}
            aria-label="Delete service"
          >
            <Trash2 size={14} />
            Delete
          </Button>
        </div>
      </div>

      {deleteService.isError ? (
        <p className="text-danger text-sm" role="alert">Could not delete this listing. Try again.</p>
      ) : null}

      <Card>
        <Card.Content className="gap-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-foreground text-sm font-medium">Listing details</p>
            <Button size="sm" onPress={handleSave} isPending={updateService.isPending}>
              Save changes
            </Button>
          </div>
          {updateService.isError ? (
            <p className="text-danger text-sm" role="alert">Could not save this listing. Your edits are still here.</p>
          ) : updateService.isSuccess ? (
            <p className="text-success text-sm" role="status">Changes saved.</p>
          ) : null}

          <FieldInput
            label="Title"
            value={title}
            onValueChange={setTitle}
            maxLength={80}
            isInvalid={saveAttempted && invalidTitle}
            errorMessage="Enter a title between 2 and 80 characters."
          />

          <FieldTextArea
            label="Description"
            value={description}
            onValueChange={setDescription}
            maxLength={1000}
            placeholder="Optional details for buyers"
            minRows={2}
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FieldInput
              label="PoE IGN"
              value={ign}
              onValueChange={setIgn}
              maxLength={32}
              isInvalid={saveAttempted && invalidIgn}
              errorMessage="Enter an in-game name up to 32 characters."
              description="The character buyers should contact."
            />
            <SelectField
              label="Region"
              selectedKey={region}
              onSelectionChange={(value) =>
                setRegion(regionFromSelection(new Set([value ?? 'Any'])))
              }
            >
              {REGION_OPTIONS.map((r) => (
                <ListBox.Item key={r} id={r} textValue={r}>
                  {r}
                </ListBox.Item>
              ))}
            </SelectField>
            <SelectField
              label="Visibility"
              selectedKey={visibility}
              onSelectionChange={(value) => {
                if (value === 'public' || value === 'group_only') setVisibility(value)
              }}
            >
              <ListBox.Item id="public" textValue="Public">
                Public
              </ListBox.Item>
              <ListBox.Item id="group_only" textValue="Group only">
                Group only
              </ListBox.Item>
            </SelectField>
            <SelectField
              label="Active"
              selectedKey={isActive ? 'active' : 'inactive'}
              onSelectionChange={(value) => setIsActive(value === 'active')}
              description={
                isActive
                  ? 'Listed for buyers'
                  : 'Hidden from public listings'
              }
            >
              <ListBox.Item id="active" textValue="Active">
                Active
              </ListBox.Item>
              <ListBox.Item id="inactive" textValue="Inactive">
                Inactive
              </ListBox.Item>
            </SelectField>
          </div>

          <FieldTextArea
            label="Custom whisper template"
            value={whisper}
            onValueChange={setWhisper}
            maxLength={400}
            placeholder="Leave blank to use the default whisper"
            minRows={1}
          />
        </Card.Content>
      </Card>

      {details ? (
        <ServiceSpecificEditor
          details={details}
          setDetails={setDetails}
          servicePrice={priceDivine}
          setServicePrice={setPriceDivine}
          modExclusions={modExclusions}
          setModExclusions={setModExclusions}
        />
      ) : null}

      <Card className="border-warning/30 bg-warning/5 border">
        <Card.Content className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-foreground text-sm font-medium">Whisper preview</p>
          </div>
          <WhisperCopyButton
            ign={ign.trim()}
            serviceType={service.service_type}
            title={title.trim() || null}
            whisperTemplate={whisper.trim() || null}
            size="md"
            showPreview
          />
        </Card.Content>
      </Card>

      <ServiceDetailSection
        service={{
          ...service,
          price_divine:
            service.service_type === 'five_way_host' || service.service_type === 'gold_rota'
              ? parseNullableDivine(priceDivine)
              : service.price_divine,
          mod_exclusions: modExclusions,
          details: details ?? service.details,
          group_name: '',
          group_game: 'poe1',
          group_league: '',
          owner_name: '',
        }}
      />
    </div>
  )
}

function ServiceSpecificEditor({
  details,
  setDetails,
  servicePrice,
  setServicePrice,
  modExclusions,
  setModExclusions,
}: {
  details: ServiceDetails
  setDetails: Dispatch<SetStateAction<ServiceDetails | null>>
  servicePrice: string
  setServicePrice: (value: string) => void
  modExclusions: string[]
  setModExclusions: Dispatch<SetStateAction<string[]>>
}) {
  return (
    <Card>
      <Card.Content className="gap-4 p-5">
        <p className="text-foreground text-sm font-medium">Service specifics</p>
        {details.service_type === 'boss_carry' ? (
          <BossCarryEditor details={details} setDetails={setDetails} />
        ) : null}
        {details.service_type === 'map_carry' ? (
          <MapCarryEditor
            details={details}
            setDetails={setDetails}
            modExclusions={modExclusions}
            setModExclusions={setModExclusions}
          />
        ) : null}
        {details.service_type === 'five_way_host' ? (
          <FiveWayEditor
            details={details}
            setDetails={setDetails}
            servicePrice={servicePrice}
            setServicePrice={setServicePrice}
          />
        ) : null}
        {details.service_type === 'gold_rota' ? (
          <GoldRotaEditor
            details={details}
            setDetails={setDetails}
            servicePrice={servicePrice}
            setServicePrice={setServicePrice}
            modExclusions={modExclusions}
            setModExclusions={setModExclusions}
          />
        ) : null}
      </Card.Content>
    </Card>
  )
}

function PriceInput({
  label,
  size,
  value,
  onChange,
}: {
  label: string
  size?: 'sm' | 'md' | 'lg'
  value: number | null | string
  onChange: (value: number | null) => void
}) {
  return (
    <FieldInput
      type="number"
      min={0}
      label={label}
      size={size}
      value={typeof value === 'string' ? value : toInputValue(value)}
      onValueChange={(next) => onChange(numberOrNull(next))}
    />
  )
}

function ModExclusionEditor({
  values,
  setValues,
}: {
  values: string[]
  setValues: Dispatch<SetStateAction<string[]>>
}) {
  const [draft, setDraft] = useState('')

  function addMod() {
    const trimmed = draft.trim()
    if (!trimmed) return
    setValues((current) => (current.includes(trimmed) ? current : [...current, trimmed]))
    setDraft('')
  }

  return (
    <div>
      <p className="text-foreground mb-2 text-sm font-medium">Map mods excluded</p>
      <div className="flex gap-2">
        <FieldInput
          value={draft}
          onValueChange={setDraft}
          placeholder="e.g. No regen"
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              addMod()
            }
          }}
        />
        <Button variant="tertiary" onPress={addMod}>
          Add
        </Button>
      </div>
      {values.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {values.map((mod) => (
            <Chip key={mod} size="sm" variant="soft" color="danger">
              {mod}
            </Chip>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function BossCarryEditor({
  details,
  setDetails,
}: {
  details: Extract<ServiceDetails, { service_type: 'boss_carry' }>
  setDetails: Dispatch<SetStateAction<ServiceDetails | null>>
}) {
  return (
    <div className="flex flex-col gap-4">
      <SelectField
        label="Map mode"
        selectedKey={details.map_mode}
        onSelectionChange={(value) => {
          if (!value) return
          setDetails({ ...details, map_mode: value as BossMapMode })
        }}
      >
        {Object.entries(BOSS_MAP_MODE_LABELS).map(([key, label]) => (
          <ListBox.Item key={key} id={key} textValue={label}>
            {label}
          </ListBox.Item>
        ))}
      </SelectField>

      <div className="flex items-center justify-between gap-3">
        <p className="text-foreground text-sm font-medium">Bosses & pricing</p>
        <Button
          size="sm"
          variant="tertiary"
          onPress={() =>
            setDetails({
              ...details,
              bosses: [...details.bosses, { name: '', price_divine: null, note: null }],
            })
          }
        >
          Add boss
        </Button>
      </div>

      {details.bosses.map((boss, index) => (
        <div
          key={index}
          className="border-divider/60 flex flex-col gap-2 border-t pt-3 first:border-t-0 first:pt-0"
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_2.25rem] sm:items-end">
            <FieldInput
              size="sm"
              className="min-w-0"
              label="Boss"
              value={boss.name}
              onValueChange={(value) => {
                const bosses = [...details.bosses]
                bosses[index] = { ...boss, name: value }
                setDetails({ ...details, bosses })
              }}
            />
            <PriceInput
              size="sm"
              label="Price (div)"
              value={boss.price_divine}
              onChange={(value) => {
                const bosses = [...details.bosses]
                bosses[index] = { ...boss, price_divine: value }
                setDetails({ ...details, bosses })
              }}
            />
            <Button
              isIconOnly
              size="sm"
              variant="danger-soft"
              className="h-9 min-h-9 w-9 min-w-9 self-end"
              onPress={() =>
                setDetails({
                  ...details,
                  bosses: details.bosses.filter((_, bossIndex) => bossIndex !== index),
                })
              }
              aria-label="Remove boss"
            >
              <Trash2 size={16} />
            </Button>
          </div>
          <FieldInput
            size="sm"
            label="Note (optional)"
            value={boss.note ?? ''}
            onValueChange={(value) => {
              const bosses = [...details.bosses]
              bosses[index] = { ...boss, note: value.trim() ? value : null }
              setDetails({ ...details, bosses })
            }}
          />
        </div>
      ))}
    </div>
  )
}

function MapCarryEditor({
  details,
  setDetails,
  modExclusions,
  setModExclusions,
}: {
  details: Extract<ServiceDetails, { service_type: 'map_carry' }>
  setDetails: Dispatch<SetStateAction<ServiceDetails | null>>
  modExclusions: string[]
  setModExclusions: Dispatch<SetStateAction<string[]>>
}) {
  return (
    <div className="flex flex-col gap-4">
      <SelectField
        label="Variant"
        selectedKey={details.variant}
        onSelectionChange={(value) => {
          if (value === 'valdo' || value === 'general') setDetails({ ...details, variant: value })
        }}
      >
        <ListBox.Item id="valdo" textValue="Valdo maps">
          Valdo maps
        </ListBox.Item>
        <ListBox.Item id="general" textValue="General maps">
          General maps
        </ListBox.Item>
      </SelectField>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <PriceInput
          label="Non-void min (div)"
          value={details.price_non_void_min_divine}
          onChange={(value) => setDetails({ ...details, price_non_void_min_divine: value })}
        />
        <PriceInput
          label="Non-void max (div)"
          value={details.price_non_void_max_divine}
          onChange={(value) => setDetails({ ...details, price_non_void_max_divine: value })}
        />
        <PriceInput
          label="Void min (div)"
          value={details.price_void_min_divine}
          onChange={(value) => setDetails({ ...details, price_void_min_divine: value })}
        />
        <PriceInput
          label="Void max (div)"
          value={details.price_void_max_divine}
          onChange={(value) => setDetails({ ...details, price_void_max_divine: value })}
        />
      </div>

      <FieldInput
        label="Refund policy"
        value={details.refund_policy ?? ''}
        onValueChange={(value) =>
          setDetails({ ...details, refund_policy: value.trim() ? value : null })
        }
      />

      <Separator />
      <MapExtrasEditor details={details} setDetails={setDetails} />
      <Separator />
      <ModExclusionEditor values={modExclusions} setValues={setModExclusions} />
    </div>
  )
}

function MapExtrasEditor({
  details,
  setDetails,
}: {
  details: Extract<ServiceDetails, { service_type: 'map_carry' }>
  setDetails: Dispatch<SetStateAction<ServiceDetails | null>>
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-foreground text-sm font-medium">Extras</p>
        <Button
          size="sm"
          variant="tertiary"
          onPress={() =>
            setDetails({
              ...details,
              extras: [...details.extras, { label: '', price_divine: null }],
            })
          }
        >
          Add extra
        </Button>
      </div>
      {details.extras.map((extra, index) => (
        <div key={index} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px_auto]">
          <FieldInput
            label="Label"
            value={extra.label}
            onValueChange={(value) => {
              const extras = [...details.extras]
              extras[index] = { ...extra, label: value }
              setDetails({ ...details, extras })
            }}
          />
          <PriceInput
            label="Price (div)"
            value={extra.price_divine}
            onChange={(value) => {
              const extras = [...details.extras]
              extras[index] = { ...extra, price_divine: value }
              setDetails({ ...details, extras })
            }}
          />
          <Button
            isIconOnly
            variant="danger-soft"
            className="self-end"
            onPress={() =>
              setDetails({
                ...details,
                extras: details.extras.filter((_, extraIndex) => extraIndex !== index),
              })
            }
            aria-label="Remove extra"
          >
            <Trash2 size={16} />
          </Button>
        </div>
      ))}
    </div>
  )
}

function FiveWayEditor({
  details,
  setDetails,
  servicePrice,
  setServicePrice,
}: {
  details: Extract<ServiceDetails, { service_type: 'five_way_host' }>
  setDetails: Dispatch<SetStateAction<ServiceDetails | null>>
  servicePrice: string
  setServicePrice: (value: string) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FieldInput
          type="number"
          min={0}
          label="Bundle price (div)"
          value={servicePrice}
          onValueChange={setServicePrice}
        />
        <FieldInput
          type="number"
          min={1}
          label="Runs per bundle"
          value={String(details.runs_per_bundle)}
          onValueChange={(value) =>
            setDetails({ ...details, runs_per_bundle: numberOrDefault(value, 1) })
          }
        />
        <PriceInput
          label="Guaranteed kills"
          value={details.guaranteed_kills}
          onChange={(value) => setDetails({ ...details, guaranteed_kills: value })}
        />
        <PriceInput
          label="Aurabot resist %"
          value={details.aurabot_resist_pct}
          onChange={(value) => setDetails({ ...details, aurabot_resist_pct: value })}
        />
      </div>

      <Separator />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
        <PartySlotEditor
          label="Clients"
          current={details.party.clients.current}
          capacity={details.party.clients.capacity}
          onChange={(slot) =>
            setDetails({ ...details, party: { ...details.party, clients: slot } })
          }
        />
        <FixedRoleCheckbox
          label="Resetter present"
          checked={details.party.resetter.current > 0}
          onChange={(checked) =>
            setDetails({
              ...details,
              party: { ...details.party, resetter: { current: checked ? 1 : 0, capacity: 1 } },
            })
          }
        />
        <FixedRoleCheckbox
          label="Aurabot present"
          checked={details.party.aurabot.current > 0}
          onChange={(checked) =>
            setDetails({
              ...details,
              party: { ...details.party, aurabot: { current: checked ? 1 : 0, capacity: 1 } },
            })
          }
        />
      </div>

      <Separator />
      <StringListEditor
        title="Guarantees"
        values={details.extra_guarantees}
        placeholder="e.g. Free run if I die before 1 min"
        onChange={(values) => setDetails({ ...details, extra_guarantees: values })}
      />
    </div>
  )
}

function GoldRotaEditor({
  details,
  setDetails,
  servicePrice,
  setServicePrice,
  modExclusions,
  setModExclusions,
}: {
  details: Extract<ServiceDetails, { service_type: 'gold_rota' }>
  setDetails: Dispatch<SetStateAction<ServiceDetails | null>>
  servicePrice: string
  setServicePrice: (value: string) => void
  modExclusions: string[]
  setModExclusions: Dispatch<SetStateAction<string[]>>
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FieldInput
          type="number"
          min={0}
          label="Price (div)"
          value={servicePrice}
          onValueChange={setServicePrice}
        />
        <FieldInput
          label="Maps per run"
          value={details.maps_per_run ?? ''}
          onValueChange={(value) =>
            setDetails({ ...details, maps_per_run: value.trim() ? value : null })
          }
        />
        <PriceInput
          label="Gold guaranteed (millions)"
          value={details.gold_guaranteed_millions}
          onChange={(value) => setDetails({ ...details, gold_guaranteed_millions: value })}
        />
      </div>

      <PartySlotEditor
        label="Party fill"
        current={details.party.current}
        capacity={details.party.capacity}
        onChange={(slot) => setDetails({ ...details, party: slot })}
      />

      <FieldInput
        label="Trade only with"
        value={details.trade_only_with ?? ''}
        onValueChange={(value) =>
          setDetails({ ...details, trade_only_with: value.trim() ? value : null })
        }
      />
      <FieldTextArea
        label="Extra info"
        value={details.extra_info ?? ''}
        onValueChange={(value) =>
          setDetails({ ...details, extra_info: value.trim() ? value : null })
        }
        minRows={2}
      />

      <Separator />
      <ModExclusionEditor values={modExclusions} setValues={setModExclusions} />
    </div>
  )
}

function PartySlotEditor({
  label,
  current,
  capacity,
  onChange,
}: {
  label: string
  current: number
  capacity: number
  onChange: (slot: { current: number; capacity: number }) => void
}) {
  return (
    <div>
      <p className="text-default-400 mb-1 text-xs font-medium tracking-wide uppercase">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        <FieldInput
          type="number"
          min={0}
          label="Current"
          value={String(current)}
          onValueChange={(value) => onChange({ current: numberOrDefault(value, 0), capacity })}
        />
        <FieldInput
          type="number"
          min={1}
          label="Capacity"
          value={String(capacity)}
          onValueChange={(value) => onChange({ current, capacity: numberOrDefault(value, 1) })}
        />
      </div>
    </div>
  )
}

function FixedRoleCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <Checkbox
      id={`service-role-${label.toLowerCase().replace(/\s+/g, '-')}`}
      isSelected={checked}
      onChange={onChange}
    >
      <Checkbox.Control>
        <Checkbox.Indicator />
      </Checkbox.Control>
      <Checkbox.Content>
        <Label>{label}</Label>
      </Checkbox.Content>
    </Checkbox>
  )
}

function StringListEditor({
  title,
  values,
  placeholder,
  onChange,
}: {
  title: string
  values: string[]
  placeholder: string
  onChange: (values: string[]) => void
}) {
  const [draft, setDraft] = useState('')

  function addValue() {
    const trimmed = draft.trim()
    if (!trimmed) return
    onChange([...values, trimmed])
    setDraft('')
  }

  return (
    <div>
      <p className="text-foreground mb-2 text-sm font-medium">{title}</p>
      <div className="flex gap-2">
        <FieldInput
          value={draft}
          onValueChange={setDraft}
          placeholder={placeholder}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              addValue()
            }
          }}
        />
        <Button variant="tertiary" onPress={addValue}>
          Add
        </Button>
      </div>
      {values.length > 0 ? (
        <div className="mt-2 flex flex-col gap-2">
          {values.map((value, index) => (
            <div
              key={`${value}-${index}`}
              className="rounded-medium bg-default-50/50 text-default-600 flex items-center justify-between px-3 py-2 text-sm"
            >
              <span>{value}</span>
              <Button
                isIconOnly
                size="sm"
                variant="danger-soft"
                onPress={() => onChange(values.filter((_, valueIndex) => valueIndex !== index))}
                aria-label="Remove item"
              >
                <Trash2 size={14} />
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
