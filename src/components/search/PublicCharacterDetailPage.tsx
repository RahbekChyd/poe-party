import { useState } from 'react'
import { Card } from '@heroui/react/card'
import { Chip } from '@heroui/react/chip'
import { ArrowLeft } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { Route } from '../../routes/dashboard/search/characters/$profileId'
import {
  useGuestPublicCharacterDailySnapshotDetail,
  useGuestPublicCharacterDailySnapshotSummaries,
  useGuestPublicCharacterDetail,
  usePublicCharacterDailySnapshotDetail,
  usePublicCharacterDailySnapshotSummaries,
  usePublicCharacterDetail,
  useRecordPublicDirectoryView,
} from '../../hooks/usePublicDirectory'
import { useActiveGroupContext } from '../../hooks/useGroups'
import { getPoeGameShortLabel } from '../../lib/poe-game'
import { useGroupStore } from '../../store/group-store'
import { formatRelativeTimestamp } from '../../lib/character-profile'
import { DetailPageSkeleton } from '../layout/Skeletons'
import { MemberCharacterDetails } from '../members/MemberCharacterDetails'
import { ListBox, SelectField } from '../ui/heroui-native'
import { QueryStatePanel } from '../ui/QueryStatePanel'

const latestProfileKey = 'latest'

function formatSnapshotDateUtc(snapshotDate: string): string {
  return `${snapshotDate} UTC`
}

export function PublicCharacterDetailPage() {
  const { profileId } = Route.useParams()
  return <PublicCharacterDetailView profileId={profileId} variant="dashboard" />
}

export function PublicCharacterDetailView({
  profileId,
  variant,
}: {
  profileId: string
  variant: 'dashboard' | 'preview'
}) {
  const activeGroupId = useGroupStore((state) => state.activeGroupId)
  const { game } = useActiveGroupContext()
  const isPreview = variant === 'preview'
  const dashboardQuery = usePublicCharacterDetail(
    isPreview ? null : activeGroupId,
    profileId,
  )
  const previewQuery = useGuestPublicCharacterDetail(
    isPreview ? profileId : null,
  )
  const dashboardSummariesQuery =
    usePublicCharacterDailySnapshotSummaries(isPreview ? null : activeGroupId, profileId)
  const previewSummariesQuery =
    useGuestPublicCharacterDailySnapshotSummaries(isPreview ? profileId : null)
  const [selectedDailySnapshotId, setSelectedDailySnapshotId] = useState<string | null>(null)
  const summariesQuery = isPreview ? previewSummariesQuery : dashboardSummariesQuery
  const dailySummaries = summariesQuery.data ?? []
  const selectedSummary = dailySummaries.find((entry) => entry.id === selectedDailySnapshotId)
  const snapshotId = selectedSummary?.id ?? null
  const dashboardDailyQuery =
    usePublicCharacterDailySnapshotDetail(
      isPreview ? null : activeGroupId,
      profileId,
      snapshotId,
    )
  const previewDailyQuery =
    useGuestPublicCharacterDailySnapshotDetail(
      isPreview ? profileId : null,
      snapshotId,
    )
  const detailQuery = isPreview ? previewQuery : dashboardQuery
  const dailyQuery = isPreview ? previewDailyQuery : dashboardDailyQuery
  const detail = detailQuery.data
  const selectedProfile = snapshotId ? dailyQuery.data : detail
  const profileIsLoading = !!snapshotId && dailyQuery.isLoading
  const displayGame = detail?.group_game ?? game
  useRecordPublicDirectoryView('character', profileId, !!detail)

  if (detailQuery.isLoading) {
    return <DetailPageSkeleton />
  }

  const backLink = (
    <Link
      to={isPreview ? '/preview/search' : '/dashboard/search'}
      className="button button--sm button--tertiary self-start"
    >
      <ArrowLeft size={14} aria-hidden="true" /> Back to directory
    </Link>
  )

  if (!detail) {
    return (
      <div className="flex flex-col gap-4">
        {backLink}
        <h1 className="text-2xl font-semibold">{detailQuery.isError ? 'Character unavailable' : 'Character not found'}</h1>
        {detailQuery.isError ? (
          <QueryStatePanel kind="error" title="Could not load character" description="Try again to open the public profile." onRetry={detailQuery.refetch} />
        ) : (
          <p className="text-default-500 text-sm">This profile may have been removed or made private.</p>
        )}
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-6 wrap-anywhere">
      {backLink}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-foreground text-2xl font-semibold">{detail.character_name}</h1>
          <p className="text-default-500 mt-1 text-sm">
            Shared by {detail.owner_name} · {detail.group_name}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to={isPreview ? '/preview/search/groups/$groupId' : '/dashboard/search/groups/$groupId'}
            params={{ groupId: detail.group_id }}
            className="button button--sm button--tertiary"
          >
            View group
          </Link>
          {displayGame ? (
            <Chip size="sm" variant="soft">
              {getPoeGameShortLabel(displayGame)}
            </Chip>
          ) : null}
          {detail.league ? (
            <Chip size="sm" variant="soft">
              {detail.league}
            </Chip>
          ) : null}
        </div>
      </div>

      <Card>
        <Card.Content className="gap-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-foreground text-sm font-medium">Profile history</h2>
              <p className="text-default-500 mt-1 text-sm">
                One public snapshot per UTC day for the last 14 days.
              </p>
            </div>
            {dailySummaries.length > 0 ? (
              <SelectField
                label="Snapshot day"
                selectedKey={snapshotId ?? latestProfileKey}
                onSelectionChange={(value) => {
                  setSelectedDailySnapshotId(
                    typeof value === 'string' && value !== latestProfileKey ? value : null,
                  )
                }}
                className="w-full sm:w-60"
              >
                <ListBox.Item id={latestProfileKey}>Latest profile</ListBox.Item>
                {dailySummaries.map((entry) => (
                  <ListBox.Item
                    key={entry.id}
                    id={entry.id}
                    textValue={formatSnapshotDateUtc(entry.snapshot_date)}
                  >
                    {formatSnapshotDateUtc(entry.snapshot_date)}
                  </ListBox.Item>
                ))}
              </SelectField>
            ) : !summariesQuery.isError ? (
              <Chip size="sm" variant="soft">
                {summariesQuery.isLoading ? 'Loading history…' : 'Latest profile only'}
              </Chip>
            ) : null}
          </div>

          {selectedSummary ? (
            <div className="flex flex-wrap items-center gap-2">
              <Chip size="sm" variant="soft">
                Viewing {formatSnapshotDateUtc(selectedSummary.snapshot_date)}
              </Chip>
              <Chip size="sm" color="accent" variant="soft">
                Synced {formatRelativeTimestamp(selectedSummary.last_synced_at)}
              </Chip>
              {selectedSummary.class ? (
                <Chip size="sm" variant="soft">
                  {selectedSummary.class}
                  {selectedSummary.level != null ? ` ${selectedSummary.level}` : ''}
                </Chip>
              ) : null}
            </div>
          ) : null}
        </Card.Content>
      </Card>

      {summariesQuery.isError && dailySummaries.length === 0 ? (
        <QueryStatePanel
          kind="error"
          title="Could not load history"
          description="Try again to see saved snapshots."
          onRetry={summariesQuery.refetch}
        />
      ) : null}

      {snapshotId && dailyQuery.isError && !selectedProfile ? (
        <QueryStatePanel
          kind="error"
          title="Could not load snapshot"
          description="Try again or choose a different day."
          onRetry={dailyQuery.refetch}
        />
      ) : snapshotId && dailyQuery.isSuccess && !selectedProfile ? (
        <QueryStatePanel
          kind="empty"
          title="Snapshot unavailable"
          description="Choose a different day or view the latest profile."
        />
      ) : (
        <MemberCharacterDetails
          profile={profileIsLoading ? null : (selectedProfile ?? null)}
          isPending={profileIsLoading}
          isMe={false}
          canSync={false}
          selectionTitle={selectedSummary ? 'Selected daily snapshot' : 'Current public snapshot'}
          selectionSubtitle={
            selectedSummary
              ? `Latest public snapshot captured on ${formatSnapshotDateUtc(selectedSummary.snapshot_date)}`
              : 'Latest stored public profile for this character'
          }
        />
      )}
    </div>
  )
}
