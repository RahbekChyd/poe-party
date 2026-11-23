import { useEffect, useRef, useState } from 'react'
import { Button } from '@heroui/react/button'
import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { Spinner } from '@heroui/react/spinner'
import {
  ArrowLeft,
  Coins,
  Info,
  Lock,
  Target,
  Trash2,
  Unlock,
} from 'lucide-react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useNinjaPrices } from '../../hooks/useNinjaPrices'
import { useForm, type SubmitHandler } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
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
import { useGroupWealthHistory, type GroupWealthDataPoint } from '../../hooks/useGroupWealthHistory'
import { useGroupStore } from '../../store/group-store'
import { useThreadData } from '../../hooks/useThreadData'
import { useCurrencyStore } from '../../store/currency-store'
import { DIFFICULTY_OPTIONS } from '../../lib/constants'
import { DetailPageSkeleton } from '../layout/Skeletons'
import { QueryStatePanel } from '../ui/QueryStatePanel'
import { DashboardPage, DashboardPageHeader } from '../ui/dashboard'
import { formatCurrencyAmount } from '../../lib/utils'
import { getPoeGameShortLabel } from '../../lib/poe-game'
import { StrategyLinkedSnapshotsModal } from './StrategyLinkedSnapshotsModal'
import { StrategyInfoSection } from './StrategyInfoSection'
import { StrategyAtlasField, StrategyBasicsFields, StrategyMapFields } from './StrategyFormFields'
import { StrategyThreadFields } from './StrategyThreadFields'
import {
  EMPTY_STRATEGY,
  buildStrategyDefaults,
  formatChaosValue,
  strategyFormSchema,
  threadLimitError,
  type StrategyFormInput,
  type StrategyFormValues,
} from './strategy-form'

export function StrategyDetailPage() {
  const { strategyId } = Route.useParams()
  const navigate = useNavigate()
  const activeGroupId = useGroupStore((s) => s.activeGroupId)

  const { data: strategy, isLoading, isError, refetch } = useStrategy(strategyId)
  const strategyGroupId = strategy?.group_id ?? activeGroupId
  const { data: members } = useGroupMembers(strategyGroupId)
  const { game, league: activeLeague, capabilities } = useActiveGroupContext(strategyGroupId)
  const { data: strategyEconomy } = useStrategyHourlyEstimates(strategyGroupId)
  const { data: groupHistory } = useGroupWealthHistory(strategyGroupId)
  const { data: linkedSnapshots = [] } = useStrategyLinkedSnapshots(strategyGroupId, strategyId)
  const myRole = useMyGroupRole(activeGroupId)
  const canEdit = myRole === 'admin' || myRole === 'editor'
  const isAdmin = myRole === 'admin'

  const { mutate: saveStrategy, isPending: savingForm, error: saveError } = useUpdateStrategy()
  const { mutate: updateQuickAction, isError: quickActionFailed } = useUpdateStrategy()
  const { mutate: deleteStrategy, isPending: deleting, isError: deleteFailed } = useDeleteStrategy()
  const { mutate: clearStrategySnapshots, isPending: clearingSnapshots, isError: clearFailed } =
    useClearStrategySnapshots()
  const { mutateAsync: setGroupHistoryStrategyLink, isPending: updatingLinkedSnapshots } =
    useSetGroupHistoryStrategyLink()
  const currentStrategyId = useCurrentStrategyId(strategyGroupId)
  const { mutate: setCurrentStrategy, isError: activeActionFailed } = useSetCurrentStrategy()
  const editButton = useRef<HTMLButtonElement>(null)
  const editorHeading = useRef<HTMLHeadingElement>(null)
  const [editingStrategyId, setEditingStrategyId] = useState<string | null>(null)
  const [confirmingPublish, setConfirmingPublish] = useState(false)
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
  const threadMarket = useThreadData(activeLeague, game ?? 'poe1')
  const { data: threadData } = threadMarket
  const threadPriceMap = new Map(threadData.map((s) => [s.name, s.chaosValue]))
  const threadIconMap = new Map(threadData.map((s) => [s.name, s.icon]))
  const display = useCurrencyStore((s) => s.display)
  const { data: ninjaData } = useNinjaPrices(game === 'poe2' ? activeLeague : threadMarket.marketLeague, game ?? 'poe1')
  const divinePrice = ninjaData?.divinePrice ?? null

  const memberByUser = Object.fromEntries((members ?? []).map((m) => [m.user.id, m.user]))

  const {
    handleSubmit,
    control,
    watch,
    reset,
    setError,
    formState: { errors, isDirty, dirtyFields },
  } = useForm<StrategyFormInput, unknown, StrategyFormValues>({
    resolver: zodResolver(strategyFormSchema),
    defaultValues: EMPTY_STRATEGY,
  })
  const isDirtyRef = useRef(isDirty)
  const watchedThreads = watch('threads')
  const watchedMapCost = watch('map_cost')
  const hasThreadAlternatives = watchedThreads.some((thread) => thread.alternatives.length > 0)
  const fmt = (chaos: number): string => formatCurrencyAmount(chaos, divinePrice == null ? 'chaos' : display, divinePrice ?? 1)
  const isSubscribed = !!strategy?.source_strategy_id
  const displayVisibility = optimisticVisibility ?? strategy?.visibility ?? 'group_only'
  const displayAdminLocked = optimisticAdminLocked ?? strategy?.admin_locked ?? false
  const displayCurrentStrategyId =
    optimisticCurrentStrategyId === undefined ? currentStrategyId : optimisticCurrentStrategyId
  const isCurrentStrategy = strategy?.id === displayCurrentStrategyId
  const canManageStrategy = canEdit && strategy?.group_id === activeGroupId
  const canEditContent = canManageStrategy && !isSubscribed && (!displayAdminLocked || isAdmin)
  const isEditing = canEditContent && editingStrategyId === strategyId
  const canToggleAdminLock = isAdmin && canManageStrategy && !isSubscribed
  const canToggleVisibility = canEditContent
  const showsPoe1PlanningFields = !!capabilities?.supportsAtlasTree
  const canTrackSnapshotResults = !!capabilities?.supportsStashSnapshots

  useEffect(() => {
    if (isEditing) editorHeading.current?.focus()
  }, [isEditing])

  useEffect(() => {
    isDirtyRef.current = isDirty
  }, [isDirty])

  useEffect(() => {
    if (!strategy) return

    reset(buildStrategyDefaults(strategy), isDirtyRef.current ? { keepDirtyValues: true } : undefined)
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

  const onSubmit: SubmitHandler<StrategyFormValues> = (values) => {
    if (!strategy || !isEditing || savingForm) return
    const threadsChanged = !!dirtyFields.threads &&
      JSON.stringify(values.threads) !== JSON.stringify(strategy.threads)
    const limitError = threadsChanged ? threadLimitError(values.threads) : undefined
    if (limitError) {
      setError('root.threadLimit', { type: 'validate', message: limitError })
      return
    }
    setSaveFeedback('saving')
    saveStrategy(
      {
        id: strategy.id,
        group_id: strategy.group_id,
        name: values.name,
        description: values.description?.trim() ? values.description.trim() : null,
        colour: strategy.colour,
        difficulty: values.difficulty,
        ...(showsPoe1PlanningFields ? {
          ...(dirtyFields.map_trade_link ? { map_trade_link: values.map_trade_link?.trim() || null } : {}),
          ...(dirtyFields.atlas_tree_url ? { atlas_tree_url: values.atlas_tree_url?.trim() || null } : {}),
          ...(dirtyFields.map_cost ? { map_cost: values.map_cost ?? null } : {}),
          ...(dirtyFields.map_requirements ? {
            map_requirements: { ...strategy.map_requirements, ...values.map_requirements },
          } : {}),
          ...(threadsChanged ? { threads: values.threads } : {}),
        } : {}),
      },
      {
        onSuccess: (data) => {
          reset(buildStrategyDefaults(data))
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

  const backLink = (
    <Link to="/dashboard/strategies" className="button button--sm button--tertiary">
      <ArrowLeft size={14} aria-hidden="true" /> Back to strategies
    </Link>
  )

  if (!strategy) {
    return (
      <DashboardPage>
        <DashboardPageHeader backLink={backLink} title={isError ? 'Strategy unavailable' : 'Strategy not found'} />
        {isError ? (
          <QueryStatePanel kind="error" title="Could not load strategy" description="Try again to open this strategy." onRetry={refetch} />
        ) : (
          <p className="text-default-500 text-sm">It may have been deleted or moved out of your workspace.</p>
        )}
      </DashboardPage>
    )
  }

  const strategyRate = strategyEconomy[strategy.id]
  const latestResult = groupHistory?.reduce<GroupWealthDataPoint | undefined>(
    (latest, point) => point.strategy_id === strategy.id ? point : latest,
    undefined,
  )
  const latestPricing = latestResult?.pricing_summary
  const snapshotDivinePrice = latestPricing?.divine_price
  const rateColor = !strategyRate
    ? 'default'
    : strategyRate.chaosPerHour > 0
      ? 'success'
      : strategyRate.chaosPerHour < 0
        ? 'danger'
        : 'default'
  const subscriptionChipColor = strategy.subscription_state === 'frozen' ? 'warning' : 'success'

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

      <form noValidate onSubmit={handleSubmit(onSubmit)}>
        <DashboardPage className="wrap-anywhere">
          <DashboardPageHeader backLink={backLink} title={strategy.name} />
          <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
            {canEditContent && !isEditing && (
              <Button
                ref={editButton}
                type="button"
                size="sm"
                variant={isCurrentStrategy ? 'primary' : 'secondary'}
                onPress={() => setEditingStrategyId(strategy.id)}
              >
                Edit setup
              </Button>
            )}
            {canManageStrategy && (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant={isCurrentStrategy || isEditing ? 'secondary' : 'primary'}
                  isPending={currentStrategyPending}
                  aria-describedby={canTrackSnapshotResults ? 'strategy-activation-effect' : undefined}
                  onPress={() => {
                    if (!activeGroupId) return
                    const nextStrategyId = isCurrentStrategy ? null : strategy.id
                    setOptimisticCurrentStrategyId(nextStrategyId)
                    setCurrentStrategyPending(true)
                    setCurrentStrategy(
                      { groupId: activeGroupId, strategyId: nextStrategyId },
                      {
                        onError: () => {
                          setOptimisticCurrentStrategyId(undefined)
                          setCurrentStrategyPending(false)
                        },
                        onSuccess: () => setCurrentStrategyPending(false),
                      },
                    )
                  }}
                >
                  {isCurrentStrategy ? 'Clear active strategy' : 'Set active'}
                </Button>
                <details className="min-w-0">
                  <summary className="text-default-500 hover:text-foreground min-h-8 cursor-pointer rounded-md px-2 py-1.5 text-sm">
                    Manage strategy
                  </summary>
                  <div className="border-divider bg-content1 mt-2 flex flex-wrap items-center gap-2 rounded-lg border p-3">
                    {canToggleVisibility && (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="tertiary"
                          isPending={visibilityPending}
                          isDisabled={adminLockPending || savingForm}
                          onPress={() => {
                            const nextVisibility: StrategyVisibility = displayVisibility === 'public' ? 'group_only' : 'public'
                            if (nextVisibility === 'public' && !confirmingPublish) {
                              setConfirmingPublish(true)
                              return
                            }
                            setConfirmingPublish(false)
                            runQuickUpdate(
                              { visibility: nextVisibility },
                              {
                                onOptimistic: () => {
                                  setOptimisticVisibility(nextVisibility)
                                  setVisibilityPending(true)
                                },
                                onRollback: () => setOptimisticVisibility(null),
                                onSettled: () => setVisibilityPending(false),
                              },
                            )
                          }}
                        >
                          {displayVisibility === 'public' ? 'Make group-only' : confirmingPublish ? 'Publish strategy' : 'Make public'}
                        </Button>
                        {confirmingPublish && (
                          <>
                            <p className="text-default-500 text-xs">Players in your game and league can find this strategy and its setup.</p>
                            <Button type="button" size="sm" variant="tertiary" onPress={() => setConfirmingPublish(false)}>Cancel publishing</Button>
                          </>
                        )}
                      </>
                    )}
                    {canToggleAdminLock && (
                      <Button
                        type="button"
                        size="sm"
                        variant="tertiary"
                        isPending={adminLockPending}
                          isDisabled={visibilityPending || savingForm}
                        onPress={() => {
                          const nextAdminLocked = !displayAdminLocked
                          runQuickUpdate(
                            { admin_locked: nextAdminLocked },
                            {
                              onOptimistic: () => {
                                setOptimisticAdminLocked(nextAdminLocked)
                                setAdminLockPending(true)
                              },
                              onRollback: () => setOptimisticAdminLocked(null),
                              onSettled: () => setAdminLockPending(false),
                            },
                          )
                        }}
                      >
                        {displayAdminLocked ? <Lock size={14} aria-hidden="true" /> : <Unlock size={14} aria-hidden="true" />}
                        {displayAdminLocked ? 'Disable admin lock' : 'Enable admin lock'}
                      </Button>
                    )}
                    {confirmingDelete ? (
                      <>
                        <span className="text-default-500 text-xs">
                          {isSubscribed ? 'Remove this subscription?' : 'Delete this strategy?'}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          isPending={deleting}
                          onPress={() => deleteStrategy(
                            { id: strategy.id, group_id: strategy.group_id },
                            { onSuccess: () => navigate({ to: '/dashboard/strategies' }) },
                          )}
                        >
                          {isSubscribed ? 'Confirm unsubscribe' : 'Delete strategy'}
                        </Button>
                        <Button type="button" size="sm" variant="tertiary" onPress={() => setConfirmingDelete(false)}>Cancel removal</Button>
                      </>
                    ) : (
                      <Button type="button" size="sm" variant="danger-soft" onPress={() => setConfirmingDelete(true)}>
                        <Trash2 size={14} aria-hidden="true" />
                        {isSubscribed ? 'Unsubscribe' : 'Remove strategy'}
                      </Button>
                    )}
                  </div>
                </details>
              </>
            )}
          </div>
          {canTrackSnapshotResults && canManageStrategy && (
            <p id="strategy-activation-effect" className="text-default-500 -mt-4 text-xs">
              {isCurrentStrategy
                ? 'New stash snapshots are linked to this strategy.'
                : 'Setting this strategy active links new stash snapshots to it.'}
            </p>
          )}
          {(activeActionFailed || quickActionFailed || deleteFailed) && (
            <p className="text-danger text-sm" role="alert">Could not update the strategy. Try again.</p>
          )}
          {strategyGroupId !== activeGroupId && (
            <p className="text-default-500 text-sm">
              {game && activeLeague ? `${getPoeGameShortLabel(game)} · ${activeLeague}. ` : null}
              Switch to the strategy’s workspace to make changes.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {isSubscribed ? (
              <>
                <Chip size="sm" variant="soft" color={subscriptionChipColor}>
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
              <Chip size="sm" variant="soft">
                {displayVisibility === 'public' ? 'Public strategy' : 'Private strategy'}
              </Chip>
            )}
            {isCurrentStrategy && (
              <span className="bg-selected text-highlight inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium">
                <Target size={14} aria-hidden="true" />
                Active strategy
              </span>
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
                    <Info size={16} className="text-info shrink-0" aria-hidden="true" />
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
                  <Chip size="sm" variant="soft">
                    Content locked
                  </Chip>
                  <Chip
                    size="sm"
                    variant="soft"
                    color={subscriptionChipColor}
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
              <div className="rounded-large border-divider bg-content1 flex flex-wrap items-center justify-between gap-2 border px-5 py-4">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Coins size={16} className="text-wealth-series shrink-0" aria-hidden="true" />
                  <span className="text-foreground text-sm font-medium">
                    {hasThreadAlternatives
                      ? 'Primary setup cost per map'
                      : 'Total estimated cost per map'}
                  </span>
                  {hasPartialThreads && <span className="text-warning text-xs">(partial)</span>}
                  {hasThreadAlternatives && (
                    <span className="text-default-400 text-xs">(alternatives excluded)</span>
                  )}
                </div>
                <span className="text-foreground text-2xl font-bold tabular-nums">
                  ~ {formatChaosValue(total)}
                  <span className="text-default-500 ml-1 text-sm font-bold">c</span>
                </span>
              </div>
            )
          })()}

          {canTrackSnapshotResults && (
            <section id="strategy-results" aria-label="Strategy results"
              className={`rounded-large flex flex-wrap items-center justify-between gap-2 scroll-mt-4 border px-5 py-4 ${
                rateColor === 'success'
                  ? 'border-success/30 bg-success/5'
                  : rateColor === 'danger'
                    ? 'border-danger/30 bg-danger/5'
                    : 'border-divider bg-content1'
              }`}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex flex-col gap-1">
                  <h2 className="text-foreground text-sm font-medium">
                    Estimated currency per hour
                  </h2>
                  <span className="text-default-400 text-xs">
                    {strategyRate
                      ? `Based on ${strategyRate.sampleCount} tagged snapshot${strategyRate.sampleCount === 1 ? '' : 's'}`
                      : 'Needs comparable linked snapshots to estimate'}
                  </span>
                  {latestResult && (
                    <div className="text-default-500 flex flex-wrap gap-x-2 gap-y-1 text-xs">
                      <span>{latestPricing?.status === 'partial' ? 'Latest linked priced subtotal' : 'Latest linked snapshot'}</span>
                      <strong className="text-foreground tabular-nums">
                        {latestPricing?.status === 'unavailable'
                          ? 'Pricing unavailable'
                          : formatCurrencyAmount(
                            latestResult.total_wealth_chaos,
                            display === 'divine' && snapshotDivinePrice ? 'divine' : 'chaos',
                            snapshotDivinePrice ?? 1,
                          )}
                      </strong>
                      <time dateTime={latestResult.created_at}>
                        {new Date(latestResult.created_at).toLocaleString(undefined, {
                          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                        })}
                      </time>
                      {latestPricing?.status === 'partial' && (
                        <span className="text-warning">{latestPricing.unpriced_item_count.toLocaleString()} unpriced items</span>
                      )}
                    </div>
                  )}
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
              {clearFailed && <p className="text-danger w-full text-sm" role="alert">Could not clear linked snapshots. Try again.</p>}
            </section>
          )}

          {!isEditing ? (
            <section aria-labelledby="strategy-setup" className="border-divider space-y-3 border-t pt-4">
              <h2 id="strategy-setup" className="text-foreground text-lg font-semibold">Setup</h2>
              <p className="text-default-500 max-w-[65ch] text-sm leading-relaxed whitespace-pre-wrap wrap-anywhere">
                {strategy.description || 'No setup notes yet.'}
              </p>
              <dl className="text-default-500 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                <div className="flex flex-wrap gap-x-2">
                  <dt>Difficulty</dt>
                  <dd className="text-foreground font-medium">
                    {DIFFICULTY_OPTIONS.find(({ value }) => value === strategy.difficulty)?.label ?? 'Normal'}
                  </dd>
                </div>
                {showsPoe1PlanningFields && strategy.map_cost != null && (
                  <div className="flex flex-wrap gap-x-2">
                    <dt>Base map cost</dt>
                    <dd className="text-foreground font-medium tabular-nums">{fmt(strategy.map_cost)}</dd>
                  </div>
                )}
              </dl>
              {showsPoe1PlanningFields && (
                <StrategyInfoSection
                  atlasTreeUrl={strategy.atlas_tree_url || 'https://www.pathofexile.com/fullscreen-atlas-skill-tree/'}
                  threads={strategy.threads}
                  mapTradeLink={strategy.map_trade_link}
                  mapRequirements={strategy.map_requirements}
                  threadPriceMap={threadPriceMap}
                  threadIconMap={threadIconMap}
                />
              )}
            </section>
          ) : (
            <div id="strategy-setup-editor" className="flex min-w-0 flex-col gap-4">
              <div className="border-divider flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                <h2 ref={editorHeading} tabIndex={-1} className="text-foreground text-lg font-semibold">Edit setup</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="tertiary"
                    size="sm"
                    isDisabled={savingForm}
                    onPress={() => {
                      if (isDirty && !window.confirm('Discard your unsaved strategy edits?')) return
                      reset(buildStrategyDefaults(strategy))
                      setSaveFeedback('idle')
                      setEditingStrategyId(null)
                      requestAnimationFrame(() => editButton.current?.focus())
                    }}
                  >
                    Close editor
                  </Button>
                  <Button type="submit" size="sm" isPending={savingForm} isDisabled={!isDirty || visibilityPending || adminLockPending}>
                    Save Changes
                  </Button>
                </div>
              </div>
              {saveFeedback === 'saved' && <p role="status" className="text-success text-sm">Changes saved.</p>}
              {saveError && <p className="text-danger text-sm" role="alert">Could not save the strategy. Your edits are still here.</p>}

              <Card>
                <Card.Content className="gap-4 p-5">
                  <StrategyBasicsFields control={control} errors={errors} />
                </Card.Content>
              </Card>

              {showsPoe1PlanningFields && (
                <>
                  <Card>
                    <Card.Header className="px-5 pt-5 pb-0">
                      <h2 className="text-foreground text-sm font-semibold">Atlas Tree</h2>
                    </Card.Header>
                    <Card.Content className="px-5 pt-3 pb-5">
                      <StrategyAtlasField control={control} />
                    </Card.Content>
                    <div className="border-divider mx-5 border-t" />
                    <Card.Header className="px-5 pt-4 pb-0">
                      <h2 className="text-foreground text-sm font-semibold">Threads</h2>
                    </Card.Header>
                    <Card.Content className="px-5 pt-3 pb-5">
                      <StrategyThreadFields control={control} errors={errors} market={threadMarket} />
                    </Card.Content>
                  </Card>

                  <Card>
                    <Card.Header className="px-5 pt-5 pb-0">
                      <h2 className="text-foreground text-sm font-semibold">Map</h2>
                    </Card.Header>
                    <Card.Content className="gap-4 px-5 pt-3 pb-5">
                      <StrategyMapFields control={control} errors={errors} />
                    </Card.Content>
                  </Card>
                </>
              )}
            </div>
          )}

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

        </DashboardPage>
      </form>
    </>
  )
}
