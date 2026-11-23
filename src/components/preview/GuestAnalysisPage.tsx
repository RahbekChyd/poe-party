import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button } from '@heroui/react/button'
import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { ListBox } from '@heroui/react/list-box'
import { Spinner } from '@heroui/react/spinner'
import { Search } from 'lucide-react'
import {
  guestPlanForRecommendationRow,
  useGuestCharacterLookup,
  useGuestUpgradeAnalysisStatus,
  useQueueGuestUpgradeAnalysis,
} from '../../hooks/useGuestAnalysis'
import { useNinjaPrices } from '../../hooks/useNinjaPrices'
import { formatElapsedSince, getAnalysisPhaseLabel } from '../../lib/analysis-progress'
import {
  getAnalysisPobLayoutLabels,
  getAnalysisPobResultLayoutLabels,
  resolveAnalysisPobSetup,
  type AnalysisPobSetupSelection,
} from '../../lib/analysis-pob-setup'
import { parsePobImport } from '../../lib/pob'
import { rankRecommendationPlans } from '../../lib/recommendation-score'
import type {
  GuestCharacterSummary,
  GuestUpgradeAnalysisRun,
  GuestUpgradeRecommendationPlan,
  PobImportMetadata,
  UpgradeRecommendationPlan,
} from '../../types/app'
import { AnalysisPobSetupFields } from '../analysis/AnalysisPobSetupFields'
import { AnalysisPobImportFields } from '../analysis/AnalysisPobImportFields'
import { AnalysisPobResultLayouts } from '../analysis/AnalysisPobResultLayouts'
import { AnalysisRunProgress } from '../analysis/AnalysisRunProgress'
import { AnalysisWizard } from '../analysis/AnalysisWizard'
import { RecommendationItemRow } from '../gear/RecommendationItemRow'
import { FieldInput, SelectField } from '../ui/heroui-native'
import { PreviewPageIntro } from './PreviewShared'
import { DashboardPage } from '../ui/dashboard'
import '../analysis/analysis-run.css'

const GUEST_RUN_TOKEN_STORAGE_KEY = 'poe-party:guest-analysis-run-token:v1'
const ALL_GUEST_LEAGUES_KEY = '__all__'
const UNKNOWN_GUEST_LEAGUE_KEY = '__unknown__'
const DEFAULT_TARGET_NAME = 'Public target'
const TARGET_NAME_LIMIT = 120
const GUEST_ANALYSIS_STEPS = ['Character', 'PoB target', 'PoB setup', 'Review'] as const
const GUEST_ANALYSIS_STEP_TITLES = [
  'Find a character',
  'Choose a PoB target',
  'Confirm PoB setup',
  'Review analysis',
]
const GUEST_ANALYSIS_STEP_DESCRIPTIONS = [
  'Enter a public Path of Exile account name, including the number after #.',
  'Paste a Path of Building share code or XML export for the build you want to compare against.',
  'Choose the tree, item set, skill set, and configuration to compare.',
  'Check your character and target before starting.',
]
const EMPTY_SETUP: AnalysisPobSetupSelection = {
  treeSpecId: null,
  itemSetId: null,
  skillSetId: null,
  configSetId: null,
}
const FINISHED_STATUS_BADGES = {
  completed: { color: 'success', label: 'Completed' },
  partial: { color: 'warning', label: 'Partial' },
  failed: { color: 'danger', label: 'Failed' },
  stale: { color: 'warning', label: 'Stale' },
} as const

function readStoredGuestRunToken(): string | null {
  try {
    return window.localStorage.getItem(GUEST_RUN_TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

function writeStoredGuestRunToken(token: string): boolean {
  try {
    window.localStorage.setItem(GUEST_RUN_TOKEN_STORAGE_KEY, token)
    return true
  } catch {
    return false
  }
}

function clearStoredGuestRunToken(token: string | null) {
  try {
    if (readStoredGuestRunToken() === token) {
      window.localStorage.removeItem(GUEST_RUN_TOKEN_STORAGE_KEY)
    }
  } catch {
    // Storage can be unavailable in browser privacy modes.
  }
}

function formatRelativeTime(value: string | null | undefined): string | null {
  if (!value) return null
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return null
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours}h ago`
  const days = Math.round(hours / 24)
  return `${days}d ago`
}

function toSelectItems<T extends { id: string; title: string }>(items: T[]) {
  return items.map((item) => (
    <ListBox.Item key={item.id} id={item.id} textValue={item.title}>
      {item.title}
    </ListBox.Item>
  ))
}

function getGuestCharacterLeagueKey(character: GuestCharacterSummary): string {
  return character.league?.trim() || UNKNOWN_GUEST_LEAGUE_KEY
}

function getGuestLeagueFilterTitle(key: string): string {
  if (key === ALL_GUEST_LEAGUES_KEY) return 'All leagues'
  if (key === UNKNOWN_GUEST_LEAGUE_KEY) return 'Unknown league'
  return key
}

function getPrimaryPlans(plans: GuestUpgradeRecommendationPlan[]): UpgradeRecommendationPlan[] {
  return plans
    .filter((plan) => plan.section !== 'overview' && plan.items.length > 0)
    .map(guestPlanForRecommendationRow)
    .sort((left, right) => right.score - left.score)
}

function getOverviewPlans(plans: GuestUpgradeRecommendationPlan[]): UpgradeRecommendationPlan[] {
  return plans
    .filter((plan) => plan.section === 'overview' && plan.items.length > 0)
    .map(guestPlanForRecommendationRow)
    .sort((left, right) => {
      const leftSlot = left.items[0]?.slot ?? ''
      const rightSlot = right.items[0]?.slot ?? ''
      return leftSlot.localeCompare(rightSlot) || right.score - left.score
    })
}

function GuestRecommendationSection({
  analysisMode,
  divinePrice,
  label,
  plans,
  showRankBadge,
}: {
  analysisMode: GuestUpgradeAnalysisRun['analysis_mode']
  divinePrice: number
  label: string
  plans: UpgradeRecommendationPlan[]
  showRankBadge: boolean
}) {
  const scoreRanks = useMemo(
    () => ({
      overall: rankRecommendationPlans(plans, 'overall'),
      dps: rankRecommendationPlans(plans, 'dps'),
      ehp: rankRecommendationPlans(plans, 'ehp'),
      reservation: rankRecommendationPlans(plans, 'reservation'),
    }),
    [plans],
  )

  if (plans.length === 0) return null

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-foreground text-sm font-semibold">{label}</p>
          <p className="text-default-500 mt-1 text-xs">
            {plans.reduce((count, plan) => count + plan.items.length, 0)} scored item
            {plans.reduce((count, plan) => count + plan.items.length, 0) === 1 ? '' : 's'}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 justify-start gap-3 sm:grid-cols-[repeat(auto-fill,minmax(14.375rem,14.375rem))]">
        {plans.map((plan, index) => {
          const overallRank = scoreRanks.overall.get(plan.id) ?? index + 1
          const dpsRank = scoreRanks.dps.get(plan.id) ?? null
          const ehpRank = scoreRanks.ehp.get(plan.id) ?? null
          const reservationRank = scoreRanks.reservation.get(plan.id) ?? null

          return plan.items.map((item) => (
            <RecommendationItemRow
              key={item.id}
              item={item}
              plan={plan}
              scoreContext={{
                overallRank,
                dpsRank,
                ehpRank,
                reservationRank,
                total: plans.length,
                sectionLabel: label,
              }}
              divinePrice={divinePrice}
              analysisMode={analysisMode}
              showRankBadge={showRankBadge}
              canPromote={false}
            />
          ))
        })}
      </div>
    </section>
  )
}

function GuestRecommendations({
  divinePrice,
  plans,
  run,
}: {
  divinePrice: number
  plans: GuestUpgradeRecommendationPlan[]
  run: GuestUpgradeAnalysisRun
}) {
  const primaryPlans = useMemo(() => getPrimaryPlans(plans), [plans])
  const overviewPlans = useMemo(() => getOverviewPlans(plans), [plans])
  const hasPlans = primaryPlans.length > 0 || overviewPlans.length > 0

  if (!hasPlans) {
    return (
      <Card>
        <Card.Content className="gap-2 p-5">
          <p className="text-foreground text-sm font-semibold">No recommendations were produced</p>
          <p className="text-default-500 text-sm">
            The run completed without item output. Try a different target PoB or a public character
            with more complete gear and passive data.
          </p>
        </Card.Content>
      </Card>
    )
  }

  return (
    <Card>
      <Card.Content className="gap-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-foreground text-sm font-semibold">Recommendations</p>
            <p className="text-default-500 mt-1 text-sm">
              Public output uses public character gear and tree data only.
            </p>
          </div>
          <Chip size="sm" variant="soft">
            Public data only
          </Chip>
        </div>

        <div className="rounded-large border-divider/70 bg-default-50 border p-4">
          <p className="text-foreground text-sm font-semibold">Quick analysis scope</p>
          <p className="text-default-600 mt-1 text-sm">
            This run exact-scores the public character against the selected target. Live rare-market
            searching and stash matching are not part of public mode.
          </p>
        </div>

        <GuestRecommendationSection
          label="Upgrade recommendations"
          plans={primaryPlans}
          divinePrice={divinePrice}
          analysisMode={run.analysis_mode}
          showRankBadge
        />
        <GuestRecommendationSection
          label="Target PoB item scores"
          plans={overviewPlans}
          divinePrice={divinePrice}
          analysisMode={run.analysis_mode}
          showRankBadge={false}
        />
      </Card.Content>
    </Card>
  )
}

function CharacterPicker({
  characters,
  selectedCharacter,
  onSelect,
}: {
  characters: GuestCharacterSummary[]
  selectedCharacter: GuestCharacterSummary | null
  onSelect: (character: GuestCharacterSummary) => void
}) {
  if (characters.length === 0) return null

  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {characters.map((character) => {
        const selected = character.name === selectedCharacter?.name &&
          character.realm === selectedCharacter.realm
        return (
          <button
            key={`${character.realm}-${character.name}`}
            type="button"
            aria-pressed={selected}
            className={`rounded-large border p-3 text-left transition ${
              selected
                ? 'border-highlight bg-selected'
                : 'border-control bg-content1 hover:bg-content2'
            }`}
            onClick={() => onSelect(character)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-foreground wrap-anywhere text-sm font-semibold">{character.name}</p>
                <p className="text-default-500 mt-1 text-xs">
                  {character.class ?? 'Unknown class'}
                  {character.level ? ` - level ${character.level}` : ''}
                </p>
              </div>
              {selected ? (
                <Chip size="sm" variant="soft" className="text-highlight">
                  Selected
                </Chip>
              ) : null}
            </div>
            <p className="text-default-400 mt-2 text-xs">{character.league ?? 'Unknown league'}</p>
          </button>
        )
      })}
    </div>
  )
}

export function GuestAnalysisPage() {
  const [step, setStep] = useState(0)
  const [isSettingUp, setIsSettingUp] = useState(false)
  const [accountName, setAccountName] = useState('')
  const [resolvedAccountName, setResolvedAccountName] = useState<string | null>(null)
  const [characterMessage, setCharacterMessage] = useState<{ text: string; error?: boolean } | null>(null)
  const lookupRevision = useRef(0)
  const [characters, setCharacters] = useState<GuestCharacterSummary[]>([])
  const [leagueFilter, setLeagueFilter] = useState(ALL_GUEST_LEAGUES_KEY)
  const [selectedCharacter, setSelectedCharacter] = useState<GuestCharacterSummary | null>(null)
  const [rawImport, setRawImport] = useState('')
  const [targetName, setTargetName] = useState(DEFAULT_TARGET_NAME)
  const [parsedMetadata, setParsedMetadata] = useState<PobImportMetadata | null>(null)
  const [setup, setSetup] = useState(EMPTY_SETUP)
  const [parseError, setParseError] = useState<string | null>(null)
  const [queueError, setQueueError] = useState<string | null>(null)
  const [targetAction, setTargetAction] = useState<'parse' | 'queue' | null>(null)
  const targetActionPending = useRef(false)
  const [runNotice, setRunNotice] = useState<string | null>(null)
  const [runToken, setRunToken] = useState<string | null>(() => readStoredGuestRunToken())
  const [runRemembered, setRunRemembered] = useState(!!runToken)
  const currentRunHeading = useRef<HTMLHeadingElement>(null)
  const focusRunHeading = useRef(false)
  const characterLookup = useGuestCharacterLookup()
  const queueGuestRun = useQueueGuestUpgradeAnalysis()
  const showCurrentRun = !!runToken && !isSettingUp
  const {
    data: statusData,
    error: statusError,
    isLoading: statusLoading,
    isResultPending,
    retry: retryStatus,
    runUnavailable,
  } = useGuestUpgradeAnalysisStatus(showCurrentRun ? runToken : null)
  const activeRun = runUnavailable ? null : statusData?.run ?? null
  const activePlans = statusData?.plans ?? []
  const showRecommendations =
    (activeRun?.status === 'completed' || activeRun?.status === 'partial') &&
    !isResultPending && (!statusError || activePlans.length > 0)
  const { data: ninjaData } = useNinjaPrices(
    showRecommendations ? activeRun?.character_league ?? null : null,
    'poe1',
  )
  const divinePrice = ninjaData?.divinePrice ?? 0
  const normalizedTargetName = targetName.trim().slice(0, TARGET_NAME_LIMIT) || DEFAULT_TARGET_NAME
  const leagueFilterOptions = useMemo(() => {
    const leagueTitles = new Map<string, string>()
    for (const character of characters) {
      const key = getGuestCharacterLeagueKey(character)
      if (!leagueTitles.has(key)) {
        leagueTitles.set(key, getGuestLeagueFilterTitle(key))
      }
    }

    return [
      { id: ALL_GUEST_LEAGUES_KEY, title: 'All leagues' },
      ...[...leagueTitles.entries()]
        .map(([id, title]) => ({ id, title }))
        .sort((left, right) => left.title.localeCompare(right.title)),
    ]
  }, [characters])
  const filteredCharacters = useMemo(
    () =>
      leagueFilter === ALL_GUEST_LEAGUES_KEY
        ? characters
        : characters.filter((character) => getGuestCharacterLeagueKey(character) === leagueFilter),
    [characters, leagueFilter],
  )

  useEffect(() => {
    if (!showCurrentRun || !focusRunHeading.current) return
    focusRunHeading.current = false
    currentRunHeading.current?.focus()
  }, [showCurrentRun, runToken])

  useEffect(() => {
    if (!runUnavailable) return
    clearStoredGuestRunToken(runToken)
    setRunToken(null)
    setStep(0)
    setIsSettingUp(true)
    setRunNotice('This analysis is no longer available. Start a new analysis to get fresh results.')
  }, [runUnavailable, runToken])

  function clearCharacterLookup() {
    setResolvedAccountName(null)
    setCharacters([])
    setSelectedCharacter(null)
    setLeagueFilter(ALL_GUEST_LEAGUES_KEY)
    setCharacterMessage(null)
  }

  function handleAccountChange(value: string) {
    setAccountName(value)
    if (value.trim() !== accountName.trim()) {
      lookupRevision.current += 1
      clearCharacterLookup()
      characterLookup.reset()
      setQueueError(null)
    }
  }

  async function handleLookupCharacters() {
    if (!accountName.trim() || characterLookup.isPending || targetActionPending.current) return
    const revision = ++lookupRevision.current
    clearCharacterLookup()
    try {
      const result = await characterLookup.mutateAsync(accountName.trim())
      if (lookupRevision.current !== revision) return
      setResolvedAccountName(result.account_name)
      setCharacters(result.characters)
      setSelectedCharacter(result.characters[0] ?? null)
      if (!result.characters.length) {
        setCharacterMessage({ text: 'No public PoE1 characters found for this account.' })
      }
    } catch (error) {
      if (lookupRevision.current !== revision) return
      setCharacterMessage({
        text: error instanceof Error ? error.message : 'Could not load characters. Try again.',
        error: true,
      })
    }
  }

  function handleLeagueFilterChange(key: string | null) {
    const nextLeagueFilter = key || ALL_GUEST_LEAGUES_KEY
    setLeagueFilter(nextLeagueFilter)

    const nextCharacters =
      nextLeagueFilter === ALL_GUEST_LEAGUES_KEY
        ? characters
        : characters.filter(
            (character) => getGuestCharacterLeagueKey(character) === nextLeagueFilter,
          )
    const selectedStillVisible =
      selectedCharacter &&
      nextCharacters.some(
        (character) =>
          character.name === selectedCharacter.name && character.realm === selectedCharacter.realm,
      )

    if (!selectedStillVisible) {
      setSelectedCharacter(nextCharacters[0] ?? null)
    }
  }

  async function handleReadTarget() {
    if (targetActionPending.current || !rawImport.trim()) return
    if (parsedMetadata) {
      setStep(2)
      return
    }

    targetActionPending.current = true
    setTargetAction('parse')
    setParseError(null)
    try {
      const { metadata } = await parsePobImport(rawImport)
      setParsedMetadata(metadata)
      setSetup(resolveAnalysisPobSetup(metadata))
      if (normalizedTargetName === DEFAULT_TARGET_NAME) {
        const inferredName = metadata.ascendancy_name ?? metadata.class_name ?? metadata.item_sets[0]?.title
        setTargetName(inferredName?.slice(0, TARGET_NAME_LIMIT) ?? DEFAULT_TARGET_NAME)
      }
      setStep(2)
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'The PoB import could not be read.')
    } finally {
      targetActionPending.current = false
      setTargetAction(null)
    }
  }

  async function handleQueueRun() {
    if (targetActionPending.current || !selectedCharacter || !resolvedAccountName || !parsedMetadata) return
    targetActionPending.current = true
    setTargetAction('queue')
    setQueueError(null)

    try {
      const result = await queueGuestRun.mutateAsync({
        account_name: resolvedAccountName,
        character_name: selectedCharacter.name,
        raw_import: rawImport,
        target_name: normalizedTargetName,
        tree_spec_id: setup.treeSpecId,
        item_set_id: setup.itemSetId,
        skill_set_id: setup.skillSetId,
        config_set_id: setup.configSetId,
      })
      setRunRemembered(writeStoredGuestRunToken(result.run_token))
      focusRunHeading.current = true
      setRunToken(result.run_token)
      setRunNotice(null)
      setStep(0)
      setIsSettingUp(false)
    } catch (error) {
      setQueueError(error instanceof Error ? error.message : 'Could not queue the analysis. Try again.')
    } finally {
      targetActionPending.current = false
      setTargetAction(null)
    }
  }

  if (showCurrentRun) {
    const runStatus = activeRun?.status
    const isLive = runStatus === 'queued' || runStatus === 'running'
    const progressStatus = isLive ? runStatus : isResultPending && !statusError ? 'finalizing' : null
    const statusBadge = runStatus && !isLive ? FINISHED_STATUS_BADGES[runStatus] : null

    return (
      <DashboardPage>
        <GuestAnalysisIntro />
        <section aria-labelledby="current-public-run-title" className="flex min-w-0 flex-col gap-4">
          <header className="analysis-run-summary">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2
                  id="current-public-run-title"
                  ref={currentRunHeading}
                  tabIndex={-1}
                  className="text-foreground scroll-mt-6 text-base font-semibold focus:outline-none"
                >
                  Current public run
                </h2>
                {activeRun ? (
                  <p className="text-default-600 mt-1 text-sm wrap-anywhere">
                    {activeRun.character_name} compared with {activeRun.target_name}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onPress={() => setIsSettingUp(true)}>
                  New analysis
                </Button>
                <Button
                  size="sm"
                  variant="tertiary"
                  onPress={() => {
                    clearStoredGuestRunToken(runToken)
                    setRunToken(null)
                    setRunNotice('Saved run cleared from this browser.')
                    setStep(0)
                    setIsSettingUp(true)
                  }}
                >
                  Clear saved run
                </Button>
              </div>
            </div>
            {activeRun ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {statusBadge ? (
                    <Chip size="sm" color={statusBadge.color} variant="soft">{statusBadge.label}</Chip>
                  ) : null}
                  <Chip size="sm" variant="soft">Quick</Chip>
                  {activeRun.character_league ? (
                    <Chip size="sm" variant="soft">{activeRun.character_league}</Chip>
                  ) : null}
                </div>
                <p className="text-default-500 text-sm">
                  Queued {formatRelativeTime(activeRun.created_at) ?? activeRun.created_at}
                </p>
              </div>
            ) : null}
          </header>
          <p role="status" className="sr-only">
            {showRecommendations ? 'Analysis results ready.' : ''}
          </p>
          {statusLoading ? (
            <div role="status" className="text-default-600 flex items-center gap-2 text-sm">
              <Spinner size="sm" />
              Loading your current analysis…
            </div>
          ) : null}
          {statusError && !runUnavailable ? (
            <div className="flex flex-wrap items-center gap-2">
              <p role="alert" className="text-danger text-sm">Could not load the current analysis.</p>
              <Button size="sm" variant="tertiary" onPress={() => void retryStatus()}>
                Try again
              </Button>
            </div>
          ) : null}
          {activeRun && progressStatus ? (
            <AnalysisRunProgress
              status={progressStatus}
              headingLevel={3}
              phase={runStatus === 'running' ? getAnalysisPhaseLabel(activeRun.summary) : null}
              elapsed={formatElapsedSince(activeRun.started_at, Date.now())}
              returnNote={
                runRemembered
                  ? 'You can leave this page and return in the same browser to see your results.'
                  : 'This browser could not save the run. Keep this page open to see your results.'
              }
            />
          ) : null}
          {activeRun?.status === 'failed' || activeRun?.status === 'stale' ? (
            <div className="rounded-large border-divider bg-surface flex flex-col gap-1 border p-4">
              <p role="alert" className="text-foreground text-sm font-semibold">
                {activeRun.status === 'failed' ? 'Public analysis failed' : 'Public analysis is out of date'}
              </p>
              <p className="text-default-600 text-sm">
                {activeRun.status === 'failed'
                  ? 'Recommendations could not be generated. Try running the analysis again.'
                  : 'Start a new analysis to get fresh recommendations.'}
              </p>
            </div>
          ) : null}
          {activeRun && showRecommendations ? (
            <>
              {activeRun.status === 'partial' ? (
                <p role="status" className="text-warning text-sm">
                  {activeRun.partial_reason ?? 'Recommendations are ready with partial confidence.'}
                </p>
              ) : null}
              <AnalysisPobResultLayouts
                rows={getAnalysisPobResultLayoutLabels(
                  activeRun.import_metadata,
                  activeRun.summary,
                  activeRun.target_stage,
                )}
              />
              <GuestRecommendations run={activeRun} plans={activePlans} divinePrice={divinePrice} />
            </>
          ) : null}
        </section>
      </DashboardPage>
    )
  }

  const canContinueFromCharacter = !!selectedCharacter && !!resolvedAccountName
  const wizardAction = step === 0 ? (
    <Button isDisabled={!canContinueFromCharacter} onPress={() => setStep(1)}>
      Continue
    </Button>
  ) : step === 1 ? (
    <Button
      isDisabled={!rawImport.trim()}
      isPending={targetAction === 'parse'}
      onPress={() => void handleReadTarget()}
    >
      {({ isPending }) => isPending ? 'Reading PoB…' : 'Read PoB and continue'}
    </Button>
  ) : step === 2 ? (
    <Button isDisabled={!parsedMetadata} onPress={() => setStep(3)}>
      Continue
    </Button>
  ) : (
    <Button
      isPending={targetAction === 'queue'}
      isDisabled={!canContinueFromCharacter || !parsedMetadata}
      onPress={() => void handleQueueRun()}
    >
      {({ isPending }) => isPending ? 'Starting analysis…' : 'Run Quick analysis'}
    </Button>
  )

  return (
    <DashboardPage>
      <GuestAnalysisIntro
        aside={runToken ? (
          <Button
            variant="tertiary"
            isDisabled={targetAction !== null}
            onPress={() => {
              focusRunHeading.current = true
              setIsSettingUp(false)
            }}
          >
            Resume current run
          </Button>
        ) : null}
      />
      {runNotice ? <p role="status" className="text-default-600 text-sm">{runNotice}</p> : null}
      <AnalysisWizard
        steps={GUEST_ANALYSIS_STEPS}
        activeStep={step}
        title={GUEST_ANALYSIS_STEP_TITLES[step]}
        description={GUEST_ANALYSIS_STEP_DESCRIPTIONS[step]}
        focusOnMount={isSettingUp}
        backAction={step > 0 ? (
          <Button
            variant="tertiary"
            isDisabled={targetAction !== null}
            onPress={() => {
              setQueueError(null)
              setStep((current) => current - 1)
            }}
          >
            Back
          </Button>
        ) : null}
        primaryAction={wizardAction}
      >
        {step === 0 ? (
          <>
            <form
              className="grid min-w-0 gap-3 min-[35rem]:grid-cols-[minmax(0,1fr)_auto] min-[35rem]:items-end"
              onSubmit={(event) => {
                event.preventDefault()
                void handleLookupCharacters()
              }}
            >
              <FieldInput
                label="PoE account"
                value={accountName}
                onValueChange={handleAccountChange}
                placeholder="AccountName#1234"
                startContent={<Search size={16} />}
              />
              <Button
                type="submit"
                variant="secondary"
                isPending={characterLookup.isPending}
                isDisabled={!accountName.trim()}
              >
                {({ isPending }) => isPending ? 'Finding characters…' : 'Find characters'}
              </Button>
            </form>
            {characterMessage ? (
              <p
                role={characterMessage.error ? 'alert' : 'status'}
                className={characterMessage.error ? 'text-danger wrap-anywhere text-sm' : 'text-default-500 text-sm'}
              >
                {characterMessage.text}
              </p>
            ) : null}
            {characters.length > 0 ? (
              <div className="grid gap-3 min-[35rem]:grid-cols-[minmax(9rem,15rem)_minmax(0,1fr)] min-[35rem]:items-end">
                <SelectField
                  label="League"
                  selectedKey={leagueFilter}
                  onSelectionChange={(key) =>
                    handleLeagueFilterChange(typeof key === 'string' ? key : null)
                  }
                >
                  {toSelectItems(leagueFilterOptions)}
                </SelectField>
                <p className="text-default-500 text-sm min-[35rem]:pb-2">
                  Showing {filteredCharacters.length} of {characters.length} public character
                  {characters.length === 1 ? '' : 's'}.
                </p>
              </div>
            ) : null}
            <CharacterPicker
              characters={filteredCharacters}
              selectedCharacter={selectedCharacter}
              onSelect={setSelectedCharacter}
            />
          </>
        ) : null}
        {step === 1 ? (
          <AnalysisPobImportFields
            value={rawImport}
            isPending={targetAction !== null}
            onValueChange={(value) => {
              setRawImport(value)
              setParsedMetadata(null)
              setSetup(EMPTY_SETUP)
              setParseError(null)
              setQueueError(null)
            }}
            name={targetName}
            onNameChange={setTargetName}
            error={parseError}
          />
        ) : null}
        {step === 2 && parsedMetadata ? (
          <>
            <p className="text-foreground text-sm font-medium wrap-anywhere">{normalizedTargetName}</p>
            <AnalysisPobSetupFields
              metadata={parsedMetadata}
              selection={setup}
              onSelectionChange={(field, value) =>
                setSetup((current) => ({ ...current, [field]: value }))
              }
            />
          </>
        ) : null}
        {step === 3 && selectedCharacter && parsedMetadata ? (
          <>
            <GuestAnalysisReview
              character={selectedCharacter}
              targetName={normalizedTargetName}
              metadata={parsedMetadata}
              selection={setup}
            />
            <p className="text-default-500 text-sm">
              One Quick run per Path of Exile account per UTC day.
            </p>
            {queueError ? <p role="alert" className="text-danger wrap-anywhere text-sm">{queueError}</p> : null}
          </>
        ) : null}
      </AnalysisWizard>
    </DashboardPage>
  )
}

function GuestAnalysisIntro({ aside }: { aside?: ReactNode }) {
  return (
    <PreviewPageIntro
      title="Analysis"
      description="Compare a public PoE1 character with a Path of Building target to find upgrades."
      aside={aside}
      asideClassName="w-auto"
    />
  )
}

function GuestAnalysisReview({
  character,
  targetName,
  metadata,
  selection,
}: {
  character: GuestCharacterSummary
  targetName: string
  metadata: PobImportMetadata
  selection: AnalysisPobSetupSelection
}) {
  const rows = [
    ['Character', [character.name, character.league].filter(Boolean).join(' · ')],
    ['PoB target', targetName],
    ...getAnalysisPobLayoutLabels(metadata, selection).map(({ label, value }) => [label, value]),
    ['Analysis mode', 'Quick'],
  ]

  return (
    <dl className="divide-divider divide-y text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="grid min-w-0 grid-cols-[minmax(5rem,1fr)_minmax(0,2fr)] gap-3 py-2.5">
          <dt className="text-default-500 wrap-anywhere">{label}</dt>
          <dd className="text-foreground font-medium wrap-anywhere">{value ?? 'Not included'}</dd>
        </div>
      ))}
    </dl>
  )
}
