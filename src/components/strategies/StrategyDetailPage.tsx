import { isThreadName } from '../../lib/strategy-threads'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@heroui/react/button'
import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { ComboBox } from '@heroui/react/combo-box'
import { Description } from '@heroui/react/description'
import { FieldError } from '@heroui/react/field-error'
import { Input } from '@heroui/react/input'
import { Label } from '@heroui/react/label'
import { Spinner } from '@heroui/react/spinner'
import {
  ArrowLeft,
  Check,
  Coins,
  ExternalLink,
  Info,
  Lock,
  Plus,
  Trash2,
  Unlock,
} from 'lucide-react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useNinjaPrices } from '../../hooks/useNinjaPrices'
import {
  useFieldArray,
  useForm,
  useWatch,
  Controller,
  type Control,
  type FieldErrors,
  type SubmitHandler,
} from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Route } from '../../routes/dashboard/strategies/$strategyId'
import {
  useStrategy,
  useUpdateStrategy,
  useDeleteStrategy,
  type Strategy,
  type StrategyVisibility,
} from '../../hooks/useStrategies'
import {
  useGroupMembers,
  useMyGroupRole,
  useCurrentStrategyId,
  useSetCurrentStrategy,
  useActiveGroupContext,
} from '../../hooks/useGroups'
import {
  useClearStrategySnapshots,
  useSetGroupHistoryStrategyLink,
  useStrategyLinkedSnapshots,
} from '../../hooks/useSnapshots'
import { useStrategyHourlyEstimates } from '../../hooks/useStrategyEconomy'
import { useGroupStore } from '../../store/group-store'
import { useThreadData, type ThreadEntry } from '../../hooks/useThreadData'
import { useCurrencyStore } from '../../store/currency-store'
import { DIFFICULTY_OPTIONS, MAP_REQ_FIELDS as MAP_REQ_FIELDS_CONST } from '../../lib/constants'
import { DetailPageSkeleton } from '../layout/Skeletons'
import { formatCurrencyAmount } from '../../lib/utils'
import { StrategyLinkedSnapshotsModal } from './StrategyLinkedSnapshotsModal'
import {
  FieldInput,
  FieldTextArea,
  ListBox,
  NativeCheckbox,
  SelectField,
} from '../ui/heroui-native'

type NativeChipColor = 'default' | 'accent' | 'success' | 'warning' | 'danger'

function toNativeChipColor(color: string): NativeChipColor {
  if (color === 'primary' || color === 'secondary') return 'accent'
  return color as NativeChipColor
}
const numericPct = z.preprocess(
  (v) => (v === '' || v == null ? null : Number(v)),
  z.number().min(0).nullable().optional(),
)

const threadAlternativeSchema = z.object({
  name: z.string().trim().refine(isThreadName, 'Choose a Thread'),
})

const threadSchema = z.object({
  name: z.string().trim().refine(isThreadName, 'Choose a Thread'),
  quantity: z.preprocess((v) => Number(v), z.number().int().min(1).max(8)),
  required: z.boolean(),
  alternatives: z.array(threadAlternativeSchema),
})

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(64),
  description: z.string().max(1000).optional().nullable(),
  difficulty: z.enum(['easy', 'normal', 'hard']),
  map_trade_link: z.string().optional().nullable(),
  atlas_tree_url: z.string().optional().nullable(),
  map_cost: z.preprocess(
    (v) => (v === '' || v == null ? null : Number(v)),
    z.number().int().min(0).nullable().optional(),
  ),
  map_requirements: z.object({
    atlas_drops: numericPct,
    item_rarity: numericPct,
    pack_size: numericPct,
    more_threads: numericPct,
    more_currency: numericPct,
    more_unique: numericPct,
  }),
  threads: z.array(threadSchema).refine((rows) => rows.reduce((sum, row) => sum + row.quantity, 0) <= 8, 'Spend at most eight Threads per map'),
})

type FormInput = z.input<typeof schema>
type FormValues = z.output<typeof schema>

const DEFAULT_FORM_VALUES: FormInput = {
  name: '',
  description: '',
  difficulty: 'normal',
  map_trade_link: '',
  atlas_tree_url: '',
  map_cost: null,
  map_requirements: {
    atlas_drops: null,
    item_rarity: null,
    pack_size: null,
    more_threads: null,
    more_currency: null,
    more_unique: null,
  },
  threads: [],
}

function buildDefaults(s: Strategy): FormValues {
  return {
    name: s.name,
    description: s.description ?? '',
    difficulty: s.difficulty ?? 'normal',
    map_trade_link: s.map_trade_link ?? '',
    atlas_tree_url: s.atlas_tree_url ?? '',
    map_cost: s.map_cost ?? null,
    map_requirements: {
      atlas_drops: s.map_requirements?.atlas_drops ?? null,
      item_rarity: s.map_requirements?.item_rarity ?? null,
      pack_size: s.map_requirements?.pack_size ?? null,
      more_threads: s.map_requirements?.more_threads ?? null,
      more_currency: s.map_requirements?.more_currency ?? null,
      more_unique: s.map_requirements?.more_unique ?? null,
    },
    threads: s.threads.map((sc) => ({
      ...sc,
      alternatives: sc.alternatives.map((alternative) => ({ ...alternative })),
    })),
  }
}

const MAP_REQ_FIELDS = MAP_REQ_FIELDS_CONST as {
  key: keyof FormValues['map_requirements']
  label: string
}[]

function formatChaosValue(chaos: number): string {
  if (chaos > 0 && chaos < 1) return chaos.toFixed(1)
  return Math.round(chaos).toLocaleString()
}

function getReadOnlyFieldClassName(isReadOnly: boolean) {
  if (!isReadOnly) return undefined
  return 'opacity-90'
}

function toFieldStringValue(value: unknown): string {
  return value == null ? '' : String(value)
}

function ThreadAutocompleteField({
  value,
  onChange,
  isReadOnly,
  isInvalid,
  errorMessage,
  threadData,
  inputRef,
  autoFocus,
  className,
}: {
  value: string
  onChange: (value: string) => void
  isReadOnly: boolean
  isInvalid?: boolean
  errorMessage?: string
  threadData: ThreadEntry[]
  inputRef?: (node: HTMLInputElement | null) => void
  autoFocus?: boolean
  className?: string
}) {
  const selectedThread = threadData.find((thread) => thread.name === value)
  const filteredThreads = threadData
    .filter((thread) => thread.name.toLowerCase().includes(value.toLowerCase()))
    .slice(0, 30)

  return (
    <ComboBox
      allowsCustomValue
      allowsEmptyCollection
      aria-label="Thread name"
      className={className}
      inputValue={value}
      isInvalid={isInvalid}
      isReadOnly={isReadOnly}
      selectedKey={selectedThread?.name ?? null}
      onInputChange={isReadOnly ? undefined : onChange}
      onSelectionChange={(key) => {
        if (key != null && !isReadOnly) {
          onChange(String(key))
        }
      }}
    >
      <ComboBox.InputGroup className="min-h-9">
        <Input ref={inputRef} autoFocus={autoFocus} placeholder="Thread name" />
        <ComboBox.Trigger />
      </ComboBox.InputGroup>
      <ComboBox.Popover className="!max-h-80 overflow-y-auto">
        <ListBox>
          {filteredThreads.map((thread) => (
            <ListBox.Item key={thread.name} id={thread.name} textValue={thread.name}>
              {thread.icon ? (
                <img
                  src={thread.icon}
                  alt=""
                  className="h-8 w-8 shrink-0 bg-transparent object-contain"
                  loading="lazy"
                />
              ) : (
                <div
                  className="bg-default-100 h-8 w-8 shrink-0 rounded-small"
                  aria-hidden="true"
                />
              )}
              <div className="flex min-w-0 flex-col">
                <Label>{thread.name}</Label>
                <Description>{thread.chaosValue == null ? 'Price unavailable' : `${formatChaosValue(thread.chaosValue)}c`}</Description>
              </div>
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </ComboBox.Popover>
      {isInvalid && errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
    </ComboBox>
  )
}

function ThreadAlternativesField({
  control,
  threadIndex,
  canEditContent,
  errors,
  threadData,
  threadIconMap,
  threadPriceMap,
}: {
  control: Control<FormInput, unknown, FormValues>
  threadIndex: number
  canEditContent: boolean
  errors: FieldErrors<FormInput>
  threadData: ThreadEntry[]
  threadIconMap: Map<string, string | null>
  threadPriceMap: Map<string, number | null>
}) {
  const {
    fields: alternativeFields,
    append: appendAlternative,
    remove: removeAlternative,
  } = useFieldArray({
    control,
    name: `threads.${threadIndex}.alternatives` as const,
  })
  const watchedAlternatives =
    useWatch({
      control,
      name: `threads.${threadIndex}.alternatives` as const,
    }) ?? []
  const quantity =
    Number(
      useWatch({
        control,
        name: `threads.${threadIndex}.quantity` as const,
      }) ?? 1,
    ) || 1

  if (alternativeFields.length === 0 && !canEditContent) return null

  return (
    <div className="rounded-large border-divider bg-default-50/60 mt-3 ml-12 border border-dashed p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-default-500 text-xs font-medium tracking-wider uppercase">
            Alternatives
          </p>
          <p className="text-default-400 text-xs">
            Fallback threads for this slot. Alternatives use the same quantity.
          </p>
        </div>
        {canEditContent ? (
          <Button
            size="sm"
            variant="tertiary"
            type="button"
            onPress={() => appendAlternative({ name: '' })}
          >
            Add alternative
          </Button>
        ) : null}
      </div>

      {alternativeFields.length === 0 ? (
        <p className="text-default-400 mt-3 text-xs">No alternatives added for this thread.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {alternativeFields.map((field, alternativeIndex) => {
            const alternativeName = watchedAlternatives?.[alternativeIndex]?.name ?? ''
            const alternativeIcon = threadIconMap.get(alternativeName)
            const unitPrice = threadPriceMap.get(alternativeName) ?? null
            const rowTotal = unitPrice != null ? unitPrice * quantity : null
            const error =
              errors.threads?.[threadIndex]?.alternatives?.[alternativeIndex]?.name?.message

            return (
              <div key={field.id} className="flex items-center gap-2">
                {alternativeIcon ? (
                  <img
                    src={alternativeIcon}
                    alt={alternativeName}
                    className="h-8 w-8 bg-transparent object-contain"
                  />
                ) : (
                  <div className="h-8 w-8 bg-transparent" aria-hidden="true" />
                )}
                <Controller
                  control={control}
                  name={`threads.${threadIndex}.alternatives.${alternativeIndex}.name`}
                  render={({ field: formField }) => (
                    <ThreadAutocompleteField
                      value={formField.value ?? ''}
                      onChange={formField.onChange}
                      isReadOnly={!canEditContent}
                      isInvalid={!!error}
                      errorMessage={typeof error === 'string' ? error : undefined}
                      threadData={threadData}
                      className="flex-1"
                    />
                  )}
                />
                <span className="min-w-20 shrink-0 px-2 text-right tabular-nums">
                  {rowTotal != null ? (
                    <>
                      <span className="text-foreground text-sm font-semibold">
                        ~ {formatChaosValue(rowTotal)}
                      </span>
                      <span className="text-foreground ml-0.5 text-sm font-semibold">c</span>
                    </>
                  ) : (
                    <span className="text-default-300 text-xs">-</span>
                  )}
                </span>
                {canEditContent ? (
                  <Button
                    isIconOnly
                    size="sm"
                    variant="tertiary"
                    type="button"
                    className="text-default-400 hover:text-danger shrink-0"
                    aria-label="Remove alternative Thread"
                      onPress={() => removeAlternative(alternativeIndex)}
                  >
                    <Trash2 size={14} />
                  </Button>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function StrategyDetailPage() {
  const { strategyId } = Route.useParams()
  const navigate = useNavigate()
  const activeGroupId = useGroupStore((s) => s.activeGroupId)

  const { data: strategy, isLoading } = useStrategy(strategyId)
  const { data: members } = useGroupMembers(activeGroupId)
  const { game, league: activeLeague, capabilities } = useActiveGroupContext()
  const { data: strategyEconomy } = useStrategyHourlyEstimates(activeGroupId)
  const { data: linkedSnapshots = [] } = useStrategyLinkedSnapshots(activeGroupId, strategyId)
  const myRole = useMyGroupRole(activeGroupId)
  const canEdit = myRole === 'admin' || myRole === 'editor'
  const isAdmin = myRole === 'admin'

  const { mutate: saveStrategy, isPending: savingForm, error: saveError } = useUpdateStrategy()
  const { mutate: updateQuickAction } = useUpdateStrategy()
  const { mutate: deleteStrategy, isPending: deleting } = useDeleteStrategy()
  const { mutate: clearStrategySnapshots, isPending: clearingSnapshots } =
    useClearStrategySnapshots()
  const { mutateAsync: setGroupHistoryStrategyLink, isPending: updatingLinkedSnapshots } =
    useSetGroupHistoryStrategyLink()
  const currentStrategyId = useCurrentStrategyId(activeGroupId)
  const { mutate: setCurrentStrategy } = useSetCurrentStrategy()
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [confirmingReset, setConfirmingReset] = useState(false)
  const [linkedSnapshotsOpen, setLinkedSnapshotsOpen] = useState(false)
  const [saveFeedback, setSaveFeedback] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [optimisticVisibility, setOptimisticVisibility] = useState<StrategyVisibility | null>(null)
  const [optimisticAdminLocked, setOptimisticAdminLocked] = useState<boolean | null>(null)
  const [optimisticCurrentStrategyId, setOptimisticCurrentStrategyId] = useState<
    string | null | undefined
  >(undefined)
  const [visibilityPending, setVisibilityPending] = useState(false)
  const [adminLockPending, setAdminLockPending] = useState(false)
  const [currentStrategyPending, setCurrentStrategyPending] = useState(false)
  const { data: threadData = [] } = useThreadData(activeLeague, game ?? 'poe1')
  const threadPriceMap = new Map(threadData.map((s) => [s.name, s.chaosValue]))
  const threadIconMap = new Map(threadData.map((s) => [s.name, s.icon]))
  const display = useCurrencyStore((s) => s.display)
  const { data: ninjaData } = useNinjaPrices(activeLeague, game ?? 'poe1')
  const divinePrice = ninjaData?.divinePrice ?? null

  const memberByUser = Object.fromEntries((members ?? []).map((m) => [m.user.id, m.user]))

  const {
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULT_FORM_VALUES,
  })
  const isDirtyRef = useRef(isDirty)
  const threadInputRefs = useRef<Array<HTMLInputElement | null>>([])
  const pendingThreadFocusIndexRef = useRef<number | null>(null)
  const [pendingThreadFocusIndex, setPendingThreadFocusIndex] = useState<number | null>(null)

  const {
    fields: threadFields,
    append: appendThread,
    remove: removeThread,
  } = useFieldArray({ control, name: 'threads' })

  const atlasUrl = watch('atlas_tree_url')
  const mapTradeUrl = watch('map_trade_link')
  const watchedThreads = watch('threads')
  const watchedMapCost = watch('map_cost')
  const hasThreadAlternatives = (watchedThreads ?? []).some(
    (thread) => (thread.alternatives?.length ?? 0) > 0,
  )
  const fmt = (chaos: number): string => formatCurrencyAmount(chaos, divinePrice == null ? 'chaos' : display, divinePrice ?? 1)
  const isSubscribed = !!strategy?.source_strategy_id
  const displayVisibility = optimisticVisibility ?? strategy?.visibility ?? 'group_only'
  const displayAdminLocked = optimisticAdminLocked ?? strategy?.admin_locked ?? false
  const displayCurrentStrategyId =
    optimisticCurrentStrategyId === undefined ? currentStrategyId : optimisticCurrentStrategyId
  const isCurrentStrategy = strategy?.id === displayCurrentStrategyId
  const canEditContent = canEdit && !isSubscribed && (!displayAdminLocked || isAdmin)
  const canManageStrategy = canEdit
  const canToggleAdminLock = isAdmin && !isSubscribed
  const canToggleVisibility = canEditContent
  const readOnlyFieldClassName = getReadOnlyFieldClassName(isSubscribed)
  const showsPoe1PlanningFields = !!capabilities?.supportsAtlasTree

  useEffect(() => {
    isDirtyRef.current = isDirty
  }, [isDirty])

  useEffect(() => {
    if (!strategy) return

    reset(buildDefaults(strategy), isDirtyRef.current ? { keepDirtyValues: true } : undefined)
  }, [strategy, reset])

  useEffect(() => {
    if (isDirty && saveFeedback === 'saved') {
      setSaveFeedback('idle')
    }
  }, [isDirty, saveFeedback])

  useEffect(() => {
    setOptimisticVisibility(null)
  }, [strategy?.visibility])

  useEffect(() => {
    setOptimisticAdminLocked(null)
  }, [strategy?.admin_locked])

  useEffect(() => {
    setOptimisticCurrentStrategyId(undefined)
  }, [currentStrategyId, activeGroupId])

  useEffect(() => {
    const pendingIndex = pendingThreadFocusIndexRef.current
    if (pendingIndex == null) return
    if (!threadFields[pendingIndex]) return

    const frame = requestAnimationFrame(() => {
      const input = threadInputRefs.current[pendingIndex]
      input?.focus()
      input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
      pendingThreadFocusIndexRef.current = null
      setPendingThreadFocusIndex(null)
    })

    return () => cancelAnimationFrame(frame)
  }, [threadFields])

  const onSubmit: SubmitHandler<FormValues> = (values) => {
    if (!strategy || !canEditContent) return
    setSaveFeedback('saving')
    saveStrategy(
      {
        id: strategy.id,
        group_id: strategy.group_id,
        name: values.name,
        description: values.description?.trim() ? values.description.trim() : null,
        colour: strategy.colour,
        difficulty: values.difficulty,
        map_trade_link: values.map_trade_link || null,
        atlas_tree_url: values.atlas_tree_url || null,
        map_cost: values.map_cost ?? null,
        map_requirements: { ...strategy.map_requirements, ...values.map_requirements },
        threads: values.threads,
      },
      {
        onSuccess: (data) => {
          reset(buildDefaults(data))
          setSaveFeedback('saved')
        },
        onError: () => {
          setSaveFeedback('idle')
        },
      },
    )
  }

  const unlinkLinkedSnapshot = async (groupHistoryId: string) => {
    await setGroupHistoryStrategyLink({
      groupHistoryId,
      strategyId: null,
    })
  }

  const handleLinkedSnapshotsSave = async (removedGroupHistoryIds: string[]) => {
    if (removedGroupHistoryIds.length === 0) {
      setLinkedSnapshotsOpen(false)
      return
    }

    await Promise.all(removedGroupHistoryIds.map(unlinkLinkedSnapshot))

    setLinkedSnapshotsOpen(false)
  }

  if (isLoading) {
    return <DetailPageSkeleton />
  }

  if (!strategy) {
    return (
      <div className="flex flex-col gap-4">
        <Link to="/dashboard/strategies" className="self-start">
          <Button variant="tertiary" size="sm">
            <ArrowLeft size={14} />
            Back to Strategies
          </Button>
        </Link>
        <p className="text-default-400 text-sm">Strategy not found.</p>
      </div>
    )
  }

  const strategyRate = strategyEconomy[strategy.id]
  const rateColor = !strategyRate
    ? 'default'
    : strategyRate.chaosPerHour > 0
      ? 'success'
      : strategyRate.chaosPerHour < 0
        ? 'danger'
        : 'default'
  const visibilityChipColor = isSubscribed
    ? strategy.subscription_state === 'frozen'
      ? 'warning'
      : 'success'
    : displayVisibility === 'public'
      ? 'secondary'
      : 'default'

  const runQuickUpdate = (
    overrides: Partial<Pick<Strategy, 'visibility' | 'admin_locked'>>,
    handlers: {
      onOptimistic: () => void
      onRollback: () => void
      onSettled: () => void
    },
  ) => {
    handlers.onOptimistic()
    updateQuickAction(
      {
        id: strategy.id,
        group_id: strategy.group_id,
        name: strategy.name,
        description: strategy.description,
        colour: strategy.colour,
        difficulty: strategy.difficulty,
        map_trade_link: strategy.map_trade_link,
        atlas_tree_url: strategy.atlas_tree_url,
        map_cost: strategy.map_cost,
        map_requirements: strategy.map_requirements,
        threads: strategy.threads,
        ...overrides,
      },
      {
        onError: () => {
          handlers.onRollback()
          handlers.onSettled()
        },
        onSuccess: () => {
          handlers.onSettled()
        },
      },
    )
  }

  return (
    <>
      <StrategyLinkedSnapshotsModal
        isOpen={linkedSnapshotsOpen}
        onClose={() => setLinkedSnapshotsOpen(false)}
        strategyName={strategy.name}
        linkedSnapshots={linkedSnapshots}
        memberByUser={memberByUser}
        fmt={fmt}
        isSaving={updatingLinkedSnapshots}
        onSave={handleLinkedSnapshotsSave}
        onUnlink={unlinkLinkedSnapshot}
      />

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="flex flex-col gap-6">
          {/* Top nav row with Save button */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Link to="/dashboard/strategies">
              <Button
                variant="tertiary"
                size="sm"
                className="-ml-2"
                type="button"
                onPress={() => setConfirmingDelete(false)}
              >
                <ArrowLeft size={14} />
                Back to Strategies
              </Button>
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              {canManageStrategy && (
                <Button
                  size="sm"
                  variant={isCurrentStrategy ? 'tertiary' : 'secondary'}
                  type="button"
                  isPending={currentStrategyPending}
                  className="min-w-32"
                  onPress={() => {
                    const nextStrategyId = isCurrentStrategy ? null : strategy.id
                    setOptimisticCurrentStrategyId(nextStrategyId)
                    setCurrentStrategyPending(true)
                    setCurrentStrategy(
                      {
                        groupId: activeGroupId!,
                        strategyId: nextStrategyId,
                      },
                      {
                        onError: () => {
                          setOptimisticCurrentStrategyId(undefined)
                          setCurrentStrategyPending(false)
                        },
                        onSuccess: () => {
                          setCurrentStrategyPending(false)
                        },
                      },
                    )
                  }}
                >
                  {({ isPending }) => (
                    <>
                      {isPending ? <Spinner color="current" size="sm" /> : null}
                      {isCurrentStrategy ? 'Active Strategy' : 'Set as Active'}
                    </>
                  )}
                </Button>
              )}
              {canToggleVisibility && (
                <Button
                  size="sm"
                  variant={displayVisibility === 'public' ? 'tertiary' : 'secondary'}
                  type="button"
                  isPending={visibilityPending}
                  className="min-w-28"
                  onPress={() => {
                    const nextVisibility: StrategyVisibility =
                      displayVisibility === 'public' ? 'group_only' : 'public'
                    runQuickUpdate(
                      { visibility: nextVisibility },
                      {
                        onOptimistic: () => {
                          setOptimisticVisibility(nextVisibility)
                          setVisibilityPending(true)
                        },
                        onRollback: () => {
                          setOptimisticVisibility(null)
                        },
                        onSettled: () => {
                          setVisibilityPending(false)
                        },
                      },
                    )
                  }}
                >
                  {({ isPending }) => (
                    <>
                      {isPending ? <Spinner color="current" size="sm" /> : null}
                      {displayVisibility === 'public' ? 'Public' : 'Make Public'}
                    </>
                  )}
                </Button>
              )}
              {canToggleAdminLock && (
                <Button
                  isIconOnly
                  size="sm"
                  variant={displayAdminLocked ? 'tertiary' : 'secondary'}
                  type="button"
                  isPending={adminLockPending}
                  aria-label={displayAdminLocked ? 'Disable admin lock' : 'Enable admin lock'}
                  className={displayAdminLocked ? 'text-warning' : ''}
                  onPress={() => {
                    const nextAdminLocked = !displayAdminLocked
                    runQuickUpdate(
                      { admin_locked: nextAdminLocked },
                      {
                        onOptimistic: () => {
                          setOptimisticAdminLocked(nextAdminLocked)
                          setAdminLockPending(true)
                        },
                        onRollback: () => {
                          setOptimisticAdminLocked(null)
                        },
                        onSettled: () => {
                          setAdminLockPending(false)
                        },
                      },
                    )
                  }}
                >
                  {({ isPending }) =>
                    isPending ? (
                      <Spinner color="current" size="sm" />
                    ) : displayAdminLocked ? (
                      <Lock size={14} />
                    ) : (
                      <Unlock size={14} />
                    )
                  }
                </Button>
              )}
              {canEditContent && saveError && (
                <p className="text-danger text-xs">
                  Failed to save: {(saveError as Error).message}
                </p>
              )}
              {canManageStrategy &&
                (confirmingDelete ? (
                  <>
                    <span className="text-default-500 text-xs">
                      {isSubscribed ? 'Remove this subscription?' : 'Delete this strategy?'}
                    </span>
                    <Button
                      size="sm"
                      type="button"
                      isPending={deleting}
                      onPress={() =>
                        deleteStrategy(
                          { id: strategy.id, group_id: strategy.group_id },
                          { onSuccess: () => navigate({ to: '/dashboard/strategies' }) },
                        )
                      }
                      variant="danger"
                    >
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
                      {isSubscribed ? 'Unsubscribe' : 'Remove'}
                    </Button>
                    {canEditContent && (savingForm || isDirty) ? (
                      <Button
                        type="submit"
                        size="sm"
                        isPending={savingForm}
                        isDisabled={!isDirty}
                        className="min-w-32 transition-all duration-200"
                      >
                        {({ isPending }) =>
                          isPending ? (
                            <>
                              <Spinner color="current" size="sm" />
                              Saving...
                            </>
                          ) : (
                            'Save Changes'
                          )
                        }
                      </Button>
                    ) : canEditContent && saveFeedback === 'saved' ? (
                      <div
                        aria-label="Saved"
                        className="border-success/40 bg-success/10 text-success flex min-w-32 items-center justify-center rounded-md border px-3 py-2 transition-all duration-200"
                      >
                        <Check size={14} className="animate-in zoom-in-50 fade-in duration-200" />
                      </div>
                    ) : null}
                  </>
                ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isSubscribed ? (
              <>
                <Chip size="sm" variant="soft" color={toNativeChipColor(visibilityChipColor)}>
                  {strategy.subscription_state === 'frozen'
                    ? 'Frozen subscription'
                    : 'Live subscription'}
                </Chip>
                {strategy.source_group_name ? (
                  <Chip size="sm" variant="soft">
                    Source: {strategy.source_group_name}
                  </Chip>
                ) : null}
                <Chip size="sm" variant="soft">
                  Content is publisher-managed
                </Chip>
              </>
            ) : (
              <Chip size="sm" variant="soft" color={toNativeChipColor(visibilityChipColor)}>
                {displayVisibility === 'public' ? 'Public strategy' : 'Private strategy'}
              </Chip>
            )}
            {displayAdminLocked ? (
              <Chip size="sm" variant="soft" color="warning">
                Admin locked
              </Chip>
            ) : null}
          </div>

          {isSubscribed ? (
            <Card>
              <Card.Content className="gap-4 p-5 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Info size={16} className="text-warning shrink-0" />
                    <p className="text-foreground text-sm font-medium">
                      Publisher-managed strategy copy
                    </p>
                  </div>
                  <p className="text-default-500 mt-2 text-sm leading-relaxed">
                    This strategy belongs to
                    <span className="text-foreground font-medium">
                      {strategy.source_group_name
                        ? ` ${strategy.source_group_name}`
                        : ' another group'}
                    </span>
                    . Your group can keep using it for active strategy tracking, but the strategy
                    content stays read-only here.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                  <Chip size="sm" variant="soft" color="warning">
                    Content locked
                  </Chip>
                  <Chip
                    size="sm"
                    variant="soft"
                    color={strategy.subscription_state === 'frozen' ? 'warning' : 'success'}
                  >
                    {strategy.subscription_state === 'frozen'
                      ? 'Updates paused'
                      : 'Updates follow publisher'}
                  </Chip>
                </div>
              </Card.Content>
            </Card>
          ) : null}

          {showsPoe1PlanningFields && strategy.scarabs.length > 0 && (
            <Card><Card.Content className="p-4">
              <h2 className="text-sm font-semibold">Legacy Scarab reference</h2>
              <p className="text-default-400 text-sm">Scarabs were removed in 3.30. Your saved selections remain here; choose Threads below for a new setup.</p>
              <ul className="mt-2 text-sm">{strategy.scarabs.map((scarab, index) => (
                <li key={index}>{scarab.quantity} × {scarab.name}{scarab.required ? '' : ' (optional)'}{scarab.alternatives.length ? `; alternatives: ${scarab.alternatives.map((a) => a.name).join(', ')}` : ''}</li>
              ))}</ul>
            </Card.Content></Card>
          )}
          {errors.threads?.root?.message && <p role="alert" className="text-danger text-sm">{errors.threads.root.message}</p>}
          {/* Total estimated cost summary */}
          {(() => {
            const threadTotal = (watchedThreads ?? []).reduce((sum, s) => {
              const p = threadPriceMap.get(s.name ?? '')
              return p != null ? sum + p * (Number(s.quantity) || 1) : sum
            }, 0)
            const mapCost = Number(watchedMapCost) || 0
            const total = threadTotal + mapCost
            if (total === 0) return null
            const hasPartialThreads = (watchedThreads ?? []).some(
              (s) => s.name && threadPriceMap.get(s.name) == null,
            )
            return (
              <div className="rounded-large border-primary/30 bg-primary/5 flex items-center justify-between border px-5 py-4">
                <div className="flex items-center gap-2">
                  <Coins size={16} className="text-primary shrink-0" />
                  <span className="text-foreground text-sm font-medium">
                    {hasThreadAlternatives
                      ? 'Primary setup cost per map'
                      : 'Total estimated cost per map'}
                  </span>
                  {hasPartialThreads && <span className="text-default-400 text-xs">(partial)</span>}
                  {hasThreadAlternatives && (
                    <span className="text-default-400 text-xs">(alternatives excluded)</span>
                  )}
                </div>
                <span className="text-foreground text-2xl font-bold tabular-nums">
                  ~ {formatChaosValue(total)}
                  <span className="text-primary ml-1 text-sm font-bold">c</span>
                </span>
              </div>
            )
          })()}

          <div
            className={`rounded-large flex items-center justify-between border px-5 py-4 ${
              rateColor === 'success'
                ? 'border-success/30 bg-success/5'
                : rateColor === 'danger'
                  ? 'border-danger/30 bg-danger/5'
                  : 'border-divider bg-default-50'
            }`}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-foreground text-sm font-medium">
                  Estimated currency per hour
                </span>
                <span className="text-default-400 text-xs">
                  {strategyRate
                    ? `Based on ${strategyRate.sampleCount} tagged snapshot${strategyRate.sampleCount === 1 ? '' : 's'}`
                    : 'Needs tagged snapshots to estimate'}
                </span>
              </div>
              {canManageStrategy && linkedSnapshots.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="tertiary"
                    type="button"
                    onPress={() => setLinkedSnapshotsOpen(true)}
                  >
                    Linked snapshots ({linkedSnapshots.length})
                  </Button>
                  {confirmingReset ? (
                    <>
                      <span className="text-default-500 text-xs">Clear linked snapshots?</span>
                      <Button
                        size="sm"
                        variant="danger-soft"
                        type="button"
                        isPending={clearingSnapshots}
                        onPress={() =>
                          clearStrategySnapshots(
                            {
                              groupId: strategy.group_id,
                              strategyId: strategy.id,
                            },
                            { onSuccess: () => setConfirmingReset(false) },
                          )
                        }
                      >
                        {({ isPending }) => (
                          <>
                            {isPending ? <Spinner color="current" size="sm" /> : null}
                            Reset
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="tertiary"
                        type="button"
                        onPress={() => setConfirmingReset(false)}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="danger-soft"
                      type="button"
                      onPress={() => setConfirmingReset(true)}
                    >
                      Clear snapshots
                    </Button>
                  )}
                </div>
              )}
            </div>
            <span className="text-foreground text-2xl font-bold tabular-nums">
              {strategyRate ? `${fmt(strategyRate.chaosPerHour)}/hr` : '—'}
            </span>
          </div>

          {/* Identity */}
          <Card>
            <Card.Content className="gap-4 p-5">
              <Controller
                control={control}
                name="name"
                render={({ field }) => (
                  <FieldInput
                    ref={field.ref}
                    name={field.name}
                    label="Name"
                    size="sm"
                    isReadOnly={!canEditContent}
                    className={readOnlyFieldClassName}
                    isInvalid={!!errors.name}
                    errorMessage={errors.name?.message}
                    value={toFieldStringValue(field.value)}
                    onValueChange={field.onChange}
                    onBlur={field.onBlur}
                  />
                )}
              />
              <Controller
                control={control}
                name="description"
                render={({ field }) => (
                  <FieldTextArea
                    label="Description"
                    placeholder="Describe the strategy, goals, and setup notes..."
                    minRows={2}
                    size="sm"
                    isRequired={false}
                    isReadOnly={!canEditContent}
                    className={readOnlyFieldClassName}
                    isInvalid={!!errors.description}
                    errorMessage={errors.description?.message}
                    value={field.value ?? ''}
                    onValueChange={field.onChange}
                    onBlur={field.onBlur}
                  />
                )}
              />
              <Controller
                control={control}
                name="difficulty"
                render={({ field }) => (
                  <SelectField
                    label="Difficulty"
                    isDisabled={!canEditContent}
                    selectedKey={field.value}
                    onSelectionChange={(key) => {
                      if (key === 'easy' || key === 'normal' || key === 'hard') field.onChange(key)
                    }}
                  >
                    {DIFFICULTY_OPTIONS.map((opt) => (
                      <ListBox.Item key={opt.value} id={opt.value} textValue={opt.label}>
                        {opt.label}
                      </ListBox.Item>
                    ))}
                  </SelectField>
                )}
              />
            </Card.Content>
          </Card>

          {/* Atlas Tree & Threads — two sections in one card */}
          <Card className={!showsPoe1PlanningFields ? 'hidden' : undefined}>
            {/* Section: Atlas Tree */}
            <Card.Header className="px-5 pt-5 pb-0">
              <h2 className="text-foreground text-sm font-semibold">Atlas Tree</h2>
            </Card.Header>
            <Card.Content className="px-5 pt-3 pb-5">
              <div className="flex items-center gap-2">
                <Controller
                  control={control}
                  name="atlas_tree_url"
                  render={({ field }) => (
                    <FieldInput
                      ref={field.ref}
                      name={field.name}
                      label="Atlas tree URL"
                      placeholder="https://www.pathofexile.com/fullscreen-atlas-skill-tree/…"
                      size="sm"
                      className={`flex-1 ${readOnlyFieldClassName ?? ''}`}
                      isReadOnly={!canEditContent}
                      value={toFieldStringValue(field.value)}
                      onValueChange={field.onChange}
                      onBlur={field.onBlur}
                    />
                  )}
                />
                <a
                  href={
                    atlasUrl?.trim() || 'https://www.pathofexile.com/fullscreen-atlas-skill-tree/'
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  tabIndex={-1}
                  className="shrink-0"
                >
                  <Button isIconOnly size="sm" variant="tertiary" type="button">
                    <ExternalLink size={14} />
                  </Button>
                </a>
              </div>
            </Card.Content>

            {/* Divider */}
            <div className="border-divider mx-5 border-t" />

            {/* Section: Threads */}
            <Card.Header className="px-5 pt-4 pb-0">
              <div className="flex w-full flex-wrap items-center justify-between gap-3">
                <h2 className="text-foreground text-sm font-semibold">Threads</h2>
                {canEditContent && (
                  <Button
                    size="sm"
                    variant="tertiary"
                    type="button"
                    className="shrink-0"
                    onPress={() => {
                      pendingThreadFocusIndexRef.current = threadFields.length
                      setPendingThreadFocusIndex(threadFields.length)
                      appendThread(
                        { name: '', quantity: 1, required: true, alternatives: [] },
                        { shouldFocus: false },
                      )
                    }}
                  >
                    <Plus size={14} />
                    Add thread
                  </Button>
                )}
              </div>
            </Card.Header>
            <Card.Content className="px-5 pt-3 pb-5">
              {threadFields.length === 0 ? (
                <p className="text-default-400 text-sm">No Threads added yet. Spend up to eight per map; free Atlas Threads are additional.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {threadFields.map((field, i) => {
                    const threadName = watchedThreads?.[i]?.name ?? ''
                    const threadIcon = threadIconMap.get(threadName)
                    const qty = Number(watchedThreads?.[i]?.quantity) || 1
                    const unitPrice = threadPriceMap.get(threadName) ?? null
                    const rowTotal = unitPrice != null ? unitPrice * qty : null
                    const alternativeCount = watchedThreads?.[i]?.alternatives?.length ?? 0

                    return (
                      <div
                        key={field.id}
                        className="rounded-large border-divider bg-default-50/40 border p-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          {threadIcon ? (
                            <img
                              src={threadIcon}
                              alt={threadName}
                              className="h-10 w-10 bg-transparent object-contain"
                            />
                          ) : (
                            <div className="h-10 w-10 bg-transparent" aria-hidden="true" />
                          )}
                          <Controller
                            control={control}
                            name={`threads.${i}.name`}
                            render={({ field: f }) => (
                              <ThreadAutocompleteField
                                inputRef={(node) => {
                                  threadInputRefs.current[i] = node
                                }}
                                value={f.value ?? ''}
                                onChange={f.onChange}
                                isReadOnly={!canEditContent}
                                isInvalid={!!errors.threads?.[i]?.name}
                                errorMessage={errors.threads?.[i]?.name?.message}
                                threadData={threadData}
                                autoFocus={pendingThreadFocusIndex === i}
                                className="flex-1"
                              />
                            )}
                          />
                          <Controller
                            control={control}
                            name={`threads.${i}.quantity`}
                            render={({ field: quantityField }) => (
                              <FieldInput
                                ref={quantityField.ref}
                                name={quantityField.name}
                                placeholder="Qty"
                                aria-label="Thread quantity"
                                min={1}
                                max={8}
                                step={1}
                                type="number"
                                size="sm"
                                className={`w-16 shrink-0 ${readOnlyFieldClassName ?? ''}`}
                                isReadOnly={!canEditContent}
                                isInvalid={!!errors.threads?.[i]?.quantity}
                                value={toFieldStringValue(quantityField.value)}
                                onValueChange={quantityField.onChange}
                                onBlur={quantityField.onBlur}
                              />
                            )}
                          />
                          <span className="shrink-0 px-2 text-right tabular-nums">
                            {rowTotal != null ? (
                              <>
                                <span className="text-foreground text-sm font-semibold">
                                  ~ {formatChaosValue(rowTotal)}
                                </span>
                                <span className="text-foreground ml-0.5 text-sm font-semibold">
                                  c
                                </span>
                              </>
                            ) : (
                              <span className="text-default-300 text-xs">—</span>
                            )}
                          </span>
                          <Controller
                            control={control}
                            name={`threads.${i}.required`}
                            render={({ field: f }) => (
                              <NativeCheckbox
                                id={`thread-${field.id}-required`}
                                isSelected={f.value}
                                onChange={canEditContent ? f.onChange : undefined}
                                isDisabled={!canEditContent}
                              >
                                Required
                              </NativeCheckbox>
                            )}
                          />
                          {alternativeCount > 0 ? (
                            <Chip size="sm" variant="soft">
                              {alternativeCount} alternative{alternativeCount === 1 ? '' : 's'}
                            </Chip>
                          ) : null}
                          {canEditContent && (
                            <Button
                              isIconOnly
                              size="sm"
                              variant="tertiary"
                              type="button"
                              className="text-default-400 hover:text-danger shrink-0"
                              aria-label="Remove Thread"
                              onPress={() => removeThread(i)}
                            >
                              <Trash2 size={14} />
                            </Button>
                          )}
                        </div>
                        <ThreadAlternativesField
                          control={control}
                          threadIndex={i}
                          canEditContent={canEditContent}
                          errors={errors}
                          threadData={threadData}
                          threadIconMap={threadIconMap}
                          threadPriceMap={threadPriceMap}
                        />
                      </div>
                    )
                  })}

                  {/* Total */}
                  {(() => {
                    const total = (watchedThreads ?? []).reduce((sum, s) => {
                      const p = threadPriceMap.get(s.name ?? '')
                      return p != null ? sum + p * (Number(s.quantity) || 1) : sum
                    }, 0)
                    const knownCount = (watchedThreads ?? []).filter((s) =>
                      threadPriceMap.get(s.name ?? '') != null,
                    ).length
                    if (knownCount === 0) return null
                    return (
                      <div className="border-divider border-t pt-2 text-right">
                        <span className="text-default-500 text-xs">
                          {hasThreadAlternatives
                            ? 'Primary thread cost per map:'
                            : 'Estimated cost per map:'}{' '}
                          <span className="text-foreground font-medium">
                            ~ {formatChaosValue(total)}
                            <span className="text-default-500 ml-0.5 text-xs font-semibold">c</span>
                          </span>
                          {knownCount < (watchedThreads ?? []).length && (
                            <span className="text-default-400"> (partial)</span>
                          )}
                          {hasThreadAlternatives && (
                            <span className="text-default-400"> (alternatives excluded)</span>
                          )}
                        </span>
                      </div>
                    )
                  })()}
                </div>
              )}
            </Card.Content>
          </Card>

          {/* Map — trade link + requirements */}
          <Card className={!showsPoe1PlanningFields ? 'hidden' : undefined}>
            <Card.Header className="px-5 pt-5 pb-0">
              <h2 className="text-foreground text-sm font-semibold">Map</h2>
            </Card.Header>
            <Card.Content className="gap-4 px-5 pt-3 pb-5">
              <div className="flex items-center gap-2">
                <Controller
                  control={control}
                  name="map_trade_link"
                  render={({ field }) => (
                    <FieldInput
                      ref={field.ref}
                      name={field.name}
                      label="Trade link"
                      placeholder="https://www.pathofexile.com/trade/…"
                      size="sm"
                      className={`flex-1 ${readOnlyFieldClassName ?? ''}`}
                      isReadOnly={!canEditContent}
                      value={toFieldStringValue(field.value)}
                      onValueChange={field.onChange}
                      onBlur={field.onBlur}
                    />
                  )}
                />
                {mapTradeUrl && (
                  <a
                    href={mapTradeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    tabIndex={-1}
                    className="shrink-0"
                  >
                    <Button isIconOnly size="sm" variant="tertiary" type="button">
                      <ExternalLink size={14} />
                    </Button>
                  </a>
                )}
              </div>
              <Controller
                control={control}
                name="map_cost"
                render={({ field }) => (
                  <FieldInput
                    ref={field.ref}
                    name={field.name}
                    label="Estimated map cost"
                    placeholder="—"
                    type="number"
                    size="sm"
                    className={`max-w-50 ${readOnlyFieldClassName ?? ''}`}
                    isReadOnly={!canEditContent}
                    endContent={<span className="text-default-600 text-sm font-semibold">c</span>}
                    value={toFieldStringValue(field.value)}
                    onValueChange={field.onChange}
                    onBlur={field.onBlur}
                  />
                )}
              />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {MAP_REQ_FIELDS.map(({ key, label }) => (
                  <Controller
                    key={key}
                    control={control}
                    name={`map_requirements.${key}`}
                    render={({ field }) => (
                      <FieldInput
                        ref={field.ref}
                        name={field.name}
                        label={label}
                        placeholder="—"
                        type="number"
                        size="sm"
                        isReadOnly={!canEditContent}
                        className={readOnlyFieldClassName}
                        endContent={<span className="text-default-400 text-xs">%</span>}
                        value={toFieldStringValue(field.value)}
                        onValueChange={field.onChange}
                        onBlur={field.onBlur}
                      />
                    )}
                  />
                ))}
              </div>
            </Card.Content>
          </Card>

          {!showsPoe1PlanningFields ? (
            <Card>
              <Card.Content className="gap-2 p-5">
                <p className="text-foreground text-sm font-semibold">PoE2 strategy mode</p>
                <p className="text-default-500 text-sm leading-relaxed">
                  Path of Exile 2 strategies currently focus on shared planning fields like name,
                  description, and difficulty. Atlas trees, threads, and map setup stay
                  PoE1-only until we ship a dedicated PoE2 strategy model.
                </p>
              </Card.Content>
            </Card>
          ) : null}

        </div>
      </form>
    </>
  )
}
