import { useState, type KeyboardEvent } from 'react'
import { ToggleButton } from '@heroui/react/toggle-button'
import { ToggleButtonGroup } from '@heroui/react/toggle-button-group'
import { Card } from '@heroui/react/card'
import { useNavigate } from '@tanstack/react-router'
import { Search, Users } from 'lucide-react'
import { Route } from '../../routes/dashboard/search'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { usePublicCharacterSearch, usePublicGroupSearch } from '../../hooks/usePublicDirectory'
import { useActiveGroupContext } from '../../hooks/useGroups'
import { getPoeGameShortLabel } from '../../lib/poe-game'
import { useGroupStore } from '../../store/group-store'
import { FieldInput } from '../ui/heroui-native'
import { HoverTooltip } from '../ui/hover-tooltip'
import { DashboardEmptyState, DashboardPage, DashboardPageHeader } from '../ui/dashboard'
import { DirectoryCharacterCardContent, DirectoryGroupCardContent } from './DirectoryResultCards'
type Mode = 'characters' | 'groups'

export function SearchPage() {
  const activeGroupId = useGroupStore((state) => state.activeGroupId)
  const { game, league: activeLeague } = useActiveGroupContext()
  const navigate = useNavigate()
  const { tab } = Route.useSearch()
  const mode = tab ?? 'characters'
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query, 250)
  const { data: publicCharacters = [], isLoading: characterLoading } = usePublicCharacterSearch(
    activeGroupId,
    debouncedQuery,
  )
  const { data: publicGroups = [], isLoading: groupLoading } = usePublicGroupSearch(
    activeGroupId,
    debouncedQuery,
  )

  const isLoading = mode === 'characters' ? characterLoading : groupLoading
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

  const handleDirectoryCardKeyDown = (
    event: KeyboardEvent<HTMLElement>,
    onActivate: () => void,
  ) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onActivate()
  }

  return (
    <DashboardPage>
      <DashboardPageHeader
        title="Directory"
        eyebrow="Public discovery"
        tone="arcane"
        description={`Search public characters or groups in ${activeScopeLabel}.`}
        actions={
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
        }
      />

      <FieldInput
        aria-label={mode === 'characters' ? 'Search public characters' : 'Search public groups'}
        placeholder={
          mode === 'characters'
            ? 'Search public character names...'
            : 'Search public groups by partial name...'
        }
        size="lg"
        startContent={<Search size={18} className="text-default-400" />}
        value={query}
        onValueChange={setQuery}
      />

      {mode === 'characters' ? (
        publicCharacters.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {publicCharacters.map((character) => (
              <HoverTooltip
                key={character.profile_id}
                closeDelay={50}
                content="Click anywhere to view this character"
                delay={150}
                placement="top"
                className="block h-full cursor-pointer"
                role="button"
                tabIndex={0}
                onClick={() =>
                  navigate({
                    to: '/dashboard/search/characters/$profileId',
                    params: { profileId: character.profile_id },
                  })
                }
                onKeyDown={(event) =>
                  handleDirectoryCardKeyDown(event, () =>
                    navigate({
                      to: '/dashboard/search/characters/$profileId',
                      params: { profileId: character.profile_id },
                    }),
                  )
                }
              >
                <Card className="hover:border-primary/40 hover:bg-default-50 h-full border border-transparent transition-colors">
                  <DirectoryCharacterCardContent character={character} fallbackGame={game} />
                </Card>
              </HoverTooltip>
            ))}
          </div>
        ) : (
          <DashboardEmptyState icon={Search} tone="arcane">
            {isLoading
              ? 'Searching public characters...'
              : debouncedQuery.trim()
                ? 'No public characters matched that search.'
                : `Start typing to search for public characters in ${activeScopeLabel}.`}
          </DashboardEmptyState>
        )
      ) : publicGroups.length > 0 ? (
        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {publicGroups.map((group) => (
            <HoverTooltip
              key={group.group_id}
              closeDelay={50}
              content="Click anywhere to view this group"
              delay={150}
              placement="top"
              className="block h-full cursor-pointer"
              role="button"
              tabIndex={0}
              onClick={() =>
                navigate({
                  to: '/dashboard/search/groups/$groupId',
                  params: { groupId: group.group_id },
                })
              }
              onKeyDown={(event) =>
                handleDirectoryCardKeyDown(event, () =>
                  navigate({
                    to: '/dashboard/search/groups/$groupId',
                    params: { groupId: group.group_id },
                  }),
                )
              }
            >
              <Card className="hover:border-primary/40 hover:bg-default-50 h-full border border-transparent transition-colors">
                <DirectoryGroupCardContent group={group} fallbackGame={game} />
              </Card>
            </HoverTooltip>
          ))}
        </div>
      ) : (
        <DashboardEmptyState icon={Users} tone="arcane">
          {isLoading
            ? 'Searching public groups...'
            : debouncedQuery.trim()
              ? 'No public groups matched that search.'
              : 'Start typing to search for groups that have public characters.'}
        </DashboardEmptyState>
      )}
    </DashboardPage>
  )
}
