import type { getAnalysisPobResultLayoutLabels } from '../../lib/analysis-pob-setup'

export function AnalysisPobResultLayouts({
  rows,
}: {
  rows: ReturnType<typeof getAnalysisPobResultLayoutLabels>
}) {
  if (!rows.some(({ value }) => value)) return null
  return (
    <dl className="grid grid-cols-2 gap-3 text-sm min-[45rem]:grid-cols-4">
      {rows.map(({ label, value }) => (
        <div key={label} className="min-w-0">
          <dt className="text-default-500">{label}</dt>
          <dd className="text-foreground font-medium wrap-anywhere">{value ?? 'PoB default'}</dd>
        </div>
      ))}
    </dl>
  )
}
