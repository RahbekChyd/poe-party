import { createAdminClient } from '../_shared/supabase-admin.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { hmacSha256Hex } from '../_shared/guest-analysis.ts'

const GUEST_RUN_STATUS_SELECT = [
  'id',
  'normalized_account_name',
  'account_name',
  'character_name',
  'character_class',
  'character_ascendancy_class',
  'character_league',
  'character_level',
  'realm',
  'target_name',
  'source_kind',
  'budget_chaos',
  'analysis_mode',
  'input_hash',
  'status',
  'stale_reason',
  'partial_reason',
  'error_detail',
  'summary',
  'started_at',
  'completed_at',
  'expires_at',
  'created_at',
  'updated_at',
].join(', ')

const GUEST_RUN_SELECT = [
  'id',
  'normalized_account_name',
  'account_name',
  'character_name',
  'character_class',
  'character_ascendancy_class',
  'character_league',
  'character_level',
  'realm',
  'target_name',
  'source_kind',
  'import_metadata',
  'target_stage',
  'character_profile',
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
  'expires_at',
  'created_at',
  'updated_at',
].join(', ')

const GUEST_PLAN_SELECT = `
  id, run_id, category, kind, title, summary, explanation,
  effective_cost_chaos, ask_price_chaos, score, stage_progress_score,
  ranking_reason, before_metrics, after_metrics, breaks_requirements, section, created_at,
  items:guest_upgrade_recommendation_items(id, plan_id, run_id, slot, source, item_name, item_payload, trade_link, ask_price_chaos, effective_price_chaos, created_at)
`

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function hasStringId(value: unknown): value is { id: string } {
  return (
    typeof value === 'object' && value !== null && 'id' in value && typeof value.id === 'string'
  )
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const body = (await req.json()) as { include_results?: unknown; run_token?: unknown }
    const runToken = typeof body.run_token === 'string' ? body.run_token.trim() : ''
    if (!runToken || runToken.length < 32) {
      return jsonResponse({ error: 'Missing public run token', code: 'missing_run_token' }, 400)
    }
    const includeResults = body.include_results !== false

    const adminClient = createAdminClient()
    const runTokenHash = await hmacSha256Hex(runToken, 'guest-analysis-run-token')
    const { data: run, error: runError } = await adminClient
      .from('guest_upgrade_analysis_runs')
      .select(includeResults ? GUEST_RUN_SELECT : GUEST_RUN_STATUS_SELECT)
      .eq('run_token_hash', runTokenHash)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()

    if (runError) throw runError
    if (!run) {
      return jsonResponse(
        {
          error: 'Public Analysis run not found or expired.',
          code: 'guest_run_not_found',
        },
        404,
      )
    }
    if (!hasStringId(run)) {
      throw new Error('Guest analysis lookup returned no run id')
    }

    if (!includeResults) {
      return jsonResponse({
        run,
        plans: [],
        result_mode: 'status',
      })
    }

    const { data: plans, error: plansError } = await adminClient
      .from('guest_upgrade_recommendation_plans')
      .select(GUEST_PLAN_SELECT)
      .eq('run_id', run.id)
      .order('section', { ascending: true })
      .order('score', { ascending: false })

    if (plansError) throw plansError

    return jsonResponse({
      run,
      plans: plans ?? [],
      result_mode: 'full',
    })
  } catch (error) {
    console.error('guest-upgrade-analysis-status error', error)
    return jsonResponse({ error: 'Failed to load Public Analysis status' }, 500)
  }
})
