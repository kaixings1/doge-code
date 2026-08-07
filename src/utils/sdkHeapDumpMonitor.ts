import { logForDebugging } from '../debug.js'

/**
 * Memory thresholds (bytes) that trigger heap dump generation.
 */
const HEAP_WARNING_THRESHOLD = 500 * 1024 * 1024 // 500 MB
const HEAP_CRITICAL_THRESHOLD = 1 * 1024 * 1024 * 1024 // 1 GB

/**
 * How often (ms) to poll the Node.js heap for memory pressure.
 */
const POLL_INTERVAL_MS = 30_000

let intervalId: ReturnType<typeof setInterval> | null = null
let dumpCount = 0

/**
 * Start monitoring SDK (process) memory usage.
 *
 * Periodically checks `process.memoryUsage()` and logs warnings when heap
 * usage exceeds {@link HEAP_WARNING_THRESHOLD}.  At
 * {@link HEAP_CRITICAL_THRESHOLD} a heap snapshot is requested via
 * `writeHeapSnapshot()` (V8 API) for later analysis.
 *
 * The monitor is a singleton — calling when already running is a no-op.
 */
export function startSdkMemoryMonitor(): void {
  if (intervalId !== null) {
    logForDebugging('startSdkMemoryMonitor: already running')
    return
  }

  intervalId = setInterval(() => {
    const mem = process.memoryUsage()
    const heapUsed = mem.heapUsed
    const rss = mem.rss

    if (heapUsed > HEAP_CRITICAL_THRESHOLD) {
      dumpCount++
      const snapshotPath = `/tmp/sdk-heap-${Date.now()}-${dumpCount}.heapsnapshot`
      try {
        if (typeof (process as any).writeHeapSnapshot === 'function') {
          ;(process as any).writeHeapSnapshot(snapshotPath)
          logForDebugging(
            `startSdkMemoryMonitor: CRITICAL heap ${Math.round(heapUsed / 1024 / 1024)}MB ` +
              `(RSS ${Math.round(rss / 1024 / 1024)}MB) — heap snapshot written to ${snapshotPath}`,
          )
        } else {
          logForDebugging(
            `startSdkMemoryMonitor: CRITICAL heap ${Math.round(heapUsed / 1024 / 1024)}MB ` +
              `(RSS ${Math.round(rss / 1024 / 1024)}MB) — writeHeapSnapshot unavailable`,
          )
        }
      } catch (error) {
        logForDebugging(
          `startSdkMemoryMonitor: heap snapshot failed — ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    } else if (heapUsed > HEAP_WARNING_THRESHOLD) {
      logForDebugging(
        `startSdkMemoryMonitor: WARNING heap ${Math.round(heapUsed / 1024 / 1024)}MB ` +
          `(RSS ${Math.round(rss / 1024 / 1024)}MB) exceeds ${Math.round(HEAP_WARNING_THRESHOLD / 1024 / 1024)}MB`,
      )
    }
  }, POLL_INTERVAL_MS)

  logForDebugging(
    `startSdkMemoryMonitor: started (warning=${Math.round(HEAP_WARNING_THRESHOLD / 1024 / 1024)}MB, ` +
      `critical=${Math.round(HEAP_CRITICAL_THRESHOLD / 1024 / 1024)}MB, poll=${POLL_INTERVAL_MS}ms)`,
  )
}
