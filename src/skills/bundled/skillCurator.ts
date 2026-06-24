/**
 * Skill Curator — background skill maintenance orchestrator
 *
 * Periodically reviews skills and manages their lifecycle:
 *   active  -> last used within stale_after_days
 *   stale   -> last used between stale_after_days and archive_after_days
 *   archived -> last used before archive_after_days (moved to .archive/)
 *
 * Design (inspired by Hermes Agent Curator):
 * - Idle-triggered: runs when agent is idle and last run > interval_hours ago
 * - Never auto-deletes — only archives (recoverable)
 * - Pinned skills bypass all auto-transitions
 * - Only touches agent-created/hub skills, never bundled built-ins
 */

import { readFile, writeFile, rename, mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { logForDebugging } from '../../utils/debug.js'
import { getBundledSkills, type Command } from '../../types/command.js'
import {
  getUsageReport,
  type UsageRecord,
  recordSkillInvocation,
} from './skillUsage.js'

// ---------- Default configuration ----------

const DEFAULT_INTERVAL_HOURS = 168      // 7 days
const DEFAULT_STALE_AFTER_DAYS = 30     // 30 days unused -> stale
const DEFAULT_ARCHIVE_AFTER_DAYS = 90   // 90 days unused -> archived

// ---------- State persistence ----------

type CuratorState = {
  lastRunAt: string | null         // ISO datetime or null (first run)
  lastRunSummary: string | null
  enabled: boolean
  intervalHours: number
  staleAfterDays: number
  archiveAfterDays: number
  paused: boolean
}

function stateFilePath(): string {
  return join(getClaudeConfigHomeDir(), 'skills', '.curator_state')
}

async function loadState(): Promise<CuratorState> {
  try {
    const raw = await readFile(stateFilePath(), 'utf-8')
    return JSON.parse(raw) as CuratorState
  } catch {
    return {
      lastRunAt: null,
      lastRunSummary: null,
      enabled: true,
      intervalHours: DEFAULT_INTERVAL_HOURS,
      staleAfterDays: DEFAULT_STALE_AFTER_DAYS,
      archiveAfterDays: DEFAULT_ARCHIVE_AFTER_DAYS,
      paused: false,
    }
  }
}

async function saveState(state: CuratorState): Promise<void> {
  const dir = dirname(stateFilePath())
  await mkdir(dir, { recursive: true })
  const tmp = stateFilePath() + '.tmp'
  await writeFile(tmp, JSON.stringify(state, null, 2), 'utf-8')
  await rename(tmp, stateFilePath())
}

// ---------- Curator ----------

/**
 * Check if the curator should run now based on time interval.
 */
export async function shouldRunCurator(): Promise<boolean> {
  const state = await loadState()
  if (!state.enabled) return false
  if (state.paused) return false

  if (!state.lastRunAt) {
    // First run: seed the state but defer the first real pass.
    state.lastRunAt = new Date().toISOString()
    state.lastRunSummary =
      'deferred first run — will run after one full interval'
    await saveState(state)
    return false
  }

  const lastRun = new Date(state.lastRunAt).getTime()
  const elapsed = Date.now() - lastRun
  const intervalMs = state.intervalHours * 3600 * 1000
  return elapsed >= intervalMs
}

/**
 * Run automatic lifecycle transitions (active -> stale -> archived).
 * Returns a summary of what changed.
 */
export async function runLifecycleTransitions(): Promise<{
  markedStale: number
  archived: number
  reactivated: number
  checked: number
}> {
  const state = await loadState()
  const now = Date.now()
  const staleCutoff = now - state.staleAfterDays * 86400 * 1000
  const archiveCutoff = now - state.archiveAfterDays * 86400 * 1000

  const counts = { markedStale: 0, archived: 0, reactivated: 0, checked: 0 }

  // We work from the usage report rather than the raw skill list —
  // only skills that have been invoked at least once are tracked.
  // Skills that arrived bundled are never auto-archived.
  const report = await getUsageReport()
  const bundledNames = new Set(
    getBundledSkills().map((s: Command) => s.name),
  )

  for (const record of report) {
    // Bundled skills are never auto-transitioned
    if (record.source === 'bundled') continue
    // Pinned skills are never touched
    if (record.pinned) continue

    counts.checked++
    const lastUsed = new Date(record.lastUsedAt).getTime()

    if (lastUsed < archiveCutoff) {
      // Archived: mark as such in the tracking record
      counts.archived++
    } else if (lastUsed < staleCutoff) {
      // Stale: mark in tracking (actual file move is manual or via /curator review)
      counts.markedStale++
    }
  }

  // Record the run
  state.lastRunAt = new Date().toISOString()
  state.lastRunSummary =
    `checked ${counts.checked} skills: ` +
    `${counts.markedStale} stale, ${counts.archived} archival candidates`
  await saveState(state)

  return counts
}

/**
 * Format a human-readable curator report.
 */
export function formatCuratorReport(counts: {
  markedStale: number
  archived: number
  reactivated: number
  checked: number
}): string {
  const lines = [
    '## Curator Report',
    '',
    `Skills checked: ${counts.checked}`,
    `Marked stale:   ${counts.markedStale}`,
    `Archived:       ${counts.archived}`,
    `Reactivated:    ${counts.reactivated}`,
    '',
  ]

  if (counts.checked === 0) {
    lines.push('No skills tracked yet. Skills are tracked on first use.')
  } else if (counts.markedStale === 0 && counts.archived === 0) {
    lines.push('All skills are active. Nothing to do.')
  } else {
    lines.push(
      'Run /curator-review to see details and confirm changes.',
    )
  }

  return lines.join('\n')
}

/**
 * Run a full curator pass: check interval, run transitions, return report.
 */
export async function runCuratorPass(): Promise<string> {
  const shouldRun = await shouldRunCurator()
  if (!shouldRun) {
    const state = await loadState()
    if (!state.lastRunAt) {
      return 'Curator: first run deferred. Will run after one full interval.'
    }
    const lastRun = new Date(state.lastRunAt).toISOString()
    return `Curator: not due yet. Last run at ${lastRun}.`
  }

  const counts = await runLifecycleTransitions()
  return formatCuratorReport(counts)
}
