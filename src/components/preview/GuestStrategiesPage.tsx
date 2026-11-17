import { useMemo, useState } from 'react'
import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { ListBox } from '@heroui/react/list-box'
import { ToggleButton } from '@heroui/react/toggle-button'
import { ToggleButtonGroup } from '@heroui/react/toggle-button-group'
import { Globe } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useThreadData } from '../../hooks/useThreadData'
import { useGuestPublicStrategies } from '../../hooks/useGuestPreview'
import { usePoeGameAccess } from '../../hooks/usePoeGameAccess'
import { usePreviewLeague } from '../../hooks/usePreviewLeague'
import { DIFFICULTY_CHIP } from '../../lib/constants'
import { formatCurrencyAmount } from '../../lib/utils'
import { PreviewNotice, PreviewPageIntro } from './PreviewShared'
import { getPoeGameCapabilities, getPoeGameShortLabel } from '../../lib/poe-game'
import { trackPublicEvent } from '../../lib/analytics'
import { SelectField } from '../ui/heroui-native'
import { StrategyInfoSection } from '../strategies/StrategyInfoSection'
import { StrategyMetadataBadges } from '../strategies/StrategyMetadataBadges'
import {
  STRATEGY_CONTENT_STAGE_OPTIONS,
  type StrategyContentStage,
} from '../../lib/public-strategy-content'
import { QueryFreshnessNotice, QueryStatePanel } from '../ui/QueryStatePanel'
const divinePrice = 205
type StageFilter = StrategyContentStage | 'all'

export function GuestStrategiesPage() {
  const [stageFilter, setStageFilter] = useState<StageFilter>('all')
  const { canUsePoe2, availableGames } = usePoeGameAccess()
  const {
    leagues,
    selectedGame,
    setSelectedGame,
    selectedLeague,
    setSelectedLeague,
    isLoading: leagueLoading,
    isError: leagueError,
    isFetching: leagueFetching,
    refetch: refetchLeagues,
  } = usePreviewLeague(canUsePoe2)
  const {
    data: strategies = [],
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useGuestPublicStrategies(
    selectedGame,
    selectedLeague,
  )
  const { data: threadData = [] } = useThreadData(selectedLeague, selectedGame)
  const threadPriceMap = useMemo(
    () => new Map(threadData.map((thread) => [thread.name, thread.chaosValue])),
    [threadData],
  )
  const threadIconMap = useMemo(
    () => new Map(threadData.map((thread) => [thread.name, thread.icon])),
    [threadData],
  )
  const filteredStrategies = useMemo(
    () =>
      stageFilter === 'all'
        ? strategies
        : strategies.filter((strategy) => strategy.content_metadata?.stage === stageFilter),
    [stageFilter, strategies],
  )

  return (
    <div className="flex flex-col gap-6">
      <PreviewPageIntro
        mode="public"
        title="Strategies"
        description="Browse real public community strategies for the selected game and league. Public summaries, benchmarks, and PoE1 setup details are readable here."
        aside={
          <PreviewNotice
            mode="public"
            title="Real public listings"
            description="Titles, publishers, benchmark data, atlas setup, threads, and map cost come from live public listings. Workspace actions stay private."
          />
        }
      />

      <Card>
        <Card.Content className="gap-4 p-5 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-foreground text-sm font-medium">League-scoped live public data</p>
            <p className="text-default-500 mt-1 text-sm leading-relaxed">
              Browse real public strategies here. Creating, subscribing, and active-strategy
              tracking stay inside private workspaces.
            </p>
          </div>
          <div className="grid w-full gap-3 md:max-w-xl md:grid-cols-2">
            <SelectField
              label="Game"
              selectedKey={selectedGame}
              onSelectionChange={(value) => {
                if (typeof value === 'string' && (value === 'poe1' || value === 'poe2')) {
                  setSelectedGame(value)
                }
              }}
            >
              {availableGames.map((game) => (
                <ListBox.Item key={game.id} id={game.id} textValue={game.label}>
                  {game.label}
                </ListBox.Item>
              ))}
            </SelectField>
            <SelectField
              label="League"
              selectedKey={selectedLeague}
              onSelectionChange={(value) => {
                setSelectedLeague(typeof value === 'string' ? value : null)
              }}
              isDisabled={leagueLoading}
            >
              {leagues.map((league) => (
                <ListBox.Item key={league.id} id={league.id} textValue={league.label}>
                  {league.label}
                </ListBox.Item>
              ))}
            </SelectField>
          </div>
        </Card.Content>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <ToggleButtonGroup
          size="sm"
          className="flex max-w-full flex-wrap"
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={new Set([stageFilter])}
          onSelectionChange={(keys) => {
            const [nextStage] = Array.from(keys)
            if (
              nextStage === 'all' ||
              STRATEGY_CONTENT_STAGE_OPTIONS.some((option) => option.value === nextStage)
            ) {
              setStageFilter(nextStage as StageFilter)
            }
          }}
        >
          <ToggleButton id="all">All</ToggleButton>
          {STRATEGY_CONTENT_STAGE_OPTIONS.map((option) => (
            <ToggleButton key={option.value} id={option.value}>
              {option.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </div>

      {leagueError && leagues.length === 0 ? (
        <QueryStatePanel
          kind="error"
          title="Leagues are unavailable"
          description="We could not load the current league list. Retry before browsing strategies."
          onRetry={refetchLeagues}
        />
      ) : null}

      <QueryFreshnessNotice
        isRefreshing={(leagueFetching && leagues.length > 0) || (isFetching && strategies.length > 0)}
        refreshFailed={(leagueError && leagues.length > 0) || (isError && strategies.length > 0)}
        onRetry={() => {
          void refetchLeagues()
          void refetch()
        }}
      />

      {isError && strategies.length === 0 ? (
        <QueryStatePanel
          kind="error"
          title="Strategies could not be loaded"
          description="The public strategy directory did not respond. This is not an empty league result."
          onRetry={refetch}
        />
      ) : isLoading ? (
        <QueryStatePanel
          kind="loading"
          title="Loading strategies"
          description="Checking the selected league for public strategy listings."
        />
      ) : strategies.length === 0 ? (
        <QueryStatePanel
          kind="empty"
          icon={<Globe size={32} className="text-default-300" />}
          title={`No public strategies in ${selectedLeague ?? 'the selected league'}`}
          description="Try another game or league, or check again after new strategies are published."
        />
      ) : filteredStrategies.length === 0 ? (
        <QueryStatePanel
          kind="empty"
          icon={<Globe size={32} className="text-default-300" />}
          title="No strategies match this stage"
          description={`Try another stage or league. The current league is ${selectedLeague ?? 'not selected'}.`}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-default-500 text-sm">
              Showing {filteredStrategies.length} live public strateg
              {filteredStrategies.length === 1 ? 'y' : 'ies'}
              {selectedLeague ? ` for ${getPoeGameShortLabel(selectedGame)} ${selectedLeague}` : ''}
              .
            </p>
            <Link to="/preview/search" className="button button--sm button--tertiary">
              Open Directory
            </Link>
          </div>

          {filteredStrategies.map((strategy) => {
            const diffChip = DIFFICULTY_CHIP[strategy.difficulty] ?? DIFFICULTY_CHIP.normal
            const strategyGame = strategy.group_game ?? selectedGame
            const capabilities = getPoeGameCapabilities(strategyGame)
            const showsPoe1PlanningFields = capabilities.supportsMapInvestmentPlanning
            const benchmarkColor =
              strategy.benchmark_chaos_per_hour == null
                ? 'default'
                : strategy.benchmark_chaos_per_hour > 0
                  ? 'success'
                  : strategy.benchmark_chaos_per_hour < 0
                    ? 'danger'
                    : 'default'

            return (
              <Card key={strategy.id}>
                <Card.Content className="gap-0 p-0">
                  <div className="flex flex-wrap items-start justify-between gap-4 px-5 pt-5 pb-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-foreground font-semibold">{strategy.name}</p>
                        <Chip size="sm" color={diffChip.color} variant="soft">
                          {diffChip.label}
                        </Chip>
                        <Chip size="sm" color="accent" variant="soft">
                          Public
                        </Chip>
                        <Chip size="sm" variant="soft">
                          {strategy.group_name}
                        </Chip>
                        <Chip size="sm" variant="soft" color={benchmarkColor}>
                          {strategy.benchmark_chaos_per_hour == null
                            ? 'No benchmark'
                            : `${formatCurrencyAmount(strategy.benchmark_chaos_per_hour, 'chaos', divinePrice)}/hr`}
                        </Chip>
                        {strategy.map_cost != null ? (
                          <Chip size="sm" variant="soft">
                            ~= {formatCurrencyAmount(strategy.map_cost, 'chaos', divinePrice)}/map
                          </Chip>
                        ) : null}
                        <StrategyMetadataBadges
                          metadata={strategy.content_metadata}
                          includeVerified={false}
                        />
                      </div>

                      {strategy.description ? (
                        <p className="text-default-500 mt-2 text-sm leading-relaxed">
                          {strategy.description}
                        </p>
                      ) : null}

                      <p className="text-default-400 mt-2 text-xs">
                        {getPoeGameShortLabel(strategyGame)} {strategy.group_league} | Benchmark
                        samples: {strategy.benchmark_sample_count.toLocaleString()}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <Link
                        to="/preview/strategies/$strategyId"
                        params={{ strategyId: strategy.id }}
                        className="button button--sm"
                        onClick={() =>
                          trackPublicEvent('strategy_preview_open', {
                            strategy_id: strategy.id,
                            league: strategy.group_league,
                            game: strategy.group_game ?? selectedGame,
                          })
                        }
                      >
                        Open
                      </Link>
                    </div>
                  </div>
                  <StrategyInfoSection
                    atlasTreeUrl={showsPoe1PlanningFields ? strategy.atlas_tree_url : null}
                    threads={showsPoe1PlanningFields ? strategy.threads : []}
                    mapTradeLink={showsPoe1PlanningFields ? strategy.map_trade_link : null}
                    mapRequirements={showsPoe1PlanningFields ? strategy.map_requirements : {}}
                    threadPriceMap={threadPriceMap}
                    threadIconMap={threadIconMap}
                  />
                </Card.Content>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
