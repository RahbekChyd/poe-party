import { useEffect, useState } from 'react'
import { Card } from '@heroui/react/card'
import { ToggleButton } from '@heroui/react/toggle-button'
import { ToggleButtonGroup } from '@heroui/react/toggle-button-group'
import { Link } from '@tanstack/react-router'
import { Search, Users } from 'lucide-react'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import {
  useGuestPublicCharacterSearch,
  useGuestPublicGroupSearch,
} from '../../hooks/useGuestPreview'
import { usePoeGameAccess } from '../../hooks/usePoeGameAccess'
import { usePreviewLeague } from '../../hooks/usePreviewLeague'
import { PreviewPageIntro } from './PreviewShared'
import { DiscoveryScope } from './DiscoveryFilters'
import { getPoeGameShortLabel } from '../../lib/poe-game'
import { trackPublicEvent } from '../../lib/analytics'
import { FieldInput } from '../ui/heroui-native'
import {
  DirectoryCharacterCardContent,
  DirectoryGroupCardContent,
} from '../search/DirectoryResultCards'
import { QueryFreshnessNotice, QueryStatePanel } from '../ui/QueryStatePanel'
type Mode = 'characters' | 'groups'

export function GuestDirectoryPage() {
  const [mode, setMode] = useState<Mode>('characters')
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query, 250)
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
  const characterQuery = useGuestPublicCharacterSearch(selectedGame, selectedLeague, debouncedQuery)
  const groupQuery = useGuestPublicGroupSearch(
    selectedGame,
    selectedLeague,
    debouncedQuery,
  )
  const { data: publicCharacters = [] } = characterQuery
  const { data: publicGroups = [] } = groupQuery
  const hasSearch = debouncedQuery.trim().length >= 2
  const activeQuery = mode === 'characters' ? characterQuery : groupQuery
  const isLoading = activeQuery.isLoading
  const resultCount = mode === 'characters' ? publicCharacters.length : publicGroups.length

  useEffect(() => {
    if (!hasSearch || !selectedLeague || !activeQuery.isSuccess || activeQuery.isFetching) return
    trackPublicEvent('directory_search', {
      mode,
      query_length: debouncedQuery.trim().length,
      result_count: resultCount,
      game: selectedGame,
      league: selectedLeague ?? '',
    })
  }, [activeQuery.isFetching, activeQuery.isSuccess, debouncedQuery, hasSearch, mode, resultCount, selectedGame, selectedLeague])

  return (
    <DashboardPage>
      <PreviewPageIntro
        title="Directory"
        description="Find public characters and groups by game and league."
      />

      <Card className="@container p-3 sm:p-4">
        <Card.Content className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ToggleButtonGroup
              size="sm"
              aria-label="Search for"
              selectionMode="single"
              disallowEmptySelection
              selectedKeys={new Set([mode])}
              onSelectionChange={(keys) => {
                const [value] = Array.from(keys)
                if (value === 'characters' || value === 'groups') setMode(value)
              }}
            >
              <ToggleButton id="characters">Characters</ToggleButton>
              <ToggleButton id="groups">
                <ToggleButtonGroup.Separator />
                Groups
              </ToggleButton>
            </ToggleButtonGroup>
          </div>

          <div className="grid items-end gap-3 @min-[32rem]:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
            <FieldInput
              label={mode === 'characters' ? 'Character name' : 'Group name'}
              placeholder="At least 2 characters"
              startContent={<Search size={18} className="text-default-400" />}
              value={query}
              onValueChange={setQuery}
              isClearable
              onClear={() => setQuery('')}
            />
            <DiscoveryScope
              game={selectedGame}
              league={selectedLeague}
              games={availableGames}
              leagues={leagues}
              onGameChange={setSelectedGame}
              onLeagueChange={setSelectedLeague}
            />
          </div>
        </Card.Content>
      </Card>

      {!selectedLeague && leagueError ? (
        <QueryStatePanel
          kind="error"
          title="Leagues are unavailable"
          description="Try again to load the league list."
          onRetry={refetchLeagues}
        />
      ) : null}

      <QueryFreshnessNotice
        isRefreshing={
          (leagueFetching && leagues.length > 0) ||
          (activeQuery.isFetching && resultCount > 0)
        }
        refreshFailed={
          (leagueError && leagues.length > 0) || (activeQuery.isError && resultCount > 0)
        }
        onRetry={() => {
          void refetchLeagues()
          if (selectedLeague && hasSearch) void activeQuery.refetch()
        }}
      />

      {selectedLeague && hasSearch && resultCount > 0 ? (
        <p className="text-default-500 text-sm wrap-anywhere" role="status">
          {resultCount} result{resultCount === 1 ? '' : 's'} for <strong>{debouncedQuery.trim()}</strong>
          { ` in ${getPoeGameShortLabel(selectedGame)} ${selectedLeague}.` }
        </p>
      ) : null}

      {!selectedLeague ? (
        leagueLoading ? (
          <QueryStatePanel kind="loading" title="Loading leagues" description="Getting leagues for the selected game." />
        ) : !leagueError ? (
          <QueryStatePanel kind="empty" title="No leagues available" description="Choose another game to search its directory." />
        ) : null
      ) : hasSearch && activeQuery.isError && resultCount === 0 ? (
        <QueryStatePanel
          kind="error"
          title="Directory search failed"
          description="Try again to repeat your search."
          onRetry={activeQuery.refetch}
        />
      ) : !hasSearch ? (
        <Card>
          <Card.Content className="flex flex-col items-center gap-3 p-12 text-center">
            <Search size={32} className="text-default-300" />
            <p className="text-default-400 text-sm">
              Enter at least two characters to search {selectedLeague}.
            </p>
          </Card.Content>
        </Card>
      ) : isLoading ? (
        <QueryStatePanel
          kind="loading"
          title="Searching the directory"
          description="Looking for public results in the selected game and league."
        />
      ) : mode === 'characters' ? (
        publicCharacters.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {publicCharacters.map((character) => (
              <Card
                key={character.profile_id}
                className="hover:border-primary/40 hover:bg-default-50 h-full border border-transparent transition-colors"
              >
                <Link
                  to="/preview/search/characters/$profileId"
                  params={{ profileId: character.profile_id }}
                  aria-label={`View ${character.character_name}`}
                  className="block h-full rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <DirectoryCharacterCardContent
                    character={character}
                    fallbackGame={selectedGame}
                  />
                </Link>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <Card.Content className="flex flex-col items-center gap-3 p-12 text-center">
              <Search size={32} className="text-default-300" />
              <p className="text-default-400 text-sm">No public characters matched that search.</p>
            </Card.Content>
          </Card>
        )
      ) : publicGroups.length > 0 ? (
        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {publicGroups.map((group) => (
            <Card
              key={group.group_id}
              className="hover:border-primary/40 hover:bg-default-50 h-full border border-transparent transition-colors"
            >
              <Link
                to="/preview/search/groups/$groupId"
                params={{ groupId: group.group_id }}
                aria-label={`View ${group.group_name}`}
                className="block h-full rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <DirectoryGroupCardContent
                  group={group}
                  fallbackGame={selectedGame}
                />
              </Link>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <Card.Content className="flex flex-col items-center gap-3 p-12 text-center">
            <Users size={32} className="text-default-300" />
            <p className="text-default-400 text-sm">No public groups matched that search.</p>
          </Card.Content>
        </Card>
      )}
    </DashboardPage>
  )
}
import { DashboardPage } from '../ui/dashboard'
