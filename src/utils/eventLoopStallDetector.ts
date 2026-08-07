import { logForDebugging } from '../debug.js'

/**
 * Threshold (ms) above which the event loop is considered "stalled".
 */
const STALL_THRESHOLD_MS = 200

/**
 * How often (ms) to poll the event loop for stalls.
 */
const POLL_INTERVAL_MS = 1000

/**
 * Maximum number of consecutive stalls before emitting a warning.
 */
const MAX_CONSECUTIVE_STALLS = 5

let intervalId: ReturnType<typeof setInterval> | null = null
let consecutiveStalls = 0
let lastTick = Date.now()

/**
 * Start monitoring the Node.js event loop for stalls.
 *
 * Uses a `setInterval` probe: if the callback fires more than
 * {@link STALL_THRESHOLD_MS} ms after the expected time, the event loop is
 * considered stalled.  Consecutive stalls beyond {@link MAX_CONSECUTIVE_STALLS}
 * trigger a debug log.
 *
 * The detector is a singleton — calling this function when already running
 * is a no-op.
 */
export function startEventLoopStallDetector(): void {
  if (intervalId !== null) {
    logForDebugging('startEventLoopStallDetector: already running')
    return
  }

  lastTick = Date.now()

  intervalId = setInterval(() => {
    const now = Date.now()
    const elapsed = now - lastTick
    lastTick = now

    if (elapsed > STALL_THRESHOLD_MS) {
      consecutiveStalls++
      logForDebugging(
        `Event loop stall detected: ${elapsed}ms (threshold ${STALL_THRESHOLD_MS}ms, ` +
          `consecutive: ${consecutiveStalls}/${MAX_CONSECUTIVE_STALLS})`,
      )

      if (consecutiveStalls >= MAX_CONSECUTIVE_STALLS) {
        logForDebugging(
          `Event loop stalled ${consecutiveStalls} consecutive times — ` +
            'this may indicate a blocking operation or CPU-intensive task.',
        )
      }
    } else {
      consecutiveStalls = 0
    }
  }, POLL_INTERVAL_MS)

  logForDebugging(
    `startEventLoopStallDetector: started (threshold=${STALL_THRESHOLD_MS}ms, ` +
      `poll=${POLL_INTERVAL_MS}ms)`,
  )
}
