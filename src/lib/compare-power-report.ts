import { asRecord, readNumber, readString } from './parse-helpers'
export type ComparePowerRow = {
  category: 'item' | 'jewel' | 'tree_node' | string
  actionType: string | null
  name: string
  slot: string | null
  nodeId: number | null
  sourceKey: string | null
  rarity: string | null
  impact: number
  impactPercent: number | null
  pathDistance: number | null
  perPoint: number | null
  secondaryImpacts: Record<string, ComparePowerSecondaryImpact>
}

export type ComparePowerSecondaryImpact = {
  metric: string | null
  metricKey: string
  metricLabel: string
  impact: number
  impactPercent: number | null
}

export type ComparePowerReport = {
  available: boolean
  metric: string | null
  metricLabel: string
  rowCount: number
  rows: ComparePowerRow[]
}

export function getComparePowerReport(
  summary: Record<string, unknown> | null | undefined,
): ComparePowerReport | null {
  const report = asRecord(summary?.compare_power_report)
  if (!report.available) return null

  const rows = Array.isArray(report.rows)
    ? report.rows
        .map((entry): ComparePowerRow | null => {
          const row = asRecord(entry)
          const impact = readNumber(row.impact)
          const category = readString(row.category)
          const name = readString(row.name)
          if (!category || !name || impact == null) return null

          const secondaryImpactsValue = asRecord(row.secondary_impacts)
          const secondaryImpacts: Record<string, ComparePowerSecondaryImpact> = {}
          for (const [key, value] of Object.entries(secondaryImpactsValue)) {
            const impactRow = asRecord(value)
            const secondaryImpact = readNumber(impactRow.impact)
            if (secondaryImpact == null) continue
            secondaryImpacts[key] = {
              metric: readString(impactRow.metric),
              metricKey: readString(impactRow.metric_key) ?? key,
              metricLabel: readString(impactRow.metric_label) ?? key,
              impact: secondaryImpact,
              impactPercent: readNumber(impactRow.impact_percent),
            }
          }

          return {
            category,
            actionType: readString(row.action_type),
            name,
            slot: readString(row.slot),
            nodeId: readNumber(row.node_id),
            sourceKey: readString(row.source_key),
            rarity: readString(row.rarity),
            impact,
            impactPercent: readNumber(row.impact_percent),
            pathDistance: readNumber(row.path_distance),
            perPoint: readNumber(row.per_point),
            secondaryImpacts,
          }
        })
        .filter((row): row is ComparePowerRow => row !== null)
    : []

  return {
    available: report.available === true,
    metric: readString(report.metric),
    metricLabel: readString(report.metric_label) ?? 'Power',
    rowCount: readNumber(report.row_count) ?? rows.length,
    rows,
  }
}

export function normalizeCompareSlot(value: string | null | undefined): string | null {
  const slot = value?.trim().toLowerCase().replace(/\s+/g, ' ') ?? ''
  if (!slot) return null
  if (slot === 'helm') return 'helmet'
  if (slot === 'body armour' || slot === 'bodyarmour' || slot === 'chest') return 'body armour'
  if (slot === 'ring' || slot === 'ring1') return 'ring 1'
  if (slot === 'ring2') return 'ring 2'
  if (slot === 'weapon' || slot === 'weapon1') return 'weapon 1'
  if (slot === 'offhand' || slot === 'weapon2') return 'weapon 2'
  return slot
}

export function getTopComparePowerRows(
  report: ComparePowerReport | null,
  category: 'item' | 'jewel' | 'tree_node',
  limit: number,
): ComparePowerRow[] {
  if (!report || limit <= 0) return []

  return report.rows
    .filter((row) => row.category === category || (category === 'item' && row.category === 'jewel'))
    .sort((left, right) => Math.abs(right.impact) - Math.abs(left.impact))
    .slice(0, limit)
}

export function formatCompareImpact(row: ComparePowerRow): string {
  const value = Math.round(row.impact).toLocaleString()
  return row.impact > 0 ? `+${value}` : value
}

export function formatCompareImpactPercent(row: ComparePowerRow): string | null {
  if (row.impactPercent == null) return null
  const value = row.impactPercent.toFixed(Math.abs(row.impactPercent) >= 10 ? 1 : 2)
  return row.impactPercent > 0 ? `+${value}%` : `${value}%`
}

export function formatCompareSecondaryImpact(
  impact: ComparePowerSecondaryImpact | null | undefined,
): string | null {
  if (!impact) return null
  const rounded = Math.round(impact.impact)
  const formatted = Math.abs(rounded).toLocaleString()
  if (rounded > 0) return `+${formatted}`
  if (rounded < 0) return `-${formatted}`
  return '0'
}

export function formatCompareSecondaryImpactPercent(
  impact: ComparePowerSecondaryImpact | null | undefined,
): string | null {
  if (!impact || impact.impactPercent == null) return null
  const value = impact.impactPercent.toFixed(Math.abs(impact.impactPercent) >= 10 ? 1 : 2)
  return impact.impactPercent > 0 ? `+${value}%` : `${value}%`
}
