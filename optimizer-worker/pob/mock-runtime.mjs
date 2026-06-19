async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk)
  }
  return chunks.length > 0 ? Buffer.concat(chunks).toString('utf8') : ''
}

const input = await readStdin()
const payload = input ? JSON.parse(input) : {}

const summary = {
  runtime: 'mock',
  stage_label: payload?.target_stage?.label ?? null,
  primary_metric: payload?.target_stage?.primary_metric ?? null,
  target_config_set_id: payload?.target_stage?.config_set?.id ?? null,
  target_config_set_title: payload?.target_stage?.config_set?.title ?? null,
  equipped_item_count: payload?.diagnostics?.equipped_item_count ?? 0,
  owned_candidate_count: payload?.diagnostics?.owned_candidate_count ?? 0,
  market_candidate_count: payload?.diagnostics?.market_candidate_count ?? 0,
  stage_item_count: payload?.diagnostics?.stage_item_count ?? 0,
  has_raw_xml: Boolean(payload?.build_target?.raw_xml),
  available_tree_keystones: [],
  current_tree_keystones: [],
  target_tree_keystones: [],
  reservation_audit: {
    status: 'unknown',
    target_skill_set_id: payload?.target_stage?.skill_set?.id ?? null,
    target_skill_set_title: payload?.target_stage?.skill_set?.title ?? null,
    target_gems: Array.isArray(payload?.target_stage?.skill_set?.gemNames)
      ? payload.target_stage.skill_set.gemNames
      : [],
    reserved_mana_delta: null,
    blockers: [],
    surplus_sources: [],
    notes: ['Mock PoB runtime does not calculate reservation fit.'],
    suggestions: [],
  },
}

process.stdout.write(
  JSON.stringify({
    status: 'partial',
    partialReason: 'Mock PoB runtime adapter returned payload diagnostics only.',
    summary,
    plans: [],
  }),
)
