import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@heroui/react/button'
import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { ListBox } from '@heroui/react/list-box'
import { Spinner } from '@heroui/react/spinner'
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Search,
  Sparkles,
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
import { PreviewPageIntro } from './PreviewShared'

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
  color: 'default' | 'warning' | 'success' | 'danger'
  label: string
  icon: typeof Clock3
} {
  switch (status) {
    case 'queued':
      return { color: 'default', label: 'Queued', icon: Clock3 }
    case 'running':
      return { color: 'default', label: 'Running', icon: Sparkles }
    case 'completed':
      return { color: 'success', label: 'Completed', icon: CheckCircle2 }
    case 'partial':
      return { color: 'warning', label: 'Partial', icon: AlertTriangle }
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
          <Spinner color="current" className="text-info" />
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
      <Card className="border-danger/40 bg-danger-soft border">
        <Card.Content className="gap-2 p-5">
          <p role="alert" className="text-danger text-sm font-semibold">Public analysis failed</p>
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
  selectedCharacter,
  isDisabled,
  onSelect,
}: {
  characters: GuestCharacterSummary[]
  selectedCharacter: GuestCharacterSummary | null
  isDisabled: boolean
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
            disabled={isDisabled}
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
  const [accountName, setAccountName] = useState('')
  const [resolvedAccountName, setResolvedAccountName] = useState<string | null>(null)
  const [characterMessage, setCharacterMessage] = useState<{ text: string; error?: boolean } | null>(null)
  const lookupRevision = useRef(0)
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
  const [queueError, setQueueError] = useState<string | null>(null)
  const [targetAction, setTargetAction] = useState<'parse' | 'queue' | null>(null)
  const targetActionPending = useRef(false)
  const [runNotice, setRunNotice] = useState<string | null>(null)
  const [runToken, setRunToken] = useState<string | null>(() => readStoredGuestRunToken())
  const characterLookup = useGuestCharacterLookup()
  const queueGuestRun = useQueueGuestUpgradeAnalysis()
  const {
    data: statusData,
    error: statusError,
    isLoading: statusLoading,
    isResultPending,
    retry: retryStatus,
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
    if (statusError?.message.match(/^Public Analysis run not found(?: or expired)?\.?$/i)) {
      setRunToken(null)
      setRunNotice('This analysis is no longer available. Run a new analysis to get fresh results.')
    }
  }, [statusError])

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

  async function readTarget() {
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

  async function handleParseTarget() {
    if (targetActionPending.current || !rawImport.trim()) return
    targetActionPending.current = true
    setTargetAction('parse')
    try {
      await readTarget()
    } finally {
      targetActionPending.current = false
      setTargetAction(null)
    }
  }

  async function handleQueueRun() {
    if (targetActionPending.current || !selectedCharacter || !resolvedAccountName || !rawImport.trim()) return
    targetActionPending.current = true
    setTargetAction('queue')
    setQueueError(null)

    try {
      const selection = parsedMetadata ? {
        target_name: targetName,
        tree_spec_id: treeSpecId,
        item_set_id: itemSetId,
        skill_set_id: skillSetId,
        config_set_id: configSetId,
      } : await readTarget()
      if (!selection) return

      const result = await queueGuestRun.mutateAsync({
        account_name: resolvedAccountName,
        character_name: selectedCharacter.name,
        raw_import: rawImport,
        ...selection,
      })
      setRunToken(result.run_token)
      setRunNotice('Quick analysis queued.')
    } catch (error) {
      setQueueError(error instanceof Error ? error.message : 'Could not queue the analysis. Try again.')
    } finally {
      targetActionPending.current = false
      setTargetAction(null)
    }
  }

  const runTone = activeRun ? statusTone(activeRun.status) : null
  const RunIcon = runTone?.icon

  return (
    <div className="flex flex-col gap-6">
      <PreviewPageIntro
        mode="public"
        title="Analysis"
        description="Compare a public PoE1 character with a Path of Building target to find upgrades."
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card id="public-character" className="scroll-mt-6 p-0">
            <Card.Header className="flex-col items-start gap-1 px-4 pt-4 pb-0 sm:px-5 sm:pt-5">
              <h2 className="text-foreground text-base font-semibold">Find a character</h2>
              <p className="text-default-500 text-sm">Enter your account name, including the number after #.</p>
            </Card.Header>
            <Card.Content className="gap-4 p-4 sm:p-5">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                <FieldInput
                  label="PoE account"
                  value={accountName}
                  onValueChange={handleAccountChange}
                  isDisabled={targetAction === 'queue'}
                  placeholder="AccountName#1234"
                  startContent={<Search size={16} />}
                />
                <Button
                  className="md:mb-[1px]"
                  variant={selectedCharacter ? 'tertiary' : 'primary'}
                  isPending={characterLookup.isPending}
                  isDisabled={!accountName.trim() || targetAction === 'queue'}
                  onPress={() => void handleLookupCharacters()}
                >
                  Find characters
                </Button>
              </div>
              {characterMessage ? (
                <p
                  role={characterMessage.error ? 'alert' : 'status'}
                  className={characterMessage.error ? 'text-danger wrap-anywhere text-sm' : 'text-default-500 text-sm'}
                >
                  {characterMessage.text}
                </p>
              ) : null}
              {characters.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-[minmax(12rem,18rem)_minmax(0,1fr)] md:items-end">
                  <SelectField
                    label="League"
                    selectedKey={leagueFilter}
                    isDisabled={targetAction === 'queue'}
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
                selectedCharacter={selectedCharacter}
                isDisabled={targetAction === 'queue'}
                onSelect={setSelectedCharacter}
              />
            </Card.Content>
          </Card>

          <Card id="target-pob" className="scroll-mt-6 p-0">
            <Card.Header className="flex-col items-start gap-1 px-4 pt-4 pb-0 sm:px-5 sm:pt-5">
              <h2 className="text-foreground text-base font-semibold">Choose a PoB target</h2>
              <p className="text-default-500 text-sm">Paste a share code or XML export. Read the layouts to choose which ones to use.</p>
            </Card.Header>
            <Card.Content className="gap-4 p-4 sm:p-5">
              <FieldInput
                label="Target name"
                value={targetName}
                onValueChange={setTargetName}
                isDisabled={targetAction !== null}
                placeholder="Mapping starter target"
              />
              <FieldTextArea
                label="PoB import"
                minRows={5}
                value={rawImport}
                isDisabled={targetAction !== null}
                onValueChange={(value) => {
                  setRawImport(value)
                  setParsedMetadata(null)
                  setParseError(null)
                  setQueueError(null)
                }}
                placeholder="Paste PoB code or XML"
              />
              {parseError ? <p role="alert" className="text-danger wrap-anywhere text-sm">{parseError}</p> : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="tertiary"
                  isDisabled={!rawImport.trim() || targetAction === 'queue'}
                  isPending={targetAction === 'parse'}
                  onPress={() => void handleParseTarget()}
                >
                  Read PoB layouts
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
                    isDisabled={targetAction === 'queue'}
                    onSelectionChange={(key) =>
                      setTreeSpecId(typeof key === 'string' ? key : null)
                    }
                  >
                    {toSelectItems(parsedMetadata.tree_specs)}
                  </SelectField>
                  <SelectField
                    label="Item set"
                    selectedKey={itemSetId}
                    isDisabled={targetAction === 'queue'}
                    onSelectionChange={(key) => setItemSetId(typeof key === 'string' ? key : null)}
                  >
                    {toSelectItems(parsedMetadata.item_sets)}
                  </SelectField>
                  <SelectField
                    label="Skill set"
                    selectedKey={skillSetId}
                    isDisabled={targetAction === 'queue'}
                    onSelectionChange={(key) =>
                      setSkillSetId(typeof key === 'string' ? key : null)
                    }
                  >
                    {toSelectItems(parsedMetadata.skill_sets)}
                  </SelectField>
                  <SelectField
                    label="Configuration"
                    selectedKey={configSetId}
                    isDisabled={targetAction === 'queue'}
                    onSelectionChange={(key) =>
                      setConfigSetId(typeof key === 'string' ? key : null)
                    }
                  >
                    {toSelectItems(parsedMetadata.config_sets)}
                  </SelectField>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-divider/70 pt-4">
                <div className="min-w-0">
                  <p className="text-foreground text-sm font-medium">
                    {!selectedCharacter
                      ? 'Find and select a public character.'
                      : !rawImport.trim()
                        ? 'Paste a PoB share code or XML export.'
                        : parseError
                          ? 'Check the PoB import before running analysis.'
                          : 'Ready for Quick analysis.'}
                  </p>
                  <p className="text-default-500 mt-1 text-xs">
                    One Quick run per PoE account per UTC day. Failed validation does not count.
                  </p>
                </div>
                <Button
                  isPending={targetAction === 'queue'}
                  isDisabled={!resolvedAccountName || !selectedCharacter || !rawImport.trim() || targetAction === 'parse'}
                  onPress={() => void handleQueueRun()}
                >
                  Run Quick analysis
                </Button>
              </div>
              {queueError ? <p role="alert" className="text-danger wrap-anywhere text-sm">{queueError}</p> : null}
            </Card.Content>
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card id="current-public-run" className="scroll-mt-6 p-0">
            <Card.Content className="gap-4 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                {RunIcon ? <RunIcon size={18} className="text-default-500 mt-0.5 shrink-0" aria-hidden="true" /> : null}
                <div className="min-w-0">
                  <h2 className="text-foreground text-sm font-semibold">Current public run</h2>
                  {activeRun ? (
                    <p className="text-default-500 wrap-anywhere mt-1 text-sm">
                      {activeRun.character_name} compared with {activeRun.target_name}
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
                <div role="status" className="text-default-500 flex items-center gap-2 text-sm">
                  <Spinner size="sm" />
                  Loading your latest analysis…
                </div>
              ) : null}

              {activeRun && runTone ? (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap gap-2">
                    <Chip
                      size="sm"
                      color={runTone.color}
                      variant="soft"
                      className={activeRun.status === 'running' ? 'bg-info-soft text-info' : undefined}
                    >
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
                      setRunNotice(null)
                    }}
                  >
                    Clear saved run
                  </Button>
                </div>
              ) : null}

              {runToken && statusError ? (
                <div className="flex flex-wrap items-center gap-2">
                  <p role="alert" className="text-danger text-sm">Could not load the latest analysis results.</p>
                  <Button size="sm" variant="tertiary" onPress={() => void retryStatus()}>
                    Try again
                  </Button>
                </div>
              ) : null}
              {runNotice ? <p role="status" className="text-default-600 text-sm">{runNotice}</p> : null}
            </Card.Content>
          </Card>

        </div>
      </div>

      {activeRun && (!statusError || activePlans.length > 0) ? (
        <div id="public-recommendations" className="scroll-mt-6">
          <GuestRecommendations
            run={activeRun}
            plans={activePlans}
            divinePrice={divinePrice}
            isResultPending={isResultPending && !statusError}
          />
        </div>
      ) : null}
    </div>
  )
}
