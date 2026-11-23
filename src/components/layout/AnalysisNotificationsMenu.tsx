import { Dropdown } from '@heroui/react/dropdown'
import { useNavigate } from '@tanstack/react-router'
import { Bell, FlaskConical } from 'lucide-react'
import { useAnalysisNotifications } from '../../hooks/useAnalysisNotifications'
import type { AnalysisRunListEntry } from '../../hooks/useGearOptimizer'

function readyLabel(run: AnalysisRunListEntry) {
  if (run.status === 'partial') return 'Partial analysis ready'
  if (run.status === 'stale') return 'Historical analysis ready'
  return 'Analysis ready'
}

function activeLabel(run: AnalysisRunListEntry) {
  return run.status === 'running' ? 'Analysis running' : 'Analysis queued'
}

export function AnalysisNotificationsMenu({
  groupId,
  userId,
}: {
  groupId: string | null
  userId: string | null
}) {
  const { unread, active } = useAnalysisNotifications(groupId, userId)
  const navigate = useNavigate()
  const count = unread.length
  const currentRun = active.find((run) => run.status === 'running') ?? active[0]
  const label = count ? 'Analysis ready' : currentRun ? activeLabel(currentRun) : null
  const Icon = count ? Bell : FlaskConical

  const entries = [
    ...unread.map((run) => ({ run, title: readyLabel(run) })),
    ...active.map((run) => ({ run, title: activeLabel(run) })),
  ]

  return (
    <>
      <span role="status" className="sr-only">
        {count ? `${count} ${count === 1 ? 'analysis is' : 'analyses are'} ready to open.` : ''}
      </span>
      {label ? (
        <Dropdown>
          <Dropdown.Trigger
            aria-label={label}
            className={`button button--sm button--tertiary inline-flex min-w-11 shrink-0 items-center justify-center whitespace-nowrap px-2.5 ${count ? 'text-success' : 'text-info'}`}
          >
            <span className="inline-flex items-center gap-1.5">
              <Icon size={16} className="shrink-0" aria-hidden="true" />
              <span className="hidden lg:inline">{label}</span>
              {count ? (
                <span
                  aria-hidden="true"
                  className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-success-soft px-1 text-[0.6875rem] font-semibold tabular-nums"
                >
                  {count > 99 ? '99+' : count}
                </span>
              ) : null}
            </span>
          </Dropdown.Trigger>
          <Dropdown.Popover placement="bottom end" className="w-72 max-w-[calc(100vw-1rem)]">
            <Dropdown.Menu aria-label="Analysis notifications" className="max-h-[60dvh] overflow-y-auto">
              {entries.map(({ run, title }) => {
                const context = [run.characterName, run.targetName].filter(Boolean).join(' · ')
                return (
                  <Dropdown.Item
                    key={run.id}
                    id={run.id}
                    textValue={context ? `${title} · ${context}` : title}
                    onAction={() => void navigate({
                      to: '/dashboard/analysis/runs/$runId',
                      params: { runId: run.id },
                    })}
                  >
                    <span className="min-w-0 wrap-anywhere">
                      <span className="block font-medium">{title}</span>
                      {context ? <span className="text-default-500 block text-xs">{context}</span> : null}
                    </span>
                  </Dropdown.Item>
                )
              })}
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      ) : null}
    </>
  )
}
