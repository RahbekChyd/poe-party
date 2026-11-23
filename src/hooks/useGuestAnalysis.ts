import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../lib/queryKeys'
import { supabase } from '../lib/supabase'
import { normalizeUpgradeSearchConstraints } from '../lib/gear-optimizer-search-constraints'
import { asRecord, readString } from '../lib/parse-helpers'
import {
  normalizePobConfigSet,
  normalizePobSkillSet,
  normalizePobTreeSpec,
} from '../lib/pob'
import type {
  GuestCharacterSummary,
  GuestUpgradeAnalysisRun,
  GuestUpgradeRecommendationItem,
  GuestUpgradeRecommendationPlan,
  PartyBuildEntry,
  AnalysisMetricSnapshot,
  PobConfigSetLayout,
  PobImportMetadata,
  PobItemSetLayout,
  UpgradeAnalysisMode,
  UpgradeRecommendationPlan,
  UpgradeSearchConstraints,
} from '../types/app'

function asPlayerStats(value: unknown): PobImportMetadata['player_stats'] {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as PobImportMetadata['player_stats'])
    : {}
}

function asSkillSets(value: unknown) {
  return Array.isArray(value)
    ? value.map((entry, index) => normalizePobSkillSet(entry, index))
    : []
}

function asItemSets(value: unknown): PobItemSetLayout[] {
  return Array.isArray(value) ? (value as PobItemSetLayout[]) : []
}

function asConfigSets(value: unknown): PobConfigSetLayout[] {
  return Array.isArray(value)
    ? value.map((entry, index) => normalizePobConfigSet(entry, index))
    : []
}

function asImportMetadata(value: unknown): PobImportMetadata {
  const record = asRecord(value)
  const sourceKind =
    record.source_kind === 'pob_xml' || record.source_kind === 'legacy_pob_code'
      ? record.source_kind
      : 'pob_share_code'

  return {
    source_kind: sourceKind,
    class_name: readString(record.class_name),
    ascendancy_name: readString(record.ascendancy_name),
    target_version: readString(record.target_version),
    notes: readString(record.notes),
    player_stats: asPlayerStats(record.player_stats),
    tree_specs: Array.isArray(record.tree_specs)
      ? record.tree_specs.map((spec, index) => normalizePobTreeSpec(spec, index))
      : [],
    active_tree_spec_id: readString(record.active_tree_spec_id),
    skill_sets: asSkillSets(record.skill_sets),
    active_skill_set_id: readString(record.active_skill_set_id),
    config_sets: asConfigSets(record.config_sets),
    active_config_set_id: readString(record.active_config_set_id),
    active_config_set_title: readString(record.active_config_set_title),
    item_sets: asItemSets(record.item_sets),
    active_item_set_id: readString(record.active_item_set_id),
  }
}

function asSearchConstraints(value: unknown): UpgradeSearchConstraints {
  return normalizeUpgradeSearchConstraints(
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null,
  )
}

function toGuestRun(row: Record<string, unknown>): GuestUpgradeAnalysisRun {
  return {
    id: String(row.id),
    normalized_account_name: String(row.normalized_account_name ?? ''),
    account_name: String(row.account_name ?? ''),
    character_name: String(row.character_name ?? 'Character'),
    character_class: readString(row.character_class),
    character_ascendancy_class:
      row.character_ascendancy_class == null ? null : Number(row.character_ascendancy_class),
    character_league: readString(row.character_league),
    character_level: row.character_level == null ? null : Number(row.character_level),
    realm: String(row.realm ?? 'pc'),
    target_name: String(row.target_name ?? 'Imported PoB'),
    source_kind:
      row.source_kind === 'pob_xml' || row.source_kind === 'legacy_pob_code'
        ? row.source_kind
        : 'pob_share_code',
    import_metadata: asImportMetadata(row.import_metadata),
    target_stage: asRecord(row.target_stage),
    character_profile: asRecord(row.character_profile),
    budget_chaos: Number(row.budget_chaos ?? 0),
    analysis_mode: row.analysis_mode === 'thorough' ? 'thorough' : 'quick',
    search_constraints: asSearchConstraints(row.search_constraints),
    party_config: Array.isArray(row.party_config) ? (row.party_config as PartyBuildEntry[]) : [],
    input_hash: String(row.input_hash ?? ''),
    status:
      row.status === 'running' ||
      row.status === 'completed' ||
      row.status === 'partial' ||
      row.status === 'failed' ||
      row.status === 'stale'
        ? row.status
        : 'queued',
    stale_reason: readString(row.stale_reason),
    partial_reason: readString(row.partial_reason),
    error_detail: readString(row.error_detail),
    summary: asRecord(row.summary),
    started_at: readString(row.started_at),
    completed_at: readString(row.completed_at),
    expires_at: String(row.expires_at ?? new Date(0).toISOString()),
    created_at: String(row.created_at ?? new Date(0).toISOString()),
    updated_at: String(row.updated_at ?? new Date(0).toISOString()),
  }
}

function toGuestRecommendationItem(row: Record<string, unknown>): GuestUpgradeRecommendationItem {
  return {
    id: String(row.id),
    plan_id: String(row.plan_id),
    run_id: String(row.run_id),
    slot: readString(row.slot),
    source: row.source === 'compare' ? 'compare' : row.source === 'market' ? 'market' : 'owned',
    item_name: readString(row.item_name),
    item_payload: asRecord(row.item_payload),
    trade_link: readString(row.trade_link),
    ask_price_chaos: row.ask_price_chaos == null ? null : Number(row.ask_price_chaos),
    effective_price_chaos: Number(row.effective_price_chaos ?? 0),
    created_at: String(row.created_at ?? new Date(0).toISOString()),
  }
}

function toGuestRecommendationPlan(row: Record<string, unknown>): GuestUpgradeRecommendationPlan {
  const items = Array.isArray(row.items)
    ? row.items
        .filter(
          (entry): entry is Record<string, unknown> =>
            !!entry && typeof entry === 'object' && !Array.isArray(entry),
        )
        .map(toGuestRecommendationItem)
    : []

  return {
    id: String(row.id),
    run_id: String(row.run_id),
    category:
      row.category === 'unlock_next_stage' || row.category === 'owned_now'
        ? row.category
        : 'best_single',
    kind: row.kind === 'bundle' ? 'bundle' : 'single',
    title: String(row.title ?? 'Recommendation'),
    summary: readString(row.summary),
    explanation: readString(row.explanation),
    effective_cost_chaos: Number(row.effective_cost_chaos ?? 0),
    ask_price_chaos: row.ask_price_chaos == null ? null : Number(row.ask_price_chaos),
    score: Number(row.score ?? 0),
    stage_progress_score: Number(row.stage_progress_score ?? 0),
    ranking_reason: asRecord(row.ranking_reason),
    before_metrics: asRecord(row.before_metrics) as AnalysisMetricSnapshot,
    after_metrics: asRecord(row.after_metrics) as AnalysisMetricSnapshot,
    breaks_requirements: !!row.breaks_requirements,
    section: row.section === 'overview' ? 'overview' : 'primary',
    created_at: String(row.created_at ?? new Date(0).toISOString()),
    items,
  }
}

class GuestAnalysisFunctionError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message)
  }
}

async function readFunctionError(error: unknown): Promise<Error> {
  const context = (error as { context?: unknown })?.context
  if (context instanceof Response) {
    try {
      const body = await context.json()
      if (typeof body?.error === 'string') {
        return new GuestAnalysisFunctionError(
          body.error,
          typeof body.code === 'string' ? body.code : undefined,
        )
      }
    } catch {
      // fall through
    }
  }
  return error instanceof Error ? error : new Error('Request failed')
}

function isRunUnavailable(error: unknown): boolean {
  return error instanceof GuestAnalysisFunctionError && (
    error.code === 'guest_run_not_found' ||
    error.code === 'missing_run_token' ||
    /^Public Analysis run not found(?: or expired)?\.?$/i.test(error.message)
  )
}

function retryGuestStatus(failureCount: number, error: Error): boolean {
  return !isRunUnavailable(error) && failureCount < 3
}

function isLiveStatus(status: GuestUpgradeAnalysisRun['status'] | null | undefined): boolean {
  return status === 'queued' || status === 'running'
}

const LIVE_ANALYSIS_FAST_POLL_MS = 5_000
const LIVE_ANALYSIS_MEDIUM_POLL_MS = 10_000
const LIVE_ANALYSIS_SLOW_POLL_MS = 20_000
const MISSING_PLANS_RETRY_WINDOW_MS = 30_000

function readTimestampMs(value: string | null | undefined): number | null {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

function getLiveAnalysisPollInterval(run: GuestUpgradeAnalysisRun | null | undefined): number {
  const startedMs = readTimestampMs(run?.started_at ?? run?.created_at)
  if (!startedMs) return LIVE_ANALYSIS_FAST_POLL_MS

  const ageMs = Date.now() - startedMs
  if (ageMs < 60_000) return LIVE_ANALYSIS_FAST_POLL_MS
  if (ageMs < 5 * 60_000) return LIVE_ANALYSIS_MEDIUM_POLL_MS
  return LIVE_ANALYSIS_SLOW_POLL_MS
}

function shouldRetryMissingPlans(
  run: GuestUpgradeAnalysisRun | null | undefined,
  plans: GuestUpgradeRecommendationPlan[],
): boolean {
  if (run?.status !== 'completed' && run?.status !== 'partial') return false
  if (plans.length > 0) return false

  const completedMs = readTimestampMs(run.completed_at ?? run.updated_at)
  return completedMs != null && Date.now() - completedMs < MISSING_PLANS_RETRY_WINDOW_MS
}

type GuestAnalysisData = {
  run: GuestUpgradeAnalysisRun
  plans: GuestUpgradeRecommendationPlan[]
}

async function fetchGuestAnalysisStatus(
  runToken: string,
  includeResults: boolean,
): Promise<GuestAnalysisData> {
  const { data, error } = await supabase.functions.invoke<{
    run: Record<string, unknown>
    plans: Record<string, unknown>[]
  }>('guest-upgrade-analysis-status', {
    body: { run_token: runToken, include_results: includeResults },
  })

  if (error) throw await readFunctionError(error)
  if (!data?.run) throw new Error('Public Analysis run not found')
  return {
    run: toGuestRun(data.run),
    plans: (data.plans ?? []).map(toGuestRecommendationPlan),
  }
}

export function guestPlanForRecommendationRow(
  plan: GuestUpgradeRecommendationPlan,
): UpgradeRecommendationPlan {
  return {
    ...plan,
    group_id: 'guest',
    target_user_id: 'guest',
    target_stage_id: null,
  }
}

export function useGuestCharacterLookup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (accountName: string) => {
      const { data, error } = await supabase.functions.invoke<{
        account_name: string
        characters: GuestCharacterSummary[]
      }>('guest-list-characters', {
        body: { account_name: accountName },
      })

      if (error) throw await readFunctionError(error)
      const characters = Array.isArray(data?.characters) ? data.characters : []
      queryClient.setQueryData(
        queryKeys.preview.guestAnalysisCharacters(accountName.trim()),
        characters,
      )
      return { account_name: data?.account_name ?? accountName.trim(), characters }
    },
  })
}

export function useQueueGuestUpgradeAnalysis() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: {
      account_name: string
      character_name: string
      raw_import: string
      target_name?: string | null
      tree_spec_id?: string | null
      item_set_id?: string | null
      skill_set_id?: string | null
      config_set_id?: string | null
    }) => {
      const { data, error } = await supabase.functions.invoke<{
        run_token: string
        worker_notified: boolean
        run: Record<string, unknown>
      }>('guest-queue-upgrade-analysis', {
        body: values,
      })

      if (error) throw await readFunctionError(error)
      if (!data?.run_token || !data.run) throw new Error('No Public Analysis run was returned')
      return {
        run_token: data.run_token,
        worker_notified: !!data.worker_notified,
        run: toGuestRun(data.run),
      }
    },
    onSuccess: ({ run_token, run }) => {
      queryClient.setQueryData(queryKeys.preview.guestAnalysisStatus(run_token), {
        run,
        plans: [],
      })
    },
  })
}

export function useGuestUpgradeAnalysisStatus(runToken: string | null) {
  const statusQuery = useQuery({
    queryKey: queryKeys.preview.guestAnalysisStatus(runToken),
    enabled: !!runToken,
    queryFn: async () => fetchGuestAnalysisStatus(runToken!, false),
    retry: retryGuestStatus,
    refetchInterval: (query) => {
      const run = query.state.data?.run
      if (isLiveStatus(run?.status)) return getLiveAnalysisPollInterval(run)
      return false
    },
    refetchIntervalInBackground: false,
  })

  const run = statusQuery.data?.run ?? null
  const shouldLoadResults = run?.status === 'completed' || run?.status === 'partial'
  const resultsQuery = useQuery({
    queryKey: queryKeys.preview.guestAnalysisResults(runToken),
    enabled: !!runToken && shouldLoadResults,
    queryFn: async () => fetchGuestAnalysisStatus(runToken!, true),
    retry: retryGuestStatus,
    refetchInterval: (query) => {
      const data = query.state.data
      return shouldRetryMissingPlans(data?.run ?? run, data?.plans ?? [])
        ? LIVE_ANALYSIS_FAST_POLL_MS
        : false
    },
    refetchIntervalInBackground: false,
  })

  const data = (shouldLoadResults ? resultsQuery.data : null) ?? statusQuery.data
  const error = statusQuery.error ?? resultsQuery.error
  const isResultPending =
    shouldLoadResults &&
    (!resultsQuery.data || shouldRetryMissingPlans(resultsQuery.data.run, resultsQuery.data.plans))

  return {
    ...statusQuery,
    data,
    error,
    runUnavailable: isRunUnavailable(error),
    isError: !!error,
    isFetching: statusQuery.isFetching || resultsQuery.isFetching,
    isLoading: statusQuery.isLoading || (resultsQuery.isLoading && !data),
    isResultPending,
    retry: statusQuery.error || !shouldLoadResults ? statusQuery.refetch : resultsQuery.refetch,
  }
}

export type GuestAnalysisStatus = GuestUpgradeAnalysisRun['status']
export type GuestAnalysisMode = UpgradeAnalysisMode
