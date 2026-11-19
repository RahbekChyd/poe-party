import { sanitizeAnalysisRawText } from './pob-item-text.mjs'
import {
  detectEssentialCraftsOnTarget,
  hasEssentialCraft,
} from './essential-crafts.mjs'
import { candidateSatisfiesRequiredSourceEffects } from './recommendation-dependencies.mjs'

const TRADE_API_BASE_URL = 'https://www.pathofexile.com/api/trade'
const TRADE_SITE_BASE_URL = 'https://www.pathofexile.com/trade/search'
const DEFAULT_USER_AGENT =
  'OAuth poeparty/1.0 (contact: support@poe-party.com) optimizer-worker'
const TRADE_STATUS_INSTANT_BUYOUT = 'securable'
const DEFAULT_DIVINE_TO_CHAOS = Number(process.env.DIVINE_TO_CHAOS_ESTIMATE ?? 150)
const TRADE_FETCH_TIMEOUT_MS = Number(process.env.TRADE_FETCH_TIMEOUT_MS) || 30_000
const RARE_SEARCH_CACHE_TTL_MS = 10 * 60 * 1000
const rareSearchCache = new Map()
const EXACT_RARE_SEARCH_CACHE_TTL_MS = 30 * 60 * 1000
const exactRareSearchCache = new Map()
const UNIQUE_SEARCH_CACHE_TTL_MS = 30 * 60 * 1000
const uniqueSearchCache = new Map()
const TRADE_STAT_CACHE_TTL_MS = 24 * 60 * 60 * 1000
let tradeStatIndexCache = null
let tradeStatIndexPromise = null
let tradeStatPersistence = null

// Inject a persistence adapter so we can survive cold starts when GGG's
// Cloudflare layer 403s `/api/trade/data/stats`. The adapter is set once at
// worker startup; both `load` and `save` may be omitted independently.
//   load(): Promise<{ payload, fetchedAt } | null>
//   save({ payload }): Promise<void>
//   bundledFallback(): { payload } | null  -- last-resort copy baked into the image
export function setTradeStatPersistence(adapter) {
  tradeStatPersistence = adapter ?? null
}
const RARE_SEARCH_VERSION = 'v5'
const DEFAULT_TRADE_REQUEST_DELAY_MS = Math.max(
  0,
  Number(process.env.POE_TRADE_REQUEST_DELAY_MS ?? 0),
)
const DEFAULT_TRADE_REQUEST_JITTER_MS = Math.max(
  0,
  Number(process.env.POE_TRADE_REQUEST_JITTER_MS ?? 0),
)
const THOROUGH_TRADE_REQUEST_DELAY_MS = Math.max(
  0,
  Number(process.env.POE_TRADE_THOROUGH_REQUEST_DELAY_MS ?? 5000),
)
const THOROUGH_TRADE_REQUEST_JITTER_MS = Math.max(
  0,
  Number(process.env.POE_TRADE_THOROUGH_REQUEST_JITTER_MS ?? 1000),
)
const TRADE_RATE_LIMIT_MARGIN = Math.max(0, Number(process.env.POE_TRADE_RATE_LIMIT_MARGIN ?? 1))
let tradeRequestPacingQueue = Promise.resolve()
let tradeRequestPacingNextAtMs = 0
const tradeRateLimitPolicies = new Map()

const PSEUDO_FILTERS = {
  life: 'pseudo.pseudo_total_life',
  elementalRes: 'pseudo.pseudo_total_elemental_resistance',
  chaosRes: 'pseudo.pseudo_total_chaos_resistance',
  strength: 'pseudo.pseudo_total_strength',
  dexterity: 'pseudo.pseudo_total_dexterity',
  intelligence: 'pseudo.pseudo_total_intelligence',
  allAttributes: 'pseudo.pseudo_total_all_attributes',
  movementSpeed: 'pseudo.pseudo_increased_movement_speed',
  attackSpeed: 'pseudo.pseudo_total_attack_speed',
  critChance: 'pseudo.pseudo_global_critical_strike_chance',
  critMulti: 'pseudo.pseudo_global_critical_strike_multiplier',
}

const TARGET_KEY_ORDER = [
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
]

const RARE_SLOT_PRIORITY = {
  Weapon: 100,
  BodyArmour: 90,
  Amulet: 80,
  Ring: 78,
  Ring2: 76,
  Belt: 72,
  Gloves: 68,
  Boots: 66,
  Helmet: 64,
  Offhand: 60,
}

function getEquippedCacheSignature(stageItem, equippedItems) {
  const wantedSlot = normalizeSlot(stageItem?.slot)
  const equippedItem =
    (Array.isArray(equippedItems) ? equippedItems : []).find(
      (item) => normalizeSlot(item?.slot ?? item?.inventoryId) === wantedSlot,
    ) ?? null

  return [
    trim(equippedItem?.id),
    trim(equippedItem?.name),
    trim(equippedItem?.typeLine ?? equippedItem?.baseType),
  ]
    .filter(Boolean)
    .join(':')
}

function getRareSearchCacheKey({
  league,
  budgetChaos,
  stageItem,
  equippedItems,
  searchConstraints,
  rareSlotContext,
}) {
  const normalizedRawText = sanitizeAnalysisRawText(stageItem?.rawText)
  return [
    RARE_SEARCH_VERSION,
    trim(league),
    normalizeSlot(stageItem?.slot),
    trim(stageItem?.typeLine),
    Number.isFinite(budgetChaos) ? Math.floor(budgetChaos) : 0,
    trim(normalizedRawText),
    getEquippedCacheSignature(stageItem, equippedItems),
    getSearchConstraintSignature(stageItem, searchConstraints),
    getRareSlotContextSignature(stageItem, rareSlotContext),
  ].join('::')
}

function normalizeDivineToChaosRate(value) {
  const numeric = Number(value)
  if (Number.isFinite(numeric) && numeric > 0) return numeric
  return Number.isFinite(DEFAULT_DIVINE_TO_CHAOS) && DEFAULT_DIVINE_TO_CHAOS > 0
    ? DEFAULT_DIVINE_TO_CHAOS
    : 150
}

function getUniqueSearchCacheKey({ league, uniqueName, baseType, links }) {
  const normalizedLinks = Number(links)
  return [
    trim(league),
    trim(uniqueName),
    trim(baseType),
    Number.isFinite(normalizedLinks) && normalizedLinks >= 5 ? Math.floor(normalizedLinks) : 0,
  ].join('::')
}

function getExactRareSearchCacheKey({ league, candidate }) {
  const normalizedRawText = sanitizeAnalysisRawText(candidate?.rawText)
  return [
    trim(league),
    normalizeSlot(candidate?.slot),
    trim(candidate?.baseType),
    Number.isFinite(candidate?.chaosValue) ? Math.floor(candidate.chaosValue) : 0,
    trim(normalizedRawText),
  ].join('::')
}

export function normalizeSlot(slot) {
  const raw = String(slot ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
  if (!raw) return null
  const visceraPart = raw.replace(/^viscera/, '')
  if (['head', 'body', 'arm', 'leg'].includes(visceraPart)) return visceraPart[0].toUpperCase() + visceraPart.slice(1)
  if (raw.includes('weapon2') || raw.includes('offhand')) return 'Offhand'
  if (raw.includes('weapon1') || raw === 'weapon') return 'Weapon'
  if (raw.includes('helmet') || raw.includes('helm')) return 'Helmet'
  if (raw.includes('body') || raw.includes('chest')) return 'BodyArmour'
  if (raw.includes('glove')) return 'Gloves'
  if (raw.includes('boot')) return 'Boots'
  if (raw.includes('ring2')) return 'Ring2'
  if (raw.includes('ring1') || raw === 'ring') return 'Ring'
  if (raw.includes('amulet')) return 'Amulet'
  if (raw.includes('belt')) return 'Belt'
  return slot ?? null
}

function getRareSlotContextForStageItem(stageItem, rareSlotContext) {
  if (!rareSlotContext || typeof rareSlotContext !== 'object' || Array.isArray(rareSlotContext)) {
    return {}
  }

  const direct = stageItem?.slot ? asRecord(rareSlotContext[stageItem.slot]) : {}
  if (Object.keys(direct).length > 0) {
    return direct
  }

  const wantedSlot = normalizeSlot(stageItem?.slot)
  if (!wantedSlot) {
    return {}
  }

  for (const [slot, value] of Object.entries(rareSlotContext)) {
    if (normalizeSlot(slot) === wantedSlot) {
      return asRecord(value)
    }
  }

  return {}
}

function getRequiredSourceEffectsForStageItem(stageItem, rareSlotContext) {
  const slotContext = getRareSlotContextForStageItem(stageItem, rareSlotContext)
  return Array.isArray(slotContext.strict_required_effects)
    ? slotContext.strict_required_effects.filter(
        (entry) => !!entry && typeof entry === 'object' && !Array.isArray(entry),
      )
    : []
}

function getRareSlotContextSignature(stageItem, rareSlotContext) {
  const slotContext = getRareSlotContextForStageItem(stageItem, rareSlotContext)
  const requiredSourceEffects = getRequiredSourceEffectsForStageItem(stageItem, rareSlotContext)
    .map((entry) => {
      const record = asRecord(entry)
      return {
        key: trim(record.key),
        label: trim(record.label),
      }
    })
    .filter((entry) => entry.key || entry.label)

  return JSON.stringify({
    requiredSourceEffects,
    hasTransferableAnoint:
      asRecord(slotContext.transferable_anoint).allocation_line != null ||
      asRecord(slotContext.transferable_anoint).passive_name != null,
  })
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function trim(value) {
  return String(value ?? '').trim() || null
}

function normalizeWhitespace(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizePositiveNumber(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return Math.round(parsed * 100) / 100
}

function sleep(ms) {
  const waitMs = Number.isFinite(ms) ? Math.max(0, ms) : 0
  if (waitMs <= 0) {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    setTimeout(resolve, waitMs)
  })
}

function getRandomDelayMs(maxDelayMs) {
  const normalizedMax = Number.isFinite(maxDelayMs) ? Math.max(0, Math.floor(maxDelayMs)) : 0
  if (normalizedMax <= 0) {
    return 0
  }

  return Math.floor(Math.random() * (normalizedMax + 1))
}

function normalizeTradeRequestPacing(value) {
  if (!value) {
    return null
  }

  if (value === 'thorough_live_search') {
    return {
      label: 'thorough_live_search',
      minDelayMs: THOROUGH_TRADE_REQUEST_DELAY_MS,
      jitterMs: THOROUGH_TRADE_REQUEST_JITTER_MS,
    }
  }

  if (value === 'default') {
    return {
      label: 'default',
      minDelayMs: DEFAULT_TRADE_REQUEST_DELAY_MS,
      jitterMs: DEFAULT_TRADE_REQUEST_JITTER_MS,
    }
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const record = value
  const label = trim(record.label) ?? 'custom'
  const minDelayMs = Math.max(0, Number(record.minDelayMs ?? 0))
  const jitterMs = Math.max(0, Number(record.jitterMs ?? 0))

  if (!Number.isFinite(minDelayMs) || !Number.isFinite(jitterMs)) {
    return null
  }

  if (minDelayMs <= 0 && jitterMs <= 0) {
    return null
  }

  return {
    label,
    minDelayMs,
    jitterMs,
  }
}

async function withTradeRequestPacing(requestPacing, callback) {
  const pacing = normalizeTradeRequestPacing(requestPacing)
  if (!pacing) {
    return callback()
  }

  const run = async () => {
    const waitMs = Math.max(0, tradeRequestPacingNextAtMs - Date.now())
    if (waitMs > 0) {
      await sleep(waitMs)
    }

    try {
      return await callback()
    } finally {
      tradeRequestPacingNextAtMs =
        Date.now() + pacing.minDelayMs + getRandomDelayMs(pacing.jitterMs)
    }
  }

  const requestPromise = tradeRequestPacingQueue.then(run, run)
  tradeRequestPacingQueue = requestPromise.then(
    () => undefined,
    () => undefined,
  )
  return requestPromise
}

function classifyTradeRequest(url) {
  const normalizedUrl = trim(url) ?? ''
  if (normalizedUrl.includes('/api/trade/search/')) {
    return {
      kind: 'search',
      policyName: 'trade-search-request-limit',
    }
  }

  if (normalizedUrl.includes('/api/trade/fetch/')) {
    return {
      kind: 'fetch',
      policyName: 'trade-fetch-request-limit',
    }
  }

  return {
    kind: 'other',
    policyName: null,
  }
}

function getOrCreateTradeRatePolicy(policyName) {
  if (!policyName) {
    return null
  }

  let state = tradeRateLimitPolicies.get(policyName)
  if (!state) {
    state = {
      policyName,
      rules: {},
      retryAfterAtMs: null,
      lastUpdateMs: 0,
      maxWindowMs: 0,
      requestTimestamps: [],
    }
    tradeRateLimitPolicies.set(policyName, state)
  }

  return state
}

function parseTradeRateLimitBuckets(value, { applyMargin = false } = {}) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return {}
  }

  const buckets = {}
  for (const entry of value.split(',')) {
    const [requestText, windowText, timeoutText] = entry.trim().split(':')
    const request = Number(requestText)
    const windowSeconds = Number(windowText)
    const timeoutSeconds = Number(timeoutText)
    if (
      !Number.isFinite(request) ||
      !Number.isFinite(windowSeconds) ||
      !Number.isFinite(timeoutSeconds) ||
      windowSeconds <= 0
    ) {
      continue
    }

    buckets[String(windowSeconds)] = {
      request: applyMargin ? Math.max(1, request - TRADE_RATE_LIMIT_MARGIN) : request,
      timeout: timeoutSeconds,
    }
  }

  return buckets
}

function trimTradeRatePolicyRequests(policyState, nowMs = Date.now()) {
  if (!policyState) {
    return
  }

  const maxWindowMs = Number.isFinite(policyState.maxWindowMs)
    ? Math.max(0, policyState.maxWindowMs)
    : 0
  if (maxWindowMs <= 0) {
    return
  }

  policyState.requestTimestamps = policyState.requestTimestamps.filter(
    (timestampMs) => Number.isFinite(timestampMs) && timestampMs >= nowMs - maxWindowMs,
  )
}

function noteTradeRateLimitRequest(policyName, timestampMs = Date.now()) {
  const policyState = getOrCreateTradeRatePolicy(policyName)
  if (!policyState) {
    return
  }

  policyState.requestTimestamps.push(timestampMs)
  trimTradeRatePolicyRequests(policyState, timestampMs)
}

function updateTradeRatePolicyFromResponse(requestInfo, response) {
  if (!response?.headers) {
    return
  }

  const headerPolicyName = trim(response.headers.get('x-rate-limit-policy'))
  const policyName = headerPolicyName ?? requestInfo?.policyName ?? null
  if (!policyName) {
    return
  }

  const policyState = getOrCreateTradeRatePolicy(policyName)
  if (!policyState) {
    return
  }

  const nowMs = Date.now()
  policyState.lastUpdateMs = nowMs

  const retryAfterSeconds = Number(response.headers.get('retry-after'))
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    policyState.retryAfterAtMs = nowMs + retryAfterSeconds * 1000
  }

  const ruleNames = String(response.headers.get('x-rate-limit-rules') ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)

  if (ruleNames.length === 0) {
    trimTradeRatePolicyRequests(policyState, nowMs)
    return
  }

  const nextRules = {}
  let nextMaxWindowMs = 0

  for (const ruleName of ruleNames) {
    const limits = parseTradeRateLimitBuckets(response.headers.get(`x-rate-limit-${ruleName}`), {
      applyMargin: true,
    })
    const state = parseTradeRateLimitBuckets(
      response.headers.get(`x-rate-limit-${ruleName}-state`),
    )

    if (Object.keys(limits).length === 0 || Object.keys(state).length === 0) {
      continue
    }

    nextRules[ruleName] = {
      limits,
      state,
    }

    for (const windowKey of Object.keys(limits)) {
      const windowSeconds = Number(windowKey)
      if (Number.isFinite(windowSeconds) && windowSeconds > 0) {
        nextMaxWindowMs = Math.max(nextMaxWindowMs, windowSeconds * 1000)
      }
    }
  }

  if (Object.keys(nextRules).length > 0) {
    policyState.rules = nextRules
    policyState.maxWindowMs = nextMaxWindowMs
  }

  trimTradeRatePolicyRequests(policyState, nowMs)
}

function getTradeRateLimitWaitMs(policyName, nowMs = Date.now()) {
  const policyState = policyName ? tradeRateLimitPolicies.get(policyName) : null
  if (!policyState) {
    return 0
  }

  trimTradeRatePolicyRequests(policyState, nowMs)

  let waitUntilMs = nowMs
  if (Number.isFinite(policyState.retryAfterAtMs) && policyState.retryAfterAtMs > waitUntilMs) {
    waitUntilMs = policyState.retryAfterAtMs
  }

  for (const ruleValue of Object.values(policyState.rules ?? {})) {
    const limits = ruleValue?.limits ?? {}
    const state = ruleValue?.state ?? {}

    for (const [windowKey, limitBucket] of Object.entries(limits)) {
      const windowSeconds = Number(windowKey)
      const stateBucket = state[windowKey]
      if (!Number.isFinite(windowSeconds) || !stateBucket) {
        continue
      }

      if (Number.isFinite(stateBucket.timeout) && stateBucket.timeout > 0) {
        waitUntilMs = Math.max(waitUntilMs, policyState.lastUpdateMs + stateBucket.timeout * 1000 + 1000)
      }

      if (!Number.isFinite(stateBucket.request) || stateBucket.request < limitBucket.request) {
        continue
      }

      const windowMs = windowSeconds * 1000
      const recentTimestamps = policyState.requestTimestamps.filter(
        (timestampMs) => timestampMs >= nowMs - windowMs,
      )

      if (recentTimestamps.length < limitBucket.request) {
        waitUntilMs = Math.max(waitUntilMs, policyState.lastUpdateMs + limitBucket.timeout * 1000 + 1000)
        continue
      }

      const releaseIndex = Math.max(0, recentTimestamps.length - limitBucket.request)
      const releaseTimestampMs = recentTimestamps[releaseIndex]
      if (Number.isFinite(releaseTimestampMs)) {
        waitUntilMs = Math.max(waitUntilMs, releaseTimestampMs + windowMs + 1000)
      }
    }
  }

  return Math.max(0, waitUntilMs - nowMs)
}

function normalizeLineOverride(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value
  const lineId = trim(record.line_id)
  const targetKey =
    typeof record.target_key === 'string' && TARGET_KEY_ORDER.includes(record.target_key)
      ? record.target_key
      : null
  if (!lineId || !targetKey) {
    return null
  }

  return {
    line_id: lineId,
    target_key: targetKey,
    enabled: record.enabled !== false,
    value: record.value == null ? null : normalizePositiveNumber(record.value),
  }
}

function normalizeSearchConstraints(value) {
  const record = asRecord(value)
  const rawSlotOverrides = asRecord(record.slot_overrides)
  const slotOverrides = Object.fromEntries(
    Object.entries(rawSlotOverrides)
      .map(([slot, slotValue]) => {
        const normalizedSlot = normalizeSlot(slot)
        const slotRecord = asRecord(slotValue)
        const targetOverrideRecord = asRecord(slotRecord.target_overrides)
        const disabledTargetKeys = Array.from(
          new Set(
            (Array.isArray(slotRecord.disabled_target_keys)
              ? slotRecord.disabled_target_keys
              : []
            ).filter((entry) => typeof entry === 'string' && TARGET_KEY_ORDER.includes(entry)),
          ),
        ).sort((left, right) => TARGET_KEY_ORDER.indexOf(left) - TARGET_KEY_ORDER.indexOf(right))
        const targetOverrides = Object.fromEntries(
          TARGET_KEY_ORDER.flatMap((key) => {
            const normalizedValue = normalizePositiveNumber(targetOverrideRecord[key])
            return normalizedValue != null && normalizedValue > 0 ? [[key, normalizedValue]] : []
          }),
        )
        const lineOverrides = Array.from(
          new Map(
            (Array.isArray(slotRecord.line_overrides) ? slotRecord.line_overrides : [])
              .map(normalizeLineOverride)
              .filter(Boolean)
              .map((entry) => [entry.line_id, entry]),
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
        ]
      })
      .filter(Boolean),
  )

  const percentileFloorValue = Number(record.property_percentile_floor)
  const propertyPercentileFloor = Number.isFinite(percentileFloorValue)
    ? Math.min(90, Math.max(0, Math.round(percentileFloorValue)))
    : 20

  return {
    ignoreCraftedMods: record.ignore_crafted_mods !== false,
    ignoreEnchants: record.ignore_enchants !== false,
    ignoreQuality: record.ignore_quality !== false,
    ignoreCorruptedImplicits: record.ignore_corrupted_implicits !== false,
    propertyPercentileFloor,
    slotOverrides,
  }
}

function stripCraftedLines(rawText) {
  return filterItemTextLinesPreservingImplicitCount(rawText, (trimmedLine) =>
    trimmedLine.includes('{crafted}'),
  )
}

function stripEnchantLines(rawText) {
  return filterItemTextLinesPreservingImplicitCount(rawText, (trimmedLine) =>
    trimmedLine.includes('{enchant}'),
  )
}

function filterItemTextLinesPreservingImplicitCount(rawText, shouldDropLine) {
  const result = []
  let implicitLinesRemaining = 0
  let implicitHeaderIndex = null
  let retainedImplicitLineCount = 0

  const finalizeImplicitHeader = () => {
    if (implicitHeaderIndex === null) return

    if (retainedImplicitLineCount > 0) {
      result[implicitHeaderIndex] = `Implicits: ${retainedImplicitLineCount}`
    } else {
      result.splice(implicitHeaderIndex, 1)
    }

    implicitLinesRemaining = 0
    implicitHeaderIndex = null
    retainedImplicitLineCount = 0
  }

  for (const line of String(rawText ?? '').split(/\r?\n/)) {
    const trimmed = line.trim()

    if (!trimmed) {
      result.push(line)
      continue
    }

    if (trimmed === '--------') {
      finalizeImplicitHeader()
      result.push(line)
      continue
    }

    const implicitMatch = trimmed.match(/^Implicits:\s*(\d+)/i)
    if (implicitMatch) {
      finalizeImplicitHeader()
      implicitHeaderIndex = result.length
      retainedImplicitLineCount = 0
      implicitLinesRemaining = Number(implicitMatch[1] ?? 0)
      result.push(line)
      continue
    }

    const countsTowardsImplicitBlock =
      implicitLinesRemaining > 0 && !(trimmed.startsWith('{') && trimmed.endsWith('}'))

    if (shouldDropLine(trimmed)) {
      if (countsTowardsImplicitBlock) {
        implicitLinesRemaining -= 1
        if (implicitLinesRemaining === 0) {
          finalizeImplicitHeader()
        }
      }
      continue
    }

    result.push(line)

    if (countsTowardsImplicitBlock) {
      implicitLinesRemaining -= 1
      retainedImplicitLineCount += 1

      if (implicitLinesRemaining === 0) {
        finalizeImplicitHeader()
      }
    }
  }

  finalizeImplicitHeader()
  return result.join('\n')
}

function stripCorruptedImplicitLines(rawText) {
  let inImplicitBlock = false
  return filterItemTextLinesPreservingImplicitCount(rawText, (trimmed) => {
    if (/^\{implicit\}/i.test(trimmed) || /\{implicit\}/i.test(trimmed)) {
      inImplicitBlock = true
    }
    if (inImplicitBlock && /\{corrupted\}/i.test(trimmed)) {
      return true
    }
    if (/\{corrupted\}/i.test(trimmed) && /implicit/i.test(trimmed)) {
      return true
    }
    return false
  })
}

function stripQualityLine(rawText) {
  return String(rawText ?? '')
    .split(/\r?\n/)
    .filter((line) => !/^Quality:\s*\+?\d/i.test(line.trim()))
    .join('\n')
}

function shouldSkipWholeTextNumericRelaxationLine(trimmedLine) {
  if (!trimmedLine) return true
  if (trimmedLine.startsWith('Rarity:')) return true
  if (trimmedLine.startsWith('Item Class:')) return true
  if (trimmedLine.startsWith('Unique ID:')) return true
  if (trimmedLine.startsWith('Note:')) return true
  if (trimmedLine.startsWith('League:')) return true
  if (trimmedLine.startsWith('Item Level:')) return true
  if (trimmedLine.startsWith('Implicits:')) return true
  if (trimmedLine.startsWith('Requirements:')) return true
  if (/^Level:\s/i.test(trimmedLine)) return true
  if (/^Sockets:/i.test(trimmedLine)) return true
  return false
}

function scaleNumericTokenForWholeTextRelaxation(match, multiplier) {
  const numeric = Number(match)
  if (!Number.isFinite(numeric)) return match

  const scaled = numeric * multiplier
  const decimalMatch = match.match(/\.(\d+)/)
  if (!decimalMatch) {
    return String(Math.floor(scaled))
  }

  const decimalPlaces = decimalMatch[1].length
  const precision = 10 ** decimalPlaces
  return String(Math.floor(scaled * precision) / precision)
}

function applyWholeTextNumericRelaxation(rawText, multiplier) {
  if (!Number.isFinite(multiplier)) return String(rawText ?? '')
  if (multiplier >= 0.999) return String(rawText ?? '')
  const normalizedMultiplier = Math.max(0, multiplier)

  return String(rawText ?? '')
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim()
      if (shouldSkipWholeTextNumericRelaxationLine(trimmed)) {
        return line
      }

      return line.replace(/(-?\d+(?:\.\d+)?)/g, (match) =>
        scaleNumericTokenForWholeTextRelaxation(match, normalizedMultiplier),
      )
    })
    .join('\n')
}

function applyPropertyPercentileFloor(rawText, floorPercent) {
  if (!floorPercent || floorPercent <= 0) return String(rawText ?? '')
  const multiplier = (100 - floorPercent) / 100
  return applyWholeTextNumericRelaxation(rawText, multiplier)
}

function applySearchConstraintRelaxation(rawText, normalizedConstraints) {
  let result = String(rawText ?? '')
  if (normalizedConstraints.ignoreCraftedMods) {
    result = stripCraftedLines(result)
  }
  if (normalizedConstraints.ignoreEnchants) {
    result = stripEnchantLines(result)
  }
  if (normalizedConstraints.ignoreCorruptedImplicits) {
    result = stripCorruptedImplicitLines(result)
  }
  if (normalizedConstraints.ignoreQuality) {
    result = stripQualityLine(result)
  }
  if (normalizedConstraints.propertyPercentileFloor > 0) {
    result = applyPropertyPercentileFloor(result, normalizedConstraints.propertyPercentileFloor)
  }
  return result
}
function applyDisabledTargetKeys(targets, disabledTargetKeys) {
  const next = { ...targets }
  for (const key of disabledTargetKeys) {
    if (Object.prototype.hasOwnProperty.call(next, key)) {
      next[key] = 0
    }
  }
  return next
}

function applyTargetOverrides(targets, targetOverrides) {
  const next = { ...targets }
  for (const [key, value] of Object.entries(asRecord(targetOverrides))) {
    if (
      TARGET_KEY_ORDER.includes(key) &&
      typeof value === 'number' &&
      Number.isFinite(value) &&
      value >= 0
    ) {
      next[key] = value
    }
  }
  return next
}

function getStageConstraintContext(stageItem, searchConstraints) {
  const normalizedConstraints = normalizeSearchConstraints(searchConstraints)
  const normalizedSlot = normalizeSlot(stageItem?.slot)
  const slotOverride = normalizedSlot ? normalizedConstraints.slotOverrides?.[normalizedSlot] : null
  const disabledTargetKeys = slotOverride?.disabled_target_keys ?? []
  const targetOverrides = slotOverride?.target_overrides ?? {}
  const lineOverrides = slotOverride?.line_overrides ?? []
  const originalRawText = String(stageItem?.rawText ?? '')
  const normalizedRawText = sanitizeAnalysisRawText(
    applySearchConstraintRelaxation(originalRawText, normalizedConstraints),
  )

  return {
    rawText: normalizedRawText,
    originalRawText,
    targets: applyDisabledTargetKeys(
      applyTargetOverrides(extractRareTargets(normalizedRawText), targetOverrides),
      disabledTargetKeys,
    ),
    disabledTargetKeys,
    targetOverrides,
    lineOverrides,
    ignoreCraftedMods: normalizedConstraints.ignoreCraftedMods,
    ignoreEnchants: normalizedConstraints.ignoreEnchants,
    ignoreQuality: normalizedConstraints.ignoreQuality,
    ignoreCorruptedImplicits: normalizedConstraints.ignoreCorruptedImplicits,
    propertyPercentileFloor: normalizedConstraints.propertyPercentileFloor,
    normalizedSlot,
  }
}

function getSearchConstraintSignature(stageItem, searchConstraints) {
  const context = getStageConstraintContext(stageItem, searchConstraints)
  return JSON.stringify({
    ignoreCraftedMods: context.ignoreCraftedMods,
    ignoreEnchants: context.ignoreEnchants,
    ignoreQuality: context.ignoreQuality,
    ignoreCorruptedImplicits: context.ignoreCorruptedImplicits,
    propertyPercentileFloor: context.propertyPercentileFloor,
    disabledTargetKeys: context.disabledTargetKeys,
    targetOverrides: context.targetOverrides,
    lineOverrides: context.lineOverrides,
    slot: context.normalizedSlot,
  })
}

function scoreRareStageItemPriority(item, searchConstraints) {
  const normalizedSlot = normalizeSlot(item?.slot)
  const constraintContext = getStageConstraintContext(item, searchConstraints)
  const disabledTargetPenalty = constraintContext.disabledTargetKeys.length * 5
  return (RARE_SLOT_PRIORITY[normalizedSlot] ?? 0) + disabledTargetPenalty
}

function parseNumber(matchValue) {
  const parsed = Number(matchValue)
  return Number.isFinite(parsed) ? parsed : null
}

function toChaosEquivalent(amount, currency, options = {}) {
  const numericAmount = parseNumber(amount)
  const normalizedCurrency = trim(currency)?.toLowerCase()
  if (numericAmount == null || !normalizedCurrency) return null
  if (normalizedCurrency === 'chaos') return numericAmount
  if (normalizedCurrency === 'divine') {
    return numericAmount * normalizeDivineToChaosRate(options.divineToChaosRate)
  }
  return null
}

function uniqueBy(items, keyFn) {
  const seen = new Set()
  const result = []
  for (const item of items) {
    const key = keyFn(item)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }
  return result
}

function extractRareTargets(rawText) {
  const text = sanitizeAnalysisRawText(rawText)
  const targets = {
    life: 0,
    elementalRes: 0,
    chaosRes: 0,
    strength: 0,
    dexterity: 0,
    intelligence: 0,
    allAttributes: 0,
    movementSpeed: 0,
    attackSpeed: 0,
    critChance: 0,
    critMulti: 0,
    pdps: 0,
    edps: 0,
    weaponDps: 0,
    custom: 0,
  }

  for (const line of text.split(/\r?\n/)) {
    const normalized = line.trim()
    if (!normalized) continue

    const lifeMatch = normalized.match(/\+(\d+) to maximum Life/i)
    if (lifeMatch) targets.life += Number(lifeMatch[1])

    const fireResMatch = normalized.match(/\+(\d+)% to Fire Resistance/i)
    if (fireResMatch) targets.elementalRes += Number(fireResMatch[1])
    const coldResMatch = normalized.match(/\+(\d+)% to Cold Resistance/i)
    if (coldResMatch) targets.elementalRes += Number(coldResMatch[1])
    const lightningResMatch = normalized.match(/\+(\d+)% to Lightning Resistance/i)
    if (lightningResMatch) targets.elementalRes += Number(lightningResMatch[1])
    const allEleMatch = normalized.match(/\+(\d+)% to all Elemental Resistances/i)
    if (allEleMatch) targets.elementalRes += Number(allEleMatch[1]) * 3

    const chaosMatch = normalized.match(/\+(\d+)% to Chaos Resistance/i)
    if (chaosMatch) targets.chaosRes += Number(chaosMatch[1])

    const strengthMatch = normalized.match(/\+(\d+) to Strength/i)
    if (strengthMatch) targets.strength += Number(strengthMatch[1])
    const dexterityMatch = normalized.match(/\+(\d+) to Dexterity/i)
    if (dexterityMatch) targets.dexterity += Number(dexterityMatch[1])
    const intelligenceMatch = normalized.match(/\+(\d+) to Intelligence/i)
    if (intelligenceMatch) targets.intelligence += Number(intelligenceMatch[1])
    const allAttributesMatch = normalized.match(/\+(\d+) to all Attributes/i)
    if (allAttributesMatch) targets.allAttributes += Number(allAttributesMatch[1])

    const moveSpeedMatch = normalized.match(/(\d+)% increased Movement Speed/i)
    if (moveSpeedMatch)
      targets.movementSpeed = Math.max(targets.movementSpeed, Number(moveSpeedMatch[1]))

    const attackSpeedMatch = normalized.match(/(\d+)% increased Attack Speed/i)
    if (attackSpeedMatch)
      targets.attackSpeed = Math.max(targets.attackSpeed, Number(attackSpeedMatch[1]))

    const critChanceMatch = normalized.match(/\+(\d+)% to Global Critical Strike Chance/i)
    if (critChanceMatch)
      targets.critChance = Math.max(targets.critChance, Number(critChanceMatch[1]))

    const critMultiMatch = normalized.match(/\+(\d+)% to Global Critical Strike Multiplier/i)
    if (critMultiMatch) targets.critMulti = Math.max(targets.critMulti, Number(critMultiMatch[1]))
  }

  const physicalDamageMatch = text.match(/Physical Damage:\s*(\d+)-(\d+)/i)
  const elementalDamageLine = text.match(/Elemental Damage:\s*([^\r\n]+)/i)?.[1] ?? null
  const apsMatch = text.match(/Attacks per Second:\s*([\d.]+)/i)
  let edps = 0
  if (physicalDamageMatch && apsMatch) {
    const min = Number(physicalDamageMatch[1])
    const max = Number(physicalDamageMatch[2])
    const aps = Number(apsMatch[1])
    if (Number.isFinite(min) && Number.isFinite(max) && Number.isFinite(aps) && aps > 0) {
      targets.pdps = ((min + max) / 2) * aps
    }
  }

  if (elementalDamageLine && apsMatch) {
    const aps = Number(apsMatch[1])
    if (Number.isFinite(aps) && aps > 0) {
      const ranges = [...elementalDamageLine.matchAll(/(\d+)-(\d+)/g)]
      for (const range of ranges) {
        const min = Number(range[1])
        const max = Number(range[2])
        if (Number.isFinite(min) && Number.isFinite(max)) {
          edps += ((min + max) / 2) * aps
        }
      }
    }
  }

  targets.edps = edps
  targets.weaponDps = targets.pdps + edps

  return targets
}

function getPropertyValueString(property) {
  const values = Array.isArray(property?.values) ? property.values : []
  const rendered = values
    .map((entry) => (Array.isArray(entry) ? entry[0] : null))
    .filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
  if (rendered.length === 0) return null
  return rendered.join(', ')
}

function toProfileItemSearchText(item) {
  if (!item || typeof item !== 'object') return ''

  const lines = []
  for (const property of Array.isArray(item.properties) ? item.properties : []) {
    const name = trim(property?.name)
    const renderedValue = getPropertyValueString(property)
    if (!name || !renderedValue) continue
    lines.push(`${name.replace(/: \{0\} metres$/i, '')}: ${renderedValue}`)
  }

  for (const modListKey of ['implicitMods', 'explicitMods', 'craftedMods']) {
    for (const mod of Array.isArray(item[modListKey]) ? item[modListKey] : []) {
      const description = typeof mod === 'string' ? mod : mod?.description
      if (typeof description === 'string' && description.trim()) {
        lines.push(description.trim())
      }
    }
  }

  return lines.join('\n')
}

function resolveEquippedWeaponStats(stageItem, equippedItems) {
  if (normalizeSlot(stageItem?.slot) !== 'Weapon') {
    return { pdps: 0, edps: 0, weaponDps: 0 }
  }

  const currentWeapon =
    (Array.isArray(equippedItems) ? equippedItems : []).find(
      (item) => normalizeSlot(item?.slot ?? item?.inventoryId) === 'Weapon',
    ) ?? null

  const currentWeaponStats = extractRareTargets(toProfileItemSearchText(currentWeapon))
  return currentWeaponStats
}

function isLikelyPhysicalWeapon(rawText) {
  const text = sanitizeAnalysisRawText(rawText)
  const physicalSignals = [
    /Adds \d+ to \d+ Physical Damage/i,
    /\bincreased Physical Damage\b/i,
    /\bPhysical Damage\b/i,
  ]
  const elementalSignals = [
    /Adds \d+ to \d+ Fire Damage/i,
    /Adds \d+ to \d+ Cold Damage/i,
    /Adds \d+ to \d+ Lightning Damage/i,
    /\bElemental Damage\b/i,
  ]

  const physicalCount = physicalSignals.reduce(
    (count, pattern) => count + (pattern.test(text) ? 1 : 0),
    0,
  )
  const elementalCount = elementalSignals.reduce(
    (count, pattern) => count + (pattern.test(text) ? 1 : 0),
    0,
  )

  return physicalCount >= elementalCount
}

function extractSocketMetrics(rawText) {
  const normalizedRawText = sanitizeAnalysisRawText(rawText)
  const socketsLine = normalizedRawText.match(/Sockets:\s*([^\r\n]+)/i)?.[1] ?? null
  if (!socketsLine) {
    return { socketCount: 0, maxLinkCount: 0 }
  }

  const groups = socketsLine
    .split(/\s+/)
    .map((group) => group.trim())
    .filter(Boolean)
  const socketCount = groups.reduce(
    (count, group) => count + group.split('-').filter(Boolean).length,
    0,
  )
  const maxLinkCount = groups.reduce(
    (maxLinks, group) => Math.max(maxLinks, group.split('-').filter(Boolean).length),
    0,
  )

  return { socketCount, maxLinkCount }
}

function getMeaningfulLinkRequirement(stageItem) {
  const normalizedSlot = normalizeSlot(stageItem?.slot)
  const minimumLinks = Number(stageItem?.maxLinkCount ?? 0)
  if (minimumLinks >= 6 && (normalizedSlot === 'Weapon' || normalizedSlot === 'BodyArmour')) {
    return minimumLinks
  }
  return 0
}

function meetsSocketRequirements(stageItem, rawText) {
  const minimumLinks = getMeaningfulLinkRequirement(stageItem)
  if (minimumLinks <= 0) {
    return true
  }

  const candidateSockets = extractSocketMetrics(rawText)
  if (minimumLinks > 0 && candidateSockets.maxLinkCount < minimumLinks) {
    return false
  }
  return true
}

function buildSocketFilters(stageItem) {
  const minimumLinks = getMeaningfulLinkRequirement(stageItem)
  if (minimumLinks <= 0) {
    return null
  }

  return {
    socket_filters: {
      filters: {
        links: { min: minimumLinks },
      },
    },
  }
}

function buildPseudoFilters(slot, targets, ratio) {
  const normalizedSlot = normalizeSlot(slot)
  const entries = []

  if (targets.life > 0) {
    entries.push({
      id: PSEUDO_FILTERS.life,
      min: Math.max(35, Math.floor(targets.life * ratio)),
      weight: normalizedSlot === 'Weapon' ? 1 : 5,
    })
  }
  if (targets.elementalRes > 0) {
    entries.push({
      id: PSEUDO_FILTERS.elementalRes,
      min: Math.max(30, Math.floor(targets.elementalRes * ratio)),
      weight: [
        'Ring',
        'Ring2',
        'Amulet',
        'Belt',
        'Boots',
        'Gloves',
        'Helmet',
        'BodyArmour',
        'Offhand',
      ].includes(normalizedSlot)
        ? 5
        : 2,
    })
  }
  if (targets.chaosRes > 0) {
    entries.push({
      id: PSEUDO_FILTERS.chaosRes,
      min: Math.max(8, Math.floor(targets.chaosRes * ratio)),
      weight: 4,
    })
  }
  if (targets.allAttributes > 0) {
    entries.push({
      id: PSEUDO_FILTERS.allAttributes,
      min: Math.max(12, Math.floor(targets.allAttributes * ratio)),
      weight: 4,
    })
  }
  if (targets.strength > 0) {
    entries.push({
      id: PSEUDO_FILTERS.strength,
      min: Math.max(15, Math.floor(targets.strength * ratio)),
      weight: 3,
    })
  }
  if (targets.dexterity > 0) {
    entries.push({
      id: PSEUDO_FILTERS.dexterity,
      min: Math.max(15, Math.floor(targets.dexterity * ratio)),
      weight: 3,
    })
  }
  if (targets.intelligence > 0) {
    entries.push({
      id: PSEUDO_FILTERS.intelligence,
      min: Math.max(15, Math.floor(targets.intelligence * ratio)),
      weight: 3,
    })
  }
  if (targets.movementSpeed > 0) {
    entries.push({
      id: PSEUDO_FILTERS.movementSpeed,
      min: Math.max(20, Math.floor(targets.movementSpeed * ratio)),
      weight: normalizedSlot === 'Boots' ? 6 : 1,
    })
  }
  if (targets.attackSpeed > 0) {
    entries.push({
      id: PSEUDO_FILTERS.attackSpeed,
      min: Math.max(6, Math.floor(targets.attackSpeed * ratio)),
      weight: normalizedSlot === 'Weapon' || normalizedSlot === 'Gloves' ? 5 : 2,
    })
  }
  if (targets.critMulti > 0) {
    entries.push({
      id: PSEUDO_FILTERS.critMulti,
      min: Math.max(10, Math.floor(targets.critMulti * ratio)),
      weight:
        normalizedSlot === 'Amulet' || normalizedSlot === 'Ring' || normalizedSlot === 'Ring2'
          ? 4
          : 2,
    })
  }
  if (targets.critChance > 0) {
    entries.push({
      id: PSEUDO_FILTERS.critChance,
      min: Math.max(10, Math.floor(targets.critChance * ratio)),
      weight: normalizedSlot === 'Weapon' ? 4 : 2,
    })
  }

  return entries.sort((left, right) => right.weight - left.weight)
}

function buildSearchAttempts(stageItem, budgetChaos, equippedItems, searchConstraints) {
  const baseType = trim(stageItem?.typeLine)
  const slot = normalizeSlot(stageItem?.slot)
  const constraintContext = getStageConstraintContext(stageItem, searchConstraints)
  const lineOverrideMap = getLineOverrideMap(searchConstraints, stageItem?.slot)
  const targets = constraintContext.targets
  const equippedWeaponStats = resolveEquippedWeaponStats(stageItem, equippedItems)
  const preferPhysical = isLikelyPhysicalWeapon(constraintContext.rawText)
  const targetWeaponStatFloor = preferPhysical
    ? Math.max(targets.pdps, equippedWeaponStats.pdps, 0)
    : Math.max(
        targets.weaponDps,
        targets.pdps,
        equippedWeaponStats.weaponDps,
        equippedWeaponStats.pdps,
        0,
      )
  const socketFilters = buildSocketFilters(stageItem)
  if (!baseType || !slot || !Number.isFinite(budgetChaos) || budgetChaos <= 0) {
    return []
  }

  const attempts = []

  if (slot === 'Weapon') {
    const weaponConfigs =
      targetWeaponStatFloor > 0
        ? [
            { maxFilters: 3 },
            { maxFilters: 2 },
            { maxFilters: 1 },
            { maxFilters: 1 },
            { maxFilters: 0 },
          ]
        : [
            { maxFilters: 3 },
            { maxFilters: 2 },
            { maxFilters: 1 },
          ]

    for (const config of weaponConfigs) {
      const pseudoFilters = buildPseudoFilters(slot, targets, 1).slice(0, config.maxFilters)
      const weaponFilters = {
        ...((targetWeaponStatFloor > 0
          ? {
              [preferPhysical ? 'pdps' : 'dps']: {
                min: Math.max(250, Math.floor(targetWeaponStatFloor)),
              },
            }
          : {})),
        ...(buildExactWeaponPropertyFilters(constraintContext.rawText, targets, {
          valueRatio: 1,
          includeAps: true,
          includeCrit: true,
          lineOverrideMap,
        }) ?? {}),
      }
      attempts.push({
        baseType,
        body: {
          query: {
            status: { option: TRADE_STATUS_INSTANT_BUYOUT },
            type: baseType,
            filters: {
              trade_filters: {
                filters: {
                  price: { option: 'chaos', max: Math.max(1, Math.floor(budgetChaos)) },
                },
              },
              ...(socketFilters ?? {}),
              ...(Object.keys(weaponFilters).length > 0
                ? {
                    weapon_filters: {
                      filters: weaponFilters,
                    },
                  }
                : {}),
            },
            stats: pseudoFilters.length
              ? [
                  {
                    type: 'and',
                    filters: pseudoFilters.map((entry) => ({
                      id: entry.id,
                      value: { min: entry.min },
                    })),
                  },
                ]
              : [],
          },
          sort: { [preferPhysical ? 'pdps' : 'dps']: 'desc' },
        },
      })
    }
    return attempts
  }

  const configs = [
    { maxFilters: 4 },
    { maxFilters: 3 },
    { maxFilters: 2 },
  ]

  for (const config of configs) {
    const pseudoFilters = buildPseudoFilters(slot, targets, 1).slice(0, config.maxFilters)
    const armourFilters = buildExactArmourPropertyFilters(constraintContext.rawText, {
      valueRatio: 1,
      lineOverrideMap,
    })
    if (pseudoFilters.length === 0 && !armourFilters) continue
    attempts.push({
      baseType,
      body: {
        query: {
          status: { option: TRADE_STATUS_INSTANT_BUYOUT },
          type: baseType,
          filters: {
            trade_filters: {
              filters: {
                price: { option: 'chaos', max: Math.max(1, Math.floor(budgetChaos)) },
              },
            },
            ...(socketFilters ?? {}),
            ...(armourFilters
              ? {
                  armour_filters: {
                    filters: armourFilters,
                  },
                }
              : {}),
          },
          stats: pseudoFilters.length
            ? [
                {
                  type: 'and',
                  filters: pseudoFilters.map((entry) => ({
                    id: entry.id,
                    value: { min: entry.min },
                  })),
                },
              ]
            : [],
        },
        sort: { price: 'asc' },
      },
    })
  }

  return attempts
}

function scoreTradeCandidate(stageItem, rawText, priceChaos, searchConstraints) {
  const slot = normalizeSlot(stageItem?.slot)
  const constraintContext = getStageConstraintContext(stageItem, searchConstraints)
  const targetStats = constraintContext.targets
  const candidateStats = extractRareTargets(rawText)
  const safePrice = Number.isFinite(priceChaos) && priceChaos > 0 ? priceChaos : 1

  if (slot === 'Weapon') {
    const preferPhysical = isLikelyPhysicalWeapon(constraintContext.rawText)
    const offensiveScore = preferPhysical
      ? candidateStats.pdps * 1.35 +
        candidateStats.weaponDps * 0.2 +
        candidateStats.attackSpeed * 18 +
        candidateStats.critChance * 10 +
        candidateStats.critMulti * 7
      : candidateStats.weaponDps * 1.2 +
        candidateStats.pdps * 0.35 +
        candidateStats.attackSpeed * 18 +
        candidateStats.critChance * 10 +
        candidateStats.critMulti * 7

    const targetPressure = preferPhysical
      ? targetStats.pdps * 0.9 +
        targetStats.weaponDps * 0.15 +
        targetStats.attackSpeed * 14 +
        targetStats.critChance * 8 +
        targetStats.critMulti * 6
      : targetStats.weaponDps * 0.8 +
        targetStats.pdps * 0.2 +
        targetStats.attackSpeed * 14 +
        targetStats.critChance * 8 +
        targetStats.critMulti * 6

    return offensiveScore - targetPressure - safePrice * 0.02
  }

  const defensiveScore =
    candidateStats.life * 2.2 +
    candidateStats.elementalRes * 1.3 +
    candidateStats.chaosRes * 1.7 +
    candidateStats.allAttributes * 1.4 +
    candidateStats.strength * 0.65 +
    candidateStats.dexterity * 0.65 +
    candidateStats.intelligence * 0.65 +
    candidateStats.movementSpeed * 3.5 +
    candidateStats.attackSpeed * 2.4 +
    candidateStats.critChance * 1.6 +
    candidateStats.critMulti * 1.6

  const targetPressure =
    targetStats.life * 1.7 +
    targetStats.elementalRes * 1.1 +
    targetStats.chaosRes * 1.3 +
    targetStats.allAttributes * 1.1 +
    targetStats.strength * 0.5 +
    targetStats.dexterity * 0.5 +
    targetStats.intelligence * 0.5 +
    targetStats.movementSpeed * 2.8 +
    targetStats.attackSpeed * 1.8 +
    targetStats.critChance * 1.2 +
    targetStats.critMulti * 1.2

  return defensiveScore - targetPressure - safePrice * 0.03
}

function selectResultIdsForFetch(search, stageItem, maxResultsPerSlot) {
  const resultIds = Array.isArray(search?.result) ? search.result : []
  if (resultIds.length === 0) return []

  const slot = normalizeSlot(stageItem?.slot)
  const fetchWindow =
    slot === 'Weapon' ? Math.max(maxResultsPerSlot * 8, 18) : Math.max(maxResultsPerSlot * 6, 12)

  return resultIds.slice(0, fetchWindow)
}

function chunkArray(entries, chunkSize) {
  const result = []
  for (let index = 0; index < entries.length; index += chunkSize) {
    result.push(entries.slice(index, index + chunkSize))
  }
  return result
}

function buildUniqueSearchBody({ uniqueName, baseType, links }) {
  const normalizedLinks = Number(links)
  const socketFilters =
    Number.isFinite(normalizedLinks) && normalizedLinks >= 5
      ? {
          socket_filters: {
            filters: {
              links: { min: Math.floor(normalizedLinks) },
            },
          },
        }
      : null

  return {
    query: {
      status: { option: TRADE_STATUS_INSTANT_BUYOUT },
      name: uniqueName,
      type: baseType ?? undefined,
      ...(socketFilters ? { filters: socketFilters } : {}),
    },
    sort: { price: 'asc' },
  }
}

function buildExactRareSearchAttempts(candidate, options = {}) {
  const includePriceFilter = options.includePriceFilter !== false
  const slot = normalizeSlot(candidate?.slot)
  const baseType = trim(candidate?.baseType)
  const rawText = trim(candidate?.rawText)
  const priceChaos = Number(candidate?.chaosValue ?? 0)
  if (
    !slot ||
    !baseType ||
    !rawText ||
    (includePriceFilter && (!Number.isFinite(priceChaos) || priceChaos <= 0))
  ) {
    return []
  }

  const targets = extractRareTargets(rawText)
  const maxPrice =
    includePriceFilter && Number.isFinite(priceChaos) && priceChaos > 0
      ? Math.max(1, Math.ceil(priceChaos * 1.15 + 3))
      : null
  const attempts = []
  const socketFilters = buildSocketFilters({
    socketCount: extractSocketMetrics(rawText).socketCount,
    maxLinkCount: extractSocketMetrics(rawText).maxLinkCount,
  })

  if (slot === 'Weapon') {
    const weaponRatios =
      Math.max(targets.pdps, targets.weaponDps, 0) > 0
        ? [
            { ratio: 0.98, maxFilters: 3, minPdpsRatio: 0.98 },
            { ratio: 0.9, maxFilters: 2, minPdpsRatio: 0.9 },
            { ratio: 0.8, maxFilters: 2, minPdpsRatio: 0.8 },
            { ratio: 0.68, maxFilters: 1, minPdpsRatio: 0.68 },
            { ratio: 0.55, maxFilters: 0, minPdpsRatio: 0.55 },
          ]
        : [
            { ratio: 0.98, maxFilters: 3 },
            { ratio: 0.9, maxFilters: 2 },
            { ratio: 0.82, maxFilters: 1 },
          ]

    for (const config of weaponRatios) {
      const pseudoFilters = buildPseudoFilters(
        slot,
        targets,
        Math.max(0.8, config.ratio - 0.05),
      ).slice(0, config.maxFilters)
      attempts.push({
        body: {
          query: {
            status: { option: TRADE_STATUS_INSTANT_BUYOUT },
            type: baseType,
            filters: {
              ...(maxPrice
                ? {
                    trade_filters: {
                      filters: {
                        price: { option: 'chaos', max: maxPrice },
                      },
                    },
                  }
                : {}),
              ...(socketFilters ?? {}),
              ...(targets.pdps > 0 && config.minPdpsRatio
                ? {
                    weapon_filters: {
                      filters: {
                        pdps: {
                          min: Math.max(150, Math.floor(targets.pdps * config.minPdpsRatio)),
                        },
                      },
                    },
                  }
                : {}),
            },
            stats: pseudoFilters.length
              ? [
                  {
                    type: 'and',
                    filters: pseudoFilters.map((entry) => ({
                      id: entry.id,
                      value: { min: entry.min },
                    })),
                  },
                ]
              : [],
          },
          sort: { dps: 'desc' },
        },
      })
    }
    return attempts
  }

  for (const config of [
    { ratio: 0.98, maxFilters: 5 },
    { ratio: 0.93, maxFilters: 4 },
    { ratio: 0.88, maxFilters: 3 },
  ]) {
    const pseudoFilters = buildPseudoFilters(slot, targets, config.ratio).slice(
      0,
      config.maxFilters,
    )
    if (pseudoFilters.length === 0) continue
    attempts.push({
      body: {
        query: {
          status: { option: TRADE_STATUS_INSTANT_BUYOUT },
          type: baseType,
          filters: {
            ...(maxPrice
              ? {
                  trade_filters: {
                    filters: {
                      price: { option: 'chaos', max: maxPrice },
                    },
                  },
                }
              : {}),
            ...(socketFilters ?? {}),
          },
          stats: [
            {
              type: 'and',
              filters: pseudoFilters.map((entry) => ({
                id: entry.id,
                value: { min: entry.min },
              })),
            },
          ],
        },
        sort: { price: 'asc' },
      },
    })
  }

  return attempts
}

async function fetchJson(url, init = {}, { requestPacing = null } = {}) {
  const requestInfo = {
    ...classifyTradeRequest(url),
    timestampMs: null,
  }
  const response = await withTradeRequestPacing(requestPacing, async () => {
    const rateLimitWaitMs = getTradeRateLimitWaitMs(requestInfo.policyName)
    if (rateLimitWaitMs > 0) {
      await sleep(rateLimitWaitMs)
    }

    requestInfo.timestampMs = Date.now()
    noteTradeRateLimitRequest(requestInfo.policyName, requestInfo.timestampMs)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TRADE_FETCH_TIMEOUT_MS)
    try {
      return await fetch(url, {
        ...init,
        signal: init.signal ?? controller.signal,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': process.env.POE_TRADE_USER_AGENT || DEFAULT_USER_AGENT,
          ...(init.headers ?? {}),
        },
      })
    } finally {
      clearTimeout(timeout)
    }
  })
  updateTradeRatePolicyFromResponse(requestInfo, response)

  if (!response.ok) {
    const text = await response.text()
    if (response.status === 429) {
      const retryAfterHeader = response.headers.get('retry-after')
      const retryAfterFromHeader = retryAfterHeader ? Number(retryAfterHeader) * 1000 : null
      const retryAfterFromBodyMatch = text.match(/wait\s+(\d+)\s+seconds/i)
      const retryAfterFromBody = retryAfterFromBodyMatch
        ? Number(retryAfterFromBodyMatch[1]) * 1000
        : null
      const retryAfterMs = Number.isFinite(retryAfterFromHeader)
        ? retryAfterFromHeader
        : Number.isFinite(retryAfterFromBody)
          ? retryAfterFromBody
          : null
      const policyState = requestInfo.policyName
        ? getOrCreateTradeRatePolicy(requestInfo.policyName)
        : null
      if (policyState && Number.isFinite(retryAfterMs) && retryAfterMs > 0) {
        policyState.retryAfterAtMs = Math.max(policyState.retryAfterAtMs ?? 0, Date.now() + retryAfterMs)
      }
      const error = new Error(`Trade API rate limit exceeded for ${url}`)
      error.code = 'TRADE_RATE_LIMIT'
      error.retryAfterMs = Number.isFinite(retryAfterMs) ? retryAfterMs : null
      error.rateLimitDetail = text
      throw error
    }
    throw new Error(`Trade API request failed (${response.status}) ${url}: ${text}`)
  }

  return response.json()
}

function decodeTradeItemText(encoded) {
  const value = trim(encoded)
  if (!value) return null
  return Buffer.from(value, 'base64').toString('utf8')
}

function buildSearchLink(league, queryId) {
  const normalizedLeague = trim(league)
  const normalizedQueryId = trim(queryId)
  if (!normalizedLeague || !normalizedQueryId) return null
  return `${TRADE_SITE_BASE_URL}/${encodeURIComponent(normalizedLeague)}/${encodeURIComponent(normalizedQueryId)}`
}

function buildQuerySearchLink(league, queryBody) {
  const normalizedLeague = trim(league)
  if (
    !normalizedLeague ||
    !queryBody ||
    typeof queryBody !== 'object' ||
    Array.isArray(queryBody)
  ) {
    return null
  }

  return `${TRADE_SITE_BASE_URL}/${encodeURIComponent(normalizedLeague)}?q=${encodeURIComponent(JSON.stringify(queryBody))}`
}

async function runUniqueSearch({ league, uniqueName, baseType, links }) {
  const normalizedLeague = trim(league)
  const normalizedUniqueName = trim(uniqueName)
  const normalizedBaseType = trim(baseType)
  if (!normalizedLeague || !normalizedUniqueName) {
    return { searchLink: null, queryId: null }
  }

  const cacheKey = getUniqueSearchCacheKey({
    league: normalizedLeague,
    uniqueName: normalizedUniqueName,
    baseType: normalizedBaseType,
    links,
  })
  const cached = uniqueSearchCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return { searchLink: cached.searchLink ?? null, queryId: cached.queryId ?? null }
  }

  let search
  try {
    search = await fetchJson(
      `${TRADE_API_BASE_URL}/search/${encodeURIComponent(normalizedLeague)}`,
      {
        method: 'POST',
        body: JSON.stringify(
          buildUniqueSearchBody({
            uniqueName: normalizedUniqueName,
            baseType: normalizedBaseType,
            links,
          }),
        ),
      },
    )
  } catch (error) {
    if (error?.code === 'TRADE_RATE_LIMIT') {
      return { searchLink: null, queryId: null }
    }
    throw error
  }

  const queryId = trim(search?.id)
  const searchLink = buildSearchLink(normalizedLeague, queryId)
  uniqueSearchCache.set(cacheKey, {
    expiresAt: Date.now() + UNIQUE_SEARCH_CACHE_TTL_MS,
    queryId,
    searchLink,
  })

  return { searchLink, queryId }
}

async function runRareSlotSearch({
  league,
  budgetChaos,
  stageItem,
  equippedItems,
  searchConstraints,
  rareSlotContext,
  divineToChaosRate,
  maxResultsPerSlot = 6,
  requestPacing = null,
}) {
  const normalizedLeague = trim(league)
  if (!normalizedLeague || !Number.isFinite(budgetChaos) || budgetChaos <= 0) {
    return { items: [], searchLink: null }
  }

  const normalizedRequestPacing = normalizeTradeRequestPacing(requestPacing)

  const cacheKey = getRareSearchCacheKey({
    league: normalizedLeague,
    budgetChaos,
    stageItem,
    equippedItems,
    searchConstraints,
    rareSlotContext,
  })
  const cached = rareSearchCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return {
      items: cached.items,
      searchLink: cached.searchLink ?? null,
      diagnostics: {
        slot: trim(stageItem?.slot),
        rate_limited: false,
        used_cached_items: true,
        cached_item_count: Array.isArray(cached.items) ? cached.items.length : 0,
        candidate_count: Array.isArray(cached.items) ? cached.items.length : 0,
        search_link: cached.searchLink ?? null,
        live_search_status:
          Array.isArray(cached.items) && cached.items.length > 0 ? 'found_listings' : 'no_listings',
        request_pacing: normalizedRequestPacing,
      },
    }
  }

  const exactAttempts = await buildExactStageSearchAttempts(
    stageItem,
    budgetChaos,
    searchConstraints,
    {
      includePriceFilter: false,
    },
  )
  const requiredSourceEffects = getRequiredSourceEffectsForStageItem(stageItem, rareSlotContext)
  const attempts = exactAttempts
  const stageConstraintContext = getStageConstraintContext(stageItem, searchConstraints)
  const shouldFlagEssentialCrafts = stageConstraintContext.ignoreCraftedMods === true
  const targetEssentialCrafts = shouldFlagEssentialCrafts
    ? detectEssentialCraftsOnTarget(stageConstraintContext.originalRawText)
    : []
  let slotCandidates = []
  const seenCandidateKeys = new Set()
  let searchLink = null
  let attemptedSearchCount = 0

  for (const attempt of attempts) {
    attemptedSearchCount += 1
    let search
    try {
      search = await fetchJson(
        `${TRADE_API_BASE_URL}/search/${encodeURIComponent(normalizedLeague)}`,
        {
          method: 'POST',
          body: JSON.stringify(attempt.body),
        },
        {
          requestPacing: normalizedRequestPacing,
        },
      )
    } catch (error) {
      if (error?.code === 'TRADE_RATE_LIMIT') {
        return {
          items: Array.isArray(cached?.items) ? cached.items : [],
          searchLink: cached?.searchLink ?? null,
          diagnostics: {
            slot: trim(stageItem?.slot),
            rate_limited: true,
            retry_after_ms:
              typeof error?.retryAfterMs === 'number' && Number.isFinite(error.retryAfterMs)
                ? error.retryAfterMs
                : null,
            request_pacing: normalizedRequestPacing,
            used_stale_cache: Array.isArray(cached?.items) && cached.items.length > 0,
            cached_item_count: Array.isArray(cached?.items) ? cached.items.length : 0,
            search_link: cached?.searchLink ?? null,
            live_search_status:
              Array.isArray(cached?.items) && cached.items.length > 0
                ? 'found_listings'
                : 'rate_limited',
          },
        }
      }
      throw error
    }

    const queryId = trim(search?.id)
    if (queryId) {
      searchLink = buildSearchLink(normalizedLeague, queryId)
    }
    const resultIds = selectResultIdsForFetch(search, stageItem, maxResultsPerSlot)
    if (!queryId || resultIds.length === 0) {
      continue
    }

    for (const batch of chunkArray(resultIds, 10)) {
      let fetchResult
      try {
        fetchResult = await fetchJson(
          `${TRADE_API_BASE_URL}/fetch/${batch.join(',')}?query=${encodeURIComponent(queryId)}`,
          {},
          {
            requestPacing: normalizedRequestPacing,
          },
        )
      } catch (error) {
        if (error?.code === 'TRADE_RATE_LIMIT') {
          return {
            items: Array.isArray(cached?.items) ? cached.items : [],
            searchLink: cached?.searchLink ?? searchLink,
            diagnostics: {
              slot: trim(stageItem?.slot),
              rate_limited: true,
              retry_after_ms:
                typeof error?.retryAfterMs === 'number' && Number.isFinite(error.retryAfterMs)
                  ? error.retryAfterMs
                  : null,
              request_pacing: normalizedRequestPacing,
              used_stale_cache: Array.isArray(cached?.items) && cached.items.length > 0,
              cached_item_count: Array.isArray(cached?.items) ? cached.items.length : 0,
              search_link: cached?.searchLink ?? searchLink,
              live_search_status:
                Array.isArray(cached?.items) && cached.items.length > 0
                  ? 'found_listings'
                  : 'rate_limited',
            },
          }
        }
        throw error
      }

      for (const entry of Array.isArray(fetchResult?.result) ? fetchResult.result : []) {
        if (!entry?.item || !entry?.listing) continue
        const rawText = sanitizeAnalysisRawText(decodeTradeItemText(entry.item?.extended?.text))
        const priceAmount = parseNumber(entry.listing?.price?.amount)
        const priceCurrency = trim(entry.listing?.price?.currency)?.toLowerCase()
        const chaosEquivalent = toChaosEquivalent(priceAmount, priceCurrency, {
          divineToChaosRate,
        })
        if (!rawText || priceAmount == null || chaosEquivalent == null) continue
        if (!meetsSocketRequirements(stageItem, rawText)) continue
        if (
          requiredSourceEffects.length > 0 &&
          !candidateSatisfiesRequiredSourceEffects(rawText, requiredSourceEffects)
        ) {
          continue
        }

        const missingEssentialCrafts =
          targetEssentialCrafts.length > 0
            ? targetEssentialCrafts.filter((craft) => !hasEssentialCraft(rawText, craft.id))
            : []
        const candidate = {
          slot: trim(stageItem.slot),
          baseType: trim(stageItem.typeLine),
          itemName:
            trim(entry.item?.name) || trim(entry.item?.typeLine) || trim(stageItem.typeLine),
          chaosValue: chaosEquivalent,
          listingPriceAmount: priceAmount,
          listingPriceCurrency: priceCurrency,
          tradeLink: buildSearchLink(normalizedLeague, queryId),
          tradeLinkKind: 'trade_search',
          tradeQueryId: queryId,
          tradeResultId: trim(entry.id) ?? trim(entry.item?.id),
          iconUrl: trim(entry.item?.icon),
          rawText,
          missingEssentialCrafts,
          shortlistScore: scoreTradeCandidate(
            stageItem,
            rawText,
            chaosEquivalent,
            searchConstraints,
          ),
        }
        const candidateKey =
          trim(candidate.tradeResultId) ??
          `${trim(candidate.baseType)}::${trim(candidate.itemName)}::${trim(candidate.rawText)}`
        if (!candidateKey || seenCandidateKeys.has(candidateKey)) {
          continue
        }
        seenCandidateKeys.add(candidateKey)
        slotCandidates.push(candidate)
      }
    }

    if (slotCandidates.length > 0) {
      slotCandidates = slotCandidates.sort((left, right) => {
        const leftScore = Number(left?.shortlistScore ?? 0)
        const rightScore = Number(right?.shortlistScore ?? 0)
        if (leftScore !== rightScore) {
          return rightScore - leftScore
        }
        return Number(left?.chaosValue ?? 0) - Number(right?.chaosValue ?? 0)
      })
      if (slotCandidates.length >= maxResultsPerSlot) {
        break
      }
    }
  }

  slotCandidates = slotCandidates
    .slice(0, maxResultsPerSlot)
    .map(({ shortlistScore, ...candidate }) => candidate)

  rareSearchCache.set(cacheKey, {
    expiresAt: Date.now() + RARE_SEARCH_CACHE_TTL_MS,
    items: slotCandidates,
    searchLink,
  })

  return {
    items: slotCandidates,
    searchLink,
    diagnostics: {
      slot: trim(stageItem?.slot),
      rate_limited: false,
      used_cached_items: false,
      cached_item_count: 0,
      candidate_count: slotCandidates.length,
      attempt_count: attemptedSearchCount,
      search_link: searchLink,
      live_search_status: slotCandidates.length > 0 ? 'found_listings' : 'no_listings',
      request_pacing: normalizedRequestPacing,
    },
  }
}

export async function getRareTradeLinkForStageItem({
  league,
  budgetChaos,
  stageItem,
  searchConstraints,
  divineToChaosRate,
}) {
  const result = await runRareSlotSearch({
    league,
    budgetChaos,
    stageItem,
    searchConstraints,
    divineToChaosRate,
    maxResultsPerSlot: 1,
  })
  return result.searchLink
}

export async function getPreciseRareTradeLink({ league, candidate }) {
  const normalizedLeague = trim(league)
  if (!normalizedLeague) return null

  const cacheKey = getExactRareSearchCacheKey({ league: normalizedLeague, candidate })
  const cached = exactRareSearchCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.searchLink ?? null
  }

  const attempts = buildExactRareSearchAttempts(candidate)
  for (const attempt of attempts) {
    let search
    try {
      search = await fetchJson(
        `${TRADE_API_BASE_URL}/search/${encodeURIComponent(normalizedLeague)}`,
        {
          method: 'POST',
          body: JSON.stringify(attempt.body),
        },
      )
    } catch (error) {
      if (error?.code === 'TRADE_RATE_LIMIT') {
        return null
      }
      throw error
    }

    const queryId = trim(search?.id)
    const resultIds = Array.isArray(search?.result) ? search.result : []
    if (!queryId || resultIds.length === 0) continue

    const searchLink = buildSearchLink(normalizedLeague, queryId)
    exactRareSearchCache.set(cacheKey, {
      expiresAt: Date.now() + EXACT_RARE_SEARCH_CACHE_TTL_MS,
      searchLink,
    })
    return searchLink
  }

  exactRareSearchCache.set(cacheKey, {
    expiresAt: Date.now() + EXACT_RARE_SEARCH_CACHE_TTL_MS,
    searchLink: null,
  })
  return null
}

function roundDown(value, decimals = 0) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }

  const factor = 10 ** Math.max(0, decimals)
  return Math.floor(value * factor) / factor
}

function buildMinimumValue(value, ratio, { floor = 0, decimals = 0 } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null
  }

  const scaled = roundDown(value * ratio, decimals)
  if (scaled == null) return null
  return Math.max(floor, scaled)
}

function roundDisplayValue(value, decimals = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }

  const factor = 10 ** Math.max(0, decimals)
  return Math.round(value * factor) / factor
}

function extractNumericProperty(rawText, pattern) {
  const match = sanitizeAnalysisRawText(rawText).match(pattern)
  if (!match?.[1]) return null

  const numeric = Number(String(match[1]).replace(/,/g, ''))
  return Number.isFinite(numeric) ? numeric : null
}

const IGNORED_TRADE_PROPERTY_NAMES = new Set(['crafted', 'prefix', 'suffix', 'catalyst'])

function isIgnoredTradeMetadataLine(line) {
  const normalized = normalizeWhitespace(line).toLowerCase()
  return (
    normalized.startsWith('crafted:') ||
    normalized.startsWith('prefix:') ||
    normalized.startsWith('suffix:') ||
    normalized.startsWith('catalyst:')
  )
}

function parsePropertyLine(line) {
  if (normalizeWhitespace(line).startsWith('{')) return null

  const match = String(line ?? '').match(/^([^:]+):\s*(.+)$/)
  if (!match?.[1] || !match[2]) return null

  let name = normalizeWhitespace(match[1])
  if (IGNORED_TRADE_PROPERTY_NAMES.has(name.toLowerCase())) {
    return null
  }
  if (name.toLowerCase() === 'catalystquality') {
    name = 'Quality'
  }

  return {
    name,
    value: normalizeWhitespace(match[2]),
  }
}

function normalizeSearchLineIdFragment(value) {
  return normalizeWhitespace(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

function getPropertySearchLineId(name) {
  return `property-${normalizeSearchLineIdFragment(name)}`
}

function isRequirementPropertyName(name) {
  const normalized = normalizeWhitespace(name).toLowerCase()
  return (
    normalized === 'levelreq' ||
    normalized === 'str' ||
    normalized === 'dex' ||
    normalized === 'int'
  )
}

function normalizeTradeMarker(marker) {
  return normalizeWhitespace(marker).toLowerCase().replace(/[{}]/g, ' ').trim()
}

function getExactTradeModifierSectionKey(marker) {
  const normalized = normalizeTradeMarker(marker)
  if (normalized === 'enchant' || normalized === 'enchanted') return 'enchant'
  if (normalized === 'implicit') return 'implicit'
  // Fractured mods should broaden into ordinary stat targets instead of forcing
  // fractured-only searches and trade links.
  if (normalized === 'fractured') return 'explicit'
  if (normalized === 'crafted') return 'crafted'
  if (normalized === 'veiled') return 'veiled'
  return null
}

function normalizeTradeModifierSectionKey(marker) {
  return getExactTradeModifierSectionKey(marker) ?? 'explicit'
}

function stripTrailingTradeModifierSuffixes(line) {
  let nextLine = normalizeWhitespace(line)
  let detectedKey = null

  while (true) {
    const suffixMatch = String(nextLine ?? '').match(
      /^(.*?)\s+\((implicit|crafted|fractured|veiled|enchant(?:ed)?)\)\s*$/i,
    )
    if (!suffixMatch?.[1] || !suffixMatch[2]) {
      break
    }

    detectedKey ||= normalizeTradeModifierSectionKey(suffixMatch[2])
    nextLine = normalizeWhitespace(suffixMatch[1])
  }

  return { key: detectedKey, line: nextLine }
}

function stripLeadingTradeModifierBlocks(line) {
  let nextLine = normalizeWhitespace(line)
  const markers = []

  while (nextLine.startsWith('{')) {
    const match = nextLine.match(/^\{([^}]*)\}(.*)$/)
    if (!match) break

    markers.push(normalizeWhitespace(match[1]))
    nextLine = String(match[2] ?? '').trimStart()
  }

  return { markers, line: nextLine }
}

function stripInlineTradeModifierMarker(line) {
  const strippedPrefix = stripLeadingTradeModifierBlocks(line)
  const prefixKey =
    strippedPrefix.markers.map(getExactTradeModifierSectionKey).find(Boolean) ?? null
  const strippedSuffix = stripTrailingTradeModifierSuffixes(strippedPrefix.line)
  return { key: prefixKey ?? strippedSuffix.key, line: strippedSuffix.line }
}

function mapInfluenceLineToPseudoId(line) {
  switch (normalizeWhitespace(line)) {
    case 'Shaper Item':
      return 'pseudo.pseudo_has_shaper_influence'
    case 'Elder Item':
      return 'pseudo.pseudo_has_elder_influence'
    case 'Crusader Item':
      return 'pseudo.pseudo_has_crusader_influence'
    case 'Redeemer Item':
      return 'pseudo.pseudo_has_redeemer_influence'
    case 'Hunter Item':
      return 'pseudo.pseudo_has_hunter_influence'
    case 'Warlord Item':
      return 'pseudo.pseudo_has_warlord_influence'
    default:
      return null
  }
}

function parseRareItemTradeContext(rawText) {
  const lines = sanitizeAnalysisRawText(rawText)
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)

  const nonSeparatorLines = lines.filter((line) => line !== '--------')
  const rarityIndex = nonSeparatorLines.findIndex((line) => line.startsWith('Rarity:'))
  const title = rarityIndex >= 0 ? (nonSeparatorLines[rarityIndex + 1] ?? null) : null
  const baseLine = rarityIndex >= 0 ? (nonSeparatorLines[rarityIndex + 2] ?? null) : null

  const properties = {}
  const requirements = {}
  const modifierLines = []
  const influencePseudoIds = new Set()
  const flags = {
    corrupted: false,
    fractured: false,
    synthesised: false,
    veiled: false,
  }

  let inRequirements = false
  let currentModifierKey = 'explicit'
  let implicitLinesRemaining = 0
  let modifierLineIndex = 0

  for (const line of lines) {
    if (line === '--------') {
      if (inRequirements) {
        inRequirements = false
      }
      continue
    }
    if (line.startsWith('Rarity:')) continue
    if (line === title || line === baseLine) continue
    if (line.startsWith('Item Class:')) continue
    if (line.startsWith('Unique ID:')) continue
    if (line.startsWith('League:')) continue
    if (line.startsWith('Note:')) continue
    if (line.startsWith('Split Tag:')) continue
    if (isIgnoredTradeMetadataLine(line)) continue
    if (/xbasepercentile/i.test(line)) continue

    if (line.startsWith('Requirements:')) {
      inRequirements = true
      continue
    }

    const implicitMatch = line.match(/^Implicits:\s*(\d+)/i)
    if (implicitMatch) {
      implicitLinesRemaining = Number(implicitMatch[1] ?? 0)
      continue
    }

    const standaloneMarkerKey =
      line.startsWith('{') && line.endsWith('}') ? getExactTradeModifierSectionKey(line) : null
    if (standaloneMarkerKey) {
      currentModifierKey = standaloneMarkerKey
      continue
    }

    const property = parsePropertyLine(line)
    if (property) {
      if (inRequirements || isRequirementPropertyName(property.name)) {
        requirements[property.name] = property.value
      } else {
        properties[property.name] = property.value
      }
      continue
    }

    if (line === 'Corrupted') {
      flags.corrupted = true
      continue
    }
    if (line.includes('Fractured Item')) {
      flags.fractured = true
      continue
    }
    if (line.includes('Synthesised Item')) {
      flags.synthesised = true
      continue
    }
    if (line.includes('Veiled Item')) {
      flags.veiled = true
      continue
    }

    const influencePseudoId = mapInfluenceLineToPseudoId(line)
    if (influencePseudoId) {
      influencePseudoIds.add(influencePseudoId)
      continue
    }

    const inlineMarker = stripInlineTradeModifierMarker(line)
    const cleanedLine = normalizeWhitespace(inlineMarker.line)
    if (!cleanedLine) continue

    let category = inlineMarker.key ?? currentModifierKey
    if (implicitLinesRemaining > 0) {
      if (category === 'crafted') {
        category = 'enchant'
      } else if (category === 'explicit') {
        category = 'implicit'
      }
    }

    modifierLines.push({
      line_id: `modifier-${modifierLineIndex}`,
      line: cleanedLine,
      category,
      isImplicit: implicitLinesRemaining > 0,
    })
    modifierLineIndex += 1

    if (implicitLinesRemaining > 0) {
      implicitLinesRemaining -= 1
    }
  }

  return {
    properties,
    requirements,
    modifierLines,
    influencePseudoIds: Array.from(influencePseudoIds),
    flags,
  }
}

function getEditableLineTarget(modLine) {
  const line = normalizeWhitespace(modLine?.line)
  if (!line) return null

  const lifeMatch = line.match(/\+(\d+) to maximum Life/i)
  if (lifeMatch) {
    return { targetKey: 'life', defaultValue: Number(lifeMatch[1]) }
  }

  const fireResMatch = line.match(/\+(\d+)% to Fire Resistance/i)
  if (fireResMatch) {
    return { targetKey: 'elementalRes', defaultValue: Number(fireResMatch[1]) }
  }
  const coldResMatch = line.match(/\+(\d+)% to Cold Resistance/i)
  if (coldResMatch) {
    return { targetKey: 'elementalRes', defaultValue: Number(coldResMatch[1]) }
  }
  const lightningResMatch = line.match(/\+(\d+)% to Lightning Resistance/i)
  if (lightningResMatch) {
    return { targetKey: 'elementalRes', defaultValue: Number(lightningResMatch[1]) }
  }
  const allElementalResMatch = line.match(/\+(\d+)% to all Elemental Resistances/i)
  if (allElementalResMatch) {
    return { targetKey: 'elementalRes', defaultValue: Number(allElementalResMatch[1]) }
  }

  const chaosResMatch = line.match(/\+(\d+)% to Chaos Resistance/i)
  if (chaosResMatch) {
    return { targetKey: 'chaosRes', defaultValue: Number(chaosResMatch[1]) }
  }

  const strengthMatch = line.match(/\+(\d+) to Strength/i)
  if (strengthMatch) {
    return { targetKey: 'strength', defaultValue: Number(strengthMatch[1]) }
  }
  const dexterityMatch = line.match(/\+(\d+) to Dexterity/i)
  if (dexterityMatch) {
    return { targetKey: 'dexterity', defaultValue: Number(dexterityMatch[1]) }
  }
  const intelligenceMatch = line.match(/\+(\d+) to Intelligence/i)
  if (intelligenceMatch) {
    return { targetKey: 'intelligence', defaultValue: Number(intelligenceMatch[1]) }
  }
  const allAttributesMatch = line.match(/\+(\d+) to all Attributes/i)
  if (allAttributesMatch) {
    return { targetKey: 'allAttributes', defaultValue: Number(allAttributesMatch[1]) }
  }

  const movementSpeedMatch = line.match(/(\d+)% increased Movement Speed/i)
  if (movementSpeedMatch) {
    return { targetKey: 'movementSpeed', defaultValue: Number(movementSpeedMatch[1]) }
  }
  const attackSpeedMatch = line.match(/(\d+)% increased Attack Speed/i)
  if (attackSpeedMatch) {
    return { targetKey: 'attackSpeed', defaultValue: Number(attackSpeedMatch[1]) }
  }
  const critChanceMatch = line.match(/\+(\d+)% to Global Critical Strike Chance/i)
  if (critChanceMatch) {
    return { targetKey: 'critChance', defaultValue: Number(critChanceMatch[1]) }
  }
  const critMultiMatch = line.match(/\+(\d+)% to Global Critical Strike Multiplier/i)
  if (critMultiMatch) {
    return { targetKey: 'critMulti', defaultValue: Number(critMultiMatch[1]) }
  }

  return {
    targetKey: 'custom',
    defaultValue: buildGenericEditableLineValue(extractTradeFilterNumbers(line)),
  }
}

function getLineOverrideMap(searchConstraints, slot) {
  const normalizedConstraints = normalizeSearchConstraints(searchConstraints)
  const normalizedSlot = normalizeSlot(slot)
  const lineOverrides = normalizedSlot
    ? (normalizedConstraints.slotOverrides?.[normalizedSlot]?.line_overrides ?? [])
    : []
  return new Map(lineOverrides.map((entry) => [entry.line_id, entry]))
}

function getModifierLineFilterRatio(modLine, lineOverrideMap, disabledTargetKeySet = new Set()) {
  const lineOverride = lineOverrideMap.get(trim(modLine?.line_id))
  if (!lineOverride) {
    const editableTarget = getEditableLineTarget(modLine)
    if (editableTarget && disabledTargetKeySet.has(editableTarget.targetKey)) {
      return { enabled: false, valueRatio: 0 }
    }
    return { enabled: true, valueRatio: 1 }
  }
  if (lineOverride.enabled === false) {
    return { enabled: false, valueRatio: 0 }
  }

  const editableTarget = getEditableLineTarget(modLine)
  if (
    editableTarget &&
    typeof lineOverride.value === 'number' &&
    Number.isFinite(lineOverride.value) &&
    lineOverride.value >= 0 &&
    editableTarget.defaultValue > 0
  ) {
    return {
      enabled: true,
      valueRatio: lineOverride.value / editableTarget.defaultValue,
    }
  }

  return { enabled: true, valueRatio: 1 }
}

function resolvePropertyFilterValue(lineOverrideMap, propertyName, defaultValue) {
  const lineOverride = lineOverrideMap.get(getPropertySearchLineId(propertyName))
  if (!lineOverride) {
    return { enabled: true, value: defaultValue }
  }

  if (lineOverride.enabled === false) {
    return { enabled: false, value: null }
  }

  if (
    typeof lineOverride.value === 'number' &&
    Number.isFinite(lineOverride.value) &&
    lineOverride.value >= 0
  ) {
    return { enabled: true, value: lineOverride.value }
  }

  return { enabled: true, value: defaultValue }
}

function normalizeTradeMatchText(value, { stripLocalSuffix = false } = {}) {
  let normalized = String(value ?? '').replace(/\r?\n/g, ' ')
  if (stripLocalSuffix) {
    normalized = normalized.replace(/\s+\(Local\)/gi, '')
  }

  return normalizeWhitespace(normalized.replace(/[#,()0-9%+\-.,]/g, ' ')).toLowerCase()
}

function getTradeModifierGroupPriority(category) {
  switch (category) {
    case 'crafted':
      return ['crafted', 'explicit']
    case 'fractured':
      return ['fractured', 'explicit']
    case 'veiled':
      return ['veiled', 'explicit']
    case 'enchant':
      return ['enchant', 'implicit', 'crafted', 'explicit']
    case 'implicit':
      return ['implicit', 'enchant', 'explicit']
    default:
      return ['explicit', 'crafted', 'fractured', 'veiled']
  }
}

function getTradeSpecialCaseVariants(line, slot) {
  const variants = new Set([normalizeWhitespace(line)])

  if (normalizeSlot(slot) === 'Offhand' && /Chance to Block$/i.test(line)) {
    variants.add(`${normalizeWhitespace(line)} (Shields)`)
  }

  const replacements = [
    ['You can apply an additional Curse', 'You can apply 1 additional Curses'],
    ['Bow Attacks fire an additional Arrow', 'Bow Attacks fire 1 additional Arrows'],
    ['Projectiles Pierce an additional Target', 'Projectiles Pierce 1 additional Targets'],
    ['Has 1 Abyssal Socket', 'Has 1 Abyssal Sockets'],
    ['Flasks gain a Charge every 3 seconds', 'Flasks gain 1 Charges every 3 seconds'],
  ]

  for (const [source, replacement] of replacements) {
    if (normalizeWhitespace(line) === source) {
      variants.add(replacement)
    }
  }

  return Array.from(variants)
}

function isLikelyLocalWeaponStat(line, slot) {
  const normalizedSlot = normalizeSlot(slot)
  if (normalizedSlot !== 'Weapon' && normalizedSlot !== 'Offhand') {
    return false
  }

  return (
    /Adds [-+]?\d+(?:\.\d+)? to [-+]?\d+(?:\.\d+)? (?:Physical|Fire|Cold|Lightning|Chaos) Damage$/i.test(
      line,
    ) ||
    /to Accuracy Rating$/i.test(line) ||
    /increased Attack Speed$/i.test(line)
  )
}

function isLikelyLocalDefenceStat(line, slot) {
  const normalizedSlot = normalizeSlot(slot)
  if (!['Helmet', 'BodyArmour', 'Gloves', 'Boots', 'Offhand'].includes(normalizedSlot)) {
    return false
  }

  return (
    /Chance to Block$/i.test(line) ||
    /to Armour$/i.test(line) ||
    /to Evasion Rating$/i.test(line) ||
    /to Energy Shield$/i.test(line) ||
    /increased Armour$/i.test(line) ||
    /increased Evasion Rating$/i.test(line) ||
    /increased Energy Shield$/i.test(line) ||
    /increased Armour and Evasion$/i.test(line) ||
    /increased Armour and Energy Shield$/i.test(line) ||
    /increased Evasion Rating and Energy Shield$/i.test(line)
  )
}

function shouldPreferLocalTradeStat(line, slot) {
  return isLikelyLocalWeaponStat(line, slot) || isLikelyLocalDefenceStat(line, slot)
}

function buildTradeStatIndexFromPayload(payload) {
  const groups = new Map()
  for (const group of Array.isArray(payload?.result) ? payload.result : []) {
    const entries = Array.isArray(group?.entries)
      ? group.entries.map((entry) => ({
          ...entry,
          normalized: normalizeTradeMatchText(entry?.text),
          normalizedNoLocal: normalizeTradeMatchText(entry?.text, { stripLocalSuffix: true }),
          isLocal: /\(Local\)/i.test(String(entry?.text ?? '')),
          isMultiline: /\r?\n/.test(String(entry?.text ?? '')),
        }))
      : []
    groups.set(String(group?.id ?? ''), entries)
  }
  return groups
}

async function getTradeStatIndex() {
  if (tradeStatIndexCache && tradeStatIndexCache.expiresAt > Date.now()) {
    return tradeStatIndexCache
  }

  if (tradeStatIndexPromise) {
    return tradeStatIndexPromise
  }

  tradeStatIndexPromise = (async () => {
    // 1. Try the live trade API. On success, refresh the persisted copy.
    let payload = null
    let liveError = null
    try {
      payload = await fetchJson(`${TRADE_API_BASE_URL}/data/stats`)
    } catch (error) {
      liveError = error
    }

    if (payload && tradeStatPersistence?.save) {
      try {
        await tradeStatPersistence.save({ payload })
      } catch (saveError) {
        console.error('Failed to persist trade stats cache:', saveError)
      }
    }

    // 2. Fall back to the persisted copy. The schema only changes on patches,
    //    so a stale Supabase row is dramatically better than a hard failure.
    if (!payload && tradeStatPersistence?.load) {
      try {
        const persisted = await tradeStatPersistence.load()
        if (persisted?.payload) {
          payload = persisted.payload
          console.warn(
            `Trade stats live fetch failed (${liveError?.message ?? 'unknown'}); using persisted copy from ${persisted.fetchedAt ?? 'unknown time'}`,
          )
        }
      } catch (loadError) {
        console.error('Failed to load persisted trade stats cache:', loadError)
      }
    }

    // 3. Last resort: the JSON baked into the Docker image.
    if (!payload && tradeStatPersistence?.bundledFallback) {
      try {
        const bundled = tradeStatPersistence.bundledFallback()
        if (bundled?.payload) {
          payload = bundled.payload
          console.warn(
            `Trade stats live fetch and Supabase cache both unavailable; using bundled fallback. Live error: ${liveError?.message ?? 'unknown'}`,
          )
        }
      } catch (bundledError) {
        console.error('Failed to read bundled trade stats fallback:', bundledError)
      }
    }

    if (!payload) {
      throw liveError ?? new Error('Trade stats unavailable from live API, persisted cache, and bundled fallback')
    }

    tradeStatIndexCache = {
      groups: buildTradeStatIndexFromPayload(payload),
      expiresAt: Date.now() + TRADE_STAT_CACHE_TTL_MS,
    }
    return tradeStatIndexCache
  })().finally(() => {
    tradeStatIndexPromise = null
  })

  return tradeStatIndexPromise
}

function selectTradeStatEntry(matches, preferLocal) {
  if (!Array.isArray(matches) || matches.length === 0) {
    return null
  }

  const localMatches = matches.filter((entry) => entry.isLocal)
  const nonLocalMatches = matches.filter((entry) => !entry.isLocal)
  if (preferLocal && localMatches.length > 0) {
    return localMatches[0]
  }
  if (!preferLocal && nonLocalMatches.length > 0) {
    return nonLocalMatches[0]
  }
  return matches[0]
}

function findTradeStatEntryForLine(index, modLine, slot) {
  const preferLocal = shouldPreferLocalTradeStat(modLine.line, slot)

  for (const groupId of getTradeModifierGroupPriority(modLine.category)) {
    const entries = index.groups.get(groupId) ?? []
    if (entries.length === 0) continue

    for (const variant of getTradeSpecialCaseVariants(modLine.line, slot)) {
      const normalized = normalizeTradeMatchText(variant)
      const normalizedNoLocal = normalizeTradeMatchText(variant, { stripLocalSuffix: true })
      const isMultiline = /\r?\n/.test(variant)

      if (preferLocal) {
        const looseMatches = entries.filter(
          (entry) =>
            entry.isMultiline === isMultiline && entry.normalizedNoLocal === normalizedNoLocal,
        )
        const looseMatch = selectTradeStatEntry(looseMatches, true)
        if (looseMatch) {
          return { entry: looseMatch, matchedLine: variant }
        }
      }

      const exactMatches = entries.filter(
        (entry) => entry.isMultiline === isMultiline && entry.normalized === normalized,
      )
      const exactMatch = selectTradeStatEntry(exactMatches, preferLocal)
      if (exactMatch) {
        return { entry: exactMatch, matchedLine: variant }
      }

      const looseMatches = entries.filter(
        (entry) =>
          entry.isMultiline === isMultiline && entry.normalizedNoLocal === normalizedNoLocal,
      )
      const looseMatch = selectTradeStatEntry(looseMatches, preferLocal)
      if (looseMatch) {
        return { entry: looseMatch, matchedLine: variant }
      }
    }
  }

  return null
}

function extractTradeFilterNumbers(line) {
  const normalizedLine = String(line ?? '').replace(
    /([+\-])?\((\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\)/g,
    (_, sign, left, right) => {
      if (sign === '-') {
        return `-${left} -${right}`
      }
      return `${left} ${right}`
    },
  )

  return [...normalizedLine.matchAll(/[+\-]?\d+(?:\.\d+)?/g)]
    .map((match) => Number(match[0]))
    .filter((value) => Number.isFinite(value))
}

function buildGenericEditableLineValue(numbers) {
  if (!Array.isArray(numbers) || numbers.length === 0) {
    return null
  }

  if (numbers.length === 1) {
    return numbers[0] > 0 ? roundDisplayValue(numbers[0], 2) : null
  }

  if (numbers.length === 2) {
    return numbers[0] > 0 && numbers[1] > 0
      ? roundDisplayValue((numbers[0] + numbers[1]) / 2, 2)
      : null
  }

  if (numbers.length === 4) {
    const averageMinimum = (numbers[0] + numbers[2]) / 2
    const averageMaximum = (numbers[1] + numbers[3]) / 2
    return averageMinimum > 0 && averageMaximum > 0
      ? roundDisplayValue((averageMinimum + averageMaximum) / 2, 2)
      : null
  }

  const minimumValue = numbers[0]
  const maximumValue = numbers[numbers.length - 1]
  return minimumValue > 0 && maximumValue > 0
    ? roundDisplayValue((minimumValue + maximumValue) / 2, 2)
    : null
}

function buildExactTradeStatFilterValue(numbers) {
  if (!Array.isArray(numbers) || numbers.length === 0) {
    return null
  }

  if (numbers.length === 1) {
    return numbers[0] < 0 ? { min: numbers[0], max: numbers[0] } : { min: numbers[0] }
  }

  if (numbers.length === 2) {
    return { min: numbers[0], max: numbers[1] }
  }

  if (numbers.length === 4) {
    return {
      min: roundDisplayValue((numbers[0] + numbers[2]) / 2, 2),
      max: roundDisplayValue((numbers[1] + numbers[3]) / 2, 2),
    }
  }

  return {
    min: numbers[0],
    max: numbers[numbers.length - 1],
  }
}

function scaleTradeFilterBound(value, ratio) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }
  if (value <= 0) {
    return value
  }

  return roundDisplayValue(value * ratio, 2)
}

function scaleTradeFilterValue(value, ratio = 1) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ratio >= 0.999) {
    return value
  }

  const next = {}
  const scaledMin = scaleTradeFilterBound(value.min, ratio)
  const scaledMax = scaleTradeFilterBound(value.max, ratio)

  if (scaledMin != null) {
    next.min = scaledMin
  }
  if (scaledMax != null) {
    next.max = scaledMax
  }

  if (Object.keys(next).length === 0) {
    return null
  }
  return next
}

function buildTradeStatFilterFromModLine(index, modLine, slot, options = {}) {
  const match = findTradeStatEntryForLine(index, modLine, slot)
  if (!match?.entry?.id) {
    return null
  }

  const numericValues = extractTradeFilterNumbers(match.matchedLine)
  const value = scaleTradeFilterValue(
    buildExactTradeStatFilterValue(numericValues),
    typeof options.valueRatio === 'number' && Number.isFinite(options.valueRatio)
      ? Math.max(0, options.valueRatio)
      : 1,
  )
  return value ? { id: match.entry.id, value } : { id: match.entry.id }
}

function buildExactMiscFilters(parsedItem, options = {}) {
  const filters = {}
  const lineOverrideMap = options.lineOverrideMap instanceof Map ? options.lineOverrideMap : new Map()
  const itemLevel = parseNumber(parsedItem?.properties?.['Item Level'])
  const quality = parseNumber(String(parsedItem?.properties?.Quality ?? '').replace('%', ''))
  const itemLevelOverride = resolvePropertyFilterValue(lineOverrideMap, 'Item Level', itemLevel)
  const qualityOverride = resolvePropertyFilterValue(lineOverrideMap, 'Quality', quality)

  if (
    options.includeItemLevel !== false &&
    itemLevelOverride.enabled &&
    itemLevelOverride.value != null &&
    itemLevelOverride.value > 0
  ) {
    filters.ilvl = { min: itemLevelOverride.value }
  }
  if (
    options.includeQuality !== false &&
    qualityOverride.enabled &&
    qualityOverride.value != null &&
    qualityOverride.value > 0
  ) {
    filters.quality = { min: qualityOverride.value }
  }
  if (options.includeFlags !== false && parsedItem?.flags?.corrupted === true) {
    filters.corrupted = { option: 'true' }
  }
  if (options.includeFlags !== false && parsedItem?.flags?.synthesised === true) {
    filters.synthesised_item = { option: 'true' }
  }

  return Object.keys(filters).length > 0 ? filters : null
}

function buildExactArmourPropertyFilters(rawText, options = {}) {
  const filters = {}
  const lineOverrideMap = options.lineOverrideMap instanceof Map ? options.lineOverrideMap : new Map()
  const valueRatio =
    typeof options.valueRatio === 'number' && Number.isFinite(options.valueRatio)
      ? Math.max(0, options.valueRatio)
      : 1
  const armour = resolvePropertyFilterValue(
    lineOverrideMap,
    'Armour',
    extractNumericProperty(rawText, /Armour:\s*([\d,]+)/i),
  )
  const evasion = resolvePropertyFilterValue(
    lineOverrideMap,
    'Evasion',
    extractNumericProperty(rawText, /Evasion(?: Rating)?:\s*([\d,]+)/i),
  )
  const energyShield = resolvePropertyFilterValue(
    lineOverrideMap,
    'Energy Shield',
    extractNumericProperty(rawText, /Energy Shield:\s*([\d,]+)/i),
  )
  const ward = resolvePropertyFilterValue(
    lineOverrideMap,
    'Ward',
    extractNumericProperty(rawText, /Ward:\s*([\d,]+)/i),
  )
  const block = resolvePropertyFilterValue(
    lineOverrideMap,
    'Chance to Block',
    extractNumericProperty(rawText, /Chance to Block:\s*([\d.]+)%/i),
  )

  if (armour.enabled && armour.value != null) {
    filters.ar = { min: roundDisplayValue(armour.value * valueRatio, 2) }
  }
  if (evasion.enabled && evasion.value != null) {
    filters.ev = { min: roundDisplayValue(evasion.value * valueRatio, 2) }
  }
  if (energyShield.enabled && energyShield.value != null) {
    filters.es = { min: roundDisplayValue(energyShield.value * valueRatio, 2) }
  }
  if (ward.enabled && ward.value != null) {
    filters.ward = { min: roundDisplayValue(ward.value * valueRatio, 2) }
  }
  if (block.enabled && block.value != null) {
    filters.block = { min: roundDisplayValue(block.value * valueRatio, 2) }
  }

  return Object.keys(filters).length > 0 ? filters : null
}

function buildExactWeaponPropertyFilters(rawText, targets, options = {}) {
  const filters = {}
  const lineOverrideMap = options.lineOverrideMap instanceof Map ? options.lineOverrideMap : new Map()
  const valueRatio =
    typeof options.valueRatio === 'number' && Number.isFinite(options.valueRatio)
      ? Math.max(0, options.valueRatio)
      : 1
  const aps = resolvePropertyFilterValue(
    lineOverrideMap,
    'Attacks per Second',
    extractNumericProperty(rawText, /Attacks per Second:\s*([\d.]+)/i),
  )
  const crit = resolvePropertyFilterValue(
    lineOverrideMap,
    'Critical Strike Chance',
    extractNumericProperty(rawText, /Critical Strike Chance:\s*([\d.]+)%/i),
  )
  const pdps = roundDisplayValue(Number.isFinite(targets?.pdps) ? Number(targets.pdps) : 0, 2)
  const edps = roundDisplayValue(Number.isFinite(targets?.edps) ? Number(targets.edps) : 0, 2)
  const weaponDps = roundDisplayValue(
    Number.isFinite(targets?.weaponDps) ? Number(targets.weaponDps) : 0,
    2,
  )

  if (pdps != null && pdps > 0) filters.pdps = { min: roundDisplayValue(pdps * valueRatio, 2) }
  if (edps != null && edps > 0) filters.edps = { min: roundDisplayValue(edps * valueRatio, 2) }
  if (weaponDps != null && weaponDps > 0) {
    filters.dps = { min: roundDisplayValue(weaponDps * valueRatio, 2) }
  }
  if (options.includeAps !== false && aps.enabled && aps.value != null) {
    filters.aps = { min: roundDisplayValue(aps.value * valueRatio, 2) }
  }
  if (options.includeCrit !== false && crit.enabled && crit.value != null) {
    filters.crit = { min: roundDisplayValue(crit.value * valueRatio, 2) }
  }

  return Object.keys(filters).length > 0 ? filters : null
}

function buildPriceFilter(maxPriceChaos) {
  const normalizedMaxPrice =
    typeof maxPriceChaos === 'number' && Number.isFinite(maxPriceChaos) && maxPriceChaos > 0
      ? Math.max(1, Math.floor(maxPriceChaos))
      : null
  if (normalizedMaxPrice == null) {
    return null
  }

  return {
    trade_filters: {
      filters: {
        price: { option: 'chaos', max: normalizedMaxPrice },
      },
    },
  }
}

async function buildStructuredRareSearchBody(candidate, options = {}) {
  const slot = normalizeSlot(candidate?.slot)
  const baseType = trim(candidate?.baseType)
  const rawText = trim(sanitizeAnalysisRawText(candidate?.rawText))
  if (!slot || !baseType || !rawText) {
    return null
  }

  const parsedItem = parseRareItemTradeContext(rawText)
  const tradeStatIndex = options.tradeStatIndex ?? (await getTradeStatIndex())
  const includeModifierCategories = Array.isArray(options.includeModifierCategories)
    ? new Set(options.includeModifierCategories)
    : null
  const lineOverrideMap =
    options.lineOverrideMap instanceof Map ? options.lineOverrideMap : new Map()
  const disabledTargetKeySet =
    options.disabledTargetKeySet instanceof Set ? options.disabledTargetKeySet : new Set()
  const includeInfluence = options.includeInfluence !== false
  const statValueRatio =
    typeof options.statValueRatio === 'number' && Number.isFinite(options.statValueRatio)
      ? Math.max(0, options.statValueRatio)
      : 1
  const statFilters = []
  const seenStatFilters = new Set()

  if (includeInfluence) {
    for (const pseudoId of parsedItem.influencePseudoIds) {
      const key = JSON.stringify({ id: pseudoId })
      if (!seenStatFilters.has(key)) {
        seenStatFilters.add(key)
        statFilters.push({ id: pseudoId })
      }
    }
  }

  for (const modLine of parsedItem.modifierLines) {
    if (includeModifierCategories && !includeModifierCategories.has(modLine.category)) {
      continue
    }

    const lineOverride = getModifierLineFilterRatio(modLine, lineOverrideMap, disabledTargetKeySet)
    if (!lineOverride.enabled) {
      continue
    }

    const filter = buildTradeStatFilterFromModLine(tradeStatIndex, modLine, slot, {
      valueRatio: statValueRatio * lineOverride.valueRatio,
    })
    if (!filter) continue

    const key = JSON.stringify(filter)
    if (seenStatFilters.has(key)) continue
    seenStatFilters.add(key)
    statFilters.push(filter)
  }

  const query = {
    query: {
      status: { option: TRADE_STATUS_INSTANT_BUYOUT },
      type: baseType,
      filters: {
        type_filters: {
          filters: {
            rarity: { option: 'nonunique' },
            ...(['Head', 'Body', 'Arm', 'Leg'].includes(slot) ? { category: { option: `viscera.${slot.toLowerCase()}` } } : {}),
          },
        },
        ...(buildPriceFilter(options.maxPriceChaos) ?? {}),
        ...(options.includeSocketFilters === false
          ? {}
          : (buildSocketFilters({
              slot,
              maxLinkCount: extractSocketMetrics(rawText).maxLinkCount,
            }) ?? {})),
      },
      stats: statFilters.length
        ? [
            {
              type: 'and',
              filters: statFilters,
            },
          ]
        : [],
    },
    sort: { price: 'asc' },
  }

  const miscFilters =
    options.includeMiscFilters === false
      ? null
      : buildExactMiscFilters(parsedItem, {
          includeItemLevel: options.includeItemLevel,
          includeQuality: options.includeQuality,
          includeFlags: options.includeFlags,
          lineOverrideMap,
        })
  if (miscFilters) {
    query.query.filters.misc_filters = {
      filters: miscFilters,
    }
  }

  if (slot === 'Weapon' && options.includeWeaponFilters !== false) {
    const weaponFilters = buildExactWeaponPropertyFilters(rawText, extractRareTargets(rawText), {
      valueRatio:
        typeof options.propertyValueRatio === 'number' &&
        Number.isFinite(options.propertyValueRatio)
          ? options.propertyValueRatio
          : 1,
      includeAps: options.includeWeaponAps,
      includeCrit: options.includeWeaponCrit,
      lineOverrideMap,
    })
    if (weaponFilters) {
      query.query.filters.weapon_filters = {
        filters: weaponFilters,
      }
    }
  }

  const armourFilters =
    options.includeArmourFilters === false
      ? null
      : buildExactArmourPropertyFilters(rawText, {
          valueRatio:
            typeof options.propertyValueRatio === 'number' &&
            Number.isFinite(options.propertyValueRatio)
              ? options.propertyValueRatio
              : 1,
          lineOverrideMap,
        })
  if (armourFilters) {
    query.query.filters.armour_filters = {
      filters: armourFilters,
    }
  }

  if (
    statFilters.length === 0 &&
    !query.query.filters.weapon_filters &&
    !query.query.filters.armour_filters &&
    !query.query.filters.misc_filters &&
    options.allowEmptySearch !== true
  ) {
    return null
  }

  return query
}

async function buildRecommendedRareSearchBody(candidate) {
  return buildStructuredRareSearchBody(candidate)
}

async function buildExactStageSearchAttempts(stageItem, budgetChaos, searchConstraints, options = {}) {
  const slot = normalizeSlot(stageItem?.slot)
  const baseType = trim(stageItem?.typeLine)
  const rawText = trim(stageItem?.rawText)
  if (!slot || !baseType || !rawText || !Number.isFinite(budgetChaos) || budgetChaos <= 0) {
    return []
  }

  const tradeStatIndex = await getTradeStatIndex()
  const lineOverrideMap = getLineOverrideMap(searchConstraints, stageItem?.slot)
  const normalizedConstraints = normalizeSearchConstraints(searchConstraints)
  const normalizedSlot = normalizeSlot(stageItem?.slot)
  const slotOverride = normalizedSlot ? normalizedConstraints.slotOverrides?.[normalizedSlot] : null
  const ignoreCraftedMods = normalizedConstraints.ignoreCraftedMods === true
  const ignoreEnchants = normalizedConstraints.ignoreEnchants === true
  const ignoreQuality = normalizedConstraints.ignoreQuality === true
  const constrainedRawText = sanitizeAnalysisRawText(
    applySearchConstraintRelaxation(rawText, normalizedConstraints),
  )
  const disabledTargetKeySet = new Set(slotOverride?.disabled_target_keys ?? [])
  const includePriceFilter = options.includePriceFilter !== false
  const attempts = []
  const configs = [
    {
      wholeTextValueRatio: 1,
      includeModifierCategories: [
        'explicit',
        'fractured',
        'veiled',
        'crafted',
        'implicit',
        'enchant',
      ],
      includeInfluence: true,
      includeMiscFilters: true,
      includeItemLevel: false,
      includeQuality: true,
      includeFlags: true,
      includeWeaponFilters: true,
      includeArmourFilters: true,
      includeSocketFilters: true,
    },
    {
      wholeTextValueRatio: 0.75,
      includeModifierCategories: [
        'explicit',
        'fractured',
        'veiled',
        'crafted',
        'implicit',
        'enchant',
      ],
      includeInfluence: true,
      includeMiscFilters: true,
      includeItemLevel: false,
      includeQuality: true,
      includeFlags: true,
      includeWeaponFilters: true,
      includeArmourFilters: true,
      includeSocketFilters: true,
    },
    {
      wholeTextValueRatio: 0.55,
      includeModifierCategories: [
        'explicit',
        'fractured',
        'veiled',
        'crafted',
        'implicit',
        'enchant',
      ],
      includeInfluence: true,
      includeMiscFilters: true,
      includeItemLevel: false,
      includeQuality: true,
      includeFlags: true,
      includeWeaponFilters: true,
      includeArmourFilters: true,
      includeSocketFilters: true,
    },
  ]

  for (const config of configs) {
    let includeModifierCategories = config.includeModifierCategories
    if (ignoreCraftedMods) {
      includeModifierCategories = includeModifierCategories.filter(
        (category) => category !== 'crafted',
      )
    }
    if (ignoreEnchants) {
      includeModifierCategories = includeModifierCategories.filter(
        (category) => category !== 'enchant',
      )
    }
    const passRawText = sanitizeAnalysisRawText(
      applyWholeTextNumericRelaxation(constrainedRawText, config.wholeTextValueRatio),
    )
    const body = await buildStructuredRareSearchBody(
      {
        slot,
        baseType,
        rawText: passRawText,
      },
      {
        ...config,
        includeModifierCategories,
        includeQuality: config.includeQuality && !ignoreQuality,
        maxPriceChaos: includePriceFilter ? budgetChaos : null,
        tradeStatIndex,
        lineOverrideMap,
        disabledTargetKeySet,
      },
    )
    if (!body) continue
    attempts.push({
      strategy: 'exact_modifiers',
      baseType,
      body,
    })
  }

  return attempts
}

function buildApproximateRecommendedRareSearchBody(candidate) {
  const slot = normalizeSlot(candidate?.slot)
  const baseType = trim(candidate?.baseType)
  const rawText = trim(sanitizeAnalysisRawText(candidate?.rawText))
  if (!slot || !baseType || !rawText) {
    return null
  }

  const targets = extractRareTargets(rawText)
  const query = {
    query: {
      status: { option: TRADE_STATUS_INSTANT_BUYOUT },
      type: baseType,
      filters: {
        type_filters: {
          filters: {
            rarity: { option: 'nonunique' },
            ...(['Head', 'Body', 'Arm', 'Leg'].includes(slot) ? { category: { option: `viscera.${slot.toLowerCase()}` } } : {}),
          },
        },
        ...(buildSocketFilters({
          slot,
          maxLinkCount: extractSocketMetrics(rawText).maxLinkCount,
        }) ?? {}),
      },
      stats: [],
    },
    sort: { price: 'asc' },
  }

  const pseudoFilters = buildPseudoFilters(slot, targets, slot === 'Weapon' ? 0.96 : 0.94).slice(
    0,
    slot === 'Weapon' ? 4 : 5,
  )
  if (pseudoFilters.length > 0) {
    query.query.stats.push({
      type: 'and',
      filters: pseudoFilters.map((entry) => ({
        id: entry.id,
        value: { min: entry.min },
      })),
    })
  }

  if (slot === 'Weapon') {
    const weaponFilters = buildExactWeaponPropertyFilters(rawText, targets)
    if (weaponFilters) {
      query.query.filters.weapon_filters = {
        filters: weaponFilters,
      }
    }
  }

  const armourFilters = buildExactArmourPropertyFilters(rawText)
  if (armourFilters) {
    query.query.filters.armour_filters = {
      filters: armourFilters,
    }
  }

  return query
}

export async function getRecommendedRareTradeLink({ league, candidate }) {
  const normalizedLeague = trim(league)
  if (!normalizedLeague) return null

  const cacheKey = getExactRareSearchCacheKey({ league: normalizedLeague, candidate })
  const cached = exactRareSearchCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.searchLink ?? null
  }

  let searchBody = null
  try {
    searchBody = await buildRecommendedRareSearchBody(candidate)
  } catch (error) {
    searchBody = buildApproximateRecommendedRareSearchBody(candidate)
  }

  if (!searchBody) {
    const baseType = trim(candidate?.baseType)
    if (!baseType) {
      return null
    }

    searchBody = {
      query: {
        status: { option: TRADE_STATUS_INSTANT_BUYOUT },
        type: baseType,
      },
      sort: { price: 'asc' },
    }
  }

  const searchLink = buildQuerySearchLink(normalizedLeague, searchBody)
  exactRareSearchCache.set(cacheKey, {
    expiresAt: Date.now() + EXACT_RARE_SEARCH_CACHE_TTL_MS,
    searchLink,
  })
  return searchLink
}

export async function getExactTemplateRareTradeLink({
  league,
  candidate,
  budgetChaos,
  searchConstraints,
}) {
  const normalizedLeague = trim(league)
  const normalizedSlot = normalizeSlot(candidate?.slot)
  const baseType = trim(candidate?.baseType)
  const rawText = trim(candidate?.rawText)
  if (
    !normalizedLeague ||
    !normalizedSlot ||
    !baseType ||
    !rawText ||
    !Number.isFinite(budgetChaos) ||
    budgetChaos <= 0
  ) {
    return null
  }

  const attempts = await buildExactStageSearchAttempts(
    {
      slot: candidate.slot,
      typeLine: baseType,
      rawText,
    },
    budgetChaos,
    searchConstraints,
    {
      includePriceFilter: false,
    },
  )
  const searchBody = attempts[0]?.body ?? null
  if (!searchBody) {
    return null
  }

  return buildQuerySearchLink(normalizedLeague, searchBody)
}

export function getExactStageSearchBaselineRawText({ stageItem, searchConstraints }) {
  if (!stageItem || typeof stageItem !== 'object') {
    return null
  }

  const originalRawText = trim(stageItem.rawText ?? stageItem.raw_text)
  if (!originalRawText) {
    return null
  }

  const constraintContext = getStageConstraintContext(
    {
      slot: stageItem.slot,
      rawText: originalRawText,
    },
    searchConstraints,
  )

  return trim(constraintContext.rawText) || null
}

export async function getUniqueTradeLinkForName({ league, uniqueName, baseType, links }) {
  const normalizedLeague = trim(league)
  const normalizedUniqueName = trim(uniqueName)
  const normalizedBaseType = trim(baseType)
  if (!normalizedLeague || !normalizedUniqueName) {
    return null
  }

  const cacheKey = getUniqueSearchCacheKey({
    league: normalizedLeague,
    uniqueName: normalizedUniqueName,
    baseType: normalizedBaseType,
    links,
  })
  const cached = uniqueSearchCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.searchLink ?? null
  }

  const searchLink = buildQuerySearchLink(
    normalizedLeague,
    buildUniqueSearchBody({
      uniqueName: normalizedUniqueName,
      baseType: normalizedBaseType,
      links,
    }),
  )

  uniqueSearchCache.set(cacheKey, {
    expiresAt: Date.now() + UNIQUE_SEARCH_CACHE_TTL_MS,
    queryId: null,
    searchLink,
  })

  return searchLink
}

export async function searchConstrainedRareCandidates({
  league,
  budgetChaos,
  stageItems,
  equippedItems,
  searchConstraints,
  rareSlotContext,
  slotPlanning,
  limitToSlots,
  divineToChaosRate,
  maxSlots = 6,
  maxResultsPerSlot = 6,
  requestPacing = 'thorough_live_search',
}) {
  const normalizedLeague = trim(league)
  const normalizedRequestPacing = normalizeTradeRequestPacing(requestPacing)
  const planningEntries = Array.isArray(slotPlanning)
    ? slotPlanning.filter((entry) => !!entry && typeof entry === 'object' && !Array.isArray(entry))
    : []
  const planningBySlot = new Map(
    planningEntries
      .map((entry) => {
        const normalizedSlot = normalizeSlot(entry.slot ?? entry.normalized_slot)
        return normalizedSlot ? [normalizedSlot, entry] : null
      })
      .filter(Boolean),
  )
  if (!normalizedLeague || !Number.isFinite(budgetChaos) || budgetChaos <= 0) {
    return {
      items: [],
      diagnostics: {
        rate_limited: false,
        retry_after_ms: null,
        slot_count: 0,
        searched_slot_count: 0,
        slot_diagnostics: [],
        slot_planning: planningEntries,
        request_pacing: normalizedRequestPacing,
      },
    }
  }

  const rareStageItems = uniqueBy(
    (Array.isArray(stageItems) ? stageItems : [])
      .filter(
        (item) =>
          String(item?.rarity ?? '')
            .trim()
            .toLowerCase() === 'rare' || ['Head', 'Body', 'Arm', 'Leg'].includes(normalizeSlot(item?.slot)),
      )
      .filter((item) => {
        if (!Array.isArray(limitToSlots) || limitToSlots.length === 0) {
          return true
        }

        const normalizedSlot = normalizeSlot(item?.slot)
        if (!normalizedSlot) {
          return false
        }

        return limitToSlots
          .map((entry) => normalizeSlot(entry))
          .filter(Boolean)
          .includes(normalizedSlot)
      })
      .filter((item) => {
        if (planningEntries.length === 0) {
          return true
        }

        const planning = planningBySlot.get(normalizeSlot(item?.slot))
        return planning ? planning.should_search === true : false
      })
      .filter((item) => trim(item?.slot) && trim(item?.typeLine) && trim(item?.rawText)),
    (item) => `${normalizeSlot(item?.slot)}::${trim(item?.typeLine)}`,
  )
    .sort((left, right) => {
      const leftPlanning = planningBySlot.get(normalizeSlot(left?.slot))
      const rightPlanning = planningBySlot.get(normalizeSlot(right?.slot))
      const leftPriority = Number(leftPlanning?.search_priority ?? Number.NEGATIVE_INFINITY)
      const rightPriority = Number(rightPlanning?.search_priority ?? Number.NEGATIVE_INFINITY)

      if (leftPriority !== rightPriority) {
        return rightPriority - leftPriority
      }

      return scoreRareStageItemPriority(right, searchConstraints) -
        scoreRareStageItemPriority(left, searchConstraints)
    })
    .slice(0, maxSlots)

  const candidates = []
  const slotDiagnostics = []

  for (const stageItem of rareStageItems) {
    const result = await runRareSlotSearch({
      league: normalizedLeague,
      budgetChaos,
      stageItem,
      equippedItems,
      searchConstraints,
      rareSlotContext,
      divineToChaosRate,
      maxResultsPerSlot,
      requestPacing: normalizedRequestPacing,
    })
    candidates.push(...result.items)
    if (result.diagnostics) {
      slotDiagnostics.push(result.diagnostics)
      if (result.diagnostics.rate_limited === true) {
        break
      }
    }
  }

  const retryAfterMs = slotDiagnostics.reduce((max, entry) => {
    const value =
      typeof entry?.retry_after_ms === 'number' && Number.isFinite(entry.retry_after_ms)
        ? entry.retry_after_ms
        : 0
    return Math.max(max, value)
  }, 0)

  return {
    items: candidates,
    diagnostics: {
      rate_limited: slotDiagnostics.some((entry) => entry?.rate_limited === true),
      retry_after_ms: retryAfterMs > 0 ? retryAfterMs : null,
      slot_count: rareStageItems.length,
      searched_slot_count: slotDiagnostics.length,
      slot_diagnostics: slotDiagnostics,
      slot_planning: planningEntries,
      request_pacing: normalizedRequestPacing,
    },
  }
}
