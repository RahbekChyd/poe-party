import { createAdminClient } from '../_shared/supabase-admin.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { requireAuthenticatedUser } from '../_shared/request-auth.ts'

type PromoteRecommendationBody = {
  plan_id?: string
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return 'Unknown error'
  }
}

function trimToLength(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function normalizeActionType(value: unknown): string {
  const actionType = typeof value === 'string' ? value : 'gear_item'
  return [
    'gear_item',
    'passive_node',
    'skill_gem',
    'support_gem',
    'config_change',
    'reservation_fix',
  ].includes(actionType)
    ? actionType
    : 'gear_item'
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const authenticatedUser = await requireAuthenticatedUser(req)
    if (authenticatedUser instanceof Response) return authenticatedUser

    const { plan_id } = await req.json() as PromoteRecommendationBody
    if (!plan_id) {
      return new Response(JSON.stringify({ error: 'Missing plan_id parameter' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const adminClient = createAdminClient()

    const { data: plan, error: planError } = await adminClient
      .from('upgrade_recommendation_plans')
      .select(`
        id, run_id, group_id, target_user_id, category, kind, title, summary, explanation, effective_cost_chaos, stage_progress_score,
        run:upgrade_analysis_runs!upgrade_recommendation_plans_run_id_fkey(id, target_stage_id),
        target_stage:build_target_stages!upgrade_recommendation_plans_target_stage_id_fkey(id, label)
      `)
      .eq('id', plan_id)
      .maybeSingle()

    if (planError) throw planError
    if (!plan) {
      return new Response(JSON.stringify({ error: 'Recommendation plan not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: membership, error: membershipError } = await adminClient
      .from('group_members')
      .select('role')
      .eq('group_id', plan.group_id)
      .eq('user_id', authenticatedUser.id)
      .maybeSingle()

    if (membershipError) throw membershipError
    if (!membership || membership.role === 'viewer') {
      return new Response(JSON.stringify({ error: 'Only editors or admins can promote recommendations to the queue' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: recommendationItems, error: itemsError } = await adminClient
      .from('upgrade_recommendation_items')
      .select('slot, source, item_name, item_payload, trade_link, ask_price_chaos, effective_price_chaos')
      .eq('plan_id', plan_id)
      .order('created_at', { ascending: true })

    if (itemsError) throw itemsError

    const primaryItem = recommendationItems?.[0] ?? null
    const primaryPayload = asRecord(primaryItem?.item_payload)
    const actionType = normalizeActionType(primaryPayload.action_type)
    const iconUrl = primaryPayload.icon_url ?? primaryPayload.icon ?? null
    // Untyped embedded relations can be inferred as arrays even for a to-one join.
    const targetStage = Array.isArray(plan.target_stage)
      ? plan.target_stage[0]
      : plan.target_stage

    const itemName = trimToLength(
      primaryItem?.item_name ||
        plan.title ||
        (plan.kind === 'bundle' ? 'Recommended upgrade bundle' : 'Recommended upgrade'),
      128,
    )

    const notes = trimToLength(
      [
        targetStage?.label ? `Stage: ${targetStage.label}` : null,
        plan.category === 'unlock_next_stage' ? 'Unlock next stage' : null,
        plan.summary,
        plan.explanation,
        actionType !== 'gear_item' ? `Action: ${actionType.replaceAll('_', ' ')}` : null,
        recommendationItems?.length
          ? `Sources: ${recommendationItems.map((item) => `${item.source}${item.slot ? ` ${item.slot}` : ''}`).join(', ')}`
          : null,
      ]
        .filter((entry): entry is string => !!entry)
        .join(' · '),
      1000,
    )

    const importance =
      plan.category === 'unlock_next_stage' || Number(plan.stage_progress_score ?? 0) >= 1
        ? 'high'
        : Number(plan.effective_cost_chaos ?? 0) === 0
          ? 'medium'
          : 'low'

    const { data: suggestion, error: suggestionError } = await adminClient
      .from('gear_suggestions')
      .insert({
        group_id: plan.group_id,
        target_user_id: plan.target_user_id,
        suggested_by: authenticatedUser.id,
        item_name: itemName,
        item_data: iconUrl ? { icon_url: String(iconUrl) } : null,
        item_trade_link: primaryItem?.trade_link ?? null,
        notes,
        importance,
        status: 'open',
        action_type: actionType,
        action_payload: primaryPayload,
        source_recommendation_plan_id: plan.id,
      })
      .select('id, group_id, target_user_id, suggested_by, item_name, item_data, item_trade_link, notes, importance, status, status_note, created_at, admin_locked, action_type, action_payload, source_recommendation_plan_id')
      .single()

    if (suggestionError) throw suggestionError

    return new Response(JSON.stringify({ suggestion }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('promote-upgrade-recommendation error', error)
    return new Response(
      JSON.stringify({
        error: 'Failed to promote recommendation',
        detail: toErrorMessage(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
