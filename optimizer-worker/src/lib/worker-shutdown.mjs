export function closeHttpServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error)
      else resolve()
    })
    server.closeIdleConnections?.()
  })
}

export function createShutdownCoordinator({
  markReady,
  stopPolling,
  closeServer,
  drain,
  forceClose = () => {},
  timeoutMs,
  logger,
}) {
  let shutdownPromise = null
  let shuttingDown = false

  async function runShutdown(signal) {
    shuttingDown = true
    markReady(false)
    stopPolling()
    logger.info('shutdown_started', { signal, timeoutMs })

    let timeoutId
    const timeout = new Promise((resolve) => {
      timeoutId = setTimeout(() => resolve({ timedOut: true }), timeoutMs)
    })
    const graceful = Promise.all([closeServer(), drain()]).then(() => ({ timedOut: false }))
    const result = await Promise.race([graceful, timeout])
    clearTimeout(timeoutId)

    if (result.timedOut) {
      forceClose()
      logger.error('shutdown_timed_out', { signal, timeoutMs })
    } else {
      logger.info('shutdown_completed', { signal })
    }

    return result
  }

  return {
    isShuttingDown() {
      return shuttingDown
    },
    shutdown(signal = 'manual') {
      if (!shutdownPromise) shutdownPromise = runShutdown(signal)
      return shutdownPromise
    },
  }
}
