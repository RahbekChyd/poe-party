import type { ReservationAuditSuggestion, ReservationAuditSummary } from '../types/app'
import { asRecord, readNumber, readString, readStringList } from './parse-helpers'
export interface PobConfigurationInsightEntry {
  var: string
  label: string
  value: string
  type: 'check' | 'count' | 'integer' | 'countAllowZero' | 'float' | 'list' | 'text' | 'unknown'
  source: 'input' | 'placeholder'
  context_label: string | null
}

export interface PobConfigurationInsightSection {
  label: string
  entries: PobConfigurationInsightEntry[]
}

export interface PobConfigurationInsights {
  set_id: string | null
  set_title: string | null
  enabled_count: number
  sections: PobConfigurationInsightSection[]
}

function readSuggestion(entry: unknown): ReservationAuditSuggestion | null {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
  const record = entry as Record<string, unknown>
  const gemName = readString(record.gem_name)
  const reason = readString(record.reason)
  if (!gemName || !reason) return null

  return {
    kind: 'gem_level',
    gem_name: gemName,
    current_level: readNumber(record.current_level),
    suggested_level: readNumber(record.suggested_level),
    reason,
  }
}

function readConfigurationInsightType(value: unknown): PobConfigurationInsightEntry['type'] {
  return value === 'check' ||
    value === 'count' ||
    value === 'integer' ||
    value === 'countAllowZero' ||
    value === 'float' ||
    value === 'list' ||
    value === 'text'
    ? value
    : 'unknown'
}

function readConfigurationInsightSource(value: unknown): PobConfigurationInsightEntry['source'] {
  return value === 'placeholder' ? 'placeholder' : 'input'
}

function readConfigurationInsightEntry(entry: unknown): PobConfigurationInsightEntry | null {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
  const record = entry as Record<string, unknown>
  const variable = readString(record.var)
  const label = readString(record.label)
  const value = readString(record.value)
  if (!variable || !label || !value) return null

  return {
    var: variable,
    label,
    value,
    type: readConfigurationInsightType(record.type),
    source: readConfigurationInsightSource(record.source),
    context_label: readString(record.context_label),
  }
}

function readConfigurationInsightSection(entry: unknown): PobConfigurationInsightSection | null {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
  const record = entry as Record<string, unknown>
  const label = readString(record.label)
  if (!label) return null

  return {
    label,
    entries: Array.isArray(record.entries)
      ? record.entries
          .map(readConfigurationInsightEntry)
          .filter((item): item is PobConfigurationInsightEntry => !!item)
      : [],
  }
}

export function getReservationAudit(
  summary: Record<string, unknown> | null | undefined,
): ReservationAuditSummary | null {
  const audit = asRecord(summary?.reservation_audit)
  if (Object.keys(audit).length === 0) return null

  const status =
    audit.status === 'fit' ||
    audit.status === 'blocked' ||
    audit.status === 'excess' ||
    audit.status === 'unknown'
      ? audit.status
      : 'unknown'

  return {
    status,
    target_skill_set_id: readString(audit.target_skill_set_id),
    target_skill_set_title: readString(audit.target_skill_set_title),
    target_gems: readStringList(audit.target_gems),
    reserved_mana_delta: readNumber(audit.reserved_mana_delta),
    blockers: readStringList(audit.blockers),
    surplus_sources: readStringList(audit.surplus_sources),
    notes: readStringList(audit.notes),
    suggestions: Array.isArray(audit.suggestions)
      ? audit.suggestions
          .map(readSuggestion)
          .filter((entry): entry is ReservationAuditSuggestion => !!entry)
      : [],
  }
}

export function getPobConfigurationInsights(
  summary: Record<string, unknown> | null | undefined,
): PobConfigurationInsights | null {
  const config = asRecord(summary?.configuration_insights)
  if (Object.keys(config).length === 0) return null

  const sections = Array.isArray(config.sections)
    ? config.sections
        .map(readConfigurationInsightSection)
        .filter((entry): entry is PobConfigurationInsightSection => !!entry)
    : []

  return {
    set_id: readString(config.set_id),
    set_title: readString(config.set_title),
    enabled_count:
      readNumber(config.enabled_count) ??
      sections.reduce((count, section) => count + section.entries.length, 0),
    sections,
  }
}
