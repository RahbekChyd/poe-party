import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { createWorkerHttpServer } from './http-server.mjs'
import { createJobRunner } from './job-runner.mjs'
import { createSupabaseRestClient } from './lib/supabase.mjs'
import { setTradeStatPersistence } from './lib/poe-trade-client.mjs'
import { loadWorkerConfig } from './lib/worker-config.mjs'
import { createWorkerLogger } from './lib/worker-logger.mjs'
import { closeHttpServer, createShutdownCoordinator } from './lib/worker-shutdown.mjs'

const TRADE_STATS_BUNDLED_FALLBACK_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  'lib',
  'poe-trade-stats-fallback.json',
)

function configureTradeStatPersistence(supabase, logger) {
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
        logger.error('trade_stats_bundled_fallback_read_failed', { error })
        return null
      }
    },
  })

  try {
    const parsed = JSON.parse(readFileSync(TRADE_STATS_BUNDLED_FALLBACK_PATH, 'utf8'))
    const groupCount = Array.isArray(parsed?.result) ? parsed.result.length : 0
    logger.info('trade_stats_bundled_fallback_ready', { groupCount })
  } catch (error) {
    logger.warn('trade_stats_bundled_fallback_unavailable', { error })
  }
}

export async function startWorker({
  env = process.env,
  logger = createWorkerLogger(),
  exit = (code) => process.exit(code),
} = {}) {
  const config = loadWorkerConfig(env)
  const startedAt = Date.now()
  const supabase = createSupabaseRestClient({
    url: config.supabaseUrl,
    adminKey: config.supabaseAdminKey,
  })
  configureTradeStatPersistence(supabase, logger.child('trade-stats'))

  const jobRunner = createJobRunner({
    supabase,
    poeNinjaBaseUrl: config.poeNinjaBaseUrl,
    pollIntervalMs: config.pollIntervalMs,
    maxConcurrentRuns: config.maxConcurrentRuns,
    heartbeatIntervalMs: config.heartbeatIntervalMs,
    staleRunningAfterMs: config.staleRunningAfterMs,
    maxStashItems: config.maxStashItems,
    logger: logger.child('job-runner'),
  })

  let healthEnabled = false
  const server = createWorkerHttpServer({
    workerAuthToken: config.workerAuthToken,
    jobRunner,
    logger: logger.child('http'),
    isReady: () => healthEnabled && jobRunner.isReady(),
    startedAt,
  })
  const shutdownCoordinator = createShutdownCoordinator({
    markReady(value) {
      healthEnabled = value
    },
    stopPolling: () => jobRunner.stopPolling(),
    closeServer: () => closeHttpServer(server),
    drain: () => jobRunner.waitForIdle(),
    forceClose: () => server.closeAllConnections?.(),
    timeoutMs: config.shutdownTimeoutMs,
    logger: logger.child('lifecycle'),
  })

  await new Promise((resolveListen, rejectListen) => {
    const onError = (error) => rejectListen(error)
    server.once('error', onError)
    server.listen(config.port, () => {
      server.off('error', onError)
      resolveListen()
    })
  })

  jobRunner.startPolling()
  healthEnabled = true
  server.on('error', (error) => logger.error('http_server_error', { error }))
  logger.info('worker_listening', {
    port: config.port,
    maxConcurrentRuns: config.maxConcurrentRuns,
    maxStashItems: config.maxStashItems,
    shutdownTimeoutMs: config.shutdownTimeoutMs,
  })

  const handleSignal = (signal) => {
    if (shutdownCoordinator.isShuttingDown()) return
    void shutdownCoordinator
      .shutdown(signal)
      .then((result) => exit(result.timedOut ? 1 : 0))
      .catch((error) => {
        logger.error('shutdown_failed', { signal, error })
        exit(1)
      })
  }
  process.once('SIGTERM', handleSignal)
  process.once('SIGINT', handleSignal)

  return { config, server, jobRunner, shutdownCoordinator }
}

const isMainModule = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMainModule) {
  const logger = createWorkerLogger()
  startWorker({ logger }).catch((error) => {
    logger.error('worker_startup_failed', { error })
    process.exitCode = 1
  })
}
