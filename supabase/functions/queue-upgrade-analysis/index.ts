import { createAdminClient } from '../_shared/supabase-admin.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { requireAuthenticatedUser } from '../_shared/request-auth.ts'

type PartyBuildEntry =
  | { kind: 'pob_code'; pob_code: string; label?: string }
  | { kind: 'group_member'; build_target_id: string; label?: string; updated_at?: string }

type QueueUpgradeAnalysisBody = {
  group_id?: string
  build_target_id?: string
  character_id?: string | null
  target_stage_id?: string | null
  budget_chaos?: number | string | null
  analysis_mode?: string | null
  search_constraints?: unknown
  party_config?: unknown
  rerun_base_run_id?: string | null
  rerun_changed_slots?: unknown
}

const UPGRADE_ANALYSIS_INPUT_VERSION = 16
const FREE_DAILY_UPGRADE_ANALYSIS_LIMIT = 3
const UPGRADE_ANALYSIS_RUN_SELECT = [
  'id',
  'group_id',
  'build_target_id',
  'target_stage_id',
  'target_user_id',
  'character_id',
  'queued_by',
  'budget_chaos',
  'analysis_mode',
  'search_constraints',
  'party_config',
  'input_hash',
  'status',
  'stale_reason',
  'partial_reason',
  'error_detail',
  'summary',
  'started_at',
  'completed_at',
  'created_at',
  'updated_at',
].join(', ')

const ALLOWED_TARGET_KEYS = new Set([
  'life',
  'elementalRes',
  'chaosRes',
  'strength',
  'dexterity',
  'intelligence',
  'allAttributes',
  'movementSpeed',
  'attackSpeed',
  'critChance',
  'critMulti',
  'pdps',
  'edps',
  'weaponDps',
  'custom',
])

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return 'Unknown error'
  }
}

function toBudgetChaos(value: number | string | null | undefined): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return Math.round(parsed * 100) / 100
}

function normalizeAnalysisMode(value: string | null | undefined) {
  return value === 'thorough' ? 'thorough' : 'quick'
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function normalizePositiveNumber(value: unknown): number | null {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.round(parsed * 100) / 100
}

function normalizeConstraintSlot(slot: string | null | undefined): string | null {
  const normalized = String(slot ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
  if (!normalized) return null

  if (normalized === 'weapon' || normalized === 'weapon 1') return 'Weapon 1'
  if (normalized === 'weapon 2' || normalized === 'offhand') return 'Weapon 2'
  if (normalized === 'bodyarmour' || normalized === 'body armour' || normalized === 'chest')
    return 'Body Armour'
  if (normalized === 'helmet' || normalized === 'helm') return 'Helmet'
  if (normalized === 'gloves') return 'Gloves'
  if (normalized === 'boots') return 'Boots'
  if (normalized === 'ring' || normalized === 'ring 1') return 'Ring 1'
  if (normalized === 'ring 2') return 'Ring 2'
  if (normalized === 'amulet') return 'Amulet'
  if (normalized === 'belt') return 'Belt'
  return normalized
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function normalizePartyConfig(
  value: unknown,
  groupId: string,
  adminClient: ReturnType<typeof createAdminClient>,
): Promise<PartyBuildEntry[]> {
  if (!Array.isArray(value)) return []

  const entries: PartyBuildEntry[] = []

  for (const raw of value.slice(0, 5)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const entry = raw as Record<string, unknown>
    const kind = entry.kind

    if (kind === 'pob_code') {
      const code = typeof entry.pob_code === 'string' ? entry.pob_code.trim() : ''
      if (!code) continue
      const label = typeof entry.label === 'string' ? entry.label.trim().slice(0, 100) : undefined
      entries.push({ kind: 'pob_code', pob_code: code, ...(label ? { label } : {}) })
    } else if (kind === 'group_member') {
      const id = typeof entry.build_target_id === 'string' ? entry.build_target_id.trim() : ''
      if (!id || !UUID_REGEX.test(id)) continue
      const { data: bt } = await adminClient
        .from('build_targets')
        .select('id, updated_at, raw_xml')
        .eq('id', id)
        .eq('group_id', groupId)
        .maybeSingle()
      if (!bt || !bt.raw_xml) continue
      const label = typeof entry.label === 'string' ? entry.label.trim().slice(0, 100) : undefined
      entries.push({
        kind: 'group_member',
        build_target_id: id,
        updated_at: bt.updated_at,
        ...(label ? { label } : {}),
      })
    }
  }

  return entries
}

function normalizeSearchConstraints(value: unknown) {
  const record = asRecord(value)
  const rawSlotOverrides = asRecord(record.slot_overrides)
  const slotOverrides = Object.fromEntries(
    Object.entries(rawSlotOverrides)
      .map(([slot, slotValue]) => {
        const normalizedSlot = normalizeConstraintSlot(slot)
        const slotRecord = asRecord(slotValue)
        const targetOverrideRecord = asRecord(slotRecord.target_overrides)
        const disabledTargetKeys = Array.from(
          new Set(
            (Array.isArray(slotRecord.disabled_target_keys)
              ? slotRecord.disabled_target_keys
              : []
            ).filter(
              (entry): entry is string =>
                typeof entry === 'string' && ALLOWED_TARGET_KEYS.has(entry),
            ),
          ),
        ).sort()
        const targetOverrides = Object.fromEntries(
          Array.from(ALLOWED_TARGET_KEYS)
            .map((key) => {
              const normalizedValue = normalizePositiveNumber(targetOverrideRecord[key])
              return normalizedValue != null && normalizedValue > 0
                ? ([key, normalizedValue] as const)
                : null
            })
            .filter((entry): entry is readonly [string, number] => !!entry),
        )
        const lineOverrides = Array.from(
          new Map(
            (Array.isArray(slotRecord.line_overrides) ? slotRecord.line_overrides : [])
              .map((entry) => {
                if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
                const lineRecord = entry as Record<string, unknown>
                const lineId =
                  typeof lineRecord.line_id === 'string' ? lineRecord.line_id.trim() : ''
                const targetKey =
                  typeof lineRecord.target_key === 'string' &&
                  ALLOWED_TARGET_KEYS.has(lineRecord.target_key)
                    ? lineRecord.target_key
                    : null
                if (!lineId || !targetKey) return null

                return [
                  lineId,
                  {
                    line_id: lineId,
                    target_key: targetKey,
                    enabled: lineRecord.enabled !== false,
                    value:
                      lineRecord.value == null ? null : normalizePositiveNumber(lineRecord.value),
                  },
                ] as const
              })
              .filter(
                (
                  entry,
                ): entry is readonly [
                  string,
                  {
                    line_id: string
                    target_key: string
                    enabled: boolean
                    value: number | null
                  },
                ] => !!entry,
              ),
          ).values(),
        ).sort((left, right) => left.line_id.localeCompare(right.line_id))

        if (
          !normalizedSlot ||
          (disabledTargetKeys.length === 0 &&
            Object.keys(targetOverrides).length === 0 &&
            lineOverrides.length === 0)
        ) {
          return null
        }

        return [
          normalizedSlot,
          {
            disabled_target_keys: disabledTargetKeys,
            ...(Object.keys(targetOverrides).length > 0
              ? { target_overrides: targetOverrides }
              : {}),
            ...(lineOverrides.length > 0 ? { line_overrides: lineOverrides } : {}),
          },
        ] as const
      })
      .filter(
        (
          entry,
        ): entry is readonly [
          string,
          {
            disabled_target_keys: string[]
            target_overrides?: Record<string, number>
            line_overrides?: Array<{
              line_id: string
              target_key: string
              enabled: boolean
              value: number | null
            }>
          },
        ] => !!entry,
      )
      .sort(([left], [right]) => left.localeCompare(right)),
  )

  const percentileFloorValue = Number(record.property_percentile_floor)
  const propertyPercentileFloor = Number.isFinite(percentileFloorValue)
    ? Math.min(90, Math.max(0, Math.round(percentileFloorValue)))
    : 20

  return {
    ignore_crafted_mods: record.ignore_crafted_mods !== false,
    ignore_enchants: record.ignore_enchants !== false,
    ignore_quality: record.ignore_quality !== false,
    ignore_corrupted_implicits: record.ignore_corrupted_implicits !== false,
    property_percentile_floor: propertyPercentileFloor,
    slot_overrides: slotOverrides,
  }
}

function normalizeRerunChangedSlots(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  return Array.from(
    new Set(
      value
        .map((entry) => (typeof entry === 'string' ? normalizeConstraintSlot(entry) : null))
        .filter((entry): entry is string => !!entry),
    ),
  ).sort((left, right) => left.localeCompare(right))
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((entry) => entry.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const authenticatedUser = await requireAuthenticatedUser(req)
    if (authenticatedUser instanceof Response) return authenticatedUser

    const {
      group_id,
      build_target_id,
      character_id,
      target_stage_id,
      budget_chaos,
      analysis_mode,
      search_constraints,
      party_config,
      rerun_base_run_id,
      rerun_changed_slots,
    } = (await req.json()) as QueueUpgradeAnalysisBody

    if (!group_id || !build_target_id) {
      return new Response(
        JSON.stringify({ error: 'Missing group_id or build_target_id parameter' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const adminClient = createAdminClient()
    const normalizedBudgetChaos = toBudgetChaos(budget_chaos)
    const normalizedAnalysisMode = normalizeAnalysisMode(analysis_mode)
    const normalizedSearchConstraints = normalizeSearchConstraints(search_constraints)
    const normalizedCharacterId =
      typeof character_id === 'string' && UUID_REGEX.test(character_id.trim())
        ? character_id.trim()
        : null
    let normalizedRerunBaseRunId =
      typeof rerun_base_run_id === 'string' && UUID_REGEX.test(rerun_base_run_id.trim())
        ? rerun_base_run_id.trim()
        : null
    let normalizedRerunChangedSlots = normalizeRerunChangedSlots(rerun_changed_slots)
    // party_config normalization requires group_id, so deferred until after group_id is validated below
    let normalizedPartyConfig: PartyBuildEntry[] = []

    const { data: membership, error: membershipError } = await adminClient
      .from('group_members')
      .select('role')
      .eq('group_id', group_id)
      .eq('user_id', authenticatedUser.id)
      .maybeSingle()

    if (membershipError) throw membershipError
    if (!membership) {
      return new Response(JSON.stringify({ error: 'Not a member of this group' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (membership.role === 'viewer') {
      return new Response(
        JSON.stringify({ error: 'Viewers can inspect recommendations but cannot queue runs' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const { data: buildTarget, error: buildTargetError } = await adminClient
      .from('build_targets')
      .select('id, group_id, user_id, character_id, selected_stage_id, updated_at')
      .eq('id', build_target_id)
      .eq('group_id', group_id)
      .maybeSingle()

    if (buildTargetError) throw buildTargetError
    if (!buildTarget) {
      return new Response(JSON.stringify({ error: 'Build target not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (buildTarget.user_id !== authenticatedUser.id) {
      return new Response(
        JSON.stringify({ error: 'You can only queue analysis for your own characters' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    normalizedPartyConfig = await normalizePartyConfig(party_config, group_id, adminClient)

    const resolvedTargetStageId = target_stage_id ?? buildTarget.selected_stage_id ?? null
    let stageUpdatedAt = 'none'
    let resolvedCharacterId: string | null = null

    if (normalizedCharacterId) {
      const { data: requestedCharacter, error: requestedCharacterError } = await adminClient
        .from('characters')
        .select('id')
        .eq('id', normalizedCharacterId)
        .eq('group_id', group_id)
        .eq('user_id', buildTarget.user_id)
        .maybeSingle()

      if (requestedCharacterError) throw requestedCharacterError
      if (!requestedCharacter) {
        return new Response(
          JSON.stringify({ error: 'Selected character does not belong to this build target' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      }

      resolvedCharacterId = requestedCharacter.id
    } else {
      resolvedCharacterId = buildTarget.character_id as string | null
    }

    if (resolvedTargetStageId) {
      const { data: targetStage, error: targetStageError } = await adminClient
        .from('build_target_stages')
        .select('id, updated_at')
        .eq('id', resolvedTargetStageId)
        .eq('build_target_id', buildTarget.id)
        .maybeSingle()

      if (targetStageError) throw targetStageError
      if (!targetStage) {
        return new Response(
          JSON.stringify({ error: 'Selected stage does not belong to this build target' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      }

      stageUpdatedAt = targetStage.updated_at
    }

    if (!resolvedCharacterId) {
      const { data: latestCharacter } = await adminClient
        .from('characters')
        .select('id')
        .eq('group_id', group_id)
        .eq('user_id', buildTarget.user_id)
        .eq('is_active', true)
        .maybeSingle()

      resolvedCharacterId = latestCharacter?.id ?? null
    }

    if (
      normalizedAnalysisMode !== 'thorough' ||
      !normalizedRerunBaseRunId ||
      normalizedRerunChangedSlots.length === 0
    ) {
      normalizedRerunBaseRunId = null
      normalizedRerunChangedSlots = []
    } else {
      const { data: baseRun, error: baseRunError } = await adminClient
        .from('upgrade_analysis_runs')
        .select(
          'id, build_target_id, target_stage_id, target_user_id, character_id, analysis_mode, status',
        )
        .eq('id', normalizedRerunBaseRunId)
        .eq('group_id', group_id)
        .maybeSingle()

      if (baseRunError) throw baseRunError

      const baseRunIsValid =
        !!baseRun &&
        baseRun.build_target_id === build_target_id &&
        baseRun.target_user_id === buildTarget.user_id &&
        (baseRun.target_stage_id ?? null) === resolvedTargetStageId &&
        (baseRun.character_id ?? null) === resolvedCharacterId &&
        baseRun.analysis_mode === 'thorough' &&
        (baseRun.status === 'completed' || baseRun.status === 'partial')

      if (!baseRunIsValid) {
        normalizedRerunBaseRunId = null
        normalizedRerunChangedSlots = []
      }
    }

    const [{ data: profile }, { data: snapshots }] = await Promise.all([
      (() => {
        let profileQuery = adminClient
          .from('character_profile_snapshots')
          .select('id, last_synced_at')
          .eq('group_id', group_id)
          .eq('user_id', buildTarget.user_id)
        if (resolvedCharacterId) {
          profileQuery = profileQuery.eq('character_id', resolvedCharacterId)
        }
        return profileQuery.maybeSingle()
      })(),
      adminClient.from('latest_snapshots').select('completed_at').eq('group_id', group_id),
    ])

    const latestSnapshotCompletedAt =
      (snapshots ?? [])
        .map((entry) => entry.completed_at ?? '')
        .sort((left, right) => (left < right ? 1 : -1))[0] ?? 'none'

    const inputHash = await sha256Hex(
      JSON.stringify({
        version: UPGRADE_ANALYSIS_INPUT_VERSION,
        group_id,
        build_target_id,
        target_user_id: buildTarget.user_id,
        target_stage_id: resolvedTargetStageId,
        character_id: resolvedCharacterId,
        budget_chaos: normalizedBudgetChaos,
        analysis_mode: normalizedAnalysisMode,
        search_constraints: normalizedSearchConstraints,
        rerun_base_run_id: normalizedRerunBaseRunId,
        rerun_changed_slots: normalizedRerunChangedSlots,
        party_config: normalizedPartyConfig.map((entry) =>
          entry.kind === 'pob_code'
            ? { kind: 'pob_code', pob_code: entry.pob_code }
            : {
                kind: 'group_member',
                build_target_id: entry.build_target_id,
                updated_at: entry.updated_at ?? 'none',
              },
        ),
        build_target_updated_at: buildTarget.updated_at,
        target_stage_updated_at: stageUpdatedAt,
        character_profile_synced_at: profile?.last_synced_at ?? 'none',
        latest_group_snapshot_completed_at: latestSnapshotCompletedAt,
      }),
    )

    const { data: existingRun, error: existingRunError } = await adminClient
      .from('upgrade_analysis_runs')
      .select(UPGRADE_ANALYSIS_RUN_SELECT)
      .eq('build_target_id', build_target_id)
      .eq('input_hash', inputHash)
      .maybeSingle()

    if (existingRunError) throw existingRunError

    if (existingRun) {
      return new Response(
        JSON.stringify({ reused: true, worker_notified: false, run: existingRun }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    // Rate limit: Community users may queue at most 3 new analyses per UTC day.
    const { data: userProfile } = await adminClient
      .from('users')
      .select('subscription_tier, subscription_expires_at')
      .eq('id', authenticatedUser.id)
      .maybeSingle()

    const isPro =
      userProfile?.subscription_tier === 'pro' &&
      (!userProfile.subscription_expires_at ||
        new Date(userProfile.subscription_expires_at) > new Date())

    if (!isPro) {
      const todayUtcMidnight = new Date()
      todayUtcMidnight.setUTCHours(0, 0, 0, 0)

      const { count: todayRunCount, error: countError } = await adminClient
        .from('upgrade_analysis_runs')
        .select('id', { count: 'exact', head: true })
        .eq('queued_by', authenticatedUser.id)
        .gte('created_at', todayUtcMidnight.toISOString())

      if (countError) throw countError

      if ((todayRunCount ?? 0) >= FREE_DAILY_UPGRADE_ANALYSIS_LIMIT) {
        return new Response(
          JSON.stringify({
            error: `Community analysis queue limit reached. Community accounts can queue up to ${FREE_DAILY_UPGRADE_ANALYSIS_LIMIT} authenticated upgrade analyses per UTC day. Supporter access has no app-enforced daily authenticated queue cap.`,
          }),
          {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      }
    }

    const { error: stalePreviousRunsError } = await adminClient
      .from('upgrade_analysis_runs')
      .update({
        status: 'stale',
        stale_reason: 'budget-or-target-updated',
      })
      .eq('group_id', group_id)
      .eq('build_target_id', build_target_id)
      .in('status', ['queued', 'running', 'completed', 'partial'])

    if (stalePreviousRunsError) throw stalePreviousRunsError

    const { data: insertedRun, error: insertRunError } = await adminClient
      .from('upgrade_analysis_runs')
      .insert({
        group_id,
        build_target_id,
        target_stage_id: resolvedTargetStageId,
        target_user_id: buildTarget.user_id,
        character_id: resolvedCharacterId,
        queued_by: authenticatedUser.id,
        budget_chaos: normalizedBudgetChaos,
        analysis_mode: normalizedAnalysisMode,
        search_constraints: normalizedSearchConstraints,
        party_config: normalizedPartyConfig,
        input_hash: inputHash,
        status: 'queued',
        summary:
          normalizedRerunBaseRunId && normalizedRerunChangedSlots.length > 0
            ? {
                incremental_rerun: true,
                rerun_base_run_id: normalizedRerunBaseRunId,
                rerun_changed_slots: normalizedRerunChangedSlots,
              }
            : {},
      })
      .select(UPGRADE_ANALYSIS_RUN_SELECT)
      .single()

    if (insertRunError) throw insertRunError

    // History retention: keep at most 3 runs per build target (oldest are deleted along with
    // their cascaded recommendation plans and items).
    const { data: allRunIds } = await adminClient
      .from('upgrade_analysis_runs')
      .select('id')
      .eq('build_target_id', build_target_id)
      .order('created_at', { ascending: false })

    if (allRunIds && allRunIds.length > 3) {
      const idsToDelete = allRunIds.slice(3).map((r: { id: string }) => r.id)
      await adminClient.from('upgrade_analysis_runs').delete().in('id', idsToDelete)
    }

    let workerNotified = false
    const workerUrl = Deno.env.get('UPGRADE_ANALYZER_WORKER_URL')
    const workerToken = Deno.env.get('UPGRADE_ANALYZER_WORKER_TOKEN')
    const workerNotifyTimeoutMs = Math.max(
      500,
      Number(Deno.env.get('UPGRADE_ANALYZER_WORKER_NOTIFY_TIMEOUT_MS') ?? 1500) || 1500,
    )

    if (workerUrl) {
      const abortController = new AbortController()
      const timeout = setTimeout(() => abortController.abort(), workerNotifyTimeoutMs)
      try {
        const res = await fetch(`${workerUrl.replace(/\/$/, '')}/jobs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(workerToken ? { Authorization: `Bearer ${workerToken}` } : {}),
          },
          signal: abortController.signal,
          body: JSON.stringify({
            run_id: insertedRun.id,
            input_hash: inputHash,
          }),
        })
        workerNotified = res.ok
      } catch (error) {
        console.error('Failed to notify optimizer worker', error)
      } finally {
        clearTimeout(timeout)
      }
    }

    return new Response(
      JSON.stringify({ reused: false, worker_notified: workerNotified, run: insertedRun }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (error) {
    console.error('queue-upgrade-analysis error', error)
    return new Response(
      JSON.stringify({
        error: 'Failed to queue upgrade analysis',
        detail: toErrorMessage(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
