import { useEffect, useMemo, useState } from 'react'
import { Button } from '@heroui/react/button'
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
  const { data: dashboardDetail, isLoading: dashboardLoading } = usePublicCharacterDetail(
    isPreview ? null : activeGroupId,
    profileId,
  )
  const { data: previewDetail, isLoading: previewLoading } = useGuestPublicCharacterDetail(
    isPreview ? profileId : null,
  )
  const { data: dashboardDailySummaries = [], isLoading: dashboardSummariesLoading } =
    usePublicCharacterDailySnapshotSummaries(isPreview ? null : activeGroupId, profileId)
  const { data: previewDailySummaries = [], isLoading: previewSummariesLoading } =
    useGuestPublicCharacterDailySnapshotSummaries(isPreview ? profileId : null)
  const [selectedDailySnapshotId, setSelectedDailySnapshotId] = useState<string | null>(null)
  const { data: dashboardDailyDetail, isLoading: dashboardDailyDetailLoading } =
    usePublicCharacterDailySnapshotDetail(
      isPreview ? null : activeGroupId,
      profileId,
      selectedDailySnapshotId,
    )
  const { data: previewDailyDetail, isLoading: previewDailyDetailLoading } =
    useGuestPublicCharacterDailySnapshotDetail(
      isPreview ? profileId : null,
      selectedDailySnapshotId,
    )
  const detail = isPreview ? previewDetail : dashboardDetail
  const isLoading = isPreview ? previewLoading : dashboardLoading
  const dailySummaries = isPreview ? previewDailySummaries : dashboardDailySummaries
  const summariesLoading = isPreview ? previewSummariesLoading : dashboardSummariesLoading
  const dailyDetail = isPreview ? previewDailyDetail : dashboardDailyDetail
  const dailyDetailLoading = isPreview ? previewDailyDetailLoading : dashboardDailyDetailLoading

  useEffect(() => {
    if (!dailySummaries.length) {
      setSelectedDailySnapshotId(null)
      return
    }

    if (
      selectedDailySnapshotId &&
      dailySummaries.some((entry) => entry.id === selectedDailySnapshotId)
    ) {
      return
    }

    setSelectedDailySnapshotId(dailySummaries[0].id)
  }, [dailySummaries, selectedDailySnapshotId])

  const selectedSummary = useMemo(
    () => dailySummaries.find((entry) => entry.id === selectedDailySnapshotId) ?? null,
    [dailySummaries, selectedDailySnapshotId],
  )
  const selectedProfile = selectedDailySnapshotId ? dailyDetail : detail
  const profileIsLoading = !!selectedDailySnapshotId && dailyDetailLoading && !dailyDetail
  const displayGame = detail?.group_game ?? game
  useRecordPublicDirectoryView('character', profileId, !!detail)

  if (isLoading) {
    return <DetailPageSkeleton />
  }

  if (!detail) {
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
        <p className="text-default-400 text-sm">Public character not found.</p>
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
          <h1 className="text-foreground mt-3 text-2xl font-semibold">{detail.character_name}</h1>
          <p className="text-default-400 mt-1 text-sm">
            Public character shared by {detail.owner_name} from {detail.group_name}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isPreview ? (
            <Link to="/preview/search/groups/$groupId" params={{ groupId: detail.group_id }}>
              <Button size="md">View {detail.group_name}</Button>
            </Link>
          ) : (
            <Link to="/dashboard/search/groups/$groupId" params={{ groupId: detail.group_id }}>
              <Button size="md">View {detail.group_name}</Button>
            </Link>
          )}
          <Chip size="sm" color="accent" variant="soft">
            Current profile
          </Chip>
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
              <p className="text-foreground text-sm font-medium">Daily snapshots</p>
              <p className="text-default-500 mt-1 text-sm">
                Latest public snapshot stored for each UTC day, capped at the last 14 days.
              </p>
            </div>
            {dailySummaries.length > 0 ? (
              <SelectField
                aria-label="Select daily snapshot"
                label="Snapshot day"
                selectedKey={selectedDailySnapshotId ?? undefined}
                onSelectionChange={(value) => {
                  setSelectedDailySnapshotId(typeof value === 'string' ? value : null)
                }}
                className="min-w-[15rem]"
              >
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
            ) : (
              <Chip size="sm" variant="soft">
                {summariesLoading ? 'Loading history...' : 'Latest profile only'}
              </Chip>
            )}
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
    </div>
  )
}
