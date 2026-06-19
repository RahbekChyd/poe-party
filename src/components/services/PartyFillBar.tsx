import { ProgressBar } from '@heroui/react/progress-bar'
import type { PartySlot } from '../../lib/service-types'
export interface PartyRow {
  label: string
  slot: PartySlot
}

export function PartyFillBar({ rows, compact = false }: { rows: PartyRow[]; compact?: boolean }) {
  if (rows.length === 0) return null

  return (
    <div className={compact ? 'flex flex-wrap gap-3' : 'flex flex-col gap-2'}>
      {rows.map((row) => {
        const full = row.slot.capacity > 0 && row.slot.current >= row.slot.capacity
        const value =
          row.slot.capacity > 0 ? Math.min(100, (row.slot.current / row.slot.capacity) * 100) : 0

        return (
          <div key={row.label} className={compact ? 'min-w-[140px] flex-1' : 'w-full'}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium text-default-600">{row.label}</span>
              <span className={full ? 'text-success font-medium' : 'text-default-500'}>
                {row.slot.current}/{row.slot.capacity}
              </span>
            </div>
            <ProgressBar
              aria-label={`${row.label} ${row.slot.current} of ${row.slot.capacity}`}
              value={value}
              size="sm"
              color={full ? 'success' : 'accent'}
              className="max-w-full"
            />
          </div>
        )
      })}
    </div>
  )
}
