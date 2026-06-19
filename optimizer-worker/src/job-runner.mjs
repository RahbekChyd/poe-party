import { createHash, randomUUID } from 'node:crypto'
import { inflateRawSync, inflateSync } from 'node:zlib'
import { analyzeRecommendations, getEngineDiagnostics } from './engines/index.mjs'
import {
  getExactTemplateRareTradeLink,
  getExactStageSearchBaselineRawText,
  getRareTradeLinkForStageItem,
  getRecommendedRareTradeLink,
  getUniqueTradeLinkForName,
  searchConstrainedRareCandidates,
} from './lib/poe-trade-client.mjs'
import { sanitizeAnalysisRawText } from './lib/pob-item-text.mjs'
import {
  annotateRecommendationDependencies,
  buildRareSlotContext,
} from './lib/recommendation-dependencies.mjs'
import { buildStructuredRecommendationItem } from './lib/recommendation-item-structure.mjs'
import {
  detectEssentialCraftsOnTarget,
  hasEssentialCraft,
} from './lib/essential-crafts.mjs'
import { getBaseItemIconUrls } from './lib/poe-wiki-icons.mjs'
import { resolveTargetContext } from './lib/target-context.mjs'

// Decode a PoB share code (url-safe base64 + raw deflate) into XML.
// Inflate inside the Lua HeadlessWrapper is a stub (always returns ""), so we must
// do this in Node before passing to the Lua runtime.
function decodePobShareCode(code) {
  const trimmed = typeof code === 'string' ? code.trim() : ''
  if (!trimmed) return null
  // Already XML
  if (trimmed.startsWith('<')) return trimmed
  try {
    const b64 = trimmed.replace(/-/g, '+').replace(/_/g, '/')
    const compressed = Buffer.from(b64, 'base64')
    // PoB uses zlib deflate (with zlib header), not raw deflate
    let xml
    try {
      xml = inflateSync(compressed).toString('utf8')
    } catch {
      // Fallback: try raw deflate
      xml = inflateRawSync(compressed).toString('utf8')
    }
    return xml.trim() || null
  } catch {
    return null
  }
}

const DEFAULT_POLL_INTERVAL_MS = 5000
const DEFAULT_MAX_CONCURRENT_RUNS = 1
const DEFAULT_HEARTBEAT_INTERVAL_MS = 15000
const DEFAULT_STALE_RUNNING_AFTER_MS = 3 * 60 * 1000
const PERSISTED_RARE_CACHE_SCOPE = 'rare_candidates'
const TRADE_RATE_LIMIT_SCOPE = 'rare_live_search'
const PERSISTED_RARE_CACHE_TTL_MS = 30 * 60 * 1000
const PERSISTED_RARE_CACHE_VERSION = 2
const THOROUGH_RARE_SEARCH_MAX_SLOTS = 6
const THOROUGH_RARE_SEARCH_RESULTS_PER_SLOT = 6
const THOROUGH_RARE_SEARCH_REQUEST_PACING = 'thorough_live_search'
const RUN_TYPE_AUTHENTICATED = 'upgrade_analysis'
const RUN_TYPE_GUEST = 'guest_upgrade_analysis'
const RUN_TABLES = {
  [RUN_TYPE_AUTHENTICATED]: {
    runs: 'upgrade_analysis_runs',
    plans: 'upgrade_recommendation_plans',
    items: 'upgrade_recommendation_items',
  },
  [RUN_TYPE_GUEST]: {
    runs: 'guest_upgrade_analysis_runs',
    plans: 'guest_upgrade_recommendation_plans',
    items: 'guest_upgrade_recommendation_items',
  },
}

export function createJobRunner({
  supabase,
  poeNinjaBaseUrl = 'https://poe.ninja',
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  maxConcurrentRuns = DEFAULT_MAX_CONCURRENT_RUNS,
  heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
  staleRunningAfterMs = DEFAULT_STALE_RUNNING_AFTER_MS,
  workerId = process.env.RAILWAY_REPLICA_ID || process.env.HOSTNAME || randomUUID(),
}) {
  let isPollLoopActive = false
  let isPollingTickRunning = false
  let isImmediatePollScheduled = false
  let pollTimer = null
  const activeRunTasks = new Map()

  function normalizeRunType(value) {
    return value === RUN_TYPE_GUEST ? RUN_TYPE_GUEST : RUN_TYPE_AUTHENTICATED
  }

  function runTablesForType(runType) {
    return RUN_TABLES[normalizeRunType(runType)]
  }

  function runTablesForRun(run) {
    return runTablesForType(run?.__run_type)
  }

  function withRunType(run, runType) {
    return run ? { ...run, __run_type: normalizeRunType(runType) } : null
  }

  function activeRunTaskKey(runId, runType) {
    return `${normalizeRunType(runType)}:${String(runId ?? '').trim()}`
  }

  function isGuestRun(run) {
    return normalizeRunType(run?.__run_type) === RUN_TYPE_GUEST
  }

  function normalizeName(value) {
    return String(value ?? '')
      .trim()
      .toLowerCase()
  }

  function normalizeAnalysisMode(value) {
    return value === 'thorough' ? 'thorough' : 'quick'
  }

  function asRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  }

  function normalizeIsoMs(value) {
    const ms = Date.parse(String(value ?? ''))
    return Number.isFinite(ms) ? ms : null
  }

  function hasAvailableCapacity() {
    return activeRunTasks.size < maxConcurrentRuns
  }

  function sha256Hex(value) {
    return createHash('sha256')
      .update(String(value ?? ''))
      .digest('hex')
  }

  function shortHash(value) {
    const normalized = String(value ?? '').trim()
    if (!normalized) return null
    return sha256Hex(normalized).slice(0, 12)
  }

  function hashJson(value) {
    try {
      return shortHash(JSON.stringify(value ?? null))
    } catch {
      return null
    }
  }

  function summarizeObjectKeys(value, limit = 16) {
    return Object.keys(asRecord(value))
      .sort((left, right) => left.localeCompare(right))
      .slice(0, limit)
  }

  function inferProfileSyncSource(profile) {
    const rawCharacter = asRecord(profile?.raw_character)
    const rawLeagueAccount = asRecord(profile?.raw_league_account)

    if (Object.keys(rawLeagueAccount).length > 0) {
      return 'oauth-edge'
    }

    if (
      Array.isArray(rawCharacter.equipment) ||
      Array.isArray(rawCharacter.inventory) ||
      Array.isArray(rawCharacter.jewels) ||
      (rawCharacter.passives && typeof rawCharacter.passives === 'object')
    ) {
      return 'oauth-edge'
    }

    if (
      Array.isArray(rawCharacter.items) ||
      (rawCharacter.passive_tree && typeof rawCharacter.passive_tree === 'object') ||
      (rawCharacter.passiveTree && typeof rawCharacter.passiveTree === 'object')
    ) {
      return 'cookie-client'
    }

    return 'unknown'
  }

  function summarizeEquippedItems(profile) {
    return (Array.isArray(profile?.gear) ? profile.gear : [])
      .map((item) => ({
        slot: item?.slot ?? null,
        name: item?.name ?? null,
        typeLine: item?.typeLine ?? null,
        baseType: item?.baseType ?? null,
        rarity: item?.rarity ?? null,
      }))
      .sort((left, right) => String(left.slot ?? '').localeCompare(String(right.slot ?? '')))
  }

  function summarizeStageItems(targetContext) {
    return (Array.isArray(targetContext?.selectedItemSet?.items) ? targetContext.selectedItemSet.items : [])
      .map((item) => ({
        slot: item?.slot ?? null,
        rarity: item?.rarity ?? null,
        name: item?.name ?? null,
        typeLine: item?.typeLine ?? null,
        maxLinkCount: item?.maxLinkCount ?? null,
      }))
      .sort((left, right) => String(left.slot ?? '').localeCompare(String(right.slot ?? '')))
  }

  function summarizeLatestItemsByUser(latestItems) {
    const perUser = new Map()

    for (const item of Array.isArray(latestItems) ? latestItems : []) {
      const key = String(item?.user_id ?? 'unknown')
      const current = perUser.get(key) ?? {
        userId: key,
        total: 0,
        excluded: 0,
        priced: 0,
      }
      current.total += 1
      if (item?.is_excluded) current.excluded += 1
      if (Number.isFinite(Number(item?.price_chaos))) current.priced += 1
      perUser.set(key, current)
    }

    return [...perUser.values()].sort((left, right) => left.userId.localeCompare(right.userId))
  }

  function summarizePartyBuilds(partyBuilds) {
    return (Array.isArray(partyBuilds) ? partyBuilds : []).map((entry, index) => ({
      index,
      kind: entry?.kind ?? null,
      label: entry?.label ?? null,
      xmlHash:
        entry?.kind === 'group_member'
          ? shortHash(entry?.raw_xml ?? '')
          : shortHash(entry?.pob_code ?? ''),
      xmlLength:
        entry?.kind === 'group_member'
          ? String(entry?.raw_xml ?? '').length
          : String(entry?.pob_code ?? '').length,
    }))
  }

  function summarizeTargetUniqueMarket(targetUniqueItems, marketUniques) {
    const requested = (Array.isArray(targetUniqueItems) ? targetUniqueItems : [])
      .map((entry) => ({
        name: entry?.name ?? null,
        baseType: entry?.baseType ?? null,
      }))
      .filter((entry) => entry.name)

    const fetched = (Array.isArray(marketUniques) ? marketUniques : []).map((entry) => ({
      name: entry?.name ?? null,
      baseType: entry?.baseType ?? null,
      variant: entry?.variant ?? null,
      links: entry?.links ?? null,
      chaosValue: entry?.chaosValue ?? null,
    }))

    const fetchedNames = new Set(
      fetched
        .map((entry) => normalizeName(entry.name))
        .filter(Boolean),
    )

    const missing = requested.filter((entry) => !fetchedNames.has(normalizeName(entry.name)))

    return {
      requested,
      fetched,
      missing,
    }
  }

  function summarizeBaselineMetrics(summary) {
    const metrics =
      asRecord(summary?.baseline_metrics).totalDps != null
        ? asRecord(summary?.baseline_metrics)
        : asRecord(summary?.exact_baseline_metrics)

    return {
      totalDps: metrics.totalDps ?? null,
      combinedDps: metrics.combinedDps ?? null,
      totalEhp: metrics.totalEhp ?? null,
      life: metrics.life ?? null,
      fireResist: metrics.fireResist ?? null,
      coldResist: metrics.coldResist ?? null,
      lightningResist: metrics.lightningResist ?? null,
      chaosResist: metrics.chaosResist ?? null,
    }
  }

  function getBudgetBucketChaos(value) {
    const numeric = Number(value ?? 0)
    if (!Number.isFinite(numeric) || numeric <= 0) return 0
    if (numeric < 500) return Math.ceil(numeric / 50) * 50
    if (numeric < 2000) return Math.ceil(numeric / 100) * 100
    return Math.ceil(numeric / 250) * 250
  }

  function getRareStageItemsForCache(targetContext) {
    return (
      Array.isArray(targetContext?.selectedItemSet?.items)
        ? targetContext.selectedItemSet.items
        : []
    )
      .filter(
        (item) =>
          String(item?.rarity ?? '')
            .trim()
            .toLowerCase() === 'rare' &&
          item?.slot &&
          item?.typeLine &&
          item?.rawText,
      )
      .map((item) => ({
        slot: item.slot,
        typeLine: item.typeLine,
        rawText: sanitizeAnalysisRawText(item.rawText),
      }))
      .sort((left, right) => {
        const leftKey = `${left.slot}::${left.typeLine}`
        const rightKey = `${right.slot}::${right.typeLine}`
        return leftKey.localeCompare(rightKey)
      })
  }

  function getPersistentRareCacheKey({ league, budgetChaos, targetContext, searchConstraints }) {
    return sha256Hex(
      JSON.stringify({
        version: PERSISTED_RARE_CACHE_VERSION,
        scope: PERSISTED_RARE_CACHE_SCOPE,
        league: typeof league === 'string' ? league : null,
        budget_bucket_chaos: getBudgetBucketChaos(budgetChaos),
        rare_stage_items: getRareStageItemsForCache(targetContext),
        search_constraints:
          searchConstraints && typeof searchConstraints === 'object' ? searchConstraints : {},
      }),
    )
  }

  function parseCachedRecommendationItems(value) {
    return Array.isArray(value)
      ? value.filter((entry) => !!entry && typeof entry === 'object' && !Array.isArray(entry))
      : []
  }

  async function getPersistedRareSearchCache({
    league,
    budgetChaos,
    targetContext,
    searchConstraints,
  }) {
    if (!league) {
      return null
    }

    const cacheKey = getPersistentRareCacheKey({
      league,
      budgetChaos,
      targetContext,
      searchConstraints,
    })
    const row = await supabase.selectSingle(
      'upgrade_market_search_cache',
      { cache_key: cacheKey },
      '*',
    )

    if (!row) {
      return {
        cacheKey,
        items: [],
        diagnostics: null,
        expiresAt: null,
        fresh: false,
      }
    }

    const expiresAt = typeof row.expires_at === 'string' ? row.expires_at : null
    const expiresAtMs = expiresAt ? Date.parse(expiresAt) : Number.NaN
    return {
      cacheKey,
      items: parseCachedRecommendationItems(row.result_items),
      diagnostics:
        row.diagnostics && typeof row.diagnostics === 'object' && !Array.isArray(row.diagnostics)
          ? row.diagnostics
          : null,
      expiresAt,
      fresh: Number.isFinite(expiresAtMs) && expiresAtMs > Date.now(),
    }
  }

  async function savePersistedRareSearchCache({
    cacheKey,
    league,
    items,
    diagnostics,
    ttlMs = PERSISTED_RARE_CACHE_TTL_MS,
  }) {
    if (!cacheKey || !league) return

    const payload = {
      cache_key: cacheKey,
      league,
      cache_scope: PERSISTED_RARE_CACHE_SCOPE,
      item_count: Array.isArray(items) ? items.length : 0,
      result_items: Array.isArray(items) ? items : [],
      diagnostics: diagnostics && typeof diagnostics === 'object' ? diagnostics : {},
      expires_at: new Date(Date.now() + ttlMs).toISOString(),
    }

    const existing = await supabase.selectSingle(
      'upgrade_market_search_cache',
      { cache_key: cacheKey },
      'cache_key',
    )

    if (existing) {
      await supabase.updateRows('upgrade_market_search_cache', { cache_key: cacheKey }, payload)
      return
    }

    await supabase.insertRow('upgrade_market_search_cache', payload)
  }

  async function getTradeRateLimitState(league) {
    if (!league) return null

    const row = await supabase.selectSingle(
      'upgrade_trade_rate_limits',
      { league, scope: TRADE_RATE_LIMIT_SCOPE },
      '*',
    )

    if (!row || typeof row.retry_at !== 'string') {
      return null
    }

    const retryAtMs = Date.parse(row.retry_at)
    if (!Number.isFinite(retryAtMs)) {
      return null
    }

    return {
      retryAt: row.retry_at,
      retryAtMs,
      retryAfterMs:
        typeof row.retry_after_ms === 'number' && Number.isFinite(row.retry_after_ms)
          ? row.retry_after_ms
          : null,
      detail: typeof row.detail === 'string' ? row.detail : null,
    }
  }

  async function saveTradeRateLimitState(league, diagnostics) {
    if (!league) return

    const retryAfterMs =
      typeof diagnostics?.retry_after_ms === 'number' && Number.isFinite(diagnostics.retry_after_ms)
        ? diagnostics.retry_after_ms
        : null
    const retryAt = getRetryAtIso(retryAfterMs)
    const payload = {
      league,
      scope: TRADE_RATE_LIMIT_SCOPE,
      retry_at: retryAt,
      retry_after_ms: retryAfterMs,
      detail: typeof diagnostics?.detail === 'string' ? diagnostics.detail : null,
    }

    const existing = await supabase.selectSingle(
      'upgrade_trade_rate_limits',
      { league, scope: TRADE_RATE_LIMIT_SCOPE },
      'league, scope',
    )

    if (existing) {
      await supabase.updateRows(
        'upgrade_trade_rate_limits',
        { league, scope: TRADE_RATE_LIMIT_SCOPE },
        payload,
      )
      return
    }

    await supabase.insertRow('upgrade_trade_rate_limits', payload)
  }

  async function clearTradeRateLimitState(league) {
    if (!league) return

    const existing = await supabase.selectSingle(
      'upgrade_trade_rate_limits',
      { league, scope: TRADE_RATE_LIMIT_SCOPE },
      'league, scope',
    )
    if (!existing) return

    await supabase.deleteRows('upgrade_trade_rate_limits', {
      league,
      scope: TRADE_RATE_LIMIT_SCOPE,
    })
  }

  function enrichRecommendationEssentialCrafts(analysis, { targetContext, searchConstraints }) {
    if (!analysis?.plans?.length) return analysis
    const ignoreCraftedMods =
      searchConstraints &&
      typeof searchConstraints === 'object' &&
      !Array.isArray(searchConstraints) &&
      searchConstraints.ignore_crafted_mods === true
    if (!ignoreCraftedMods) return analysis

    return {
      ...analysis,
      plans: analysis.plans.map((plan) => ({
        ...plan,
        items: (plan.items ?? []).map((item) => {
          const itemPayload = getItemPayload(item)
          const rarity = typeof itemPayload.rarity === 'string' ? itemPayload.rarity : null
          if (rarity !== 'Rare') return item
          const candidateRawText =
            typeof itemPayload.raw_text === 'string' ? itemPayload.raw_text : null
          if (!candidateRawText) return item

          const stageItem = findStageItemForRecommendationItem(targetContext, item)
          const targetRawText =
            typeof stageItem?.rawText === 'string' && stageItem.rawText.trim()
              ? stageItem.rawText
              : null
          if (!targetRawText) return item

          const targetCrafts = detectEssentialCraftsOnTarget(targetRawText)
          if (targetCrafts.length === 0) return item

          const missing = targetCrafts.filter(
            (craft) => !hasEssentialCraft(candidateRawText, craft.id),
          )
          if (missing.length === 0) return item

          return withItemPayload(item, {
            missing_essential_crafts: missing,
          })
        }),
      })),
    }
  }

  function enrichRecommendationDisplayPayloads(analysis) {
    if (!analysis?.plans?.length) {
      return analysis
    }

    return {
      ...analysis,
      plans: analysis.plans.map((plan) => ({
        ...plan,
        items: (plan.items ?? []).map((item) => {
          const itemPayload =
            item?.item_payload &&
            typeof item.item_payload === 'object' &&
            !Array.isArray(item.item_payload)
              ? item.item_payload
              : {}
          const structuredItem = buildStructuredRecommendationItem(itemPayload)
          return structuredItem
            ? {
                ...item,
                item_payload: {
                  ...itemPayload,
                  structured_item: structuredItem,
                },
              }
            : item
        }),
      })),
    }
  }

  async function enrichRecommendationIconUrls(analysis) {
    if (!analysis?.plans?.length) {
      return analysis
    }

    const missingIconBaseTypes = new Set()
    for (const plan of analysis.plans) {
      for (const item of Array.isArray(plan?.items) ? plan.items : []) {
        const itemPayload = getItemPayload(item)
        if (readString(itemPayload.icon_url) || readString(itemPayload.icon)) continue
        const baseType = readString(itemPayload.base_type)
        if (baseType) {
          missingIconBaseTypes.add(baseType)
        }
      }
    }

    if (missingIconBaseTypes.size === 0) {
      return analysis
    }

    const iconUrlByBaseType = await getBaseItemIconUrls([...missingIconBaseTypes])
    if (iconUrlByBaseType.size === 0) {
      return analysis
    }

    return {
      ...analysis,
      plans: analysis.plans.map((plan) => ({
        ...plan,
        items: (Array.isArray(plan?.items) ? plan.items : []).map((item) => {
          const itemPayload = getItemPayload(item)
          if (readString(itemPayload.icon_url) || readString(itemPayload.icon)) {
            return item
          }

          const baseType = readString(itemPayload.base_type)
          const iconUrl = baseType ? iconUrlByBaseType.get(baseType) : null
          return iconUrl ? withItemPayload(item, { icon_url: iconUrl }) : item
        }),
      })),
    }
  }

  function formatRetryAfterText(retryAfterMs) {
    if (typeof retryAfterMs !== 'number' || !Number.isFinite(retryAfterMs) || retryAfterMs <= 0) {
      return null
    }

    const totalSeconds = Math.max(1, Math.round(retryAfterMs / 1000))
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    if (minutes <= 0) {
      return `${seconds}s`
    }
    if (seconds === 0) {
      return `${minutes}m`
    }
    return `${minutes}m ${seconds}s`
  }

  function getRetryAtIso(retryAfterMs) {
    const waitMs =
      typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs) && retryAfterMs > 0
        ? retryAfterMs
        : 60_000
    return new Date(Date.now() + waitMs).toISOString()
  }

  function formatAnalysisFailureDetail(error) {
    const detail = error instanceof Error ? error.message : String(error)

    if (!detail) {
      return 'Exact PoB analysis failed in the worker. Check the worker logs, then rerun the analysis.'
    }

    if (detail.includes('POB_RUNTIME_COMMAND is not configured')) {
      return 'Exact PoB analysis is not configured on the worker. Keep POB_RUNTIME_COMMAND at /app/pob/run-pob-runtime.sh, then rerun the analysis.'
    }

    if (detail.includes('POB_RUNTIME_COMMAND points to a Windows path')) {
      return 'Exact PoB analysis is configured with a Windows-only runtime path, but the Railway worker runs on Linux. Set POB_RUNTIME_COMMAND to /app/pob/run-pob-runtime.sh, redeploy, then rerun the analysis.'
    }

    if (
      detail.includes('PoB runtime terminated by signal') ||
      detail.includes('PoB runtime exited with code') ||
      detail.includes('PoB runtime returned invalid JSON') ||
      detail.includes('spawn ') ||
      detail.includes('ENOENT')
    ) {
      return 'Exact PoB analysis failed inside the worker runtime. Check the Railway logs for the PoB process error, then rerun the analysis.'
    }

    return detail
  }

  function getTradeRateLimitWaitInfo(run) {
    const summary = asRecord(run?.summary)
    const rareTradeSearch = asRecord(summary.rare_trade_search)
    if (rareTradeSearch.rate_limited !== true || rareTradeSearch.waiting_for_retry !== true) {
      return null
    }

    const retryAt = typeof rareTradeSearch.retry_at === 'string' ? rareTradeSearch.retry_at : null
    if (!retryAt) {
      return null
    }

    const retryAtMs = Date.parse(retryAt)
    if (!Number.isFinite(retryAtMs)) {
      return null
    }

    return {
      retryAt,
      retryAtMs,
      retryAfterMs:
        typeof rareTradeSearch.retry_after_ms === 'number' &&
        Number.isFinite(rareTradeSearch.retry_after_ms)
          ? rareTradeSearch.retry_after_ms
          : null,
    }
  }

  function applyRareSearchDiagnostics(analysis, diagnostics) {
    if (!diagnostics || typeof diagnostics !== 'object') {
      return analysis
    }

    const retryAfterText = formatRetryAfterText(diagnostics.retry_after_ms)
    const summary = {
      ...(analysis?.summary && typeof analysis.summary === 'object' ? analysis.summary : {}),
      rare_trade_search: diagnostics,
      rare_trade_rate_limited: diagnostics.rate_limited === true,
    }

    const partialReason =
      diagnostics.rate_limited === true
        ? `Live rare trade search was temporarily rate-limited by the trade API${retryAfterText ? ` (try again in about ${retryAfterText})` : ''}. Exact PoB baseline metrics were still available, but live rare recommendations may be incomplete for this run.`
        : (analysis?.partialReason ?? null)

    return {
      ...analysis,
      summary,
      partialReason,
    }
  }

  async function deferRunForTradeRateLimit(run, diagnostics, targetContext) {
    const retryAt = getRetryAtIso(diagnostics?.retry_after_ms)
    const retryAfterText = formatRetryAfterText(diagnostics?.retry_after_ms)
    const nextSummary = {
      ...(run?.summary && typeof run.summary === 'object' ? run.summary : {}),
      engine: 'pob',
      analysis_mode: normalizeAnalysisMode(run?.analysis_mode),
      target_stage_label: targetContext?.label ?? null,
      rare_trade_search: {
        ...(diagnostics && typeof diagnostics === 'object' ? diagnostics : {}),
        waiting_for_retry: true,
        retry_at: retryAt,
      },
      rare_trade_rate_limited: true,
    }

    await supabase.updateRows(
      runTablesForRun(run).runs,
      { id: run.id },
      {
        status: 'running',
        summary: nextSummary,
        partial_reason: `Live rare trade search is waiting for the trade API cooldown${retryAfterText ? ` (${retryAfterText} remaining)` : ''}. The worker will resume this run automatically.`,
        completed_at: null,
        error_detail: null,
      },
    )

    return {
      ok: true,
      skipped: true,
      reason: 'waiting-for-trade-rate-limit',
      retry_at: retryAt,
    }
  }

  async function fetchMarketUniques(league, targetUniqueItems = []) {
    if (!league) return []

    const normalizedTargets = (Array.isArray(targetUniqueItems) ? targetUniqueItems : [])
      .map((entry) => ({
        name: typeof entry?.name === 'string' ? entry.name : null,
        baseType: typeof entry?.baseType === 'string' ? entry.baseType : null,
      }))
      .filter((entry) => entry.name)
    const wantedNames = new Set(
      normalizedTargets.map((entry) => normalizeName(entry.name)).filter(Boolean),
    )
    if (wantedNames.size === 0) {
      return []
    }

    const types = ['UniqueWeapon', 'UniqueArmour', 'UniqueAccessory', 'UniqueFlask', 'UniqueJewel']
    const responses = await Promise.all(
      types.map(async (type) => {
        const url = `${poeNinjaBaseUrl}/poe1/api/economy/stash/current/item/overview?league=${encodeURIComponent(league)}&type=${encodeURIComponent(type)}`
        const response = await fetch(url, { headers: { Accept: 'application/json' } })
        if (!response.ok) return []
        const data = await response.json()
        return Array.isArray(data.lines) ? data.lines : []
      }),
    )

    const items = []

    for (const response of responses) {
      for (const entry of response) {
        const normalizedName = normalizeName(entry?.name)
        if (!entry?.name || !wantedNames.has(normalizedName)) {
          continue
        }
        items.push({
          name: entry.name,
          icon: entry.icon ?? null,
          baseType: entry.baseType ?? null,
          variant: entry.variant ?? null,
          links: Number.isFinite(Number(entry.links)) ? Number(entry.links) : null,
          detailsId: entry.detailsId ?? null,
          chaosValue: Number(entry.chaosValue ?? 0),
          priceSource: 'poe_ninja',
        })
      }
    }

    return items.sort((left, right) => left.chaosValue - right.chaosValue)
  }

  async function fetchNinjaDivinePrice(league) {
    if (!league) return null

    const paths = [
      `/poe1/api/economy/exchange/current/overview?league=${encodeURIComponent(league)}&type=Currency`,
      `/poe1/api/economy/exchange/currency/overview?league=${encodeURIComponent(league)}&type=Currency`,
    ]

    for (const path of paths) {
      try {
        const response = await fetch(`${poeNinjaBaseUrl}${path}`, {
          headers: { Accept: 'application/json' },
        })
        if (!response.ok) continue
        const data = await response.json()
        const itemById = new Map(
          (Array.isArray(data?.items) ? data.items : [])
            .filter((item) => item?.id && item?.name)
            .map((item) => [item.id, item.name]),
        )
        for (const line of Array.isArray(data?.lines) ? data.lines : []) {
          const name = line?.currencyTypeName ?? itemById.get(line?.id)
          const value = Number(line?.primaryValue)
          const isDivine =
            name === 'Divine Orb' || line?.id === 'divine' || line?.detailsId === 'divine-orb'
          if (isDivine && Number.isFinite(value) && value > 0) {
            return value
          }
        }
      } catch {
        // Fall through to the next known poe.ninja route, then to the worker default.
      }
    }

    return null
  }

  async function claimQueuedRun(runId, runType = RUN_TYPE_AUTHENTICATED) {
    const rows = await supabase.updateRows(
      runTablesForType(runType).runs,
      { id: runId, status: 'queued' },
      {
        status: 'running',
        started_at: new Date().toISOString(),
        completed_at: null,
        stale_reason: null,
        partial_reason: null,
        error_detail: null,
      },
    )
    return withRunType(rows[0] ?? null, runType)
  }

  function sanitizeAnalysisRecommendationPayloads(analysis) {
    if (!analysis?.plans?.length) {
      return analysis
    }

    return {
      ...analysis,
      plans: analysis.plans.map((plan) => ({
        ...plan,
        items: (plan.items ?? []).map((item) => {
          const itemPayload =
            item?.item_payload &&
            typeof item.item_payload === 'object' &&
            !Array.isArray(item.item_payload)
              ? item.item_payload
              : null

          if (!itemPayload || typeof itemPayload.raw_text !== 'string') {
            return item
          }

          return {
            ...item,
            item_payload: {
              ...itemPayload,
              raw_text: sanitizeAnalysisRawText(itemPayload.raw_text),
            },
          }
        }),
      })),
    }
  }

  async function claimRunningRun(run, { resetStartedAt = false, clearTradeWait = false } = {}) {
    const nextStartedAt = resetStartedAt || !run?.started_at ? new Date().toISOString() : run.started_at
    const nextPayload = {
      status: 'running',
      started_at: nextStartedAt,
      completed_at: null,
      partial_reason: null,
      error_detail: null,
    }

    if (clearTradeWait) {
      nextPayload.summary = clearTradeRateLimitWaitInfo(run?.summary)
    }

    const rows = await supabase.updateRows(
      runTablesForRun(run).runs,
      { id: run.id, status: 'running', updated_at: run.updated_at },
      nextPayload,
    )
    return withRunType(rows[0] ?? null, run?.__run_type)
  }

  async function writeRunPhase(run, phaseId, extra = {}) {
    const currentSummary =
      run?.summary && typeof run.summary === 'object' && !Array.isArray(run.summary)
        ? run.summary
        : {}
    const nextSummary = {
      ...currentSummary,
      current_phase: {
        id: phaseId,
        started_at: new Date().toISOString(),
        ...extra,
      },
    }
    try {
      await supabase.updateRows(runTablesForRun(run).runs, { id: run.id }, { summary: nextSummary })
      run.summary = nextSummary
    } catch (error) {
      console.warn('Optimizer worker failed to write run phase', phaseId, error)
    }
  }

  function normalizeSlot(value) {
    const raw = String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '')
    if (!raw) return null
    if (raw.includes('helmet') || raw.includes('helm')) return 'helmet'
    if (raw.includes('body') || raw.includes('chest')) return 'bodyarmour'
    if (raw.includes('glove')) return 'gloves'
    if (raw.includes('boot')) return 'boots'
    if (raw.includes('weapon2') || raw.includes('offhand')) return 'offhand'
    if (raw.includes('weapon1') || raw === 'weapon') return 'weapon'
    if (raw.includes('ring2')) return 'ring2'
    if (raw.includes('ring1') || raw === 'ring') return 'ring'
    if (raw.includes('amulet')) return 'amulet'
    if (raw.includes('belt')) return 'belt'
    return raw
  }

  function readNumber(value) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  function readString(value) {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
  }

  function readBoolean(value) {
    if (value === true) return true
    if (value === false) return false
    return null
  }

  function getItemPayload(item) {
    return item?.item_payload &&
      typeof item.item_payload === 'object' &&
      !Array.isArray(item.item_payload)
      ? item.item_payload
      : {}
  }

  function withItemPayload(item, patch) {
    return {
      ...item,
      item_payload: {
        ...getItemPayload(item),
        ...patch,
      },
    }
  }

  function getRareSlotContextForSlot(rareSlotContext, slot) {
    if (!rareSlotContext || typeof rareSlotContext !== 'object' || Array.isArray(rareSlotContext)) {
      return {}
    }

    if (slot && rareSlotContext[slot] && typeof rareSlotContext[slot] === 'object') {
      return rareSlotContext[slot]
    }

    const wantedSlot = normalizeSlot(slot)
    if (!wantedSlot) {
      return {}
    }

    for (const [entrySlot, entryValue] of Object.entries(rareSlotContext)) {
      if (normalizeSlot(entrySlot) === wantedSlot && entryValue && typeof entryValue === 'object') {
        return entryValue
      }
    }

    return {}
  }

  function buildHardRequirementSlotSet(targetContext) {
    const slots = new Set()
    for (const requirement of Array.isArray(targetContext?.hardRequirements)
      ? targetContext.hardRequirements
      : []) {
      const normalizedSlot = normalizeSlot(requirement?.slot)
      if (normalizedSlot) {
        slots.add(normalizedSlot)
      }
    }
    return slots
  }

  function buildRareSearchSlotPlanning({
    targetContext,
    rareSlotContext,
    prepassAnalysis,
    incrementalRerunConfig,
  }) {
    const rareStageItems = (Array.isArray(targetContext?.selectedItemSet?.items)
      ? targetContext.selectedItemSet.items
      : []
    ).filter(
      (item) =>
        String(item?.rarity ?? '')
          .trim()
          .toLowerCase() === 'rare' && typeof item?.slot === 'string' && item.slot.trim().length > 0,
    )

    const hardRequirementSlotSet = buildHardRequirementSlotSet(targetContext)
    const stageTemplatePlanBySlot = new Map()

    const prepassStagePlans =
      Array.isArray(prepassAnalysis?.overview_plans) && prepassAnalysis.overview_plans.length > 0
        ? prepassAnalysis.overview_plans
        : Array.isArray(prepassAnalysis?.plans)
          ? prepassAnalysis.plans
          : []

    for (const plan of prepassStagePlans) {
      const candidateType = getPlanCandidateType(plan)
      if (candidateType !== 'target_stage_rare' && candidateType !== 'compare_gear_item') {
        continue
      }

      const slot = normalizeSlot(getPlanPrimarySlot(plan))
      if (!slot) continue

      stageTemplatePlanBySlot.set(slot, plan)
    }

    const slotPlanning = rareStageItems.map((stageItem) => {
      const slot = typeof stageItem.slot === 'string' ? stageItem.slot.trim() : ''
      const normalizedSlot = normalizeSlot(slot)
      const stagePlan = normalizedSlot ? stageTemplatePlanBySlot.get(normalizedSlot) ?? null : null
      const rankingReason = asRecord(stagePlan?.ranking_reason)
      const slotContext = asRecord(getRareSlotContextForSlot(rareSlotContext, slot))
      const requiredSourceEffects = Array.isArray(slotContext.strict_required_effects)
        ? slotContext.strict_required_effects.filter(
            (entry) => !!entry && typeof entry === 'object' && !Array.isArray(entry),
          )
        : []
      const localExactScore =
        typeof stagePlan?.score === 'number' && Number.isFinite(stagePlan.score)
          ? stagePlan.score
          : null
      const localPositive =
        readBoolean(rankingReason.locally_positive) ??
        (localExactScore != null ? localExactScore > 0 : false)
      const withinBudgetLimit = readBoolean(rankingReason.within_budget_limit) ?? true
      const evaluationStatus = readString(rankingReason.evaluation_status)
      const evaluationReasonKey = readString(rankingReason.evaluation_reason_key)
      const evaluationReason = readString(rankingReason.evaluation_reason)
      const evaluationDetail = readString(rankingReason.evaluation_detail)
      const reservationDeltaGain = readNumber(rankingReason.reservation_delta_gain) ?? 0
      const resolvesReservationBlocker = rankingReason.resolves_reservation_blocker === true
      const reservationCritical = resolvesReservationBlocker || reservationDeltaGain > 0
      const dependencyCritical = requiredSourceEffects.length > 0
      const hardRequirementCritical = normalizedSlot
        ? hardRequirementSlotSet.has(normalizedSlot)
        : false
      const incrementalForced =
        !!normalizedSlot &&
        incrementalRerunConfig?.active === true &&
        incrementalRerunConfig.changedSlotSet?.has(normalizedSlot)
      const shouldSearch =
        incrementalForced ||
        (withinBudgetLimit &&
          (localPositive || reservationCritical || dependencyCritical || hardRequirementCritical))

      const searchReason = incrementalForced
        ? 'incremental_rerun_slot'
        : !withinBudgetLimit
          ? null
        : localPositive
          ? 'locally_positive'
          : resolvesReservationBlocker
            ? 'reservation_blocker'
            : reservationCritical
              ? 'reservation_progress'
            : dependencyCritical
              ? 'required_source_effect'
              : hardRequirementCritical
                ? 'hard_requirement_slot'
                : null
      const skipReason = shouldSearch
        ? null
        : !withinBudgetLimit
          ? 'over_budget'
          : evaluationReasonKey === 'same_as_equipped'
            ? 'same_as_equipped'
            : evaluationReasonKey ?? 'local_stage_template_swap_non_positive'
      const searchPriority =
        (incrementalForced ? 4_000_000 : 0) +
        (hardRequirementCritical ? 3_000_000 : 0) +
        (resolvesReservationBlocker ? 2_000_000 : reservationCritical ? 1_500_000 : 0) +
        (dependencyCritical ? 1_000_000 : 0) +
        (localPositive ? 500_000 : 0) +
        (localExactScore != null
          ? Math.max(-250_000, Math.min(250_000, localExactScore))
          : -250_000)

      return {
        slot,
        normalized_slot: normalizedSlot,
        local_exact_score: localExactScore,
        should_search: shouldSearch,
        search_reason: searchReason,
        skip_reason: skipReason,
        search_priority: searchPriority,
        locally_positive: localPositive,
        within_budget_limit: withinBudgetLimit,
        reservation_critical: reservationCritical,
        resolves_reservation_blocker: resolvesReservationBlocker,
        hard_requirement_slot: hardRequirementCritical,
        required_source_effect_count: requiredSourceEffects.length,
        local_evaluation_status: evaluationStatus,
        local_evaluation_reason_key: evaluationReasonKey,
        local_evaluation_reason: evaluationReason,
        local_evaluation_detail: evaluationDetail,
        transferable_anoint:
          slotContext.transferable_anoint &&
          typeof slotContext.transferable_anoint === 'object' &&
          !Array.isArray(slotContext.transferable_anoint)
            ? slotContext.transferable_anoint
            : null,
      }
    })

    slotPlanning.sort((left, right) => {
      const leftSearch = left.should_search === true ? 1 : 0
      const rightSearch = right.should_search === true ? 1 : 0
      if (leftSearch !== rightSearch) {
        return rightSearch - leftSearch
      }

      if (left.search_priority !== right.search_priority) {
        return right.search_priority - left.search_priority
      }

      return String(left.slot ?? '').localeCompare(String(right.slot ?? ''))
    })

    return slotPlanning
  }

  function findStageItemForRecommendationItem(targetContext, item) {
    const stageItems = Array.isArray(targetContext?.selectedItemSet?.items)
      ? targetContext.selectedItemSet.items
      : []
    const itemPayload = getItemPayload(item)
    const wantedSlot = normalizeSlot(itemPayload.target_stage_slot ?? item?.slot)
    const wantedBaseType = normalizeName(itemPayload.base_type)

    let fallback = null
    for (const stageItem of stageItems) {
      if (
        String(stageItem?.rarity ?? '')
          .trim()
          .toLowerCase() !== 'rare'
      )
        continue
      const stageSlot = normalizeSlot(stageItem?.slot)
      if (wantedSlot && stageSlot !== wantedSlot) continue
      if (!fallback) fallback = stageItem
      if (wantedBaseType && normalizeName(stageItem?.typeLine) === wantedBaseType) {
        return stageItem
      }
    }

    return fallback
  }

  function buildRecommendationRareTradeCandidate(targetContext, item) {
    const itemPayload = getItemPayload(item)
    const stageItem = findStageItemForRecommendationItem(targetContext, item)
    const candidateType =
      typeof itemPayload.candidate_type === 'string' ? itemPayload.candidate_type : null
    const preferItemPayload =
      candidateType === 'market_rare' ||
      itemPayload.exact_eval === true ||
      typeof itemPayload.trade_result_id === 'string'

    const slot =
      itemPayload.target_stage_slot ?? stageItem?.slot ?? item?.slot ?? itemPayload.slot ?? null
    const baseType = preferItemPayload
      ? itemPayload.base_type ?? stageItem?.typeLine ?? null
      : stageItem?.typeLine ?? itemPayload.base_type ?? null
    const rawText = preferItemPayload
      ? itemPayload.raw_text ?? stageItem?.rawText ?? null
      : stageItem?.rawText ?? itemPayload.raw_text ?? null

    if (
      typeof slot !== 'string' ||
      typeof baseType !== 'string' ||
      typeof rawText !== 'string' ||
      !slot.trim() ||
      !baseType.trim() ||
      !rawText.trim()
    ) {
      return null
    }

    return {
      slot,
      baseType,
      rawText: sanitizeAnalysisRawText(rawText),
      chaosValue: item.effective_price_chaos,
    }
  }

  function clearTradeRateLimitWaitInfo(summary) {
    const nextSummary = asRecord(summary)
    const rareTradeSearch = asRecord(nextSummary.rare_trade_search)
    if (Object.keys(rareTradeSearch).length === 0) {
      return nextSummary
    }

    return {
      ...nextSummary,
      rare_trade_search: {
        ...rareTradeSearch,
        waiting_for_retry: false,
        retry_at: null,
        retry_after_ms: null,
      },
      rare_trade_rate_limited: false,
    }
  }

  function isRunningRunStalled(run, nowMs = Date.now()) {
    if (!run || run.status !== 'running') return false
    if (getTradeRateLimitWaitInfo(run)) return false

    const updatedAtMs = normalizeIsoMs(run.updated_at)
    if (updatedAtMs == null) return false
    return nowMs - updatedAtMs >= staleRunningAfterMs
  }

  async function touchRunningRunHeartbeat(run) {
    if (!run?.id || !run?.started_at) return

    try {
      const rows = await supabase.updateRows(
        runTablesForRun(run).runs,
        { id: run.id, status: 'running' },
        {
          started_at: run.started_at,
          completed_at: null,
        },
        { returning: 'minimal' },
      )
      if (rows[0]?.updated_at) {
        run.updated_at = rows[0].updated_at
      }
    } catch (error) {
      console.warn('Optimizer worker heartbeat update failed', {
        runId: run.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  function startRunHeartbeat(run) {
    if (!run?.id) {
      return async () => {}
    }

    let stopped = false
    const interval = setInterval(() => {
      if (stopped) return
      void touchRunningRunHeartbeat(run)
    }, heartbeatIntervalMs)
    interval.unref?.()

    return async () => {
      if (stopped) return
      stopped = true
      clearInterval(interval)
    }
  }

  function normalizeIncrementalRerunSlots(value) {
    return Array.from(
      new Set(
        (Array.isArray(value) ? value : [])
          .map((entry) => normalizeSlot(entry))
          .filter(Boolean),
      ),
    ).sort((left, right) => left.localeCompare(right))
  }

  function getIncrementalRerunConfig(run) {
    const summary = asRecord(run?.summary)
    const baseRunId =
      typeof summary.rerun_base_run_id === 'string' && summary.rerun_base_run_id.trim().length > 0
        ? summary.rerun_base_run_id.trim()
        : null
    const changedSlots = normalizeIncrementalRerunSlots(summary.rerun_changed_slots)

    return {
      baseRunId,
      changedSlots,
      changedSlotSet: new Set(changedSlots),
      active: !!baseRunId && changedSlots.length > 0,
    }
  }

  function getPlanPrimarySlot(plan) {
    const firstItem = Array.isArray(plan?.items) ? plan.items[0] : null
    const itemPayload = getItemPayload(firstItem)

    return (
      itemPayload.target_stage_slot ??
      firstItem?.slot ??
      asRecord(plan?.ranking_reason).target_stage_slot ??
      null
    )
  }

  function getPlanCandidateType(plan) {
    const rankingReason = asRecord(plan?.ranking_reason)
    if (typeof rankingReason.candidate_type === 'string' && rankingReason.candidate_type.trim()) {
      return rankingReason.candidate_type.trim()
    }

    const firstItem = Array.isArray(plan?.items) ? plan.items[0] : null
    const itemPayload = getItemPayload(firstItem)
    return typeof itemPayload.candidate_type === 'string' && itemPayload.candidate_type.trim()
      ? itemPayload.candidate_type.trim()
      : null
  }

  function cloneIncrementalReusedPlan(plan, baseRunId) {
    return {
      ...plan,
      ranking_reason: {
        ...asRecord(plan?.ranking_reason),
        incremental_rerun_reused: true,
        reused_from_run_id: baseRunId,
      },
      items: (Array.isArray(plan?.items) ? plan.items : []).map((item) =>
        withItemPayload(item, {
          incremental_rerun_reused: true,
          reused_from_run_id: baseRunId,
        }),
      ),
    }
  }

  async function loadPersistedRecommendationPlans(runId) {
    if (!runId) return []

    const rows = await supabase.selectMany(
      'upgrade_recommendation_plans',
      { run_id: runId },
      `
        id, run_id, group_id, target_user_id, target_stage_id, category, kind, title, summary, explanation,
        effective_cost_chaos, ask_price_chaos, score, stage_progress_score, ranking_reason, before_metrics, after_metrics, breaks_requirements, section, created_at,
        items:upgrade_recommendation_items(id, plan_id, run_id, slot, source, item_name, item_payload, trade_link, ask_price_chaos, effective_price_chaos, created_at)
      `,
      { orderBy: 'score', ascending: false },
    )

    return rows.map((row) => ({
      ...row,
      effective_cost_chaos: Number(row?.effective_cost_chaos ?? 0),
      ask_price_chaos:
        row?.ask_price_chaos == null ? null : Number(row.ask_price_chaos),
      score: Number(row?.score ?? 0),
      stage_progress_score: Number(row?.stage_progress_score ?? 0),
      ranking_reason: asRecord(row?.ranking_reason),
      before_metrics: asRecord(row?.before_metrics),
      after_metrics: asRecord(row?.after_metrics),
      breaks_requirements: row?.breaks_requirements === true,
      items: (Array.isArray(row?.items) ? row.items : [])
        .map((item) => ({
          ...item,
          ask_price_chaos:
            item?.ask_price_chaos == null ? null : Number(item.ask_price_chaos),
          effective_price_chaos: Number(item?.effective_price_chaos ?? 0),
          item_payload: asRecord(item?.item_payload),
        }))
        .sort((left, right) =>
          String(left?.created_at ?? '').localeCompare(String(right?.created_at ?? '')),
        ),
    }))
  }

  function mergeIncrementalRerunAnalysis(run, analysis, basePlans) {
    const rerunConfig = getIncrementalRerunConfig(run)
    if (!rerunConfig.active || !Array.isArray(basePlans) || basePlans.length === 0) {
      return analysis
    }

    const refreshedPlans = (Array.isArray(analysis?.plans) ? analysis.plans : []).filter((plan) => {
      const slot = normalizeSlot(getPlanPrimarySlot(plan))
      return !!slot && rerunConfig.changedSlotSet.has(slot)
    })
    const reusedPlans = basePlans
      .filter((plan) => {
        const slot = normalizeSlot(getPlanPrimarySlot(plan))
        return !slot || !rerunConfig.changedSlotSet.has(slot)
      })
      .map((plan) => cloneIncrementalReusedPlan(plan, rerunConfig.baseRunId))

    const mergedPlans = [...refreshedPlans, ...reusedPlans]
    const exactUniquePlanCount = mergedPlans.filter(
      (plan) => getPlanCandidateType(plan) === 'market_unique',
    ).length
    const exactMarketRarePlanCount = mergedPlans.filter(
      (plan) => getPlanCandidateType(plan) === 'market_rare',
    ).length
    const exactStageTemplateRarePlanCount = mergedPlans.filter(
      (plan) => getPlanCandidateType(plan) === 'target_stage_rare',
    ).length

    return {
      ...analysis,
      status: mergedPlans.length > 0 ? 'partial' : analysis?.status ?? 'completed',
      partialReason: reusedPlans.length
        ? analysis?.partialReason
          ? `${analysis.partialReason} Untouched slots were carried over from the selected run.`
          : 'Untouched slots were carried over from the selected run while the changed manual-tuning slots were refreshed.'
        : analysis?.partialReason ?? null,
      summary: {
        ...asRecord(analysis?.summary),
        incremental_rerun: true,
        rerun_base_run_id: rerunConfig.baseRunId,
        rerun_changed_slots: rerunConfig.changedSlots,
        incremental_rerun_reused_plan_count: reusedPlans.length,
        incremental_rerun_refreshed_plan_count: refreshedPlans.length,
        exact_plan_count: mergedPlans.length,
        exact_unique_plan_count: exactUniquePlanCount,
        exact_rare_plan_count: exactMarketRarePlanCount + exactStageTemplateRarePlanCount,
        exact_market_rare_plan_count: exactMarketRarePlanCount,
        exact_stage_template_rare_plan_count: exactStageTemplateRarePlanCount,
        generated_plan_count: mergedPlans.length,
      },
      plans: mergedPlans,
    }
  }

  async function enrichRecommendationTradeLinks(
    analysis,
    { league, budgetChaos, targetContext, searchConstraints, analysisMode, divineToChaosRate },
  ) {
    if (!analysis?.plans?.length || !league) {
      return analysis
    }

    const rareTradeSearch = asRecord(asRecord(analysis?.summary).rare_trade_search)
    const rareSlotDiagnostics = Array.isArray(rareTradeSearch.slot_diagnostics)
      ? rareTradeSearch.slot_diagnostics.filter(
          (entry) => !!entry && typeof entry === 'object' && !Array.isArray(entry),
        )
      : []
    const getRareSlotDiagnostic = (slot) => {
      const normalizedSlot = normalizeSlot(slot)
      if (!normalizedSlot) return null
      return (
        rareSlotDiagnostics.find((entry) => normalizeSlot(entry?.slot) === normalizedSlot) ?? null
      )
    }

    const plans = await Promise.all(
      analysis.plans.map(async (plan) => {
        const items = await Promise.all(
          (plan.items ?? []).map(async (item) => {
            const itemPayload = getItemPayload(item)
            const itemName = normalizeName(item?.item_name)
            const exactEval = itemPayload.exact_eval === true
            const estimatedPrice = itemPayload.estimated_price === true
            const baseType =
              typeof itemPayload.base_type === 'string' ? itemPayload.base_type : null
            const candidateType =
              typeof itemPayload.candidate_type === 'string' ? itemPayload.candidate_type : null
            const rarity = typeof itemPayload.rarity === 'string' ? itemPayload.rarity : null
            const normalizedRarity = typeof rarity === 'string' ? rarity.trim().toLowerCase() : null
            const tradeLinkKind =
              typeof itemPayload.trade_link_kind === 'string' ? itemPayload.trade_link_kind : null
            const links = readNumber(itemPayload.links)
            const isCompareGearRareForTrade =
              analysisMode !== 'quick' &&
              item?.source === 'compare' &&
              candidateType === 'compare_gear_item' &&
              normalizedRarity === 'rare'

            if (item?.source !== 'market' && !isCompareGearRareForTrade) {
              return item
            }

            const isTemplateRare =
              normalizedRarity === 'rare' &&
              (candidateType === 'target_stage_rare' ||
                candidateType === 'compare_gear_item' ||
                tradeLinkKind === 'pob_weighted_query' ||
                estimatedPrice)
            const isLiveMarketRare = normalizedRarity === 'rare' && candidateType === 'market_rare'

            if (isTemplateRare || isLiveMarketRare) {
              const candidate = buildRecommendationRareTradeCandidate(targetContext, item)
              const slotDiagnostic = candidate ? getRareSlotDiagnostic(candidate.slot) : null
              const liveSearchStatus =
                typeof slotDiagnostic?.live_search_status === 'string'
                  ? slotDiagnostic.live_search_status
                  : null
              const liveSearchCandidateCount =
                typeof slotDiagnostic?.candidate_count === 'number' &&
                Number.isFinite(slotDiagnostic.candidate_count)
                  ? slotDiagnostic.candidate_count
                  : null
              const constrainedTemplateRawText =
                isTemplateRare && plan?.section !== 'overview' && candidate
                  ? getExactStageSearchBaselineRawText({
                      stageItem: {
                        slot: candidate.slot,
                        rawText: candidate.rawText,
                      },
                      searchConstraints,
                    })
                  : null
              const preservedLiveMarketTradeLink = isLiveMarketRare ? item?.trade_link : null
              const tradeLink = candidate
                ? isTemplateRare
                  ? await getExactTemplateRareTradeLink({
                      league,
                      candidate,
                      budgetChaos,
                      searchConstraints,
                    })
                  : preservedLiveMarketTradeLink ||
                    (await getRecommendedRareTradeLink({
                      league,
                      candidate,
                    }))
                : null
              const enrichedTradeLinkKind =
                isLiveMarketRare && tradeLink === preservedLiveMarketTradeLink && tradeLinkKind
                  ? tradeLinkKind
                  : isLiveMarketRare
                    ? 'exact_rare_search'
                    : 'template_exact_search'

              if (tradeLink) {
                return withItemPayload(
                  {
                    ...item,
                    trade_link: tradeLink,
                  },
                  {
                    ...(constrainedTemplateRawText
                      ? { raw_text: constrainedTemplateRawText }
                      : {}),
                    trade_link_kind: enrichedTradeLinkKind,
                    ...(liveSearchStatus ? { live_search_status: liveSearchStatus } : {}),
                    ...(liveSearchCandidateCount != null
                      ? { live_search_candidate_count: liveSearchCandidateCount }
                      : {}),
                  },
                )
              }

              if (isLiveMarketRare) {
                return withItemPayload(
                  {
                    ...item,
                    trade_link: null,
                  },
                  {
                    ...(constrainedTemplateRawText
                      ? { raw_text: constrainedTemplateRawText }
                      : {}),
                    trade_link_kind: tradeLinkKind ?? 'exact_rare_search',
                    ...(liveSearchStatus ? { live_search_status: liveSearchStatus } : {}),
                    ...(liveSearchCandidateCount != null
                      ? { live_search_candidate_count: liveSearchCandidateCount }
                      : {}),
                  },
                )
              }

            }

            if (analysisMode === 'quick' && normalizedRarity === 'rare') {
              return item
            }

            if (
              itemName &&
              (tradeLinkKind === 'name_search' ||
                candidateType === 'market_unique' ||
                rarity === 'Unique') &&
              (!exactEval || !estimatedPrice) &&
              (!item?.trade_link || tradeLinkKind === 'name_search')
            ) {
              try {
                const tradeLink = await getUniqueTradeLinkForName({
                  league,
                  uniqueName: item.item_name,
                  baseType,
                  links,
                })

                if (tradeLink) {
                  return withItemPayload(
                    {
                      ...item,
                      trade_link: tradeLink,
                    },
                    {
                      trade_link_kind: 'trade_search',
                    },
                  )
                }
              } catch (error) {
                console.error('Optimizer worker unique trade-link enrichment failed', error)
              }
            }

            if (item?.trade_link) {
              return item
            }

            const stageItem = findStageItemForRecommendationItem(targetContext, item)
            if (!stageItem) {
              return item
            }

            try {
              const tradeLink = await getRareTradeLinkForStageItem({
                league,
                budgetChaos,
                stageItem,
                searchConstraints,
                divineToChaosRate,
              })
              return tradeLink
                ? withItemPayload(
                    {
                      ...item,
                      trade_link: tradeLink,
                    },
                    {
                      trade_link_kind: 'similar_search',
                    },
                  )
                : item
            } catch (error) {
              console.error('Optimizer worker trade-link enrichment failed', error)
              return item
            }
          }),
        )

        return { ...plan, items }
      }),
    )

    return { ...analysis, plans }
  }

  async function persistAnalysis(run, analysis) {
    const tables = runTablesForRun(run)
    await supabase.deleteRows(tables.items, { run_id: run.id })
    await supabase.deleteRows(tables.plans, { run_id: run.id })

    for (const plan of analysis.plans) {
      const planPayload = {
        run_id: run.id,
        category: plan.category,
        kind: plan.kind,
        title: plan.title,
        summary: plan.summary,
        explanation: plan.explanation,
        effective_cost_chaos: plan.effective_cost_chaos,
        ask_price_chaos: plan.ask_price_chaos,
        score: plan.score,
        stage_progress_score: plan.stage_progress_score,
        ranking_reason: plan.ranking_reason,
        before_metrics: plan.before_metrics,
        after_metrics: plan.after_metrics,
        breaks_requirements: plan.breaks_requirements,
        section: plan.section === 'overview' ? 'overview' : 'primary',
      }
      if (!isGuestRun(run)) {
        planPayload.group_id = run.group_id
        planPayload.target_user_id = run.target_user_id
        planPayload.target_stage_id = run.target_stage_id
      }
      const insertedPlan = await supabase.insertRow(tables.plans, planPayload)

      for (const item of plan.items ?? []) {
        await supabase.insertRow(tables.items, {
          plan_id: insertedPlan.id,
          run_id: run.id,
          slot: item.slot,
          source: item.source,
          item_name: item.item_name,
          item_payload: item.item_payload,
          trade_link: item.trade_link,
          ask_price_chaos: item.ask_price_chaos,
          effective_price_chaos: item.effective_price_chaos,
        })
      }
    }

    await supabase.updateRows(
      tables.runs,
      { id: run.id },
      {
        status: analysis.status,
        summary: analysis.summary,
        partial_reason: analysis.partialReason,
        completed_at: new Date().toISOString(),
      },
    )
  }

  async function resolvePartyBuilds(partyConfig) {
    const entries = Array.isArray(partyConfig) ? partyConfig : []
    const resolved = []

    for (const entry of entries) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue

      if (entry.kind === 'pob_code') {
        const code = typeof entry.pob_code === 'string' ? entry.pob_code.trim() : ''
        if (!code) continue
        // Decode share code → XML in Node (Lua's Inflate is a stub and always returns "")
        const xml = decodePobShareCode(code)
        if (!xml) {
          console.error('Optimizer worker: failed to decode pob_code share code for party entry', entry.label)
          continue
        }
        resolved.push({ kind: 'pob_code', pob_code: xml, label: entry.label ?? null })
      } else if (entry.kind === 'group_member') {
        const id = typeof entry.build_target_id === 'string' ? entry.build_target_id.trim() : ''
        if (!id) continue
        try {
          const bt = await supabase.selectSingle('build_targets', { id }, 'id, name, raw_xml')
          if (!bt?.raw_xml) continue
          resolved.push({
            kind: 'group_member',
            raw_xml: bt.raw_xml,
            label: entry.label ?? bt.name ?? null,
          })
        } catch (error) {
          console.error('Optimizer worker failed to resolve party build target', id, error)
        }
      }
    }

    return resolved
  }

  async function processClaimedRun(run) {
    const stopHeartbeat = startRunHeartbeat(run)
    try {
      await writeRunPhase(run, 'loading_inputs')
      const buildTarget = isGuestRun(run)
        ? {
            id: run.id,
            name: run.target_name ?? 'Guest target',
            source_kind: run.source_kind ?? 'pob_share_code',
            raw_xml: run.raw_xml ?? null,
            import_metadata: asRecord(run.import_metadata),
            updated_at: run.updated_at ?? null,
          }
        : await supabase.selectSingle('build_targets', { id: run.build_target_id }, '*')
      const targetStage = isGuestRun(run)
        ? {
            id: null,
            ...asRecord(run.target_stage),
          }
        : run.target_stage_id
          ? await supabase.selectSingle('build_target_stages', { id: run.target_stage_id }, '*')
          : null
      const profile = isGuestRun(run)
        ? asRecord(run.character_profile)
        : await supabase.selectSingle(
            'character_profile_snapshots',
            {
              group_id: run.group_id,
              user_id: run.target_user_id,
              character_id: run.character_id ?? undefined,
            },
            '*',
          )
      const group = isGuestRun(run)
        ? { id: null, league: run.character_league ?? profile?.league ?? null }
        : await supabase.selectSingle('groups', { id: run.group_id }, 'id, league')
      const partyBuilds = isGuestRun(run) ? [] : await resolvePartyBuilds(run.party_config)
      const latestItems = isGuestRun(run)
        ? []
        : await supabase.selectMany(
            'latest_stash_items',
            { group_id: run.group_id },
            'id, user_id, name, type_line, base_type, item_class, frame_type, ilvl, icon_url, identified, corrupted, fractured, synthesised, price_chaos, mods, sockets, raw_data, is_excluded, excluded_reason, tab_name, tab_type',
          )
      const targetContext = resolveTargetContext({ buildTarget, targetStage })
      const analysisMode = normalizeAnalysisMode(run?.analysis_mode)
      console.info('Optimizer worker input context', {
        runId: run.id,
        inputHash: run.input_hash ?? null,
        analysisMode,
        groupId: run.group_id,
        targetUserId: run.target_user_id,
        queuedBy: run.queued_by ?? null,
        buildTarget: {
          id: buildTarget?.id ?? null,
          name: buildTarget?.name ?? null,
          updatedAt: buildTarget?.updated_at ?? null,
          xmlHash: shortHash(buildTarget?.raw_xml ?? ''),
          xmlLength: String(buildTarget?.raw_xml ?? '').length,
          importMetadataHash: hashJson(buildTarget?.import_metadata ?? {}),
        },
        targetStage: {
          id: targetStage?.id ?? null,
          label: targetStage?.label ?? null,
          updatedAt: targetStage?.updated_at ?? null,
          itemSetId: targetStage?.item_set_id ?? null,
          treeSpecId: targetStage?.tree_spec_id ?? null,
          skillSetId: targetStage?.skill_set_id ?? null,
          configSetId: targetStage?.config_set_id ?? null,
          hardRequirementCount: Array.isArray(targetStage?.hard_requirements)
            ? targetStage.hard_requirements.length
            : 0,
          targetMetricsHash: hashJson(targetStage?.target_metrics ?? {}),
        },
        targetContext: {
          label: targetContext?.label ?? null,
          primaryMetric: targetContext?.primaryMetric ?? null,
          targetMetricKeys: Object.keys(asRecord(targetContext?.targetMetrics)).sort(),
          hardRequirementCount: Array.isArray(targetContext?.hardRequirements)
            ? targetContext.hardRequirements.length
            : 0,
          selectedTreeSpec: targetContext?.selectedTreeSpec
            ? {
                id: targetContext.selectedTreeSpec.id ?? null,
                title: targetContext.selectedTreeSpec.title ?? null,
              }
            : null,
          selectedSkillSet: targetContext?.selectedSkillSet
            ? {
                id: targetContext.selectedSkillSet.id ?? null,
                title: targetContext.selectedSkillSet.title ?? null,
              }
            : null,
          selectedConfigSet: targetContext?.selectedConfigSet
            ? {
                id: targetContext.selectedConfigSet.id ?? null,
                title: targetContext.selectedConfigSet.title ?? null,
              }
            : null,
          selectedItemSet: targetContext?.selectedItemSet
            ? {
                id: targetContext.selectedItemSet.id ?? null,
                title: targetContext.selectedItemSet.title ?? null,
                useSecondWeaponSet: Boolean(targetContext.selectedItemSet.useSecondWeaponSet),
              }
            : null,
          stageItems: summarizeStageItems(targetContext),
        },
        profile: {
          id: profile?.id ?? null,
          characterId: profile?.character_id ?? null,
          characterName: profile?.character_name ?? null,
          league: profile?.league ?? null,
          class: profile?.class ?? null,
          ascendancyClass: profile?.ascendancy_class ?? null,
          level: profile?.level ?? null,
          lastSyncedAt: profile?.last_synced_at ?? null,
          source: inferProfileSyncSource(profile),
          rawCharacterHash: hashJson(profile?.raw_character ?? {}),
          rawCharacterKeys: summarizeObjectKeys(profile?.raw_character),
          rawLeagueAccountKeys: summarizeObjectKeys(profile?.raw_league_account),
          passiveTreeHash: hashJson(profile?.passive_tree ?? {}),
          passiveTreeKeys: summarizeObjectKeys(profile?.passive_tree),
          gearCount: Array.isArray(profile?.gear) ? profile.gear.length : 0,
          inventoryCount: Array.isArray(profile?.inventory) ? profile.inventory.length : 0,
          jewelCount: Array.isArray(profile?.jewels) ? profile.jewels.length : 0,
          equippedItems: summarizeEquippedItems(profile),
        },
        latestItems: {
          total: Array.isArray(latestItems) ? latestItems.length : 0,
          excluded: (Array.isArray(latestItems) ? latestItems : []).filter((item) => item?.is_excluded)
            .length,
          byUser: summarizeLatestItemsByUser(latestItems),
        },
        partyBuilds: summarizePartyBuilds(partyBuilds),
      })
      const targetUniqueItems = [
        ...(Array.isArray(targetContext.selectedItemSet?.items)
          ? targetContext.selectedItemSet.items
          : []
        )
          .filter(
            (item) =>
              String(item?.rarity ?? '')
                .trim()
                .toLowerCase() === 'unique' && item?.name,
          )
          .map((item) => ({
            name: item.name,
            baseType: item.typeLine ?? null,
          })),
        ...targetContext.hardRequirements
          .filter((entry) => entry.kind === 'mandatory_unique' && entry.item_name)
          .map((entry) => ({
            name: entry.item_name,
            baseType: null,
          })),
      ]
      await writeRunPhase(run, 'fetching_market_uniques', {
        target_unique_count: targetUniqueItems.length,
      })
      const [marketUniques, divineToChaosRate] = await Promise.all([
        fetchMarketUniques(group?.league ?? null, targetUniqueItems),
        fetchNinjaDivinePrice(group?.league ?? null),
      ])
      console.info('Optimizer worker unique candidate context', {
        runId: run.id,
        league: group?.league ?? null,
        divineToChaosRate,
        ...summarizeTargetUniqueMarket(targetUniqueItems, marketUniques),
      })
      const searchConstraints =
        run?.search_constraints && typeof run.search_constraints === 'object'
          ? run.search_constraints
          : {}
      const incrementalRerunConfig = getIncrementalRerunConfig(run)
      const rareSlotContext = buildRareSlotContext({ targetContext, profile })
      let marketRares = []
      let marketRareDiagnostics = null
      if (analysisMode === 'quick') {
        marketRareDiagnostics = {
          mode: 'quick',
          rate_limited: false,
          live_search_skipped: true,
          used_persistent_cache: false,
          cache_hit: false,
          cache_item_count: 0,
          cache_expires_at: null,
        }
      } else {
        await writeRunPhase(run, 'planning_live_rare_search')
        let rareSearchSlotPlanning = null
        try {
          const prepassAnalysis = await analyzeRecommendations({
            run,
            buildTarget,
            targetStage,
            profile,
            latestItems,
            marketUniques,
            marketRares: [],
            league: group?.league ?? null,
            targetContext,
            partyBuilds,
            rareSlotContext,
          })
          rareSearchSlotPlanning = buildRareSearchSlotPlanning({
            targetContext,
            rareSlotContext,
            prepassAnalysis,
            incrementalRerunConfig,
          })
        } catch (error) {
          console.warn('Optimizer worker rare slot planning prepass failed', {
            runId: run.id,
            error: error instanceof Error ? error.message : String(error),
          })
        }

        await writeRunPhase(run, 'searching_live_rares')
        const persistedRareCache = incrementalRerunConfig.active
          ? null
          : await getPersistedRareSearchCache({
              league: group?.league ?? null,
              budgetChaos: Number(run.budget_chaos ?? 0),
              targetContext,
              searchConstraints,
            })
        const activeRateLimit = await getTradeRateLimitState(group?.league ?? null)
        if (activeRateLimit && activeRateLimit.retryAtMs > Date.now()) {
          return await deferRunForTradeRateLimit(
            run,
            {
              mode: 'thorough',
              rate_limited: true,
              retry_after_ms: activeRateLimit.retryAfterMs,
              retry_at: activeRateLimit.retryAt,
              waiting_for_retry: true,
              used_persistent_cache: persistedRareCache?.fresh === true,
              cached_item_count: Array.isArray(persistedRareCache?.items)
                ? persistedRareCache.items.length
                : 0,
              cache_expires_at: persistedRareCache?.fresh ? persistedRareCache.expiresAt : null,
              detail: activeRateLimit.detail,
            },
            targetContext,
          )
        }

        try {
          const marketRareSearch = await searchConstrainedRareCandidates({
            league: group?.league ?? null,
            budgetChaos: Number(run.budget_chaos ?? 0),
            stageItems: targetContext.selectedItemSet?.items ?? [],
            equippedItems: Array.isArray(profile?.raw_character?.items)
              ? profile.raw_character.items
              : Array.isArray(profile?.gear)
                ? profile.gear
                : [],
            searchConstraints,
            rareSlotContext,
            divineToChaosRate,
            slotPlanning: rareSearchSlotPlanning,
            limitToSlots: incrementalRerunConfig.active
              ? incrementalRerunConfig.changedSlots
              : undefined,
            maxSlots: incrementalRerunConfig.active
              ? Math.max(
                  THOROUGH_RARE_SEARCH_MAX_SLOTS,
                  incrementalRerunConfig.changedSlots.length,
                )
              : THOROUGH_RARE_SEARCH_MAX_SLOTS,
            maxResultsPerSlot: THOROUGH_RARE_SEARCH_RESULTS_PER_SLOT,
            requestPacing: THOROUGH_RARE_SEARCH_REQUEST_PACING,
          })
          marketRares = Array.isArray(marketRareSearch?.items) ? marketRareSearch.items : []
          marketRareDiagnostics =
            marketRareSearch?.diagnostics && typeof marketRareSearch.diagnostics === 'object'
              ? {
                  ...marketRareSearch.diagnostics,
                  mode: 'thorough',
                  slot_planning: rareSearchSlotPlanning ?? marketRareSearch.diagnostics.slot_planning,
                  used_persistent_cache: false,
                  cache_hit: false,
                }
              : null
        } catch (error) {
          console.error('Optimizer worker rare trade search failed', error)
        }

        if (marketRareDiagnostics?.rate_limited === true) {
          await saveTradeRateLimitState(group?.league ?? null, marketRareDiagnostics)
          return await deferRunForTradeRateLimit(run, marketRareDiagnostics, targetContext)
        }

        await clearTradeRateLimitState(group?.league ?? null)
        if (!incrementalRerunConfig.active) {
          await savePersistedRareSearchCache({
            cacheKey: persistedRareCache?.cacheKey ?? null,
            league: group?.league ?? null,
            items: marketRares,
            diagnostics: marketRareDiagnostics,
          })
        }
      }

      await writeRunPhase(run, 'scoring_upgrades', {
        market_unique_count: Array.isArray(marketUniques) ? marketUniques.length : 0,
        market_rare_count: Array.isArray(marketRares) ? marketRares.length : 0,
      })
      const analysis = await analyzeRecommendations({
        run,
        buildTarget,
        targetStage,
        profile,
        latestItems,
        marketUniques,
        marketRares,
        league: group?.league ?? null,
        targetContext,
        partyBuilds,
        rareSlotContext,
      })
      // Merge overview_plans into plans so the enrichment pipeline processes them uniformly.
      // Each plan already carries a .section field ('primary' or 'overview') from the Lua output.
      if (Array.isArray(analysis?.overview_plans) && analysis.overview_plans.length > 0) {
        analysis.plans = [...(analysis.plans ?? []), ...analysis.overview_plans]
        delete analysis.overview_plans
      }
      console.info('Optimizer worker analysis returned', {
        runId: run.id,
        status: analysis?.status ?? null,
        partialReason: analysis?.partialReason ?? null,
        planCount: Array.isArray(analysis?.plans) ? analysis.plans.length : 0,
        engine:
          analysis?.summary && typeof analysis.summary === 'object'
            ? analysis.summary.engine ?? null
            : null,
        exactPlanCount: analysis?.summary?.exact_plan_count ?? null,
        exactUniquePlanCount: analysis?.summary?.exact_unique_plan_count ?? null,
        exactUniqueEvaluatedCount: analysis?.summary?.exact_unique_evaluated_count ?? null,
        exactRarePlanCount: analysis?.summary?.exact_rare_plan_count ?? null,
        exactRareEvaluatedCount: analysis?.summary?.exact_rare_evaluated_count ?? null,
        exactMarketRarePlanCount: analysis?.summary?.exact_market_rare_plan_count ?? null,
        exactMarketRareEvaluatedCount: analysis?.summary?.exact_market_rare_evaluated_count ?? null,
        exactStageTemplateRarePlanCount:
          analysis?.summary?.exact_stage_template_rare_plan_count ?? null,
        exactStageTemplateRareEvaluatedCount:
          analysis?.summary?.exact_stage_template_rare_evaluated_count ?? null,
        overviewPlanCount: analysis?.summary?.overview_plan_count ?? null,
        warningCount: analysis?.summary?.warning_count ?? null,
        warnings: Array.isArray(analysis?.summary?.warnings)
          ? analysis.summary.warnings.slice(0, 12)
          : [],
        baselineMetrics: summarizeBaselineMetrics(analysis?.summary),
      })
      const sanitizedAnalysis = sanitizeAnalysisRecommendationPayloads(analysis)
      const diagnosedAnalysis = applyRareSearchDiagnostics(
        {
          ...sanitizedAnalysis,
          summary: {
            ...(sanitizedAnalysis?.summary && typeof sanitizedAnalysis.summary === 'object'
              ? sanitizedAnalysis.summary
              : {}),
            analysis_mode: analysisMode,
            search_constraints: searchConstraints,
          },
        },
        marketRareDiagnostics,
      )
      const enrichedAnalysis = await enrichRecommendationTradeLinks(diagnosedAnalysis, {
        league: group?.league ?? null,
        budgetChaos: Number(run.budget_chaos ?? 0),
        targetContext,
        searchConstraints,
        analysisMode,
        divineToChaosRate,
      })
      const finalizedAnalysis = enrichedAnalysis
      const dependencyReadyAnalysis = annotateRecommendationDependencies({
        analysis: finalizedAnalysis,
        targetContext,
        profile,
      })
      const essentialCraftsAnalysis = enrichRecommendationEssentialCrafts(dependencyReadyAnalysis, {
        targetContext,
        searchConstraints,
      })
      const displayReadyAnalysis = enrichRecommendationDisplayPayloads(essentialCraftsAnalysis)
      let mergedAnalysis = displayReadyAnalysis
      if (incrementalRerunConfig.active) {
        try {
          const basePlans = await loadPersistedRecommendationPlans(incrementalRerunConfig.baseRunId)
          mergedAnalysis = mergeIncrementalRerunAnalysis(run, displayReadyAnalysis, basePlans)
        } catch (error) {
          console.warn('Optimizer worker failed to load base plans for incremental rerun', {
            runId: run.id,
            baseRunId: incrementalRerunConfig.baseRunId,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
      mergedAnalysis = await enrichRecommendationIconUrls(mergedAnalysis)
      console.info('Optimizer worker analysis ready to persist', {
        runId: run.id,
        status: mergedAnalysis?.status ?? null,
        planCount: Array.isArray(mergedAnalysis?.plans) ? mergedAnalysis.plans.length : 0,
        partialReason: mergedAnalysis?.partialReason ?? null,
        planPreview: Array.isArray(mergedAnalysis?.plans)
          ? mergedAnalysis.plans.slice(0, 5).map((plan) => ({
              category: plan?.category ?? null,
              title: plan?.title ?? null,
              score: plan?.score ?? null,
              itemNames: Array.isArray(plan?.items)
                ? plan.items.map((item) => item?.item_name ?? null).filter(Boolean)
                : [],
            }))
          : [],
      })

      const latestRun = await supabase.selectSingle(runTablesForRun(run).runs, { id: run.id }, '*')
      if (!latestRun || latestRun.status === 'stale') {
        return { ok: true, skipped: true, reason: 'run-became-stale' }
      }

      await writeRunPhase(run, 'persisting_results')
      await persistAnalysis(run, mergedAnalysis)
      console.info('Optimizer worker analysis persisted', {
        runId: run.id,
        planCount: Array.isArray(mergedAnalysis?.plans) ? mergedAnalysis.plans.length : 0,
      })
      return { ok: true, skipped: false, planCount: mergedAnalysis.plans.length }
    } catch (error) {
      console.error('Optimizer worker processClaimedRun failed', error)
      await supabase.updateRows(
        runTablesForRun(run).runs,
        { id: run.id },
        {
          status: 'failed',
          partial_reason: null,
          error_detail: formatAnalysisFailureDetail(error),
          completed_at: new Date().toISOString(),
        },
      )
      throw error
    } finally {
      await stopHeartbeat()
    }
  }

  async function processRunById(runId, runType = RUN_TYPE_AUTHENTICATED) {
    const normalizedRunType = normalizeRunType(runType)
    const run = withRunType(
      await supabase.selectSingle(runTablesForType(normalizedRunType).runs, { id: runId }, '*'),
      normalizedRunType,
    )
    if (!run || run.status === 'stale') {
      return { ok: true, skipped: true, reason: 'run-not-found-or-stale' }
    }

    if (run.status === 'running') {
      const waitInfo = getTradeRateLimitWaitInfo(run)
      if (waitInfo) {
        if (waitInfo.retryAtMs <= Date.now()) {
          const resumedRun = await claimRunningRun(run, {
            clearTradeWait: true,
            resetStartedAt: false,
          })
          if (!resumedRun) {
            return { ok: true, skipped: true, reason: 'run-resume-lost' }
          }

          return processClaimedRun(resumedRun)
        }

        return {
          ok: true,
          skipped: true,
          reason: 'waiting-for-trade-rate-limit',
          retry_at: waitInfo.retryAt,
        }
      }

      if (isRunningRunStalled(run)) {
        const reclaimedRun = await claimRunningRun(run, {
          clearTradeWait: false,
          resetStartedAt: true,
        })
        if (!reclaimedRun) {
          return { ok: true, skipped: true, reason: 'run-reclaim-lost' }
        }

        return processClaimedRun(reclaimedRun)
      }

      return { ok: true, skipped: true, reason: 'run-already-running' }
    }

    if (run.status !== 'queued') {
      return { ok: true, skipped: true, reason: `run-already-${run.status}` }
    }

    const claimedRun = await claimQueuedRun(runId, normalizedRunType)
    if (!claimedRun) {
      return { ok: true, skipped: true, reason: 'run-claim-lost' }
    }

    return processClaimedRun(claimedRun)
  }

  function requestImmediatePoll() {
    if (isImmediatePollScheduled || !isPollLoopActive) return
    isImmediatePollScheduled = true

    queueMicrotask(async () => {
      isImmediatePollScheduled = false
      if (!isPollLoopActive) return

      try {
        await pollOnce()
      } catch (error) {
        console.error('Optimizer worker immediate poll failed', error)
      }
    })
  }

  function startRunTask(runId, runType = RUN_TYPE_AUTHENTICATED) {
    const normalizedRunType = normalizeRunType(runType)
    const normalizedRunId = String(runId ?? '').trim()
    if (!normalizedRunId) return false
    const taskKey = activeRunTaskKey(normalizedRunId, normalizedRunType)
    if (activeRunTasks.has(taskKey)) return false
    if (!hasAvailableCapacity()) return false

    const task = (async () => {
      try {
        await processRunById(normalizedRunId, normalizedRunType)
      } catch (error) {
        console.error('Optimizer worker run task failed', {
          runId: normalizedRunId,
          runType: normalizedRunType,
          error: error instanceof Error ? error.message : String(error),
        })
      } finally {
        activeRunTasks.delete(taskKey)
        requestImmediatePoll()
      }
    })()

    activeRunTasks.set(taskKey, task)
    return true
  }

  async function pollOnce() {
    if (isPollingTickRunning) {
      return { ok: true, skipped: true, reason: 'poll-already-running' }
    }

    isPollingTickRunning = true
    try {
      if (!hasAvailableCapacity()) {
        return { ok: true, skipped: true, reason: 'local-capacity-full' }
      }

      const nowMs = Date.now()
      const [authenticatedRunningRuns, guestRunningRuns] = await Promise.all([
        supabase.selectMany(
          runTablesForType(RUN_TYPE_AUTHENTICATED).runs,
          { status: 'running' },
          'id, status, summary, started_at, created_at, updated_at',
          {
            orderBy: 'updated_at',
            ascending: true,
            limit: 50,
          },
        ),
        supabase.selectMany(
          runTablesForType(RUN_TYPE_GUEST).runs,
          { status: 'running' },
          'id, status, summary, started_at, created_at, updated_at',
          {
            orderBy: 'updated_at',
            ascending: true,
            limit: 50,
          },
        ),
      ])
      const runningRuns = [
        ...authenticatedRunningRuns.map((run) => withRunType(run, RUN_TYPE_AUTHENTICATED)),
        ...guestRunningRuns.map((run) => withRunType(run, RUN_TYPE_GUEST)),
      ].sort(
        (left, right) =>
          (normalizeIsoMs(left?.updated_at) ?? 0) - (normalizeIsoMs(right?.updated_at) ?? 0),
      )

      let scheduledWaitingRuns = 0
      let scheduledStalledRuns = 0
      let scheduledQueuedRuns = 0

      const waitingRuns = runningRuns
        .map((run) => ({
          id: run.id,
          runType: run.__run_type,
          waitInfo: getTradeRateLimitWaitInfo(run),
        }))
        .filter((entry) => !!entry.waitInfo)
        .sort((left, right) => left.waitInfo.retryAtMs - right.waitInfo.retryAtMs)

      for (const waitingRun of waitingRuns) {
        if (!hasAvailableCapacity()) break
        if (waitingRun.waitInfo.retryAtMs > nowMs) continue
        if (startRunTask(waitingRun.id, waitingRun.runType)) {
          scheduledWaitingRuns += 1
        }
      }

      const stalledRunningRuns = runningRuns.filter((run) => isRunningRunStalled(run, nowMs))
      for (const stalledRun of stalledRunningRuns) {
        if (!hasAvailableCapacity()) break
        if (startRunTask(stalledRun.id, stalledRun.__run_type)) {
          scheduledStalledRuns += 1
        }
      }

      const queuedRunLimit = Math.max(1, maxConcurrentRuns - activeRunTasks.size)
      const [authenticatedQueuedRuns, guestQueuedRuns] = await Promise.all([
        supabase.selectMany(
          runTablesForType(RUN_TYPE_AUTHENTICATED).runs,
          { status: 'queued' },
          'id, created_at',
          {
            orderBy: 'created_at',
            ascending: true,
            limit: queuedRunLimit,
          },
        ),
        supabase.selectMany(
          runTablesForType(RUN_TYPE_GUEST).runs,
          { status: 'queued' },
          'id, created_at',
          {
            orderBy: 'created_at',
            ascending: true,
            limit: queuedRunLimit,
          },
        ),
      ])
      const queuedRuns = [
        ...authenticatedQueuedRuns.map((run) => withRunType(run, RUN_TYPE_AUTHENTICATED)),
        ...guestQueuedRuns.map((run) => withRunType(run, RUN_TYPE_GUEST)),
      ]
        .sort(
          (left, right) =>
            (normalizeIsoMs(left?.created_at) ?? 0) - (normalizeIsoMs(right?.created_at) ?? 0),
        )
        .slice(0, queuedRunLimit)

      for (const queuedRun of queuedRuns) {
        if (!hasAvailableCapacity()) break
        if (startRunTask(queuedRun.id, queuedRun.__run_type)) {
          scheduledQueuedRuns += 1
        }
      }

      if (scheduledWaitingRuns > 0 || scheduledStalledRuns > 0 || scheduledQueuedRuns > 0) {
        return {
          ok: true,
          skipped: false,
          scheduled_waiting_runs: scheduledWaitingRuns,
          scheduled_stalled_runs: scheduledStalledRuns,
          scheduled_queued_runs: scheduledQueuedRuns,
        }
      }

      const nextWaitingRun = waitingRuns[0]
      if (nextWaitingRun) {
        return {
          ok: true,
          skipped: true,
          reason: 'waiting-for-trade-rate-limit',
          retry_at: nextWaitingRun.waitInfo.retryAt,
        }
      }

      if (queuedRuns.length > 0) {
        return { ok: true, skipped: true, reason: 'local-capacity-full' }
      }

      return { ok: true, skipped: true, reason: 'no-queued-runs' }
    } finally {
      isPollingTickRunning = false
    }
  }

  function scheduleNextPoll() {
    if (!isPollLoopActive) return
    pollTimer = setTimeout(async () => {
      try {
        await pollOnce()
      } catch (error) {
        console.error('Optimizer worker poll failed', error)
      } finally {
        scheduleNextPoll()
      }
    }, pollIntervalMs)
  }

  function startPolling() {
    if (isPollLoopActive) return
    isPollLoopActive = true
    requestImmediatePoll()
    scheduleNextPoll()
  }

  function stopPolling() {
    isPollLoopActive = false
    if (pollTimer) {
      clearTimeout(pollTimer)
      pollTimer = null
    }
  }

  function getDiagnostics() {
    return {
      worker_id: workerId,
      poll_interval_ms: pollIntervalMs,
      poll_loop_active: isPollLoopActive,
      max_concurrent_runs: maxConcurrentRuns,
      active_run_count: activeRunTasks.size,
      heartbeat_interval_ms: heartbeatIntervalMs,
      stale_running_after_ms: staleRunningAfterMs,
      ...getEngineDiagnostics(),
    }
  }

  return {
    startRunTask,
    processRunById,
    pollOnce,
    startPolling,
    stopPolling,
    getDiagnostics,
  }
}
