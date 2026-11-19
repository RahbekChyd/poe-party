import { useEffect, useMemo, useState } from 'react'
import { Button } from '@heroui/react/button'
import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { ListBox } from '@heroui/react/list-box'
import { Spinner } from '@heroui/react/spinner'
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileText,
  PlayCircle,
  Search,
  Sparkles,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import {
  guestPlanForRecommendationRow,
  useGuestCharacterLookup,
  useGuestUpgradeAnalysisStatus,
  useQueueGuestUpgradeAnalysis,
} from '../../hooks/useGuestAnalysis'
import { useNinjaPrices } from '../../hooks/useNinjaPrices'
import { parsePobImport } from '../../lib/pob'
import { rankRecommendationPlans } from '../../lib/recommendation-score'
import type {
  GuestCharacterSummary,
  GuestUpgradeAnalysisRun,
  GuestUpgradeRecommendationPlan,
  PobImportMetadata,
  UpgradeRecommendationPlan,
} from '../../types/app'
import { RecommendationItemRow } from '../gear/RecommendationItemRow'
import { FieldInput, FieldTextArea, SelectField } from '../ui/heroui-native'
import { PreviewNotice, PreviewPageIntro } from './PreviewShared'

const GUEST_RUN_TOKEN_STORAGE_KEY = 'poe-party:guest-analysis-run-token:v1'
const ALL_GUEST_LEAGUES_KEY = '__all__'
const UNKNOWN_GUEST_LEAGUE_KEY = '__unknown__'

function readStoredGuestRunToken(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(GUEST_RUN_TOKEN_STORAGE_KEY)
}

function writeStoredGuestRunToken(token: string | null) {
  if (typeof window === 'undefined') return
  if (token) {
    window.localStorage.setItem(GUEST_RUN_TOKEN_STORAGE_KEY, token)
  } else {
    window.localStorage.removeItem(GUEST_RUN_TOKEN_STORAGE_KEY)
  }
}

function statusTone(status: GuestUpgradeAnalysisRun['status']): {
  color: 'default' | 'warning' | 'success' | 'danger' | 'accent'
  label: string
  icon: typeof Clock3
} {
  switch (status) {
    case 'queued':
      return { color: 'default', label: 'Queued', icon: Clock3 }
    case 'running':
      return { color: 'warning', label: 'Running', icon: Sparkles }
    case 'completed':
      return { color: 'success', label: 'Completed', icon: CheckCircle2 }
    case 'partial':
      return { color: 'accent', label: 'Partial', icon: AlertTriangle }
    case 'failed':
      return { color: 'danger', label: 'Failed', icon: AlertTriangle }
    default:
      return { color: 'warning', label: 'Stale', icon: AlertTriangle }
  }
}

function getRunStatusDescription(run: GuestUpgradeAnalysisRun): string {
  switch (run.status) {
    case 'queued':
      return 'The public run is queued for the optimizer worker.'
    case 'running':
      return 'The worker is scoring the public character against the target PoB.'
    case 'completed':
      return 'Recommendations are ready for this public character snapshot.'
    case 'partial':
      return run.partial_reason ?? 'Recommendations are ready with partial confidence.'
    case 'failed':
      return run.error_detail ?? 'The worker could not finish this run.'
    case 'stale':
      return 'This public run is no longer current.'
    default:
      return 'Run status unknown.'
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
  isResultPending,
  plans,
  run,
}: {
  divinePrice: number
  isResultPending: boolean
  plans: GuestUpgradeRecommendationPlan[]
  run: GuestUpgradeAnalysisRun
}) {
  const primaryPlans = useMemo(() => getPrimaryPlans(plans), [plans])
  const overviewPlans = useMemo(() => getOverviewPlans(plans), [plans])
  const hasPlans = primaryPlans.length > 0 || overviewPlans.length > 0

  if (run.status === 'queued' || run.status === 'running') {
    return (
      <Card>
        <Card.Content className="items-center gap-3 p-8 text-center">
          <Spinner />
          <div>
            <p className="text-foreground text-sm font-semibold">Analysis in progress</p>
            <p className="text-default-500 mt-1 text-sm">{getRunStatusDescription(run)}</p>
          </div>
        </Card.Content>
      </Card>
    )
  }

  if (isResultPending) {
    return (
      <Card>
        <Card.Content className="items-center gap-3 p-8 text-center">
          <Spinner />
          <div>
            <p className="text-foreground text-sm font-semibold">Finalizing recommendations</p>
            <p className="text-default-500 mt-1 text-sm">
              The run is complete. Result rows are still being loaded.
            </p>
          </div>
        </Card.Content>
      </Card>
    )
  }

  if (run.status === 'failed') {
    return (
      <Card className="border-danger/40 bg-danger/10 border">
        <Card.Content className="gap-2 p-5">
          <p className="text-foreground text-sm font-semibold">Public analysis failed</p>
          <p className="text-default-600 text-sm">{getRunStatusDescription(run)}</p>
        </Card.Content>
      </Card>
    )
  }

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
  selectedCharacterName,
  onSelect,
}: {
  characters: GuestCharacterSummary[]
  selectedCharacterName: string | null
  onSelect: (character: GuestCharacterSummary) => void
}) {
  if (characters.length === 0) return null

  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {characters.map((character) => {
        const selected = character.name === selectedCharacterName
        return (
          <button
            key={`${character.realm}-${character.name}`}
            type="button"
            className={`rounded-large border p-3 text-left transition ${
              selected
                ? 'border-accent bg-accent/10'
                : 'border-divider/70 bg-default-50/60 hover:border-accent/50'
            }`}
            onClick={() => onSelect(character)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-foreground truncate text-sm font-semibold">{character.name}</p>
                <p className="text-default-500 mt-1 text-xs">
                  {character.class ?? 'Unknown class'}
                  {character.level ? ` - level ${character.level}` : ''}
                </p>
              </div>
              {selected ? (
                <Chip size="sm" color="accent" variant="soft">
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

function PublicAnalysisFirstRunGuide({
  activeRun,
  rawImport,
  selectedCharacter,
}: {
  activeRun: GuestUpgradeAnalysisRun | null
  rawImport: string
  selectedCharacter: GuestCharacterSummary | null
}) {
  const hasCharacter = Boolean(selectedCharacter)
  const hasTarget = rawImport.trim().length > 0
  const hasRun = Boolean(activeRun)
  const hasReviewableRun = activeRun?.status === 'completed' || activeRun?.status === 'partial'
  const steps: Array<{
    description: string
    href: string
    icon: LucideIcon
    isComplete: boolean
    isCurrent: boolean
    title: string
  }> = [
    {
      title: 'Find a public character',
      description: 'Use an account name with discriminator, then pick the league character to score.',
      href: '#public-character',
      icon: UserRound,
      isComplete: hasCharacter,
      isCurrent: !hasCharacter,
    },
    {
      title: 'Add the target PoB',
      description: 'Paste the build you want to compare against the selected public character.',
      href: '#target-pob',
      icon: FileText,
      isComplete: hasTarget,
      isCurrent: hasCharacter && !hasTarget,
    },
    {
      title: 'Queue Quick Analysis',
      description: 'Run the public worker once the character and target are ready.',
      href: '#target-pob',
      icon: PlayCircle,
      isComplete: hasRun,
      isCurrent: hasCharacter && hasTarget && !hasRun,
    },
    {
      title: 'Review the result',
      description: 'Completed public runs show item recommendations below the setup form.',
      href: hasRun ? '#public-recommendations' : '#current-public-run',
      icon: Sparkles,
      isComplete: hasReviewableRun,
      isCurrent: hasRun && !hasReviewableRun,
    },
  ]
  const completedSteps = steps.filter((step) => step.isComplete).length

  return (
    <Card className="border-accent/25 bg-accent/5 border">
      <Card.Content className="gap-4 p-5">
        <div className="flex items-start gap-3">
          <div className="bg-accent/10 text-accent flex h-10 w-10 items-center justify-center rounded-large">
            <Sparkles size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-foreground text-sm font-semibold">First Public Analysis</p>
            <p className="text-default-600 mt-1 text-sm">
              {completedSteps} of {steps.length} steps ready. Follow the path once, then repeat
              with any public PoE1 character and target build.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {steps.map((step, index) => {
            const Icon = step.icon
            const StepIcon = step.isComplete ? CheckCircle2 : Icon

            return (
              <a
                key={step.title}
                href={step.href}
                aria-current={step.isCurrent ? 'step' : undefined}
                className={`rounded-large border px-3 py-3 transition ${
                  step.isCurrent
                    ? 'border-accent/50 bg-accent/10'
                    : step.isComplete
                      ? 'border-success/35 bg-success/10'
                      : 'border-divider/70 bg-content1/80 hover:border-accent/35'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      step.isComplete
                        ? 'bg-success/15 text-success'
                        : step.isCurrent
                          ? 'bg-accent/15 text-accent'
                          : 'bg-default-100 text-default-500'
                    }`}
                  >
                    <StepIcon size={16} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-foreground text-sm font-medium">{step.title}</p>
                      <Chip
                        size="sm"
                        color={step.isComplete ? 'success' : step.isCurrent ? 'accent' : 'default'}
                        variant="soft"
                      >
                        {step.isComplete ? 'Done' : step.isCurrent ? 'Now' : `Step ${index + 1}`}
                      </Chip>
                    </div>
                    <p className="text-default-500 mt-1 text-xs leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </div>
              </a>
            )
          })}
        </div>

        <div className="rounded-large border-divider/70 bg-content1/70 border px-4 py-3">
          <p className="text-default-600 text-sm">
            Public mode only needs an account name, a visible PoE1 character, and a target PoB.
            This browser remembers your latest run.
          </p>
        </div>
      </Card.Content>
    </Card>
  )
}

export function GuestAnalysisPage() {
  const [accountName, setAccountName] = useState('')
  const [characters, setCharacters] = useState<GuestCharacterSummary[]>([])
  const [leagueFilter, setLeagueFilter] = useState(ALL_GUEST_LEAGUES_KEY)
  const [selectedCharacter, setSelectedCharacter] = useState<GuestCharacterSummary | null>(null)
  const [rawImport, setRawImport] = useState('')
  const [targetName, setTargetName] = useState('Public target')
  const [parsedMetadata, setParsedMetadata] = useState<PobImportMetadata | null>(null)
  const [treeSpecId, setTreeSpecId] = useState<string | null>(null)
  const [itemSetId, setItemSetId] = useState<string | null>(null)
  const [skillSetId, setSkillSetId] = useState<string | null>(null)
  const [configSetId, setConfigSetId] = useState<string | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [runToken, setRunToken] = useState<string | null>(() => readStoredGuestRunToken())
  const characterLookup = useGuestCharacterLookup()
  const queueGuestRun = useQueueGuestUpgradeAnalysis()
  const {
    data: statusData,
    error: statusError,
    isLoading: statusLoading,
    isResultPending,
  } = useGuestUpgradeAnalysisStatus(runToken)
  const activeRun = statusData?.run ?? null
  const activePlans = statusData?.plans ?? []
  const activeLeague = activeRun?.character_league ?? selectedCharacter?.league ?? null
  const { data: ninjaData } = useNinjaPrices(activeLeague, 'poe1')
  const divinePrice = ninjaData?.divinePrice ?? 0
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
    writeStoredGuestRunToken(runToken)
  }, [runToken])

  useEffect(() => {
    if (!statusError) return
    const message = statusError instanceof Error ? statusError.message : 'Public run not found'
    if (message.toLowerCase().includes('not found') || message.toLowerCase().includes('expired')) {
      setRunToken(null)
    }
  }, [statusError])

  async function handleLookupCharacters() {
    setActionMessage(null)
    setSelectedCharacter(null)
    setLeagueFilter(ALL_GUEST_LEAGUES_KEY)
    try {
      const result = await characterLookup.mutateAsync(accountName)
      setCharacters(result.characters)
      setSelectedCharacter(result.characters[0] ?? null)
    } catch (error) {
      setCharacters([])
      setActionMessage(error instanceof Error ? error.message : 'Failed to load characters.')
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

  function applyParsedTargetMetadata(metadata: PobImportMetadata): {
    config_set_id: string | null
    item_set_id: string | null
    skill_set_id: string | null
    target_name: string
    tree_spec_id: string | null
  } {
    const nextTreeSpecId = metadata.tree_specs[0]?.id ?? null
    const nextItemSetId = metadata.item_sets[0]?.id ?? null
    const nextSkillSetId = metadata.skill_sets[0]?.id ?? null
    const nextConfigSetId = metadata.active_config_set_id ?? metadata.config_sets[0]?.id ?? null
    const nextTargetName =
      targetName.trim() === 'Public target'
        ? (metadata.ascendancy_name ??
          metadata.class_name ??
          metadata.item_sets[0]?.title ??
          'Public target')
        : targetName

    setParsedMetadata(metadata)
    setTreeSpecId(nextTreeSpecId)
    setItemSetId(nextItemSetId)
    setSkillSetId(nextSkillSetId)
    setConfigSetId(nextConfigSetId)
    setTargetName(nextTargetName)

    return {
      config_set_id: nextConfigSetId,
      item_set_id: nextItemSetId,
      skill_set_id: nextSkillSetId,
      target_name: nextTargetName,
      tree_spec_id: nextTreeSpecId,
    }
  }

  async function handleParseTarget() {
    setParseError(null)
    setParsedMetadata(null)
    try {
      const parsed = await parsePobImport(rawImport)
      return applyParsedTargetMetadata(parsed.metadata)
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'The PoB import could not be read.')
      return null
    }
  }

  async function handleQueueRun() {
    setActionMessage(null)
    let selectedTreeSpecId = treeSpecId
    let selectedItemSetId = itemSetId
    let selectedSkillSetId = skillSetId
    let selectedConfigSetId = configSetId
    let selectedTargetName = targetName

    if (!parsedMetadata && rawImport.trim()) {
      const parsedSelection = await handleParseTarget()
      if (!parsedSelection) return
      selectedTreeSpecId = parsedSelection.tree_spec_id
      selectedItemSetId = parsedSelection.item_set_id
      selectedSkillSetId = parsedSelection.skill_set_id
      selectedConfigSetId = parsedSelection.config_set_id
      selectedTargetName = parsedSelection.target_name
    }
    if (!selectedCharacter) {
      setActionMessage('Choose one public character first.')
      return
    }
    if (!rawImport.trim()) {
      setParseError('Paste a PoB share code or XML export first.')
      return
    }

    try {
      const result = await queueGuestRun.mutateAsync({
        account_name: accountName,
        character_name: selectedCharacter.name,
        raw_import: rawImport,
        target_name: selectedTargetName,
        tree_spec_id: selectedTreeSpecId,
        item_set_id: selectedItemSetId,
        skill_set_id: selectedSkillSetId,
        config_set_id: selectedConfigSetId,
      })
      setRunToken(result.run_token)
      setActionMessage(
        result.worker_notified
          ? 'Public run queued. The worker has been notified.'
          : 'Public run queued. The worker will pick it up on the next poll.',
      )
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Failed to queue Public Analysis.')
    }
  }

  const runTone = activeRun ? statusTone(activeRun.status) : null
  const RunIcon = runTone?.icon

  return (
    <div className="flex flex-col gap-6">
      <PreviewPageIntro
        mode="public"
        title="Analysis"
        description="Run Public Analysis from one public PoE1 character and a target PoB. Your latest run stays available in this browser."
        aside={
          <PreviewNotice
            mode="public"
            title="Public Quick limit"
            description="Public Analysis can queue one successful Quick run per PoE account each UTC day. Failed validation does not consume the limit."
          />
        }
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-4">
          <Card id="public-character" className="scroll-mt-6">
            <Card.Header className="px-5 pt-5 pb-0">
              <div className="flex items-start gap-3">
                <div className="bg-accent/10 text-accent flex h-10 w-10 items-center justify-center rounded-large">
                  <UserRound size={18} />
                </div>
                <div>
                  <p className="text-foreground text-sm font-semibold">Public character</p>
                  <p className="text-default-500 mt-1 text-sm">
                    Enter an account name with discriminator and select one public PoE1 character.
                  </p>
                </div>
              </div>
            </Card.Header>
            <Card.Content className="gap-4 p-5">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                <FieldInput
                  label="PoE account"
                  value={accountName}
                  onValueChange={setAccountName}
                  placeholder="AccountName#1234"
                  startContent={<Search size={16} />}
                />
                <Button
                  className="md:mb-[1px]"
                  isPending={characterLookup.isPending}
                  onPress={() => void handleLookupCharacters()}
                >
                  Find Characters
                </Button>
              </div>
              {characters.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-[minmax(12rem,18rem)_minmax(0,1fr)] md:items-end">
                  <SelectField
                    label="League"
                    selectedKey={leagueFilter}
                    onSelectionChange={(key) =>
                      handleLeagueFilterChange(typeof key === 'string' ? key : null)
                    }
                  >
                    {toSelectItems(leagueFilterOptions)}
                  </SelectField>
                  <p className="text-default-500 text-sm md:pb-2">
                    Showing {filteredCharacters.length} of {characters.length} public character
                    {characters.length === 1 ? '' : 's'}.
                  </p>
                </div>
              ) : null}
              <CharacterPicker
                characters={filteredCharacters}
                selectedCharacterName={selectedCharacter?.name ?? null}
                onSelect={setSelectedCharacter}
              />
            </Card.Content>
          </Card>

          <Card id="target-pob" className="scroll-mt-6">
            <Card.Header className="px-5 pt-5 pb-0">
              <div className="flex items-start gap-3">
                <div className="bg-warning/10 text-warning flex h-10 w-10 items-center justify-center rounded-large">
                  <FileText size={18} />
                </div>
                <div>
                  <p className="text-foreground text-sm font-semibold">Target PoB</p>
                  <p className="text-default-500 mt-1 text-sm">
                    Paste a PoB share code or XML export and choose the target layouts to score.
                  </p>
                </div>
              </div>
            </Card.Header>
            <Card.Content className="gap-4 p-5">
              <FieldInput
                label="Target name"
                value={targetName}
                onValueChange={setTargetName}
                placeholder="Mapping starter target"
              />
              <FieldTextArea
                label="PoB import"
                minRows={8}
                value={rawImport}
                onValueChange={(value) => {
                  setRawImport(value)
                  setParsedMetadata(null)
                  setParseError(null)
                }}
                placeholder="Paste PoB code or XML"
              />
              {parseError ? <p className="text-danger text-sm">{parseError}</p> : null}
              <div className="flex flex-wrap gap-2">
                <Button variant="tertiary" onPress={() => void handleParseTarget()}>
                  Read PoB Layouts
                </Button>
                {parsedMetadata ? (
                  <Chip size="sm" color="success" variant="soft">
                    {parsedMetadata.tree_specs.length} tree / {parsedMetadata.item_sets.length}{' '}
                    item / {parsedMetadata.skill_sets.length} skill
                  </Chip>
                ) : null}
              </div>

              {parsedMetadata ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <SelectField
                    label="Tree"
                    selectedKey={treeSpecId}
                    onSelectionChange={(key) =>
                      setTreeSpecId(typeof key === 'string' ? key : null)
                    }
                  >
                    {toSelectItems(parsedMetadata.tree_specs)}
                  </SelectField>
                  <SelectField
                    label="Item set"
                    selectedKey={itemSetId}
                    onSelectionChange={(key) => setItemSetId(typeof key === 'string' ? key : null)}
                  >
                    {toSelectItems(parsedMetadata.item_sets)}
                  </SelectField>
                  <SelectField
                    label="Skill set"
                    selectedKey={skillSetId}
                    onSelectionChange={(key) =>
                      setSkillSetId(typeof key === 'string' ? key : null)
                    }
                  >
                    {toSelectItems(parsedMetadata.skill_sets)}
                  </SelectField>
                  <SelectField
                    label="Config"
                    selectedKey={configSetId}
                    onSelectionChange={(key) =>
                      setConfigSetId(typeof key === 'string' ? key : null)
                    }
                  >
                    {toSelectItems(parsedMetadata.config_sets)}
                  </SelectField>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-divider/70 pt-4">
                <p className="text-default-500 text-sm">
                  Public queue mode is always Quick and never reads stash tabs.
                </p>
                <Button
                  isPending={queueGuestRun.isPending}
                  isDisabled={!selectedCharacter || !rawImport.trim()}
                  onPress={() => void handleQueueRun()}
                >
                  Run Public Quick Analysis
                </Button>
              </div>
            </Card.Content>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <PublicAnalysisFirstRunGuide
            activeRun={activeRun}
            rawImport={rawImport}
            selectedCharacter={selectedCharacter}
          />

          <Card id="current-public-run" className="scroll-mt-6">
            <Card.Content className="gap-4 p-5">
              <div className="flex items-start gap-3">
                <div className="bg-default-100 text-default-500 flex h-10 w-10 items-center justify-center rounded-large">
                  {RunIcon ? <RunIcon size={18} /> : <Sparkles size={18} />}
                </div>
                <div className="min-w-0">
                  <p className="text-foreground text-sm font-semibold">Current public run</p>
                  {activeRun ? (
                    <p className="text-default-500 mt-1 text-sm">
                      {activeRun.character_name} into {activeRun.target_name}
                    </p>
                  ) : (
                    <p className="text-default-500 mt-1 text-sm">
                      Start an analysis to see progress and results here. This browser will
                      remember your latest public run.
                    </p>
                  )}
                </div>
              </div>

              {statusLoading && runToken ? (
                <div className="text-default-500 flex items-center gap-2 text-sm">
                  <Spinner size="sm" />
                  Loading your latest public run...
                </div>
              ) : null}

              {activeRun && runTone ? (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap gap-2">
                    <Chip size="sm" color={runTone.color} variant="soft">
                      {runTone.label}
                    </Chip>
                    <Chip size="sm" variant="soft">
                      Quick
                    </Chip>
                    {activeRun.character_league ? (
                      <Chip size="sm" variant="soft">
                        {activeRun.character_league}
                      </Chip>
                    ) : null}
                  </div>
                  <p className="text-default-600 text-sm">{getRunStatusDescription(activeRun)}</p>
                  <p className="text-default-400 text-xs">
                    Queued {formatRelativeTime(activeRun.created_at) ?? activeRun.created_at}
                  </p>
                  <Button
                    size="sm"
                    variant="tertiary"
                    onPress={() => {
                      setRunToken(null)
                      setActionMessage(null)
                    }}
                  >
                    Clear Stored Run
                  </Button>
                </div>
              ) : null}

              {actionMessage ? (
                <div className="rounded-large border-divider/70 bg-default-50/60 border p-3">
                  <p className="text-default-600 text-sm">{actionMessage}</p>
                </div>
              ) : null}
            </Card.Content>
          </Card>

        </div>
      </div>

      {activeRun ? (
        <div id="public-recommendations" className="scroll-mt-6">
          <GuestRecommendations
            run={activeRun}
            plans={activePlans}
            divinePrice={divinePrice}
            isResultPending={isResultPending}
          />
        </div>
      ) : null}
    </div>
  )
}
