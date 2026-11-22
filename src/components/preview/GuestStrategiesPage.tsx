import { useMemo, useState } from 'react'
import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { Globe } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useThreadData } from '../../hooks/useThreadData'
import { useGuestPublicStrategies } from '../../hooks/useGuestPreview'
import { usePoeGameAccess } from '../../hooks/usePoeGameAccess'
import { usePreviewLeague } from '../../hooks/usePreviewLeague'
import { DIFFICULTY_CHIP } from '../../lib/constants'
import { formatCurrencyAmount } from '../../lib/utils'
import { PreviewPageIntro } from './PreviewShared'
import { DiscoveryScope } from './DiscoveryFilters'
import { getPoeGameCapabilities, getPoeGameShortLabel } from '../../lib/poe-game'
import { trackPublicEvent } from '../../lib/analytics'
import { StrategyInfoSection } from '../strategies/StrategyInfoSection'
import { StrategyMetadataBadges } from '../strategies/StrategyMetadataBadges'
import { StrategySearch } from '../strategies/StrategySearch'
import {
  STRATEGY_STAGE_FILTER_OPTIONS,
  type StrategyContentStage,
} from '../../lib/public-strategy-content'
import { QueryFreshnessNotice, QueryStatePanel } from '../ui/QueryStatePanel'
import { ResponsiveFilter } from '../ui/ResponsiveFilter'
import { DashboardPage } from '../ui/dashboard'
import '../strategies/strategy-library.css'

const divinePrice = 205
type StageFilter = StrategyContentStage | 'all'

export function GuestStrategiesPage() {
  const [stageFilter, setStageFilter] = useState<StageFilter>('all')
  const [search, setSearch] = useState('')
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
  const searchTerm = search.trim().toLowerCase()
  const filteredStrategies = useMemo(
    () => strategies.filter((strategy) =>
      (stageFilter === 'all' || strategy.content_metadata?.stage === stageFilter) &&
      strategy.name.toLowerCase().includes(searchTerm),
    ),
    [searchTerm, stageFilter, strategies],
  )

  return (
    <DashboardPage>
      <PreviewPageIntro
        title="Strategies"
        description="Find community strategies and compare benchmarks."
      />

      <section aria-label="Strategy listings" className="flex min-w-0 flex-col gap-4">
        <header className="strategy-library-toolbar">
          <div className="grid min-w-0 items-start gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)] md:max-w-3xl">
            <StrategySearch value={search} onChange={setSearch} />
            <DiscoveryScope
              game={selectedGame}
              league={selectedLeague}
              games={availableGames}
              leagues={leagues}
              onGameChange={setSelectedGame}
              onLeagueChange={setSelectedLeague}
            />
          </div>
          <ResponsiveFilter
            label="Strategy stage"
            options={STRATEGY_STAGE_FILTER_OPTIONS}
            value={stageFilter}
            onChange={setStageFilter}
          />
        </header>

        {!selectedLeague && leagueError ? (
          <QueryStatePanel
            kind="error"
            title="Leagues are unavailable"
            description="Try again to load the league list."
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

        {!selectedLeague ? (
          leagueLoading ? (
            <QueryStatePanel kind="loading" title="Loading leagues" description="Getting leagues for the selected game." />
          ) : !leagueError ? (
            <QueryStatePanel kind="empty" title="No leagues available" description="Choose another game to browse its strategies." />
          ) : null
        ) : isError && strategies.length === 0 ? (
          <QueryStatePanel
            kind="error"
            title="Strategies could not be loaded"
            description="Try again to reload the selected league’s strategies."
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
            title={searchTerm ? 'No strategies match this search and stage' : 'No strategies match this stage'}
            description={searchTerm ? 'Try another name, stage, or league.' : 'Choose another stage or league.'}
          />
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-default-500 text-sm wrap-anywhere" role="status">
              {filteredStrategies.length} {filteredStrategies.length === 1 ? 'strategy' : 'strategies'}
            </p>

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
                <Card key={strategy.id} className="p-0">
                  <Card.Content className="gap-0 p-0">
                    <div className="flex flex-wrap items-start justify-between gap-3 p-4">
                      <div className="min-w-0 basis-full wrap-anywhere sm:flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-foreground font-semibold">{strategy.name}</h2>
                          <Chip size="sm" variant="soft">
                            {diffChip.label}
                          </Chip>
                          <Chip size="sm" variant="soft" color={benchmarkColor}>
                            {strategy.benchmark_chaos_per_hour == null
                              ? 'No benchmark'
                              : `${formatCurrencyAmount(strategy.benchmark_chaos_per_hour, 'chaos', divinePrice)}/hr`}
                          </Chip>
                          {showsPoe1PlanningFields && strategy.map_cost != null ? (
                            <Chip size="sm" variant="soft">
                              ~{formatCurrencyAmount(strategy.map_cost, 'chaos', divinePrice)}/map
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
                          {strategy.group_name} · {getPoeGameShortLabel(strategyGame)} {strategy.group_league}
                          {strategy.benchmark_sample_count > 0
                            ? ` · ${strategy.benchmark_sample_count.toLocaleString()} benchmark ${strategy.benchmark_sample_count === 1 ? 'sample' : 'samples'}`
                            : ''}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <Link
                          to="/preview/strategies/$strategyId"
                          params={{ strategyId: strategy.id }}
                          className="button button--sm button--primary"
                          onClick={() =>
                            trackPublicEvent('strategy_preview_open', {
                              strategy_id: strategy.id,
                              league: strategy.group_league,
                              game: strategy.group_game ?? selectedGame,
                            })
                          }
                        >
                          View strategy
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
      </section>
    </DashboardPage>
  )
}
