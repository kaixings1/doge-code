import { appendFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { logForDebugging } from '../../debug.js'
import { getSessionId } from '../../bootstrap/state.js'

const TRANSCRIPT_DIR = join(process.env.DOGE_HOME ?? process.env.HOME ?? process.env.USERPROFILE ?? '', '.doge', 'transcripts')

/**
 * Ensure the transcript directory exists.
 */
function ensureTranscriptDir(): void {
  if (!existsSync(TRANSCRIPT_DIR)) {
    mkdirSync(TRANSCRIPT_DIR, { recursive: true })
  }
}

/**
 * Get the transcript file path for a given session and date.
 */
function getTranscriptPath(sessionId: string, date: string): string {
  return join(TRANSCRIPT_DIR, `${sessionId}-${date}.jsonl`)
}

/**
 * Append a transcript segment (array of messages) to the session's daily file.
 *
 * Called after each conversation compaction — fire-and-forget, errors are
 * swallowed so they never surface to the user.
 *
 * @param messages - Array of message objects (role + content + metadata).
 */
export async function writeSessionTranscriptSegment(messages: any[]): Promise<void> {
  if (!messages || messages.length === 0) {
    return
  }

  try {
    const sessionId = getSessionId()
    const now = new Date()
    const date = now.toISOString().slice(0, 10) // YYYY-MM-DD
    const path = getTranscriptPath(sessionId, date)
    ensureTranscriptDir()

    const lines = messages.map(msg => JSON.stringify({
      ts: now.toISOString(),
      role: msg.role ?? msg.speaker ?? 'unknown',
      sessionId,
      content: typeof msg.content === 'string' ? msg.content : msg.content,
    }))

    appendFileSync(path, lines.join('\n') + '\n', 'utf-8')
  } catch (error) {
    logForDebugging(
      `writeSessionTranscriptSegment: failed — ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

/**
 * Flush remaining messages and rotate to a new file if the date has changed.
 *
 * Called during compaction to ensure the previous day's transcript is closed
 * cleanly before a new day begins.
 *
 * @param messages      - Remaining messages to flush.
 * @param currentDate   - ISO date string (YYYY-MM-DD) for the target file.
 */
export async function flushOnDateChange(messages: any[], currentDate: string): Promise<void> {
  if (!messages || messages.length === 0) {
    return
  }

  try {
    const sessionId = getSessionId()
    const path = getTranscriptPath(sessionId, currentDate)
    ensureTranscriptDir()

    const lines = messages.map(msg => JSON.stringify({
      ts: new Date().toISOString(),
      role: msg.role ?? msg.speaker ?? 'unknown',
      sessionId,
      content: typeof msg.content === 'string' ? msg.content : msg.content,
      flushed: true,
    }))

    appendFileSync(path, lines.join('\n') + '\n', 'utf-8')
  } catch (error) {
    logForDebugging(
      `flushOnDateChange: failed — ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}
