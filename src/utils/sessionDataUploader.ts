import { logForDebugging } from '../debug.js'

/**
 * Upload a single session turn to the analytics endpoint.
 *
 * @param turnData - Opaque turn payload (messages, metadata, model info).
 */
type UploadFn = (turnData: Record<string, unknown>) => Promise<void>

interface SessionTurnUploader {
  /** Upload a single session turn. */
  upload: UploadFn
  /** Flush any buffered turns and close the session. */
  close: () => Promise<void>
  /** Number of turns currently buffered. */
  readonly pendingCount: number
}

const DEFAULT_ENDPOINT = 'https://api.anthropic.com/v1/sessions/turns'

/**
 * Create a session turn uploader that batches and uploads session data.
 *
 * Turns are buffered in memory and flushed in batches to reduce HTTP
 * overhead.  On `close()` any remaining turns are force-flushed.
 */
export async function createSessionTurnUploader(): Promise<SessionTurnUploader> {
  const buffer: Record<string, unknown>[] = []
  const BATCH_SIZE = 10
  const FLUSH_INTERVAL_MS = 5_000

  let flushTimer: ReturnType<typeof setInterval> | null = null
  let closed = false

  async function flush(): Promise<void> {
    if (buffer.length === 0 || closed) return

    const batch = buffer.splice(0, Math.min(buffer.length, BATCH_SIZE))
    if (batch.length === 0) return

    try {
      const payload = JSON.stringify({ turns: batch, source: 'claude-code' })
      await uploadBatch(payload)
      logForDebugging(
        `sessionDataUploader: flushed ${batch.length} turns (${buffer.length} remaining)`,
      )
    } catch (error) {
      logForDebugging(
        `sessionDataUploader: flush failed — ${error instanceof Error ? error.message : String(error)}`,
      )
      // Put unflushed turns back at the front of the buffer.
      buffer.unshift(...batch)
    }
  }

  flushTimer = setInterval(flush, FLUSH_INTERVAL_MS)

  const uploader: SessionTurnUploader = {
    async upload(turnData) {
      if (closed) {
        logForDebugging('sessionDataUploader: upload after close, ignoring')
        return
      }
      buffer.push(turnData)
      if (buffer.length >= BATCH_SIZE) {
        void flush()
      }
    },

    async close() {
      closed = true
      if (flushTimer) {
        clearInterval(flushTimer)
        flushTimer = null
      }
      await flush()
    },

    get pendingCount() {
      return buffer.length
    },
  }

  logForDebugging('sessionDataUploader: created (batchSize=10, flushInterval=5s)')
  return uploader
}

/**
 * Send a JSON payload to the session analytics endpoint.
 */
async function uploadBatch(payload: string): Promise<void> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)

    const response = await fetch(DEFAULT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'claude-code/999.0.0',
      },
      body: payload,
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new Error('Upload timed out after 10s')
    }
    throw error
  }
}
