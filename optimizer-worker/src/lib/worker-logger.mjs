import { createHash } from 'node:crypto'

const SENSITIVE_KEY_PATTERN =
  /(?:authorization|cookie|secret|token|password|poesessid|raw_(?:character|league_account|data|xml)|pob_code)/i
const IDENTITY_OR_FREE_TEXT_KEY_PATTERN =
  /^(?:queuedBy|queued_by|targetUserId|target_user_id|ownerName|owner_name|name|label|title|.*(?:user|group|account|character).*(?:id|name))$/i
const BEARER_PATTERN = /Bearer\s+[^\s"']+/gi
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{8,}\b/g
const MAX_STRING_LENGTH = 1000
const MAX_ARRAY_LENGTH = 50
const MAX_DEPTH = 6
const SAFE_CONFIGURATION_ERROR_PATTERN =
  /^(?:Missing WORKER_AUTH_TOKEN|Missing SUPABASE_URL|WORKER_AUTH_TOKEN must|WORKER_[A-Z0-9_]+ must|PORT must)/

function sanitizeString(value) {
  const redacted = value.replace(BEARER_PATTERN, 'Bearer [redacted]').replace(JWT_PATTERN, '[jwt]')
  return redacted.length > MAX_STRING_LENGTH
    ? `${redacted.slice(0, MAX_STRING_LENGTH)}...`
    : redacted
}

export function sanitizeDiagnosticValue(value, key = '', depth = 0) {
  if (SENSITIVE_KEY_PATTERN.test(key) || IDENTITY_OR_FREE_TEXT_KEY_PATTERN.test(key)) {
    return '[redacted]'
  }
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value
  if (typeof value === 'string') return sanitizeString(value)
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (value instanceof Error) {
    const rawMessage = value.message || 'Worker operation failed'
    return {
      name: value.name || 'Error',
      code:
        typeof value.code === 'string' || typeof value.code === 'number'
          ? String(value.code)
          : undefined,
      message: SAFE_CONFIGURATION_ERROR_PATTERN.test(rawMessage)
        ? sanitizeString(rawMessage)
        : 'Worker operation failed',
      fingerprint: createHash('sha256')
        .update(`${value.name || 'Error'}:${rawMessage}`, 'utf8')
        .digest('hex')
        .slice(0, 12),
    }
  }
  if (depth >= MAX_DEPTH) return '[truncated]'
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_LENGTH)
      .map((entry) => sanitizeDiagnosticValue(entry, '', depth + 1))
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeDiagnosticValue(entryValue, entryKey, depth + 1),
      ]),
    )
  }
  return sanitizeString(String(value))
}

export function createWorkerLogger({ component = 'optimizer-worker', sink = console } = {}) {
  function write(level, event, fields = {}) {
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      component,
      event,
      ...sanitizeDiagnosticValue(fields),
    })
    const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'
    sink[method](line)
  }

  return {
    debug(event, fields) {
      write('debug', event, fields)
    },
    info(event, fields) {
      write('info', event, fields)
    },
    warn(event, fields) {
      write('warn', event, fields)
    },
    error(event, fields) {
      write('error', event, fields)
    },
    child(childComponent) {
      return createWorkerLogger({ component: `${component}:${childComponent}`, sink })
    },
  }
}
