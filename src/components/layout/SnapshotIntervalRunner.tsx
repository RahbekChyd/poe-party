import { useEffect, useRef } from 'react'
import { useGroupStore } from '../../store/group-store'
import { useStashSnapshotFlow } from '../../hooks/useStashSnapshotFlow'
import { useSnapshotSchedule } from '../../hooks/useSnapshotSchedule'
import { useSnapshotStore } from '../../store/snapshot-store'
export function SnapshotIntervalRunner() {
  const activeGroupId = useGroupStore((s) => s.activeGroupId)
  const { activeLeague, countdownLabel, isEligible, msUntilNext, resetTimer } =
    useSnapshotSchedule(activeGroupId)
  const { triggerScheduledSnapshot } = useStashSnapshotFlow()
  const { progress } = useSnapshotStore()
  const runningRef = useRef(false)

  useEffect(() => {
    const snapshotInFlight =
      progress.phase === 'characters' ||
      progress.phase === 'stash' ||
      progress.phase === 'pricing'

    if (
      !activeGroupId ||
      !activeLeague ||
      !isEligible ||
      msUntilNext == null ||
      msUntilNext > 0 ||
      snapshotInFlight ||
      runningRef.current
    ) {
      return
    }

    runningRef.current = true

    void triggerScheduledSnapshot(activeGroupId, activeLeague)
      .catch((error) => {
        console.error('Interval snapshot failed:', error)
        resetTimer()
      })
      .finally(() => {
        runningRef.current = false
      })
  }, [
    activeGroupId,
    activeLeague,
    countdownLabel,
    isEligible,
    msUntilNext,
    progress.phase,
    resetTimer,
    triggerScheduledSnapshot,
  ])

  return null
}
