import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { buildPobRuntimePayload } from '../lib/pob-payload.mjs'

const DEFAULT_LINUX_POB_RUNTIME_COMMAND = '/app/pob/run-pob-runtime.sh'

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function extractBaselineMetrics(result) {
  const direct = asRecord(result?.baseline_metrics)
  if (Object.keys(direct).length > 0) {
    return direct
  }

  const summary = asRecord(result?.summary)
  const nested = asRecord(summary.baseline_metrics)
  if (Object.keys(nested).length > 0) {
    return nested
  }

  return null
}

function applyExactBaselineToPlans(plans, baselineMetrics) {
  if (!baselineMetrics || Object.keys(baselineMetrics).length === 0) {
    return Array.isArray(plans) ? plans : []
  }

  return (Array.isArray(plans) ? plans : []).map((plan) => ({
    ...plan,
    before_metrics: {
      ...asRecord(plan?.before_metrics),
      ...baselineMetrics,
    },
  }))
}

async function readTextFile(path) {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

async function readFirstNumericFile(paths) {
  for (const path of paths) {
    const text = await readTextFile(path)
    if (!text) continue
    const trimmed = text.trim()
    if (!trimmed || trimmed === 'max') continue
    const parsed = Number(trimmed)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }
  return null
}

async function readLinuxProcessRssBytes(pid) {
  if (process.platform !== 'linux' || !pid) return null
  const status = await readTextFile(`/proc/${pid}/status`)
  if (!status) return null
  const match = status.match(/^VmRSS:\s+(\d+)\s+kB$/m)
  if (!match) return null
  const rssBytes = Number(match[1]) * 1024
  return Number.isFinite(rssBytes) ? rssBytes : null
}

async function readCgroupMemoryCurrentBytes() {
  if (process.platform !== 'linux') return null
  return readFirstNumericFile([
    '/sys/fs/cgroup/memory.current',
    '/sys/fs/cgroup/memory/memory.usage_in_bytes',
  ])
}

async function readCgroupMemoryLimitBytes() {
  if (process.platform !== 'linux') return null
  return readFirstNumericFile([
    '/sys/fs/cgroup/memory.max',
    '/sys/fs/cgroup/memory/memory.limit_in_bytes',
  ])
}

function formatMiB(bytes) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return null
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}

function formatResourceSummary(stats) {
  const parts = []
  const childPeak = formatMiB(stats.peakChildRssBytes)
  const parentPeak = formatMiB(stats.peakParentRssBytes)
  const cgroupPeak = formatMiB(stats.peakCgroupCurrentBytes)
  const cgroupLimit = formatMiB(stats.cgroupMemoryLimitBytes)

  if (childPeak) parts.push(`child peak RSS ${childPeak}`)
  if (parentPeak) parts.push(`parent peak RSS ${parentPeak}`)
  if (cgroupPeak) parts.push(`cgroup peak ${cgroupPeak}`)
  if (cgroupLimit) parts.push(`cgroup limit ${cgroupLimit}`)

  return parts.join(', ')
}

function startProcessResourceTracker(pid) {
  let lastChildRssBytes = null
  let peakChildRssBytes = null
  let peakParentRssBytes = process.memoryUsage().rss
  let peakCgroupCurrentBytes = null
  const cgroupMemoryLimitPromise = readCgroupMemoryLimitBytes()

  async function sample() {
    const childRssBytes = await readLinuxProcessRssBytes(pid)
    if (typeof childRssBytes === 'number') {
      lastChildRssBytes = childRssBytes
      peakChildRssBytes = Math.max(peakChildRssBytes ?? 0, childRssBytes)
    }

    const parentRssBytes = process.memoryUsage().rss
    peakParentRssBytes = Math.max(peakParentRssBytes, parentRssBytes)

    const cgroupCurrentBytes = await readCgroupMemoryCurrentBytes()
    if (typeof cgroupCurrentBytes === 'number') {
      peakCgroupCurrentBytes = Math.max(peakCgroupCurrentBytes ?? 0, cgroupCurrentBytes)
    }
  }

  const interval = setInterval(() => {
    void sample()
  }, 100)
  interval.unref?.()
  void sample()

  return async () => {
    clearInterval(interval)
    await sample()
    const cgroupMemoryLimitBytes = await cgroupMemoryLimitPromise
    return {
      lastChildRssBytes,
      peakChildRssBytes,
      peakParentRssBytes,
      peakCgroupCurrentBytes,
      cgroupMemoryLimitBytes,
      summary: formatResourceSummary({
        peakChildRssBytes,
        peakParentRssBytes,
        peakCgroupCurrentBytes,
        cgroupMemoryLimitBytes,
      }),
    }
  }
}

function tokenizeCommandLine(command) {
  const tokens = []
  let current = ''
  let quote = null

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]

    if (quote) {
      if (char === quote) {
        quote = null
        continue
      }

      if (char === '\\' && quote === '"' && index + 1 < command.length) {
        current += command[index + 1]
        index += 1
        continue
      }

      current += char
      continue
    }

    if (char === "'" || char === '"') {
      quote = char
      continue
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }

    if (char === '\\' && index + 1 < command.length) {
      current += command[index + 1]
      index += 1
      continue
    }

    current += char
  }

  if (quote) {
    throw new Error('POB_RUNTIME_COMMAND contains an unmatched quote')
  }

  if (current) {
    tokens.push(current)
  }

  return tokens
}

function parseRuntimeCommand(command) {
  const trimmed = String(command ?? '').trim()
  if (!trimmed) {
    throw new Error('POB_RUNTIME_COMMAND is empty')
  }

  if (trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed)
    if (
      !Array.isArray(parsed) ||
      parsed.length === 0 ||
      parsed.some((entry) => typeof entry !== 'string' || entry.trim().length === 0)
    ) {
      throw new Error('POB_RUNTIME_COMMAND JSON form must be a non-empty string array')
    }

    return {
      file: parsed[0],
      args: parsed.slice(1),
    }
  }

  const tokens = tokenizeCommandLine(trimmed)
  if (tokens.length === 0) {
    throw new Error('POB_RUNTIME_COMMAND did not contain an executable')
  }

  return {
    file: tokens[0],
    args: tokens.slice(1),
  }
}

function isLikelyWindowsAbsolutePath(value) {
  return typeof value === 'string' && /^[a-zA-Z]:[\\/]/.test(value)
}

function isLikelyWindowsAbsoluteCommand(command) {
  const trimmed = String(command ?? '').trim()
  if (!trimmed) return false

  if (/^(["'])?[a-zA-Z]:[\\/]/.test(trimmed)) {
    return true
  }

  if (!trimmed.startsWith('[')) {
    return false
  }

  try {
    const parsed = JSON.parse(trimmed)
    return Array.isArray(parsed) && parsed.length > 0 && isLikelyWindowsAbsolutePath(parsed[0])
  } catch {
    return false
  }
}

function getDefaultRuntimeCommand(platform = process.platform) {
  return platform === 'win32' ? null : DEFAULT_LINUX_POB_RUNTIME_COMMAND
}

export function resolvePobRuntimeCommand({
  command = process.env.POB_RUNTIME_COMMAND,
  platform = process.platform,
} = {}) {
  const configuredCommand = typeof command === 'string' ? command.trim() : ''
  const defaultCommand = getDefaultRuntimeCommand(platform)

  if (!configuredCommand) {
    return defaultCommand
      ? {
          command: defaultCommand,
          configured: true,
          source: 'default-linux',
          warning: null,
        }
      : {
          command: null,
          configured: false,
          source: 'missing',
          warning: null,
        }
  }

  if (
    platform !== 'win32' &&
    defaultCommand &&
    isLikelyWindowsAbsoluteCommand(configuredCommand)
  ) {
    return {
      command: defaultCommand,
      configured: true,
      source: 'default-linux-fallback',
      warning:
        `Ignored a Windows-only POB_RUNTIME_COMMAND override on ${platform} and fell back to ` +
        `${defaultCommand}. Remove the stale override from the deployment config when convenient.`,
    }
  }

  return {
    command: configuredCommand,
    configured: true,
    source: 'env',
    warning: null,
  }
}

function runExternalPobHarness(command, payload) {
  return new Promise((resolve, reject) => {
    let runtimeCommand
    try {
      runtimeCommand = parseRuntimeCommand(command)
    } catch (error) {
      reject(error)
      return
    }

    if (process.platform !== 'win32' && isLikelyWindowsAbsolutePath(runtimeCommand.file)) {
      reject(
        new Error(
          `POB_RUNTIME_COMMAND points to a Windows path (${runtimeCommand.file}) but the worker is running on ${process.platform}.`,
        ),
      )
      return
    }

    const child = spawn(runtimeCommand.file, runtimeCommand.args, {
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const stopResourceTracking = startProcessResourceTracker(child.pid)

    const MAX_OUTPUT_BYTES = 50 * 1024 * 1024 // 50 MB
    const RUNTIME_TIMEOUT_MS = Number(process.env.POB_RUNTIME_TIMEOUT_MS) || 5 * 60 * 1000
    let stdout = ''
    let stderr = ''
    let stdoutTruncated = false
    let stderrTruncated = false
    let killed = false

    const timeoutHandle = setTimeout(() => {
      killed = true
      child.kill('SIGKILL')
    }, RUNTIME_TIMEOUT_MS)

    child.stdout.on('data', (chunk) => {
      if (stdoutTruncated) return
      const text = chunk.toString()
      if (stdout.length + text.length > MAX_OUTPUT_BYTES) {
        stdout += text.slice(0, MAX_OUTPUT_BYTES - stdout.length)
        stdoutTruncated = true
        return
      }
      stdout += text
    })

    child.stderr.on('data', (chunk) => {
      if (stderrTruncated) return
      const text = chunk.toString()
      if (stderr.length + text.length > MAX_OUTPUT_BYTES) {
        stderr += text.slice(0, MAX_OUTPUT_BYTES - stderr.length)
        stderrTruncated = true
        return
      }
      stderr += text
    })

    child.on('error', (error) => {
      clearTimeout(timeoutHandle)
      reject(error)
    })
    child.on('close', async (code, signal) => {
      clearTimeout(timeoutHandle)

      if (killed) {
        const resourceStats = await stopResourceTracking()
        reject(
          new Error(
            `PoB runtime timed out after ${RUNTIME_TIMEOUT_MS}ms and was killed${resourceStats.summary ? ` (${resourceStats.summary})` : ''}`,
          ),
        )
        return
      }
      const resourceStats = await stopResourceTracking()

      // Always forward Lua stderr to Node stderr so it appears in docker logs
      if (stderr.trim()) {
        process.stderr.write(stderr.endsWith('\n') ? stderr : stderr + '\n')
      }
      if (resourceStats.summary) {
        console.error(`[pob-runtime] ${resourceStats.summary}`)
      }

      if (code !== 0 || signal) {
        let structuredError = null

        if (stdout.trim()) {
          try {
            const parsed = JSON.parse(stdout)
            const summary =
              parsed?.summary && typeof parsed.summary === 'object' && !Array.isArray(parsed.summary)
                ? parsed.summary
                : {}
            const runtimeError =
              typeof summary.error === 'string' && summary.error.trim().length > 0
                ? summary.error.trim()
                : null
            const partialReason =
              typeof parsed?.partialReason === 'string' && parsed.partialReason.trim().length > 0
                ? parsed.partialReason.trim()
                : null
            structuredError = runtimeError ?? partialReason
          } catch {
            structuredError = null
          }
        }

        const signalMessage = signal
          ? `PoB runtime terminated by signal ${signal}${resourceStats.summary ? ` (${resourceStats.summary})` : ''}`
          : null
        const exitMessage =
          code != null
            ? `PoB runtime exited with code ${code}${resourceStats.summary ? ` (${resourceStats.summary})` : ''}`
            : `PoB runtime exited unexpectedly${resourceStats.summary ? ` (${resourceStats.summary})` : ''}`

        reject(
          new Error(
            structuredError ||
              signalMessage ||
              stderr.trim() ||
              exitMessage,
          ),
        )
        return
      }

      try {
        resolve(stdout.trim() ? JSON.parse(stdout) : {})
      } catch (error) {
        reject(
          new Error(
            `PoB runtime returned invalid JSON${error instanceof Error ? `: ${error.message}` : ''}`,
          ),
        )
      }
    })

    // Suppress EPIPE — if the child exits before reading stdin the close handler
    // will already reject the promise with the real error from stderr/exit code.
    child.stdin.on('error', () => {})
    child.stdin.write(JSON.stringify(payload))
    child.stdin.end()
  })
}

export async function analyzeWithPob({
  run,
  buildTarget,
  targetStage,
  profile,
  latestItems,
  marketUniques,
  marketRares,
  league,
  targetContext,
  partyBuilds,
  rareSlotContext,
}) {
  const resolvedRuntime = resolvePobRuntimeCommand()
  if (!resolvedRuntime.command) {
    throw new Error('POB_RUNTIME_COMMAND is not configured')
  }
  if (resolvedRuntime.warning) {
    console.warn(`[pob-runtime] ${resolvedRuntime.warning}`)
  }

  if (!buildTarget?.raw_xml) {
    throw new Error('Build target raw_xml is required for PoB analysis')
  }

  const payload = buildPobRuntimePayload({
    run,
    buildTarget,
    targetStage,
    profile,
    latestItems,
    marketUniques,
    marketRares,
    league,
    targetContext,
    partyBuilds,
    rareSlotContext,
  })
  const result = await runExternalPobHarness(resolvedRuntime.command, payload)
  const baselineMetrics = extractBaselineMetrics(result)

  const normalizedSummary =
    result.summary && typeof result.summary === 'object' && !Array.isArray(result.summary)
      ? result.summary
      : {}

  const normalizedPlans = Array.isArray(result.plans) ? result.plans : []
  const normalizedOverviewPlans = Array.isArray(result.overview_plans) ? result.overview_plans : []
  return {
    status: typeof result.status === 'string' ? result.status : 'completed',
    partialReason: typeof result.partialReason === 'string' ? result.partialReason : null,
    summary: {
      engine: 'pob',
      engine_contract: 'pob-2.68.1-adapter-1',
      pob_revision: 'a41fec6c20f822a658ae5df1273e8c69d5969bac',
      runtime_command: resolvedRuntime.command,
      runtime_command_source: resolvedRuntime.source,
      runtime_command_warning: resolvedRuntime.warning,
      payload_diagnostics: payload.diagnostics,
      exact_baseline_metrics: baselineMetrics,
      ...normalizedSummary,
    },
    plans: applyExactBaselineToPlans(normalizedPlans, baselineMetrics),
    overview_plans: normalizedOverviewPlans.length > 0
      ? applyExactBaselineToPlans(normalizedOverviewPlans, baselineMetrics)
      : undefined,
  }
}

export function getPobDiagnostics() {
  const resolvedRuntime = resolvePobRuntimeCommand()
  return {
    pob_runtime_configured: resolvedRuntime.configured,
    pob_runtime_mode: resolvedRuntime.command ? 'external-command' : 'disabled',
    pob_runtime_command: resolvedRuntime.command,
    pob_runtime_command_source: resolvedRuntime.source,
    pob_runtime_warning: resolvedRuntime.warning,
  }
}
