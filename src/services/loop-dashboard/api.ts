// ============================================================================
// Loop Dashboard API - 数据读取和聚合
// ============================================================================

import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { execFileNoThrow } from '../../utils/execFileNoThrow.js'
import type {
  LoopMetricsData,
  ActiveLoop,
  DeadLetterEntry,
  LoopHistoryEntry,
  SystemHealth,
  LoopDashboardData,
} from './types.js'

// ============================================================================
// Paths
// ============================================================================

const LOOP_BASE = join(homedir(), '.doge', 'loops')
const CHECKPOINT_DIR = join(LOOP_BASE, 'checkpoints')
const DLQ_DIR = join(LOOP_BASE, 'dead-letter-queue')
const METRICS_FILE = join(LOOP_BASE, 'metrics.json')

// ============================================================================
// Metrics
// ============================================================================

function loadMetricsFile(): any[] {
  if (!existsSync(METRICS_FILE)) return []
  try {
    return JSON.parse(readFileSync(METRICS_FILE, 'utf-8'))
  } catch {
    return []
  }
}

function loadCheckpoints(): any[] {
  if (!existsSync(CHECKPOINT_DIR)) return []
  try {
    const files = readdirSync(CHECKPOINT_DIR).filter(f => f.endsWith('.json'))
    return files.map(f => {
      try { return JSON.parse(readFileSync(join(CHECKPOINT_DIR, f), 'utf-8')) } catch { return null }
    }).filter(Boolean)
  } catch {
    return []
  }
}

function loadDeadLetters(): any[] {
  if (!existsSync(DLQ_DIR)) return []
  try {
    const files = readdirSync(DLQ_DIR).filter(f => f.endsWith('.json'))
    return files.map(f => {
      try { return JSON.parse(readFileSync(join(DLQ_DIR, f), 'utf-8')) } catch { return null }
    }).filter(Boolean)
  } catch {
    return []
  }
}

// ============================================================================
// Helpers
// ============================================================================

function safeNum(v: any): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function computeDurationMs(entry: any): number {
  if (!entry) return 0
  const start = entry.startTime ? new Date(entry.startTime).getTime() : 0
  const end = entry.endTime ? new Date(entry.endTime).getTime() : Date.now()
  if (!start) return 0
  return Math.max(0, end - start)
}

// ============================================================================
// Public API
// ============================================================================

export function getLoopMetrics(): LoopMetricsData {
  const metrics = loadMetricsFile()
  const totalLoops = metrics.length
  const successCount = metrics.filter(m => m.failureCount === 0 && m.totalIterations > 0).length
  const failureCount = metrics.filter(m => m.failureCount > 0).length
  const totalTokens = metrics.reduce((sum, m) => sum + safeNum(m.totalTokens), 0)
  const totalCost = metrics.reduce((sum, m) => sum + safeNum(m.totalCost), 0)
  const avgDurationMs = totalLoops > 0 ? metrics.reduce((sum, m) => sum + safeNum(m.avgDurationMs), 0) / totalLoops : 0

  const patterns: Record<string, number> = {}
  for (const m of metrics) {
    const p = typeof m.pattern === 'string' ? m.pattern : 'unknown'
    patterns[p] = (patterns[p] || 0) + 1
  }

  return {
    totalLoops,
    successCount,
    failureCount,
    successRate: totalLoops > 0 ? successCount / totalLoops : 0,
    avgDurationMs,
    totalTokens,
    totalCost,
    patterns,
  }
}

export function getActiveLoops(): ActiveLoop[] {
  const checkpoints = loadCheckpoints()
  const byLoopId = new Map<string, any[]>()

  for (const cp of checkpoints) {
    const arr = byLoopId.get(cp.loopId) || []
    arr.push(cp)
    byLoopId.set(cp.loopId, arr)
  }

  const active: ActiveLoop[] = []
  for (const [loopId, cps] of byLoopId.entries()) {
    const sorted = cps.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    const latest = sorted[0]
    if (!latest) continue

    const started = latest.startTime || latest.timestamp
    const startedAt = new Date(started).getTime()
    const now = Date.now()
    const durationMs = Math.max(0, now - startedAt)

    active.push({
      loopId,
      pattern: typeof latest.pattern === 'string' ? latest.pattern : 'unknown',
      status: latest.status || 'idle',
      currentIteration: safeNum(latest.iteration),
      maxIterations: 10,
      startTime: started,
      durationMs,
      tokensUsed: safeNum(latest.tokensUsed),
      successCount: 0,
      failureCount: 0,
    })
  }

  return active
}

export function getRecentLoops(limit = 20): LoopHistoryEntry[] {
  const metrics = loadMetricsFile()
  const recent = metrics
    .slice()
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
    .slice(0, limit)

  return recent.map(m => ({
    loopId: m.loopId,
    pattern: typeof m.pattern === 'string' ? m.pattern : 'unknown',
    status: m.failureCount > 0 ? 'failed' : 'completed',
    startTime: m.startTime,
    endTime: m.endTime || m.startTime,
    durationMs: safeNum(m.avgDurationMs),
    tokensUsed: safeNum(m.totalTokens),
    successCount: safeNum(m.successCount),
    failureCount: safeNum(m.failureCount),
  }))
}

export function getDeadLetterQueue(): DeadLetterEntry[] {
  const entries = loadDeadLetters()
  return entries
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map(e => ({
      taskId: e.taskId,
      loopId: e.loopId,
      pattern: typeof e.pattern === 'string' ? e.pattern : 'unknown',
      error: typeof e.error === 'string' ? e.error : String(e.error || 'Unknown error'),
      retries: safeNum(e.retries),
      createdAt: e.createdAt,
      status: e.status || 'pending',
    }))
}

export async function getSystemHealth(): Promise<SystemHealth> {
  let cpu = 0
  let memory = 0
  let diskFreeGB = 0
  try {
    // @ts-ignore
    const os = require('os')
    cpu = os.cpus().length
    memory = Math.round((1 - os.freemem() / os.totalmem()) * 100)
  } catch {
    // ignore
  }

  try {
    const result = await execFileNoThrow('wmic', ['logicaldisk', 'where', 'DeviceID="C:"', 'get', 'FreeSpace', '/format:value'], { preserveOutputOnError: false })
    const match = result.stdout.match(/FreeSpace=(\d+)/)
    if (match) diskFreeGB = Math.round(parseInt(match[1]!) / 1024 / 1024 / 1024)
  } catch {
    // ignore
  }

  const checkpoints = loadCheckpoints()
  const deadLetters = loadDeadLetters()

  return {
    cpu,
    memory,
    diskFreeGB,
    checkpointCount: checkpoints.length,
    deadLetterCount: deadLetters.length,
    lockStatus: 'ok',
  }
}

export async function getLoopDashboardData(): Promise<LoopDashboardData> {
  const systemHealth = await getSystemHealth()
  return {
    generatedAt: new Date().toISOString(),
    activeLoops: getActiveLoops(),
    recentLoops: getRecentLoops(),
    deadLetterQueue: getDeadLetterQueue(),
    metrics: getLoopMetrics(),
    systemHealth,
  }
}
