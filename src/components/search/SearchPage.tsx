import { useState } from 'react'
import { ToggleButton } from '@heroui/react/toggle-button'
import { ToggleButtonGroup } from '@heroui/react/toggle-button-group'
import { Card } from '@heroui/react/card'
import { Link, useNavigate } from '@tanstack/react-router'
import { Search, Users } from 'lucide-react'
import { Route } from '../../routes/dashboard/search'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { usePublicCharacterSearch, usePublicGroupSearch } from '../../hooks/usePublicDirectory'
import { useActiveGroupContext } from '../../hooks/useGroups'
import { getPoeGameShortLabel } from '../../lib/poe-game'
import { useGroupStore } from '../../store/group-store'
import { FieldInput } from '../ui/heroui-native'
import { DashboardEmptyState, DashboardPage, DashboardPageHeader } from '../ui/dashboard'
import { DirectoryCharacterCardContent, DirectoryGroupCardContent } from './DirectoryResultCards'
import { QueryFreshnessNotice, QueryStatePanel } from '../ui/QueryStatePanel'
type Mode = 'characters' | 'groups'

export function SearchPage() {
  const activeGroupId = useGroupStore((state) => state.activeGroupId)
  const { game, league: activeLeague } = useActiveGroupContext()
  const navigate = useNavigate()
  const { tab } = Route.useSearch()
  const mode = tab ?? 'characters'
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query, 250)
  const characterQuery = usePublicCharacterSearch(
    activeGroupId,
    debouncedQuery,
  )
  const groupQuery = usePublicGroupSearch(
    activeGroupId,
    debouncedQuery,
  )

  const { data: publicCharacters = [] } = characterQuery
  const { data: publicGroups = [] } = groupQuery
  const activeQuery = mode === 'characters' ? characterQuery : groupQuery
  const resultCount = mode === 'characters' ? publicCharacters.length : publicGroups.length
  const activeScopeLabel = activeLeague
    ? `${game ? `${getPoeGameShortLabel(game)} ` : ''}${activeLeague}`
    : 'your active workspace'

  const setMode = (tab: Mode) => {
    navigate({
      to: '/dashboard/search',
      search: { tab },
      replace: true,
    })
  }

  return (
    <DashboardPage>
      <DashboardPageHeader
        title="Directory"
        description={`Find public characters and groups in ${activeScopeLabel}.`}
        actions={
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
        }
      />

      <FieldInput
        label={mode === 'characters' ? 'Character name' : 'Group name'}
        placeholder="Search by name"
        size="lg"
        startContent={<Search size={18} className="text-default-400" />}
        value={query}
        onValueChange={setQuery}
        isClearable
        onClear={() => setQuery('')}
      />

      <QueryFreshnessNotice
        isRefreshing={activeQuery.isFetching && resultCount > 0}
        refreshFailed={activeQuery.isError && resultCount > 0}
        onRetry={activeQuery.refetch}
      />

      {activeQuery.isLoading ? (
        <QueryStatePanel kind="loading" title="Searching the directory" description={`Looking for public ${mode} in ${activeScopeLabel}.`} />
      ) : activeQuery.isError && resultCount === 0 ? (
        <QueryStatePanel kind="error" title="Directory search failed" description="Try again to repeat your search." onRetry={activeQuery.refetch} />
      ) : mode === 'characters' ? (
        publicCharacters.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {publicCharacters.map((character) => (
              <Link
                key={character.profile_id}
                to="/dashboard/search/characters/$profileId"
                params={{ profileId: character.profile_id }}
                aria-label={`View ${character.character_name}`}
                className="block h-full min-w-0 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <Card className="hover:border-primary/40 hover:bg-default-50 h-full border border-transparent transition-colors">
                  <DirectoryCharacterCardContent character={character} fallbackGame={game} />
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <DashboardEmptyState icon={Search} tone="arcane">
            {debouncedQuery.trim()
              ? 'No public characters match your search.'
              : `Search by name to find public characters in ${activeScopeLabel}.`}
          </DashboardEmptyState>
        )
      ) : publicGroups.length > 0 ? (
        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {publicGroups.map((group) => (
            <Link
              key={group.group_id}
              to="/dashboard/search/groups/$groupId"
              params={{ groupId: group.group_id }}
              aria-label={`View ${group.group_name}`}
              className="block h-full min-w-0 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <Card className="hover:border-primary/40 hover:bg-default-50 h-full border border-transparent transition-colors">
                <DirectoryGroupCardContent group={group} fallbackGame={game} />
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <DashboardEmptyState icon={Users} tone="arcane">
          {debouncedQuery.trim()
            ? 'No public groups match your search.'
            : 'Search by name to find groups with public characters.'}
        </DashboardEmptyState>
      )}
    </DashboardPage>
  )
}
