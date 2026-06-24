/**
 * Skill Usage Tracking
 *
 * Tracks per-skill usage metadata (invocation count, last used timestamp)
 * in a sidecar JSON file. Data is used by the Curator to decide lifecycle
 * transitions (active -> stale -> archived).
 *
 * Design:
 * - Sidecar file: DOGE_HOME/skills/.usage.json
 * - Atomic writes via temp file + rename (never corrupts on crash)
 * - Best-effort: failures log at debug level, never break skill execution
 */

import { constants as fsConstants } from 'fs'
import { mkdir, open, rename, writeFile, readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { logForDebugging } from '../../utils/debug.js'

export type UsageRecord = {
  name: string
  invocationCount: number
  lastUsedAt: string       // ISO datetime
  createdAt: string        // ISO datetime
  source: 'bundled' | 'disk' | 'hub' | 'agent-created'
  pinned?: boolean         // opt-out from auto-archival
}

type UsageData = {
  skills: Record<string, UsageRecord>
}

function usageFilePath(): string {
  return join(getClaudeConfigHomeDir(), 'skills', '.usage.json')
}

let _cached: UsageData | null = null
let _cachePromise: Promise<UsageData> | null = null

async function ensureDir(): Promise<void> {
  const dir = dirname(usageFilePath())
  await mkdir(dir, { recursive: true })
}

async function load(): Promise<UsageData> {
  if (_cached) return _cached
  if (_cachePromise) return _cachePromise

  _cachePromise = (async () => {
    const path = usageFilePath()
    try {
      const raw = await readFile(path, 'utf-8')
      const data = JSON.parse(raw) as UsageData
      _cached = data
      return data
    } catch {
      const empty: UsageData = { skills: {} }
      _cached = empty
      return empty
    }
  })()

  return _cachePromise
}

function clearCache(): void {
  _cached = null
  _cachePromise = null
}

/**
 * Record a skill invocation: bump count and update lastUsedAt.
 * Best-effort — never throws.
 */
export async function recordSkillInvocation(
  name: string,
  source?: UsageRecord['source'],
): Promise<void> {
  try {
    const data = await load()
    const existing = data.skills[name]
    const now = new Date().toISOString()

    if (existing) {
      existing.invocationCount++
      existing.lastUsedAt = now
    } else {
      data.skills[name] = {
        name,
        invocationCount: 1,
        lastUsedAt: now,
        createdAt: now,
        source: source ?? 'bundled',
      }
    }

    await persist(data)
  } catch (e) {
    logForDebugging(`[skillUsage] Failed to record invocation for "${name}": ${e}`)
  }
}

/**
 * Get usage report for all tracked skills.
 */
export async function getUsageReport(): Promise<UsageRecord[]> {
  const data = await load()
  return Object.values(data.skills).sort(
    (a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime(),
  )
}

/**
 * Mark a skill as pinned (opt-out from auto-archival).
 */
export async function pinSkill(name: string, pinned: boolean): Promise<void> {
  try {
    const data = await load()
    if (data.skills[name]) {
      data.skills[name].pinned = pinned
      await persist(data)
    }
  } catch (e) {
    logForDebugging(`[skillUsage] Failed to pin "${name}": ${e}`)
  }
}

/**
 * Remove a skill from the tracking file (e.g. after manual uninstall).
 */
export async function removeSkill(name: string): Promise<void> {
  try {
    const data = await load()
    delete data.skills[name]
    await persist(data)
  } catch (e) {
    logForDebugging(`[skillUsage] Failed to remove "${name}": ${e}`)
  }
}

async function persist(data: UsageData): Promise<void> {
  await ensureDir()
  const path = usageFilePath()
  const tmpPath = path + '.tmp'
  const raw = JSON.stringify(data, null, 2)
  await writeFile(tmpPath, raw, 'utf-8')
  await rename(tmpPath, path)
  clearCache()
}
