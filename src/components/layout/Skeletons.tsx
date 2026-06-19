import { Card } from '@heroui/react/card'
import { Skeleton } from '@heroui/react/skeleton'
/** Three KPI stat cards side by side */
export function KpiCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <Card key={i}>
          <Card.Content className="flex flex-row items-center gap-3 p-4">
            <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-3 w-16 rounded-md" />
              <Skeleton className="h-5 w-24 rounded-md" />
            </div>
          </Card.Content>
        </Card>
      ))}
    </div>
  )
}

/** Table with avatar rows — used by Economy, Members */
export function TableSkeleton({ rows = 4, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <Card>
      <Card.Content className="p-0">
        <table className="w-full">
          <thead>
            <tr className="border-b border-divider">
              {Array.from({ length: cols }).map((_, c) => (
                <th key={c} className="px-4 py-3">
                  <Skeleton className="h-3 w-16 rounded-md" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, r) => (
              <tr key={r} className={r < rows - 1 ? 'border-b border-divider' : ''}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <div className="flex flex-col gap-1.5">
                      <Skeleton className="h-3 w-24 rounded-md" />
                      <Skeleton className="h-2.5 w-16 rounded-md" />
                    </div>
                  </div>
                </td>
                {Array.from({ length: cols - 1 }).map((_, c) => (
                  <td key={c} className="px-4 py-3">
                    <Skeleton className="h-3 w-20 rounded-md" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card.Content>
    </Card>
  )
}

/** Card list — used by Gear, Strategies */
export function CardListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Card>
      <Card.Header className="px-4 pb-0 pt-4">
        <Skeleton className="h-4 w-32 rounded-md" />
      </Card.Header>
      <Card.Content className="gap-1 p-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-medium px-3 py-2">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3 w-36 rounded-md" />
              <Skeleton className="h-2.5 w-48 rounded-md" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        ))}
      </Card.Content>
    </Card>
  )
}

/** Member cards — used by MembersPage */
export function MemberCardsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Card key={i}>
          <Card.Content className="p-0">
            <div className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-3.5 w-28 rounded-md" />
                <Skeleton className="h-2.5 w-40 rounded-md" />
              </div>
              <Skeleton className="h-6 w-14 rounded-full" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          </Card.Content>
        </Card>
      ))}
    </div>
  )
}

/** Strategy cards skeleton */
export function StrategyCardsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: rows }).map((_, i) => (
        <Card key={i}>
          <Card.Content className="flex flex-col gap-3 p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="h-4 w-40 rounded-md" />
              <Skeleton className="ml-auto h-6 w-14 rounded-full" />
            </div>
            <Skeleton className="h-3 w-3/4 rounded-md" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-6 rounded-full" />
              <Skeleton className="h-6 w-6 rounded-full" />
              <Skeleton className="h-6 w-6 rounded-full" />
            </div>
          </Card.Content>
        </Card>
      ))}
    </div>
  )
}

/** Horizontal scroll carousel skeleton */
export function CarouselSkeleton({ cards = 4, width = 'w-56' }: { cards?: number; width?: string }) {
  return (
    <div className="flex gap-3 overflow-hidden">
      {Array.from({ length: cards }).map((_, i) => (
        <Card key={i} className={`${width} shrink-0`}>
          <Card.Content className="gap-2 p-4">
            <Skeleton className="h-4 w-32 rounded-md" />
            <Skeleton className="h-3 w-24 rounded-md" />
            <div className="mt-1 flex items-center justify-between">
              <Skeleton className="h-3 w-16 rounded-md" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
          </Card.Content>
        </Card>
      ))}
    </div>
  )
}

/** Single detail page skeleton (used for StrategyDetail, GearSuggestionDetail) */
export function DetailPageSkeleton() {
  return (
    <Card>
      <Card.Content className="flex flex-col gap-4 p-6">
        <Skeleton className="h-6 w-48 rounded-md" />
        <Skeleton className="h-3 w-full rounded-md" />
        <Skeleton className="h-3 w-2/3 rounded-md" />
        <div className="mt-2 flex gap-2">
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
      </Card.Content>
    </Card>
  )
}

/** Item table skeleton — used by GroupSnapshot, SnapshotDetail */
export function ItemTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Card>
      <Card.Content className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-divider">
                <th className="w-10 px-4 py-3" />
                {['Item', 'Tab', 'Stack', 'Total'].map((h) => (
                  <th key={h} className="px-4 py-3">
                    <Skeleton className="h-3 w-12 rounded-md" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rows }).map((_, r) => (
                <tr key={r} className={r < rows - 1 ? 'border-b border-divider' : ''}>
                  <td className="px-4 py-2">
                    <Skeleton className="h-6 w-6 rounded" />
                  </td>
                  <td className="px-4 py-2">
                    <Skeleton className="h-3 w-32 rounded-md" />
                  </td>
                  <td className="px-4 py-2">
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Skeleton className="ml-auto h-3 w-8 rounded-md" />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Skeleton className="ml-auto h-3 w-14 rounded-md" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card.Content>
    </Card>
  )
}
