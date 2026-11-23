import { useEffect, useMemo, useState } from 'react'
import { Button } from '@heroui/react/button'
import { Chip } from '@heroui/react/chip'
import { Modal } from '@heroui/react/modal'
import { Spinner } from '@heroui/react/spinner'

import type { StrategyLinkedSnapshot } from '../../hooks/useSnapshots'
import { NativeCheckbox } from '../ui/heroui-native'
type MemberLookup = Record<
  string,
  | {
      display_name: string | null
      poe_account_name?: string
    }
  | undefined
>

interface Props {
  isOpen: boolean
  onClose: () => void
  strategyName: string
  linkedSnapshots: StrategyLinkedSnapshot[]
  memberByUser: MemberLookup
  fmt: (chaos: number) => string
  isSaving: boolean
  onSave: (removedGroupHistoryIds: string[]) => Promise<void>
  onUnlink: (groupHistoryId: string) => Promise<void>
}

function formatSnapshotLabel(createdAt: string) {
  return new Date(createdAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function StrategyLinkedSnapshotsModal({
  isOpen,
  onClose,
  strategyName,
  linkedSnapshots,
  memberByUser,
  fmt,
  isSaving,
  onSave,
  onUnlink,
}: Props) {
  const rawSnapshots = useMemo(
    () => linkedSnapshots.filter((snapshot) => !!snapshot.triggered_by_snapshot_id),
    [linkedSnapshots],
  )
  const summaryOnlySnapshots = useMemo(
    () => linkedSnapshots.filter((snapshot) => !snapshot.triggered_by_snapshot_id),
    [linkedSnapshots],
  )
  const [selectedSummaryIds, setSelectedSummaryIds] = useState<string[]>([])
  const [unlinkingGroupHistoryId, setUnlinkingGroupHistoryId] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setSelectedSummaryIds(summaryOnlySnapshots.map((snapshot) => snapshot.id))
  }, [isOpen, summaryOnlySnapshots])

  const removedSummaryIds = summaryOnlySnapshots
    .map((snapshot) => snapshot.id)
    .filter((id) => !selectedSummaryIds.includes(id))

  const handleToggle = (groupHistoryId: string) => {
    setSelectedSummaryIds((current) =>
      current.includes(groupHistoryId)
        ? current.filter((id) => id !== groupHistoryId)
        : [...current, groupHistoryId],
    )
  }

  const handleSave = async () => {
    await onSave(removedSummaryIds)
  }

  const handleUnlink = async (groupHistoryId: string) => {
    setUnlinkingGroupHistoryId(groupHistoryId)
    try {
      await onUnlink(groupHistoryId)
    } finally {
      setUnlinkingGroupHistoryId(null)
    }
  }

  return (
    <>
      <Modal.Backdrop
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (!open) {
            onClose()
          }
        }}
      >
        <Modal.Container scroll="inside" size="lg">
          <Modal.Dialog className="min-w-0 max-h-full max-w-2xl gap-3 p-4 sm:p-6">
            <Modal.Header className="min-w-0 shrink-0 gap-1">
              <Modal.Heading>Linked snapshots</Modal.Heading>
              <p className="text-default-500 wrap-anywhere text-sm">{strategyName}</p>
            </Modal.Header>

            <Modal.Body className="@container mt-0 min-h-0 min-w-0 gap-5 overflow-y-auto overscroll-contain">
              {linkedSnapshots.length === 0 ? (
                <p className="text-default-400 py-4 text-center text-sm">
                  No snapshots are currently linked to this strategy.
                </p>
              ) : null}

              {rawSnapshots.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <div>
                    <p className="text-foreground text-sm font-medium">Full snapshots</p>
                    <p className="text-default-400 text-xs">
                      Open a snapshot to view the items it captured.
                    </p>
                  </div>

                  <div className="flex flex-col gap-2">
                    {rawSnapshots.map((snapshot) => {
                      const member = memberByUser[snapshot.triggered_by_user_id]
                      const memberName =
                        member?.display_name ?? member?.poe_account_name ?? 'Unknown member'
                      const snapshotHref = snapshot.trigger_snapshot_history_id
                        ? `/dashboard/economy/${snapshot.triggered_by_user_id}?historyId=${snapshot.trigger_snapshot_history_id}`
                        : `/dashboard/economy/${snapshot.triggered_by_user_id}`

                      return (
                        <div
                          key={snapshot.id}
                          className="rounded-large border-divider flex min-w-0 flex-col gap-2 border px-3 py-2 @min-[22rem]:flex-row @min-[22rem]:items-center @min-[22rem]:justify-between"
                        >
                          <div className="min-w-0">
                            <p className="text-foreground wrap-anywhere text-sm font-medium">
                              {formatSnapshotLabel(snapshot.created_at)}
                            </p>
                            <p className="text-default-400 wrap-anywhere text-xs">
                              {memberName} · {fmt(snapshot.total_wealth_chaos)}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center gap-2">
                            <a
                              href={snapshotHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="button button--sm button--tertiary"
                            >
                              Open snapshot
                            </a>
                            <Button
                              size="sm"
                              variant="danger-soft"
                              isPending={unlinkingGroupHistoryId === snapshot.id}
                              isDisabled={isSaving}
                              onPress={() => handleUnlink(snapshot.id)}
                            >
                              {({ isPending }) => (
                                <>
                                  {isPending ? <Spinner color="current" size="sm" /> : null}
                                  Unlink
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : null}

              {summaryOnlySnapshots.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <div>
                    <p className="text-foreground text-sm font-medium">Snapshot summaries</p>
                    <p className="text-default-400 text-xs">
                      Uncheck a summary to unlink it from this strategy.
                    </p>
                  </div>

                  <div className="flex flex-col gap-2">
                    {summaryOnlySnapshots.map((snapshot) => {
                      const member = memberByUser[snapshot.triggered_by_user_id]
                      const memberName =
                        member?.display_name ?? member?.poe_account_name ?? 'Unknown member'

                      return (
                        <div
                          key={snapshot.id}
                          className="rounded-large border-divider flex min-w-0 flex-wrap items-center gap-2 border px-3 py-2"
                        >
                          <NativeCheckbox
                            id={`linked-summary-${snapshot.id}`}
                            isSelected={selectedSummaryIds.includes(snapshot.id)}
                            onChange={() => handleToggle(snapshot.id)}
                            className="min-w-0"
                          >
                            <div className="flex min-w-0 flex-col gap-0.5 wrap-anywhere">
                              <span className="text-foreground text-sm font-medium">
                                {formatSnapshotLabel(snapshot.created_at)}
                              </span>
                              <span className="text-default-400 text-xs">
                                {memberName} · {fmt(snapshot.total_wealth_chaos)}
                              </span>
                            </div>
                          </NativeCheckbox>
                          <Chip
                            size="sm"
                            variant="soft"
                            className="shrink-0 @min-[22rem]:ml-auto"
                          >
                            Summary only
                          </Chip>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : null}
            </Modal.Body>

            <Modal.Footer className="mt-0 shrink-0 flex-wrap">
              <Button variant="tertiary" onPress={onClose}>
                Close
              </Button>
              {summaryOnlySnapshots.length > 0 ? (
                <Button
                  onPress={handleSave}
                  isPending={isSaving}
                  isDisabled={removedSummaryIds.length === 0}
                >
                  {({ isPending }) => (
                    <>
                      {isPending ? <Spinner color="current" size="sm" /> : null}
                      Save changes
                    </>
                  )}
                </Button>
              ) : null}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  )
}
