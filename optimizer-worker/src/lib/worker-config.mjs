import { requireStrongWorkerAuthToken } from './worker-auth.mjs'

function readPositiveInteger(env, name, fallback, { maximum = Number.MAX_SAFE_INTEGER } = {}) {
  const raw = env[name]
  if (raw == null || raw === '') return fallback

  const parsed = Number(raw)
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > maximum) {
    throw new Error(`${name} must be a positive integer no greater than ${maximum}.`)
  }

  return parsed
}

export function loadWorkerConfig(env = process.env) {
  const supabaseUrl = env.SUPABASE_URL
  const supabaseAdminKey =
    env.SUPABASE_SECRET_KEY || env.SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseAdminKey) {
    throw new Error(
      'Missing SUPABASE_URL and Supabase admin key. Set SUPABASE_SECRET_KEY (preferred), SECRET_KEY, or SUPABASE_SERVICE_ROLE_KEY.',
    )
  }

  return {
    port: readPositiveInteger(env, 'PORT', 8788, { maximum: 65535 }),
    supabaseUrl,
    supabaseAdminKey,
    workerAuthToken: requireStrongWorkerAuthToken(env.WORKER_AUTH_TOKEN),
    poeNinjaBaseUrl: env.POE_NINJA_BASE_URL || 'https://poe.ninja',
    pollIntervalMs: readPositiveInteger(env, 'WORKER_POLL_INTERVAL_MS', 5000),
    maxConcurrentRuns: readPositiveInteger(env, 'WORKER_MAX_CONCURRENT_RUNS', 1, {
      maximum: 64,
    }),
    heartbeatIntervalMs: readPositiveInteger(env, 'WORKER_HEARTBEAT_INTERVAL_MS', 15000),
    staleRunningAfterMs: readPositiveInteger(env, 'WORKER_STALE_RUNNING_AFTER_MS', 180000),
    maxStashItems: readPositiveInteger(env, 'WORKER_MAX_STASH_ITEMS', 50000, {
      maximum: 500000,
    }),
    shutdownTimeoutMs: readPositiveInteger(env, 'WORKER_SHUTDOWN_TIMEOUT_MS', 25000, {
      maximum: 300000,
    }),
  }
}
