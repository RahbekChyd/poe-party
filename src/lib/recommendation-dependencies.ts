import type { UpgradeRecommendationItem } from '../types/app'
import { asRecord, readString } from './parse-helpers'
export type RecommendationDependency = {
  key: string
  label: string
  note: string
  status: 'satisfied' | 'paired_target' | 'missing'
  source_kind: string | null
  source_label: string | null
  source_slot: string | null
  source_item_name: string | null
  source_detail: string | null
}

function getItemPayload(item: UpgradeRecommendationItem): Record<string, unknown> {
  return asRecord(item.item_payload)
}

export function getRecommendationDependencies(
  item: UpgradeRecommendationItem,
): RecommendationDependency[] {
  const value = getItemPayload(item).bundle_dependencies
  return Array.isArray(value)
    ? value
        .filter(
          (entry): entry is Record<string, unknown> =>
            !!entry && typeof entry === 'object' && !Array.isArray(entry),
        )
        .map((entry, index) => ({
          key: readString(entry.key) ?? `dependency-${index}`,
          label: readString(entry.label) ?? 'Build dependency',
          note:
            readString(entry.note) ?? 'This recommendation depends on another part of the build.',
          status:
            entry.status === 'missing'
              ? 'missing'
              : entry.status === 'paired_target'
                ? 'paired_target'
                : 'satisfied',
          source_kind: readString(entry.source_kind),
          source_label: readString(entry.source_label),
          source_slot: readString(entry.source_slot),
          source_item_name: readString(entry.source_item_name),
          source_detail: readString(entry.source_detail),
        }))
    : []
}
