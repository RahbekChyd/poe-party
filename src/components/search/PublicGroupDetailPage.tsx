import { useEffect, useMemo, useState } from 'react'
import { Button } from '@heroui/react/button'
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
  const { data: dashboardGroupDetail, isLoading: dashboardGroupLoading } = usePublicGroupDetail(
    isPreview ? null : activeGroupId,
    groupId,
  )
  const { data: previewGroupDetail, isLoading: previewGroupLoading } = useGuestPublicGroupDetail(
    isPreview ? groupId : null,
  )
  const { data: dashboardPublicCharacters = [], isLoading: dashboardCharactersLoading } =
    usePublicGroupCharacters(isPreview ? null : activeGroupId, groupId)
  const { data: previewPublicCharacters = [], isLoading: previewCharactersLoading } =
    useGuestPublicGroupCharacters(isPreview ? groupId : null)
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)
  const { data: dashboardSelectedProfile, isLoading: dashboardSelectedLoading } =
    usePublicCharacterDetail(isPreview ? null : activeGroupId, selectedProfileId)
  const { data: previewSelectedProfile, isLoading: previewSelectedLoading } =
    useGuestPublicCharacterDetail(isPreview ? selectedProfileId : null)
  const groupDetail = isPreview ? previewGroupDetail : dashboardGroupDetail
  const groupLoading = isPreview ? previewGroupLoading : dashboardGroupLoading
  const publicCharacters = isPreview ? previewPublicCharacters : dashboardPublicCharacters
  const charactersLoading = isPreview ? previewCharactersLoading : dashboardCharactersLoading
  const selectedProfile = isPreview ? previewSelectedProfile : dashboardSelectedProfile
  const selectedLoading = isPreview ? previewSelectedLoading : dashboardSelectedLoading

  useEffect(() => {
    if (!publicCharacters.length) {
      setSelectedProfileId(null)
      return
    }
    if (
      selectedProfileId &&
      publicCharacters.some((character) => character.profile_id === selectedProfileId)
    ) {
      return
    }
    setSelectedProfileId(publicCharacters[0].profile_id)
  }, [publicCharacters, selectedProfileId])

  const groupGame = groupDetail?.game ?? 'poe1'
  const selectedSummary = useMemo(
    () => publicCharacters.find((character) => character.profile_id === selectedProfileId) ?? null,
    [publicCharacters, selectedProfileId],
  )
  const selectedAscendancy = selectedProfile
    ? getAscendancyLabel(selectedProfile.class, selectedProfile.ascendancy_class, groupGame)
    : selectedSummary
      ? getAscendancyLabel(selectedSummary.class, selectedSummary.ascendancy_class, groupGame)
      : null
  useRecordPublicDirectoryView('group', groupId, !!groupDetail)

  if (groupLoading) {
    return <DetailPageSkeleton />
  }

  if (!groupDetail) {
    return (
      <div className="flex flex-col gap-4">
        {isPreview ? (
          <Link to="/preview/search" className="self-start">
            <Button variant="tertiary" size="sm">
              <ArrowLeft size={14} />
              Back to Directory
            </Button>
          </Link>
        ) : (
          <Link to="/dashboard/search" className="self-start">
            <Button variant="tertiary" size="sm">
              <ArrowLeft size={14} />
              Back to Directory
            </Button>
          </Link>
        )}
        <p className="text-default-400 text-sm">Public group not found.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {isPreview ? (
            <Link to="/preview/search" className="self-start">
              <Button variant="tertiary" size="sm" className="-ml-2">
                <ArrowLeft size={14} />
                Back to Directory
              </Button>
            </Link>
          ) : (
            <Link to="/dashboard/search" className="self-start">
              <Button variant="tertiary" size="sm" className="-ml-2">
                <ArrowLeft size={14} />
                Back to Directory
              </Button>
            </Link>
          )}
          <h1 className="text-foreground mt-3 text-2xl font-semibold">{groupDetail.group_name}</h1>
          <p className="text-default-400 mt-1 text-sm">
            Public group directory for {getPoeGameShortLabel(groupGame)} {groupDetail.league}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip size="sm" variant="soft">
            {groupDetail.public_character_count} public character
            {groupDetail.public_character_count === 1 ? '' : 's'}
          </Chip>
          <Chip size="sm" variant="soft">
            {getPoeGameShortLabel(groupGame)}
          </Chip>
          <Chip size="sm" variant="soft">
            {groupDetail.league}
          </Chip>
        </div>
      </div>

      {charactersLoading ? (
        <DetailPageSkeleton />
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
                    className={`w-[18.5rem] shrink-0 border transition-all ${
                      isSelected
                        ? 'border-primary/60 bg-primary/5-lg-primary/10'
                        : 'border-transparent'
                    }`}
                  >
                    <Card.Content className="gap-4 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-foreground truncate text-sm font-medium">
                            {character.owner_name}
                          </p>
                          <p className="text-default-400 truncate text-xs">
                            {character.character_name}
                            {character.level != null ? ` - Level ${character.level}` : ''}
                          </p>
                        </div>
                        {isSelected ? (
                          <Chip size="sm" color="accent" variant="soft">
                            Selected
                          </Chip>
                        ) : null}
                      </div>

                      <button
                        type="button"
                        className="flex w-full flex-col gap-3 text-left"
                        onClick={() => setSelectedProfileId(character.profile_id)}
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
                  <h2 className="text-foreground truncate text-lg font-semibold">
                    {selectedSummary.owner_name}
                  </h2>
                  <p className="text-default-500 mt-1 truncate text-sm">
                    {selectedSummary.character_name}
                    {selectedSummary.class ? ` - ${selectedSummary.class}` : ''}
                    {selectedSummary.level != null ? ` - Level ${selectedSummary.level}` : ''}
                  </p>
                </div>

                <div className="ml-4 flex min-w-0 flex-1 flex-wrap items-start justify-end gap-2">
                  {isPreview ? (
                    <Link
                      to="/preview/search/characters/$profileId"
                      params={{ profileId: selectedSummary.profile_id }}
                    >
                      <Button size="sm" variant="tertiary">
                        Open full history
                      </Button>
                    </Link>
                  ) : (
                    <Link
                      to="/dashboard/search/characters/$profileId"
                      params={{ profileId: selectedSummary.profile_id }}
                    >
                      <Button size="sm" variant="tertiary">
                        Open full history
                      </Button>
                    </Link>
                  )}
                  {selectedProfile?.last_synced_at ? (
                    <Chip size="sm" color="accent" variant="soft">
                      Last synced {formatRelativeTimestamp(selectedProfile.last_synced_at)}
                    </Chip>
                  ) : null}
                  <Chip size="sm" variant="soft">
                    {groupDetail.group_name}
                  </Chip>
                  <Chip size="sm" variant="soft">
                    {getPoeGameShortLabel(groupGame)}
                  </Chip>
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
                <MemberCharacterDetails
                  profile={selectedProfile ?? null}
                  isPending={selectedLoading}
                  isMe={false}
                  canSync={false}
                />
              </Card.Content>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  )
}
