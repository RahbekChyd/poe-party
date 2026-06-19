import http from 'node:http'
import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createJobRunner } from './job-runner.mjs'
import { createSupabaseRestClient } from './lib/supabase.mjs'
import { setTradeStatPersistence } from './lib/poe-trade-client.mjs'

const PORT = Number(process.env.PORT || 8788)
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_ADMIN_KEY =
  process.env.SUPABASE_SECRET_KEY || process.env.SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const WORKER_AUTH_TOKEN = process.env.WORKER_AUTH_TOKEN || ''
const POE_NINJA_BASE_URL = process.env.POE_NINJA_BASE_URL || 'https://poe.ninja'
const WORKER_POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS || 5000)
const WORKER_MAX_CONCURRENT_RUNS = Number(process.env.WORKER_MAX_CONCURRENT_RUNS || 1)
const WORKER_HEARTBEAT_INTERVAL_MS = Number(process.env.WORKER_HEARTBEAT_INTERVAL_MS || 15000)
const WORKER_STALE_RUNNING_AFTER_MS = Number(process.env.WORKER_STALE_RUNNING_AFTER_MS || 180000)

if (!SUPABASE_URL || !SUPABASE_ADMIN_KEY) {
  throw new Error(
    'Missing SUPABASE_URL and Supabase admin key. Set SUPABASE_SECRET_KEY (preferred), SECRET_KEY, or SUPABASE_SERVICE_ROLE_KEY.',
  )
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' }
const startedAt = Date.now()

const supabase = createSupabaseRestClient({
  url: SUPABASE_URL,
  adminKey: SUPABASE_ADMIN_KEY,
})

const TRADE_STATS_BUNDLED_FALLBACK_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  'lib',
  'poe-trade-stats-fallback.json',
)
let bundledTradeStatsPayload = null
let bundledTradeStatsLoadAttempted = false

setTradeStatPersistence({
  async load() {
    const row = await supabase.selectSingle(
      'poe_trade_stats_cache',
      { id: 'default' },
      'payload,fetched_at',
    )
    if (!row?.payload) return null
    return { payload: row.payload, fetchedAt: row.fetched_at ?? null }
  },
  async save({ payload }) {
    const existing = await supabase.selectSingle('poe_trade_stats_cache', { id: 'default' }, 'id')
    const body = { payload, fetched_at: new Date().toISOString() }
    if (existing) {
      await supabase.updateRows('poe_trade_stats_cache', { id: 'default' }, body, {
        returning: 'minimal',
      })
    } else {
      await supabase.insertRow('poe_trade_stats_cache', { id: 'default', ...body })
    }
  },
  bundledFallback() {
    if (bundledTradeStatsPayload) return { payload: bundledTradeStatsPayload }
    if (bundledTradeStatsLoadAttempted) return null
    bundledTradeStatsLoadAttempted = true
    try {
      const data = readFileSync(TRADE_STATS_BUNDLED_FALLBACK_PATH, 'utf8')
      bundledTradeStatsPayload = JSON.parse(data)
      return { payload: bundledTradeStatsPayload }
    } catch (error) {
      console.error('Failed to read bundled trade stats fallback:', error)
      return null
    }
  },
})

// Surface a clear log line at startup so a missing bundled fallback in the
// deployed image is obvious instead of only showing up during an outage.
try {
  const parsed = JSON.parse(readFileSync(TRADE_STATS_BUNDLED_FALLBACK_PATH, 'utf8'))
  const groupCount = Array.isArray(parsed?.result) ? parsed.result.length : 0
  console.log(`Trade stats bundled fallback ready (${groupCount} stat groups)`)
} catch (error) {
  console.warn('Trade stats bundled fallback not available:', error?.message ?? error)
}

const jobRunner = createJobRunner({
  supabase,
  poeNinjaBaseUrl: POE_NINJA_BASE_URL,
  pollIntervalMs: Number.isFinite(WORKER_POLL_INTERVAL_MS) ? WORKER_POLL_INTERVAL_MS : 5000,
  maxConcurrentRuns:
    Number.isFinite(WORKER_MAX_CONCURRENT_RUNS) && WORKER_MAX_CONCURRENT_RUNS > 0
      ? Math.floor(WORKER_MAX_CONCURRENT_RUNS)
      : 1,
  heartbeatIntervalMs:
    Number.isFinite(WORKER_HEARTBEAT_INTERVAL_MS) && WORKER_HEARTBEAT_INTERVAL_MS > 0
      ? Math.floor(WORKER_HEARTBEAT_INTERVAL_MS)
      : 15000,
  staleRunningAfterMs:
    Number.isFinite(WORKER_STALE_RUNNING_AFTER_MS) && WORKER_STALE_RUNNING_AFTER_MS > 0
      ? Math.floor(WORKER_STALE_RUNNING_AFTER_MS)
      : 180000,
})

const MAX_REQUEST_BODY_BYTES = 1024 * 1024 // 1 MB

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let totalBytes = 0

    req.on('error', reject)
    req.on('data', (chunk) => {
      totalBytes += chunk.length
      if (totalBytes > MAX_REQUEST_BODY_BYTES) {
        req.destroy()
        reject(new Error(`Request body exceeds ${MAX_REQUEST_BODY_BYTES} bytes`))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        if (chunks.length === 0) {
          resolve({})
          return
        }
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch (error) {
        reject(error)
      }
    })
  })
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, JSON_HEADERS)
      res.end(
        JSON.stringify({
          ok: true,
          uptime_seconds: Math.round((Date.now() - startedAt) / 1000),
          ...jobRunner.getDiagnostics(),
        }),
      )
      return
    }

    if (req.method === 'POST' && req.url === '/jobs') {
      if (WORKER_AUTH_TOKEN) {
        const authHeader = req.headers.authorization || ''
        const expected = `Bearer ${WORKER_AUTH_TOKEN}`
        const a = Buffer.from(authHeader)
        const b = Buffer.from(expected)
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
          res.writeHead(401, JSON_HEADERS)
          res.end(JSON.stringify({ error: 'Unauthorized' }))
          return
        }
      }

      const body = await readJsonBody(req)
      const runId = body.run_id
      if (!runId) {
        res.writeHead(400, JSON_HEADERS)
        res.end(JSON.stringify({ error: 'Missing run_id' }))
        return
      }

      const runType = body.run_type === 'guest_upgrade_analysis' ? 'guest_upgrade_analysis' : undefined
      const accepted = jobRunner.startRunTask(runId, runType)
      res.writeHead(202, JSON_HEADERS)
      res.end(
        JSON.stringify({
          ok: true,
          accepted,
          run_id: runId,
          run_type: runType ?? 'upgrade_analysis',
          ...jobRunner.getDiagnostics(),
        }),
      )
      return
    }

    res.writeHead(404, JSON_HEADERS)
    res.end(JSON.stringify({ error: 'Not found' }))
  } catch (error) {
    res.writeHead(500, JSON_HEADERS)
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
  }
})

server.listen(PORT, () => {
  jobRunner.startPolling()
  console.log(`optimizer worker listening on ${PORT}`)
})
