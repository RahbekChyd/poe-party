import { useState } from 'react'
import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { ArrowLeft } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { Route } from '../../routes/dashboard/search/groups/$groupId'
import { useGroupStore } from '../../store/group-store'
import {
  useGuestPublicCharacterDetail,
  useGuestPublicGroupCharacters,
  useGuestPublicGroupDetail,
  usePublicCharacterDetail,
  usePublicGroupCharacters,
  usePublicGroupDetail,
  useRecordPublicDirectoryView,
} from '../../hooks/usePublicDirectory'
import { formatRelativeTimestamp, getAscendancyLabel } from '../../lib/character-profile'
import { getPoePortraitImagePath } from '../../lib/poe-class-art'
import { getPoeGameShortLabel } from '../../lib/poe-game'
import { DetailPageSkeleton } from '../layout/Skeletons'
import { MemberCharacterDetails } from '../members/MemberCharacterDetails'
import { AscendancyArt } from '../shared/AscendancyArt'
import { QueryStatePanel } from '../ui/QueryStatePanel'

export function PublicGroupDetailPage() {
  const { groupId } = Route.useParams()
  return <PublicGroupDetailView groupId={groupId} variant="dashboard" />
}

export function PublicGroupDetailView({
  groupId,
  variant,
}: {
  groupId: string
  variant: 'dashboard' | 'preview'
}) {
  const activeGroupId = useGroupStore((state) => state.activeGroupId)
  const isPreview = variant === 'preview'
  const dashboardGroupQuery = usePublicGroupDetail(
    isPreview ? null : activeGroupId,
    groupId,
  )
  const previewGroupQuery = useGuestPublicGroupDetail(
    isPreview ? groupId : null,
  )
  const dashboardCharactersQuery =
    usePublicGroupCharacters(isPreview ? null : activeGroupId, groupId)
  const previewCharactersQuery =
    useGuestPublicGroupCharacters(isPreview ? groupId : null)
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null)
  const groupQuery = isPreview ? previewGroupQuery : dashboardGroupQuery
  const charactersQuery = isPreview ? previewCharactersQuery : dashboardCharactersQuery
  const groupDetail = groupQuery.data
  const publicCharacters = charactersQuery.data ?? []
  const selectedSummary = publicCharacters.find((character) => character.profile_id === selectedCharacterId)
    ?? publicCharacters[0]
  const selectedProfileId = selectedSummary?.profile_id ?? null
  const dashboardSelectedQuery =
    usePublicCharacterDetail(isPreview ? null : activeGroupId, selectedProfileId)
  const previewSelectedQuery =
    useGuestPublicCharacterDetail(isPreview ? selectedProfileId : null)
  const selectedQuery = isPreview ? previewSelectedQuery : dashboardSelectedQuery
  const selectedProfile = selectedQuery.data

  const groupGame = groupDetail?.game ?? 'poe1'
  const selectedAscendancy = selectedProfile
    ? getAscendancyLabel(selectedProfile.class, selectedProfile.ascendancy_class, groupGame)
    : selectedSummary
      ? getAscendancyLabel(selectedSummary.class, selectedSummary.ascendancy_class, groupGame)
      : null
  useRecordPublicDirectoryView('group', groupId, !!groupDetail)

  if (groupQuery.isLoading) {
    return <DetailPageSkeleton />
  }

  const backLink = isPreview ? (
    <Link to="/preview/search" className="button button--sm button--tertiary self-start">
      <ArrowLeft size={14} aria-hidden="true" /> Back to directory
    </Link>
  ) : (
    <Link to="/dashboard/search" search={{ tab: 'groups' }} className="button button--sm button--tertiary self-start">
      <ArrowLeft size={14} aria-hidden="true" /> Back to directory
    </Link>
  )

  if (!groupDetail) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <h1 className="text-2xl font-semibold">{groupQuery.isError ? 'Group unavailable' : 'Group not found'}</h1>
        {groupQuery.isError ? (
          <QueryStatePanel kind="error" title="Could not load group" description="Try again to open the public group." onRetry={groupQuery.refetch} />
        ) : (
          <p className="text-default-500 text-sm">This group may have been removed or no longer has public characters.</p>
        )}
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-6 wrap-anywhere">
      {backLink}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-foreground text-2xl font-semibold">{groupDetail.group_name}</h1>
          <p className="text-default-500 mt-1 text-sm">
            {getPoeGameShortLabel(groupGame)} · {groupDetail.league}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip size="sm" variant="soft">
            {groupDetail.public_character_count} public character
            {groupDetail.public_character_count === 1 ? '' : 's'}
          </Chip>
        </div>
      </div>

      {charactersQuery.isLoading ? (
        <DetailPageSkeleton />
      ) : !publicCharacters.length ? (
        charactersQuery.isError ? (
          <QueryStatePanel kind="error" title="Could not load characters" description="Try again to see this group’s public profiles." onRetry={charactersQuery.refetch} />
        ) : (
          <QueryStatePanel kind="empty" title="No public characters" description="This group has no shared profiles to view." />
        )
      ) : (
        <div className="flex flex-col gap-4">
          <div className="-mx-1 overflow-x-auto pb-2">
            <div className="flex min-w-max gap-3 px-1">
              {publicCharacters.map((character) => {
                const isSelected = character.profile_id === selectedProfileId
                const ascendancy = getAscendancyLabel(
                  character.class,
                  character.ascendancy_class,
                  groupGame,
                )
                const portraitImagePath =
                  character.class && character.ascendancy_class != null
                    ? getPoePortraitImagePath(
                        character.class,
                        character.ascendancy_class,
                        groupGame,
                      )
                    : null

                return (
                  <Card
                    key={character.profile_id}
                    className={`w-[18.5rem] max-w-[calc(100vw-2rem)] shrink-0 border transition-colors ${
                      isSelected
                        ? 'border-highlight bg-selected'
                        : 'border-transparent'
                    }`}
                  >
                    <Card.Content className="gap-4 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-foreground text-sm font-medium">
                            {character.owner_name}
                          </p>
                          <p className="text-default-500 text-xs">
                            {character.character_name}
                            {character.level != null ? ` - Level ${character.level}` : ''}
                          </p>
                        </div>
                        {isSelected ? (
                          <Chip size="sm" variant="soft" className="text-highlight">
                            Selected
                          </Chip>
                        ) : null}
                      </div>

                      <button
                        type="button"
                        aria-label={`View ${character.character_name}`}
                        aria-pressed={isSelected}
                        className="flex w-full flex-col gap-3 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        onClick={() => setSelectedCharacterId(character.profile_id)}
                      >
                        <AscendancyArt
                          ascendancy={ascendancy}
                          poeClass={character.class}
                          imagePath={portraitImagePath}
                        />

                        <div className="flex flex-wrap gap-2">
                          {character.class ? (
                            <Chip size="sm" variant="soft">
                              {character.class}
                            </Chip>
                          ) : null}
                          {ascendancy ? (
                            <Chip size="sm" variant="soft">
                              {ascendancy}
                            </Chip>
                          ) : null}
                        </div>

                        <div className="flex items-center justify-between gap-3">
                          <p className="text-default-500 text-xs">
                            {character.class
                              ? `${character.class}${character.level != null ? ` - Level ${character.level}` : ''}`
                              : 'Public character'}
                          </p>
                          <Chip size="sm" variant="soft">
                            Public
                          </Chip>
                        </div>
                      </button>
                    </Card.Content>
                  </Card>
                )
              })}
            </div>
          </div>

          {selectedSummary ? (
            <Card>
              <Card.Header className="flex flex-wrap items-start justify-between gap-4 px-5 pt-5 pb-0">
                <div className="min-w-0">
                  <h2 className="text-foreground text-lg font-semibold">
                    {selectedSummary.owner_name}
                  </h2>
                  <p className="text-default-500 mt-1 text-sm">
                    {selectedSummary.character_name}
                    {selectedSummary.class ? ` - ${selectedSummary.class}` : ''}
                    {selectedSummary.level != null ? ` - Level ${selectedSummary.level}` : ''}
                  </p>
                </div>

                <div className="flex min-w-0 flex-wrap items-start gap-2">
                  <Link
                    to={isPreview ? '/preview/search/characters/$profileId' : '/dashboard/search/characters/$profileId'}
                    params={{ profileId: selectedSummary.profile_id }}
                    className="button button--sm button--tertiary"
                  >
                    View profile history
                  </Link>
                  {selectedProfile?.last_synced_at ? (
                    <Chip size="sm" variant="soft">
                      Last synced {formatRelativeTimestamp(selectedProfile.last_synced_at)}
                    </Chip>
                  ) : null}
                  {(selectedProfile?.class ?? selectedSummary.class) ? (
                    <Chip size="sm" variant="soft">
                      {selectedProfile?.class ?? selectedSummary.class}
                    </Chip>
                  ) : null}
                  {selectedAscendancy ? (
                    <Chip size="sm" variant="soft">
                      {selectedAscendancy}
                    </Chip>
                  ) : null}
                </div>
              </Card.Header>

              <Card.Content className="gap-4 p-0">
                {selectedQuery.isError && !selectedProfile ? (
                  <QueryStatePanel kind="error" title="Could not load profile" description="Try again or choose another character." onRetry={selectedQuery.refetch} />
                ) : (
                  <MemberCharacterDetails
                    profile={selectedProfile ?? null}
                    isPending={selectedQuery.isLoading}
                    isMe={false}
                    canSync={false}
                  />
                )}
              </Card.Content>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  )
}
