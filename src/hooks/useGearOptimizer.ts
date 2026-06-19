import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { queryKeys } from '../lib/queryKeys'
import type {
  BuildTarget,
  BuildTargetStage,
  GroupPartyBuildTarget,
  PartyBuildEntry,
  PobConfigSetLayout,
  PobImportMetadata,
  PobItemSetLayout,
  PobSkillSetLayout,
  TargetStageRequirement,
  UpgradeAnalysisMode,
  UpgradeAnalysisRun,
  UpgradeRecommendationItem,
  UpgradeRecommendationPlan,
  UpgradeSearchConstraints,
} from '../types/app'
import { normalizeUpgradeSearchConstraints } from '../lib/gear-optimizer-search-constraints'
import { asRecord, readString as asString } from '../lib/parse-helpers'
import {
  hasExactPobTreeSpecData,
  normalizePobConfigSet,
  normalizePobSkillSet,
  normalizePobTreeSpec,
  parsePobXml,
} from '../lib/pob'
function asPlayerStats(value: unknown): PobImportMetadata['player_stats'] {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as PobImportMetadata['player_stats'])
    : {}
}

function asSkillSets(value: unknown): PobSkillSetLayout[] {
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

function normalizeImportMetadata(
  value: unknown,
  sourceKind: PobImportMetadata['source_kind'],
): PobImportMetadata {
  const record = asRecord(value)

  return {
    source_kind:
      record.source_kind === 'pob_xml' ||
      record.source_kind === 'legacy_pob_code' ||
      record.source_kind === 'pob_share_code'
        ? record.source_kind
        : sourceKind,
    class_name: asString(record.class_name),
    ascendancy_name: asString(record.ascendancy_name),
    target_version: asString(record.target_version),
    notes: asString(record.notes),
    player_stats: asPlayerStats(record.player_stats),
    tree_specs: Array.isArray(record.tree_specs)
      ? record.tree_specs.map((spec, index) => normalizePobTreeSpec(spec, index))
      : [],
    skill_sets: asSkillSets(record.skill_sets),
    config_sets: asConfigSets(record.config_sets),
    active_config_set_id: asString(record.active_config_set_id),
    active_config_set_title: asString(record.active_config_set_title),
    item_sets: asItemSets(record.item_sets),
  }
}

function metadataNeedsHydration(metadata: PobImportMetadata): boolean {
  return (
    metadata.config_sets.length === 0 ||
    (metadata.tree_specs.length > 0 &&
      metadata.tree_specs.some(
        (spec) => !hasExactPobTreeSpecData(spec) || !Array.isArray(spec.clusterJewels),
      )) ||
    (metadata.skill_sets.length > 0 &&
      metadata.skill_sets.some((skillSet) => !Array.isArray(skillSet.groups)))
  )
}

function asImportMetadata(
  value: unknown,
  sourceKind: PobImportMetadata['source_kind'],
  rawXml: string | null,
): PobImportMetadata {
  const normalized = normalizeImportMetadata(value, sourceKind)

  if (!rawXml || !metadataNeedsHydration(normalized)) {
    return normalized
  }

  try {
    return normalizeImportMetadata(parsePobXml(rawXml, normalized.source_kind), normalized.source_kind)
  } catch {
    return normalized
  }
}

function asRequirementList(value: unknown): TargetStageRequirement[] {
  return Array.isArray(value) ? (value as TargetStageRequirement[]) : []
}

function asSearchConstraints(value: unknown): UpgradeSearchConstraints {
  return normalizeUpgradeSearchConstraints(
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null,
  )
}

function isLiveAnalysisStatus(status: UpgradeAnalysisRun['status'] | null | undefined): boolean {
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

function getLiveAnalysisPollInterval(run: UpgradeAnalysisRun): number {
  const startedMs = readTimestampMs(run.started_at ?? run.created_at)
  if (!startedMs) return LIVE_ANALYSIS_FAST_POLL_MS

  const ageMs = Date.now() - startedMs
  if (ageMs < 60_000) return LIVE_ANALYSIS_FAST_POLL_MS
  if (ageMs < 5 * 60_000) return LIVE_ANALYSIS_MEDIUM_POLL_MS
  return LIVE_ANALYSIS_SLOW_POLL_MS
}

function shouldRetryMissingPlans(
  runStatus: UpgradeAnalysisRun['status'] | null,
  runCompletedAt: string | null | undefined,
  planCount: number,
): boolean {
  if (runStatus !== 'completed' && runStatus !== 'partial') return false
  if (planCount > 0) return false

  const completedMs = readTimestampMs(runCompletedAt)
  return completedMs != null && Date.now() - completedMs < MISSING_PLANS_RETRY_WINDOW_MS
}

function toBuildTarget(row: Record<string, unknown>): BuildTarget {
  const source_kind =
    row.source_kind === 'pob_xml' || row.source_kind === 'legacy_pob_code'
      ? row.source_kind
      : 'pob_share_code'
  const raw_xml = typeof row.raw_xml === 'string' ? row.raw_xml : null

  return {
    id: String(row.id),
    group_id: String(row.group_id),
    user_id: String(row.user_id),
    character_id: typeof row.character_id === 'string' ? row.character_id : null,
    created_by: String(row.created_by),
    name: String(row.name ?? 'Imported PoB'),
    source_kind,
    raw_import: String(row.raw_import ?? ''),
    raw_xml,
    import_metadata: asImportMetadata(row.import_metadata, source_kind, raw_xml),
    compatibility_status:
      row.compatibility_status === 'compatible' ||
      row.compatibility_status === 'partial' ||
      row.compatibility_status === 'unsupported'
        ? row.compatibility_status
        : 'pending',
    compatibility_notes:
      typeof row.compatibility_notes === 'string' ? row.compatibility_notes : null,
    is_selected: !!row.is_selected,
    selected_stage_id: typeof row.selected_stage_id === 'string' ? row.selected_stage_id : null,
    created_at: String(row.created_at ?? new Date(0).toISOString()),
    updated_at: String(row.updated_at ?? new Date(0).toISOString()),
  }
}

function toBuildTargetStage(row: Record<string, unknown>): BuildTargetStage {
  return {
    id: String(row.id),
    build_target_id: String(row.build_target_id),
    order_index: Number(row.order_index ?? 0),
    label: String(row.label ?? 'Stage'),
    notes: typeof row.notes === 'string' ? row.notes : null,
    tree_spec_id: typeof row.tree_spec_id === 'string' ? row.tree_spec_id : null,
    tree_spec_title: typeof row.tree_spec_title === 'string' ? row.tree_spec_title : null,
    item_set_id: typeof row.item_set_id === 'string' ? row.item_set_id : null,
    item_set_title: typeof row.item_set_title === 'string' ? row.item_set_title : null,
    skill_set_id: typeof row.skill_set_id === 'string' ? row.skill_set_id : null,
    skill_set_title: typeof row.skill_set_title === 'string' ? row.skill_set_title : null,
    config_set_id: typeof row.config_set_id === 'string' ? row.config_set_id : null,
    config_set_title: typeof row.config_set_title === 'string' ? row.config_set_title : null,
    primary_offensive_metric: String(row.primary_offensive_metric ?? 'totalDps'),
    target_metrics:
      row.target_metrics &&
      typeof row.target_metrics === 'object' &&
      !Array.isArray(row.target_metrics)
        ? (row.target_metrics as BuildTargetStage['target_metrics'])
        : {},
    hard_requirements: asRequirementList(row.hard_requirements),
    created_at: String(row.created_at ?? new Date(0).toISOString()),
    updated_at: String(row.updated_at ?? new Date(0).toISOString()),
  }
}

function toUpgradeAnalysisRun(row: Record<string, unknown>): UpgradeAnalysisRun {
  return {
    id: String(row.id),
    group_id: String(row.group_id),
    build_target_id: String(row.build_target_id),
    target_stage_id: typeof row.target_stage_id === 'string' ? row.target_stage_id : null,
    target_user_id: String(row.target_user_id),
    character_id: typeof row.character_id === 'string' ? row.character_id : null,
    queued_by: String(row.queued_by),
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
    stale_reason: typeof row.stale_reason === 'string' ? row.stale_reason : null,
    partial_reason: typeof row.partial_reason === 'string' ? row.partial_reason : null,
    error_detail: typeof row.error_detail === 'string' ? row.error_detail : null,
    summary:
      row.summary && typeof row.summary === 'object' && !Array.isArray(row.summary)
        ? (row.summary as Record<string, unknown>)
        : {},
    started_at: typeof row.started_at === 'string' ? row.started_at : null,
    completed_at: typeof row.completed_at === 'string' ? row.completed_at : null,
    created_at: String(row.created_at ?? new Date(0).toISOString()),
    updated_at: String(row.updated_at ?? new Date(0).toISOString()),
  }
}

function toUpgradeRecommendationItem(row: Record<string, unknown>): UpgradeRecommendationItem {
  return {
    id: String(row.id),
    plan_id: String(row.plan_id),
    run_id: String(row.run_id),
    slot: typeof row.slot === 'string' ? row.slot : null,
    source: row.source === 'compare' ? 'compare' : row.source === 'market' ? 'market' : 'owned',
    item_name: typeof row.item_name === 'string' ? row.item_name : null,
    item_payload:
      row.item_payload && typeof row.item_payload === 'object' && !Array.isArray(row.item_payload)
        ? (row.item_payload as Record<string, unknown>)
        : {},
    trade_link: typeof row.trade_link === 'string' ? row.trade_link : null,
    ask_price_chaos: row.ask_price_chaos == null ? null : Number(row.ask_price_chaos),
    effective_price_chaos: Number(row.effective_price_chaos ?? 0),
    created_at: String(row.created_at ?? new Date(0).toISOString()),
  }
}

function toUpgradeRecommendationPlan(row: Record<string, unknown>): UpgradeRecommendationPlan {
  const items = Array.isArray(row.items)
    ? row.items
        .filter(
          (entry): entry is Record<string, unknown> =>
            !!entry && typeof entry === 'object' && !Array.isArray(entry),
        )
        .map(toUpgradeRecommendationItem)
    : []

  return {
    id: String(row.id),
    run_id: String(row.run_id),
    group_id: String(row.group_id),
    target_user_id: String(row.target_user_id),
    target_stage_id: typeof row.target_stage_id === 'string' ? row.target_stage_id : null,
    category:
      row.category === 'unlock_next_stage' || row.category === 'owned_now'
        ? row.category
        : 'best_single',
    kind: row.kind === 'bundle' ? 'bundle' : 'single',
    title: String(row.title ?? 'Recommendation'),
    summary: typeof row.summary === 'string' ? row.summary : null,
    explanation: typeof row.explanation === 'string' ? row.explanation : null,
    effective_cost_chaos: Number(row.effective_cost_chaos ?? 0),
    ask_price_chaos: row.ask_price_chaos == null ? null : Number(row.ask_price_chaos),
    score: Number(row.score ?? 0),
    stage_progress_score: Number(row.stage_progress_score ?? 0),
    ranking_reason:
      row.ranking_reason &&
      typeof row.ranking_reason === 'object' &&
      !Array.isArray(row.ranking_reason)
        ? (row.ranking_reason as Record<string, unknown>)
        : {},
    before_metrics:
      row.before_metrics &&
      typeof row.before_metrics === 'object' &&
      !Array.isArray(row.before_metrics)
        ? (row.before_metrics as UpgradeRecommendationPlan['before_metrics'])
        : {},
    after_metrics:
      row.after_metrics &&
      typeof row.after_metrics === 'object' &&
      !Array.isArray(row.after_metrics)
        ? (row.after_metrics as UpgradeRecommendationPlan['after_metrics'])
        : {},
    breaks_requirements: !!row.breaks_requirements,
    section: row.section === 'overview' ? 'overview' : 'primary',
    created_at: String(row.created_at ?? new Date(0).toISOString()),
    items,
  }
}

export function useBuildTargets(groupId: string | null, targetUserId: string | null) {
  return useQuery({
    queryKey: [...queryKeys.gearOptimizer.buildTargets(groupId, targetUserId)],
    enabled: !!groupId && !!targetUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('build_targets')
        .select(
          'id, group_id, user_id, character_id, created_by, name, source_kind, import_metadata, compatibility_status, compatibility_notes, is_selected, selected_stage_id, created_at, updated_at',
        )
        .eq('group_id', groupId!)
        .eq('user_id', targetUserId!)
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data ?? []).map((row) => toBuildTarget(row as Record<string, unknown>))
    },
  })
}

export function useBuildTarget(buildTargetId: string | null) {
  return useQuery({
    queryKey: [...queryKeys.gearOptimizer.buildTarget(buildTargetId)],
    enabled: !!buildTargetId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('build_targets')
        .select(
          'id, group_id, user_id, character_id, created_by, name, source_kind, raw_import, raw_xml, import_metadata, compatibility_status, compatibility_notes, is_selected, selected_stage_id, created_at, updated_at',
        )
        .eq('id', buildTargetId!)
        .single()

      if (error) throw error
      return toBuildTarget(data as Record<string, unknown>)
    },
  })
}

export function useBuildTargetStages(buildTargetId: string | null) {
  return useQuery({
    queryKey: [...queryKeys.gearOptimizer.buildTargetStages(buildTargetId)],
    enabled: !!buildTargetId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('build_target_stages')
        .select(
          'id, build_target_id, order_index, label, notes, tree_spec_id, tree_spec_title, item_set_id, item_set_title, skill_set_id, skill_set_title, config_set_id, config_set_title, primary_offensive_metric, target_metrics, hard_requirements, created_at, updated_at',
        )
        .eq('build_target_id', buildTargetId!)
        .order('order_index', { ascending: true })

      if (error) throw error
      return (data ?? []).map((row) => toBuildTargetStage(row as Record<string, unknown>))
    },
  })
}

export function useUpgradeAnalysisRuns(
  groupId: string | null,
  targetUserId: string | null,
  buildTargetId: string | null,
) {
  return useQuery({
    queryKey: [...queryKeys.gearOptimizer.analysisRuns(groupId, targetUserId, buildTargetId)],
    enabled: !!groupId && !!targetUserId && !!buildTargetId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('upgrade_analysis_runs')
        .select(
          'id, group_id, build_target_id, target_stage_id, target_user_id, character_id, queued_by, budget_chaos, analysis_mode, search_constraints, party_config, input_hash, status, stale_reason, partial_reason, error_detail, summary, started_at, completed_at, created_at, updated_at',
        )
        .eq('group_id', groupId!)
        .eq('target_user_id', targetUserId!)
        .eq('build_target_id', buildTargetId!)
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data ?? []).map((row) => toUpgradeAnalysisRun(row as Record<string, unknown>))
    },
    refetchInterval: (query) => {
      const runs = query.state.data ?? []
      const liveIntervals = runs
        .filter((run) => isLiveAnalysisStatus(run.status))
        .map(getLiveAnalysisPollInterval)
      return liveIntervals.length > 0 ? Math.min(...liveIntervals) : false
    },
  })
}

// Lightweight cross-build-target query for navbar status indicator.
// Polls at 30s when a run is live, otherwise fetches once and goes stale.
export function useMyLatestAnalysisRuns(groupId: string | null, targetUserId: string | null) {
  return useQuery({
    queryKey: queryKeys.gearOptimizer.myLatestRuns(groupId, targetUserId),
    enabled: !!groupId && !!targetUserId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('upgrade_analysis_runs')
        .select('id, status, analysis_mode, completed_at, summary, build_target_id')
        .eq('group_id', groupId!)
        .eq('target_user_id', targetUserId!)
        .order('created_at', { ascending: false })
        .limit(5)

      if (error) throw error
      return (data ?? []) as Array<{
        id: string
        status: UpgradeAnalysisRun['status']
        analysis_mode: UpgradeAnalysisMode
        completed_at: string | null
        summary: Record<string, unknown> | null
        build_target_id: string
      }>
    },
    refetchInterval: (query) => {
      const runs = query.state.data ?? []
      return runs.some((run) => isLiveAnalysisStatus(run.status)) ? 30000 : false
    },
    staleTime: 30000,
  })
}

export type AnalysisRuntimeEstimate = {
  median_seconds: number | null
  p90_seconds: number | null
  sample_size: number
  source: 'last_hour' | 'last_24h' | 'last_7d' | 'last_30d' | 'none'
  active_runs: number
  oldest_active_at: string | null
}

export function useAnalysisRuntimeEstimate(analysisMode: UpgradeAnalysisMode | null) {
  return useQuery({
    queryKey: queryKeys.gearOptimizer.runtimeEstimate(analysisMode),
    queryFn: async (): Promise<AnalysisRuntimeEstimate | null> => {
      const { data, error } = await supabase.rpc('estimate_analysis_runtime', {
        p_analysis_mode: analysisMode,
      })

      if (error) {
        if (
          error.code === 'PGRST202' ||
          error.code === '42883' ||
          error.message?.toLowerCase().includes('estimate_analysis_runtime')
        ) {
          return null
        }
        throw error
      }

      const row = Array.isArray(data) ? data[0] : data
      if (!row) return null

      return {
        median_seconds:
          row.median_seconds === null || row.median_seconds === undefined
            ? null
            : Number(row.median_seconds),
        p90_seconds:
          row.p90_seconds === null || row.p90_seconds === undefined
            ? null
            : Number(row.p90_seconds),
        sample_size: Number(row.sample_size ?? 0),
        source: (row.source ?? 'none') as AnalysisRuntimeEstimate['source'],
        active_runs: Number(row.active_runs ?? 0),
        oldest_active_at: row.oldest_active_at ?? null,
      }
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  })
}

export function useUpgradeRecommendationPlans(
  runId: string | null,
  runStatus: UpgradeAnalysisRun['status'] | null,
  runCompletedAt?: string | null,
) {
  return useQuery({
    queryKey: [...queryKeys.gearOptimizer.recommendationPlans(runId), runStatus ?? 'unknown'],
    enabled: !!runId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('upgrade_recommendation_plans')
        .select(
          `
          id, run_id, group_id, target_user_id, target_stage_id, category, kind, title, summary, explanation,
          effective_cost_chaos, ask_price_chaos, score, stage_progress_score, ranking_reason, before_metrics, after_metrics, breaks_requirements, section, created_at,
          items:upgrade_recommendation_items(id, plan_id, run_id, slot, source, item_name, item_payload, trade_link, ask_price_chaos, effective_price_chaos, created_at)
        `,
        )
        .eq('run_id', runId!)
        .order('category', { ascending: true })
        .order('score', { ascending: false })

      if (error) throw error
      return (data ?? []).map((row) => toUpgradeRecommendationPlan(row as Record<string, unknown>))
    },
    refetchInterval: (query) => {
      const plans = query.state.data ?? []
      // After completion/partial, keep polling until plans arrive (race condition: worker writes
      // status before writing plans, so the first fetch on key-change may return empty)
      if (shouldRetryMissingPlans(runStatus, runCompletedAt, plans.length)) {
        return LIVE_ANALYSIS_FAST_POLL_MS
      }
      return false
    },
    refetchIntervalInBackground: false,
  })
}

export function useCreateBuildTarget() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: {
      group_id: string
      user_id: string
      character_id?: string | null
      name: string
      source_kind: BuildTarget['source_kind']
      raw_import: string
      raw_xml: string
      import_metadata: PobImportMetadata
      compatibility_status?: BuildTarget['compatibility_status']
      compatibility_notes?: string | null
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data, error } = await supabase
        .from('build_targets')
        .insert({
          ...values,
          created_by: user.id,
          is_selected: false,
        })
        .select(
          'id, group_id, user_id, character_id, created_by, name, source_kind, raw_import, raw_xml, import_metadata, compatibility_status, compatibility_notes, is_selected, selected_stage_id, created_at, updated_at',
        )
        .single()

      if (error) throw error
      return toBuildTarget(data as Record<string, unknown>)
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.gearOptimizer.buildTarget(data.id), data)
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.gearOptimizer.buildTargets(data.group_id, data.user_id)],
      })
    },
  })
}

export function useUpdateBuildTarget() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (
      values: Partial<BuildTarget> & Pick<BuildTarget, 'id' | 'group_id' | 'user_id'>,
    ) => {
      const { id, group_id, user_id, ...fields } = values
      void group_id
      void user_id
      const { data, error } = await supabase
        .from('build_targets')
        .update(fields)
        .eq('id', id)
        .select(
          'id, group_id, user_id, character_id, created_by, name, source_kind, raw_import, raw_xml, import_metadata, compatibility_status, compatibility_notes, is_selected, selected_stage_id, created_at, updated_at',
        )
        .single()

      if (error) throw error
      return toBuildTarget(data as Record<string, unknown>)
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.gearOptimizer.buildTarget(data.id), data)
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.gearOptimizer.buildTargets(data.group_id, data.user_id)],
      })
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.gearOptimizer.buildTargetStages(data.id)],
      })
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.gearOptimizer.analysisRuns(data.group_id, data.user_id, data.id)],
      })
    },
  })
}

export function useDeleteBuildTarget() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: Pick<BuildTarget, 'id' | 'group_id' | 'user_id'>) => {
      const { error } = await supabase.from('build_targets').delete().eq('id', values.id)
      if (error) throw error
      return values
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.gearOptimizer.buildTargets(data.group_id, data.user_id)],
      })
      queryClient.removeQueries({
        queryKey: [...queryKeys.gearOptimizer.buildTarget(data.id)],
      })
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.gearOptimizer.buildTargetStages(data.id)],
      })
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.gearOptimizer.analysisRuns(data.group_id, data.user_id, data.id)],
      })
    },
  })
}

export function useSetSelectedBuildTarget() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: Pick<BuildTarget, 'id' | 'group_id' | 'user_id'>) => {
      const { data, error } = await supabase.rpc('set_selected_build_target', {
        p_build_target_id: values.id,
      })

      if (error) throw error
      return toBuildTarget(data as Record<string, unknown>)
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.gearOptimizer.buildTarget(data.id), data)
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.gearOptimizer.buildTargets(data.group_id, data.user_id)],
      })
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.gearOptimizer.analysisRuns(data.group_id, data.user_id, data.id)],
      })
    },
  })
}

export function useCreateBuildTargetStage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: Omit<BuildTargetStage, 'id' | 'created_at' | 'updated_at'>) => {
      const { data, error } = await supabase
        .from('build_target_stages')
        .insert(values)
        .select(
          'id, build_target_id, order_index, label, notes, tree_spec_id, tree_spec_title, item_set_id, item_set_title, skill_set_id, skill_set_title, config_set_id, config_set_title, primary_offensive_metric, target_metrics, hard_requirements, created_at, updated_at',
        )
        .single()

      if (error) throw error
      return toBuildTargetStage(data as Record<string, unknown>)
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.gearOptimizer.buildTargetStages(data.build_target_id)],
      })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.gearOptimizer.root] })
    },
  })
}

export function useUpdateBuildTargetStage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (
      values: Partial<BuildTargetStage> & Pick<BuildTargetStage, 'id' | 'build_target_id'>,
    ) => {
      const { id, build_target_id, ...fields } = values
      void build_target_id
      const { data, error } = await supabase
        .from('build_target_stages')
        .update(fields)
        .eq('id', id)
        .select(
          'id, build_target_id, order_index, label, notes, tree_spec_id, tree_spec_title, item_set_id, item_set_title, skill_set_id, skill_set_title, config_set_id, config_set_title, primary_offensive_metric, target_metrics, hard_requirements, created_at, updated_at',
        )
        .single()

      if (error) throw error
      return toBuildTargetStage(data as Record<string, unknown>)
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.gearOptimizer.buildTargetStages(data.build_target_id)],
      })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.gearOptimizer.root] })
    },
  })
}

export function useDeleteBuildTargetStage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: Pick<BuildTargetStage, 'id' | 'build_target_id'>) => {
      const { error } = await supabase.from('build_target_stages').delete().eq('id', values.id)
      if (error) throw error
      return values
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.gearOptimizer.buildTargetStages(data.build_target_id)],
      })
      queryClient.invalidateQueries({ queryKey: [...queryKeys.gearOptimizer.root] })
    },
  })
}

export function useQueueUpgradeAnalysis() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: {
      group_id: string
      build_target_id: string
      character_id?: string | null
      target_stage_id?: string | null
      budget_chaos: number
      analysis_mode: UpgradeAnalysisMode
      search_constraints: UpgradeSearchConstraints
      party_config?: PartyBuildEntry[]
      rerun_base_run_id?: string | null
      rerun_changed_slots?: string[]
    }) => {
      const { data, error } = await supabase.functions.invoke<{
        reused: boolean
        worker_notified: boolean
        run: Record<string, unknown>
      }>('queue-upgrade-analysis', {
        body: values,
      })

      if (error) {
        let message: string | undefined
        try {
          const body =
            error.context instanceof Response ? await (error.context as Response).json() : null
          message = typeof body?.error === 'string' ? body.error : undefined
        } catch {
          // ignore parse failures
        }
        throw new Error(message ?? error.message)
      }
      if (!data?.run) throw new Error('No analysis run was returned')
      return {
        reused: !!data.reused,
        worker_notified: !!data.worker_notified,
        run: toUpgradeAnalysisRun(data.run),
      }
    },
    onSuccess: ({ run }) => {
      queryClient.setQueryData<UpgradeAnalysisRun[]>(
        [
          ...queryKeys.gearOptimizer.analysisRuns(
            run.group_id,
            run.target_user_id,
            run.build_target_id,
          ),
        ],
        (current = []) => {
          const next = [run, ...current.filter((entry) => entry.id !== run.id)]
          return next.sort(
            (left, right) =>
              new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
          )
        },
      )
      queryClient.setQueryData<
        Array<{
          id: string
          status: UpgradeAnalysisRun['status']
          analysis_mode: UpgradeAnalysisMode
          completed_at: string | null
          summary: Record<string, unknown> | null
          build_target_id: string
        }>
      >(
        queryKeys.gearOptimizer.myLatestRuns(run.group_id, run.target_user_id),
        (current = []) =>
          [
            {
              id: run.id,
              status: run.status,
              analysis_mode: run.analysis_mode,
              completed_at: run.completed_at,
              summary: run.summary,
              build_target_id: run.build_target_id,
            },
            ...current.filter((entry) => entry.id !== run.id),
          ].slice(0, 5),
      )

      // Keep the freshly queued run in cache and let the live-run poll pick up the next state
      // change. An immediate refetch can briefly return the older server snapshot, which makes
      // the UI fall back to the previous completed run and drop the loading state.
      if (!isLiveAnalysisStatus(run.status)) {
        queryClient.invalidateQueries({
          queryKey: [
            ...queryKeys.gearOptimizer.analysisRuns(
              run.group_id,
              run.target_user_id,
              run.build_target_id,
            ),
          ],
        })
        queryClient.invalidateQueries({
          queryKey: queryKeys.gearOptimizer.myLatestRuns(run.group_id, run.target_user_id),
        })
        queryClient.invalidateQueries({
          queryKey: [...queryKeys.gearOptimizer.recommendationPlans(run.id)],
        })
      }
    },
  })
}

export function useCancelUpgradeAnalysis() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (values: {
      run_id: string
      group_id: string
      target_user_id: string
      build_target_id: string
    }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data, error } = await supabase
        .from('upgrade_analysis_runs')
        .update({ status: 'stale', stale_reason: 'user-cancelled' })
        .eq('id', values.run_id)
        .eq('group_id', values.group_id)
        .eq('queued_by', user.id)
        .in('status', ['queued', 'running'])
        .select(
          'id, group_id, build_target_id, target_stage_id, target_user_id, character_id, queued_by, budget_chaos, analysis_mode, search_constraints, party_config, input_hash, status, stale_reason, partial_reason, error_detail, summary, started_at, completed_at, created_at, updated_at',
        )
        .single()

      if (error) throw error
      return toUpgradeAnalysisRun(data as Record<string, unknown>)
    },
    onSuccess: (cancelled) => {
      queryClient.setQueryData<UpgradeAnalysisRun[]>(
        [
          ...queryKeys.gearOptimizer.analysisRuns(
            cancelled.group_id,
            cancelled.target_user_id,
            cancelled.build_target_id,
          ),
        ],
        (current = []) => current.map((r) => (r.id === cancelled.id ? cancelled : r)),
      )
      queryClient.invalidateQueries({
        queryKey: [
          ...queryKeys.gearOptimizer.analysisRuns(
            cancelled.group_id,
            cancelled.target_user_id,
            cancelled.build_target_id,
          ),
        ],
      })
      // Immediately update navbar status so the chip disappears without waiting for next poll
      queryClient.invalidateQueries({
        queryKey: queryKeys.gearOptimizer.myLatestRuns(
          cancelled.group_id,
          cancelled.target_user_id,
        ),
      })
    },
  })
}

export function useGroupPartyBuildTargets(groupId: string | null) {
  return useQuery({
    queryKey: [...queryKeys.gearOptimizer.partyBuildTargets(groupId)],
    enabled: !!groupId,
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return []

      const { data, error } = await supabase
        .from('build_targets')
        .select('id, user_id, name, users!user_id(display_name, poe_account_name, pob_support_code)')
        .eq('group_id', groupId!)
        .neq('user_id', user.id)
        .eq('is_selected', true)
        .order('updated_at', { ascending: false })

      if (error) throw error

      return (data ?? [])
        .filter((row) => {
          const userRow =
            row.users && typeof row.users === 'object' && !Array.isArray(row.users)
              ? (row.users as Record<string, unknown>)
              : {}
          return !!userRow.pob_support_code
        })
        .map((row): GroupPartyBuildTarget => {
          const userRow =
            row.users && typeof row.users === 'object' && !Array.isArray(row.users)
              ? (row.users as Record<string, unknown>)
              : {}
          return {
            id: String(row.id),
            user_id: String(row.user_id),
            name: String(row.name ?? 'Imported PoB'),
            display_name: typeof userRow.display_name === 'string' ? userRow.display_name : null,
            poe_account_name:
              typeof userRow.poe_account_name === 'string' ? userRow.poe_account_name : null,
          }
        })
    },
  })
}

export function usePromoteUpgradeRecommendation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (planId: string) => {
      const { data, error } = await supabase.functions.invoke<{ suggestion: { group_id: string } }>(
        'promote-upgrade-recommendation',
        {
          body: { plan_id: planId },
        },
      )

      if (error) throw error
      if (!data?.suggestion) throw new Error('No gear suggestion was created')
      return data.suggestion
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [...queryKeys.gear.all(data.group_id)] })
    },
  })
}
