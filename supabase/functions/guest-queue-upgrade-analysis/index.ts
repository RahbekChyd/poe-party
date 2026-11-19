import { createAdminClient } from '../_shared/supabase-admin.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import {
  buildGuestTargetStage,
  createRunToken,
  fetchGuestCharacterProfile,
  fetchGuestCharacters,
  getClientIp,
  GuestPoePublicError,
  hmacSha256Hex,
  nextUtcResetAt,
  normalizeCharacterName,
  normalizeGuestAccountName,
  parseGuestPobImport,
  sha256Hex,
  utcUsageDate,
} from '../_shared/guest-analysis.ts'

type GuestQueueBody = {
  account_name?: unknown
  character_name?: unknown
  raw_import?: unknown
  target_name?: unknown
  tree_spec_id?: unknown
  item_set_id?: unknown
  skill_set_id?: unknown
  config_set_id?: unknown
}

const GUEST_UPGRADE_ANALYSIS_INPUT_VERSION = 2
const GUEST_RUN_EXPIRES_DAYS = 7
const GUEST_ACCOUNT_DAILY_LIMIT = 1
const GUEST_IP_DAILY_LIMIT = 20
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

function defaultQuickSearchConstraints() {
  return {
    ignore_crafted_mods: true,
    ignore_enchants: true,
    ignore_quality: true,
    ignore_corrupted_implicits: true,
    property_percentile_floor: 20,
    slot_overrides: {},
  }
}

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

function guestErrorResponse(error: unknown): Response {
  if (error instanceof GuestPoePublicError) {
    return jsonResponse({ error: error.message, code: error.code }, error.status)
  }

  console.error('guest-queue-upgrade-analysis error', error)
  return jsonResponse(
    {
      error: 'Failed to queue Public Analysis',
    },
    500,
  )
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const body = (await req.json()) as GuestQueueBody
    const { accountName, normalizedAccountName } = normalizeGuestAccountName(body.account_name)
    const characterName = normalizeCharacterName(body.character_name)
    const adminClient = createAdminClient()
    const clientIp = getClientIp(req)
    const ipHash = clientIp ? await hmacSha256Hex(clientIp, 'guest-analysis-ip') : null
    const usageDate = utcUsageDate()
    const { data: claimRows, error: claimError } = await adminClient.rpc(
      'claim_guest_upgrade_analysis_daily_usage',
      {
        p_usage_date: usageDate,
        p_normalized_account_name: normalizedAccountName,
        p_ip_hash: ipHash,
        p_account_limit: GUEST_ACCOUNT_DAILY_LIMIT,
        p_ip_limit: GUEST_IP_DAILY_LIMIT,
      },
    )
    if (claimError) throw claimError

    const claim = Array.isArray(claimRows) ? claimRows[0] : claimRows
    if (!claim?.allowed) {
      return jsonResponse(
        {
          error:
            claim?.limiter_kind === 'ip'
              ? 'Public Analysis is temporarily rate limited from this network.'
              : 'Public Analysis is limited to one queued run per Path of Exile account each UTC day.',
          code: claim?.limiter_kind === 'ip' ? 'guest_ip_limit' : 'guest_account_daily_limit',
          reset_at: claim?.reset_at ?? nextUtcResetAt(),
        },
        429,
      )
    }

    const characters = await fetchGuestCharacters(accountName)
    const selectedCharacter =
      characters.find((character) => character.name === characterName) ??
      characters.find(
        (character) => character.name.toLowerCase() === characterName.toLowerCase(),
      ) ??
      null
    if (!selectedCharacter) {
      throw new GuestPoePublicError(
        'That character was not found on the public account.',
        404,
        'character_not_found',
      )
    }

    const [profile, pobImport] = await Promise.all([
      fetchGuestCharacterProfile(accountName, selectedCharacter.name, selectedCharacter),
      parseGuestPobImport(body.raw_import),
    ])
    const targetStage = buildGuestTargetStage(pobImport.metadata, body)
    const targetName = targetStage.label
    const searchConstraints = defaultQuickSearchConstraints()
    const inputHash = await sha256Hex(
      JSON.stringify({
        version: GUEST_UPGRADE_ANALYSIS_INPUT_VERSION,
        engine_contract: 'pob-2.68.1-adapter-1',
        normalized_account_name: normalizedAccountName,
        character_name: selectedCharacter.name,
        character_league: profile.league,
        character_profile_hash: await sha256Hex(JSON.stringify(profile)),
        raw_xml_hash: await sha256Hex(pobImport.raw_xml),
        target_stage: targetStage,
        analysis_mode: 'quick',
        search_constraints: searchConstraints,
      }),
    )
    const runToken = createRunToken()
    const runTokenHash = await hmacSha256Hex(runToken, 'guest-analysis-run-token')
    const expiresAt = new Date(Date.now() + GUEST_RUN_EXPIRES_DAYS * 24 * 60 * 60 * 1000)

    const { data: insertedRun, error: insertError } = await adminClient
      .from('guest_upgrade_analysis_runs')
      .insert({
        run_token_hash: runTokenHash,
        normalized_account_name: normalizedAccountName,
        account_name: accountName,
        ip_hash: ipHash,
        character_name: profile.character_name,
        character_class: profile.class,
        character_ascendancy_class: profile.ascendancy_class,
        character_league: profile.league,
        character_level: profile.level,
        realm: selectedCharacter.realm,
        target_name: targetName,
        source_kind: pobImport.source_kind,
        raw_import: pobImport.raw_import,
        raw_xml: pobImport.raw_xml,
        import_metadata: pobImport.metadata,
        target_stage: targetStage,
        character_profile: profile,
        budget_chaos: 0,
        analysis_mode: 'quick',
        search_constraints: searchConstraints,
        party_config: [],
        input_hash: inputHash,
        status: 'queued',
        summary: {
          guest_analysis: true,
          analysis_mode: 'quick',
          target_stage_label: targetStage.label,
          public_character_only: true,
        },
        expires_at: expiresAt.toISOString(),
      })
      .select(GUEST_RUN_SELECT)
      .single()

    if (insertError) throw insertError
    if (!hasStringId(insertedRun)) {
      throw new Error('Guest analysis run insert returned no id')
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
            run_type: 'guest_upgrade_analysis',
            input_hash: inputHash,
          }),
        })
        workerNotified = res.ok
      } catch (error) {
        console.error('Failed to notify optimizer worker for guest run', error)
      } finally {
        clearTimeout(timeout)
      }
    }

    return jsonResponse({
      run_token: runToken,
      worker_notified: workerNotified,
      run: insertedRun,
    })
  } catch (error) {
    return guestErrorResponse(error)
  }
})
