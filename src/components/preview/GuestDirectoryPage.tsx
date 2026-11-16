import { useEffect, useState } from 'react'
import { Button } from '@heroui/react/button'
import { Card } from '@heroui/react/card'
import { ListBox } from '@heroui/react/list-box'
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
import { PreviewNotice, PreviewPageIntro } from './PreviewShared'
import { getPoeGameShortLabel } from '../../lib/poe-game'
import { trackPublicEvent } from '../../lib/analytics'
import { FieldInput, SelectField } from '../ui/heroui-native'
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
    if (!hasSearch || isLoading) return
    trackPublicEvent('directory_search', {
      mode,
      query_length: debouncedQuery.trim().length,
      result_count: resultCount,
      game: selectedGame,
      league: selectedLeague ?? '',
    })
  }, [debouncedQuery, hasSearch, isLoading, mode, resultCount, selectedGame, selectedLeague])

  return (
    <div className="flex flex-col gap-6">
      <PreviewPageIntro
        mode="public"
        title="Directory"
        description="Search real public characters and groups for the selected game and league. Result cards open read-only public detail pages with shared profile data."
        aside={
          <PreviewNotice
            mode="public"
            title="Real public discovery"
            description="The directory uses live public listings. Private stash, party management, and workspace actions stay out of the public view."
          />
        }
      />

      <Card>
        <Card.Content className="gap-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-foreground text-sm font-medium">League-scoped public search</p>
              <p className="text-default-500 mt-1 text-sm">
                Search public characters or groups in the selected league. Result cards are live,
                and their public detail pages open from the cards.
              </p>
            </div>
            <ToggleButtonGroup
              size="sm"
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

          <div className="grid gap-3 md:grid-cols-[0.5fr_0.2fr_0.3fr]">
            <FieldInput
              aria-label={
                mode === 'characters' ? 'Search public characters' : 'Search public groups'
              }
              placeholder={
                mode === 'characters'
                  ? 'Search public character names (min. 2 characters)...'
                  : 'Search public groups (min. 2 characters)...'
              }
              startContent={<Search size={18} className="text-default-400" />}
              value={query}
              onValueChange={setQuery}
              isClearable
              onClear={() => setQuery('')}
            />
            <SelectField
              aria-label="Game"
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
              aria-label="League"
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

      {leagueError && leagues.length === 0 ? (
        <QueryStatePanel
          kind="error"
          title="Leagues are unavailable"
          description="We could not load the current league list. Retry before searching the directory."
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
          void activeQuery.refetch()
        }}
      />

      {hasSearch && !isLoading ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-default-500 text-sm">
            Showing {resultCount} live public {mode} result{resultCount === 1 ? '' : 's'} for{' '}
            <span className="text-default-700 font-medium">{debouncedQuery.trim()}</span>
            {selectedLeague ? ` in ${getPoeGameShortLabel(selectedGame)} ${selectedLeague}` : ''}.
          </p>
          <Button size="sm" variant="tertiary" onPress={() => setQuery('')}>
            Clear Search
          </Button>
        </div>
      ) : null}

      {hasSearch && activeQuery.isError && resultCount === 0 ? (
        <QueryStatePanel
          kind="error"
          title="Directory search failed"
          description="The public directory did not respond. Your search is still here; retry when ready."
          onRetry={activeQuery.refetch}
        />
      ) : !hasSearch ? (
        <Card>
          <Card.Content className="flex flex-col items-center gap-3 p-12 text-center">
            <Search size={32} className="text-default-300" />
            <p className="text-default-400 text-sm">
              Start with at least two characters to search the live public directory for{' '}
              {selectedLeague ?? 'the selected league'}.
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
                  className="block h-full"
                >
                  <DirectoryCharacterCardContent
                    character={character}
                    fallbackGame={selectedGame}
                    actionLabel="Open"
                    statusLabel="Live result"
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
                className="block h-full"
              >
                <DirectoryGroupCardContent
                  group={group}
                  fallbackGame={selectedGame}
                  actionLabel="Open"
                  statusLabel="Live result"
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
    </div>
  )
}
