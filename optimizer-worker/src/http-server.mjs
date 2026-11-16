import http from 'node:http'
import { isAuthorizedWorkerRequest } from './lib/worker-auth.mjs'
import { sanitizeDiagnosticValue } from './lib/worker-logger.mjs'

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' }
const MAX_REQUEST_BODY_BYTES = 1024 * 1024
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

class RequestError extends Error {
  constructor(statusCode, publicMessage) {
    super(publicMessage)
    this.name = 'RequestError'
    this.statusCode = statusCode
    this.publicMessage = publicMessage
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, JSON_HEADERS)
  res.end(JSON.stringify(payload))
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let totalBytes = 0
    let rejected = false

    req.on('error', (error) => {
      if (!rejected) reject(error)
    })
    req.on('data', (chunk) => {
      if (rejected) return
      totalBytes += chunk.length
      if (totalBytes > MAX_REQUEST_BODY_BYTES) {
        rejected = true
        chunks.length = 0
        reject(new RequestError(413, 'Request body is too large'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (rejected) return
      if (chunks.length === 0) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new RequestError(400, 'Invalid JSON request body'))
      }
    })
  })
}

function healthPayload({ ready, startedAt, diagnostics }) {
  const publicDiagnostics = Object.fromEntries(
    [
      'poll_interval_ms',
      'poll_loop_active',
      'accepting_tasks',
      'ready',
      'last_poll_succeeded_at',
      'last_poll_failed_at',
      'max_concurrent_runs',
      'max_stash_items',
      'active_run_count',
      'heartbeat_interval_ms',
      'stale_running_after_ms',
      'optimizer_engine',
      'pob_runtime_configured',
      'pob_runtime_mode',
      'pob_runtime_command_source',
    ]
      .filter((key) => Object.hasOwn(diagnostics, key))
      .map((key) => [key, diagnostics[key]]),
  )
  return {
    ok: ready,
    status: ready ? 'ready' : 'not_ready',
    uptime_seconds: Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
    ...sanitizeDiagnosticValue(publicDiagnostics),
  }
}

function jobResponseDiagnostics(diagnostics) {
  return Object.fromEntries(
    ['accepting_tasks', 'ready', 'max_concurrent_runs', 'active_run_count']
      .filter((key) => Object.hasOwn(diagnostics, key))
      .map((key) => [key, diagnostics[key]]),
  )
}

export function createWorkerHttpServer({
  workerAuthToken,
  jobRunner,
  logger,
  isReady,
  startedAt = Date.now(),
}) {
  return http.createServer(async (req, res) => {
    const method = req.method || 'GET'
    const path = new URL(req.url || '/', 'http://optimizer-worker.invalid').pathname

    try {
      if (method === 'GET' && path === '/health/live') {
        sendJson(res, 200, {
          ok: true,
          status: 'live',
          uptime_seconds: Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
        })
        return
      }

      if (method === 'GET' && (path === '/health' || path === '/health/ready')) {
        const ready = isReady()
        sendJson(
          res,
          ready ? 200 : 503,
          healthPayload({ ready, startedAt, diagnostics: jobRunner.getDiagnostics() }),
        )
        return
      }

      if (method === 'POST' && path === '/jobs') {
        if (!isAuthorizedWorkerRequest(req.headers.authorization, workerAuthToken)) {
          sendJson(res, 401, { error: 'Unauthorized' })
          return
        }

        if (!isReady()) {
          sendJson(res, 503, { error: 'Worker is not ready' })
          return
        }

        const body = await readJsonBody(req)
        const runId = typeof body.run_id === 'string' ? body.run_id.trim() : ''
        if (!UUID_PATTERN.test(runId)) {
          throw new RequestError(400, 'run_id must be a UUID')
        }

        const runType =
          body.run_type === 'guest_upgrade_analysis' ? 'guest_upgrade_analysis' : undefined
        const accepted = jobRunner.startRunTask(runId, runType)
        sendJson(res, 202, {
          ok: true,
          accepted,
          run_id: runId,
          run_type: runType ?? 'upgrade_analysis',
          ...sanitizeDiagnosticValue(jobResponseDiagnostics(jobRunner.getDiagnostics())),
        })
        return
      }

      sendJson(res, 404, { error: 'Not found' })
    } catch (error) {
      const statusCode = error instanceof RequestError ? error.statusCode : 500
      logger.error('http_request_failed', { method, path, statusCode, error })
      sendJson(res, statusCode, {
        error:
          error instanceof RequestError ? error.publicMessage : 'Internal worker request failed',
      })
    }
  })
}
