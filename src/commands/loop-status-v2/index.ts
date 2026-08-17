// ============================================================================
// Loop Status V2 Command - 检查增强版循环操作员状态
// ============================================================================

import type { Command, LocalCommandCall, LocalCommandResult } from '../commands.js'
import { existsSync, readdirSync, readFileSync, statSync, unlinkSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

// ============================================================================
// Types
// ============================================================================

interface StatusLoop {
  loopId: string
  pattern: string
  status: string
  currentIteration: number
  maxIterations: number
  startTime: string
  durationMs: number
  tokensUsed: number
  successCount: number
  failureCount: number
}

interface DeadLetterEntry {
  taskId: string
  loopId: string
  pattern: string
  error: string
  retries: number
  createdAt: string
  status: string
}

interface MetricsSummary {
  totalLoops: number
  successCount: number
  failureCount: number
  successRate: number
  avgDurationMs: number
  totalTokens: number
  totalCost: number
}

// ============================================================================
// Helpers
// ============================================================================

const LOOP_BASE = join(homedir(), '.doge', 'loops')
const CHECKPOINT_DIR = join(LOOP_BASE, 'checkpoints')
const DLQ_DIR = join(LOOP_BASE, 'dead-letter-queue')
const METRICS_FILE = join(LOOP_BASE, 'metrics.json')

function safeNum(v: any): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

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

function loadDeadLetters(): DeadLetterEntry[] {
  if (!existsSync(DLQ_DIR)) return []
  try {
    const files = readdirSync(DLQ_DIR).filter(f => f.endsWith('.json'))
    return files.map(f => {
      try {
        const d = JSON.parse(readFileSync(join(DLQ_DIR, f), 'utf-8'))
        return {
          taskId: d.taskId,
          loopId: d.loopId,
          pattern: typeof d.pattern === 'string' ? d.pattern : 'unknown',
          error: typeof d.error === 'string' ? d.error : String(d.error || 'Unknown error'),
          retries: safeNum(d.retries),
          createdAt: d.createdAt,
          status: d.status || 'pending',
        }
      } catch {
        return null
      }
    }).filter(Boolean) as DeadLetterEntry[]
  } catch {
    return []
  }
}

function getActiveLoops(): StatusLoop[] {
  const checkpoints = loadCheckpoints()
  const byLoopId = new Map<string, any[]>()

  for (const cp of checkpoints) {
    const arr = byLoopId.get(cp.loopId) || []
    arr.push(cp)
    byLoopId.set(cp.loopId, arr)
  }

  const active: StatusLoop[] = []
  for (const [loopId, cps] of byLoopId.entries()) {
    const sorted = cps.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    const latest = sorted[0]
    if (!latest) continue

    const started = latest.startTime || latest.timestamp
    const startedAt = new Date(started).getTime()
    const durationMs = Math.max(0, Date.now() - startedAt)

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

function getMetrics(): MetricsSummary {
  const metrics = loadMetricsFile()
  const totalLoops = metrics.length
  const successCount = metrics.filter(m => m.failureCount === 0).length
  const failureCount = metrics.filter(m => m.failureCount > 0).length
  const totalTokens = metrics.reduce((sum, m) => sum + safeNum(m.totalTokens), 0)
  const totalCost = metrics.reduce((sum, m) => sum + safeNum(m.totalCost), 0)
  const avgDurationMs = totalLoops > 0 ? metrics.reduce((sum, m) => sum + safeNum(m.avgDurationMs), 0) / totalLoops : 0

  return {
    totalLoops,
    successCount,
    failureCount,
    successRate: totalLoops > 0 ? successCount / totalLoops : 0,
    avgDurationMs,
    totalTokens,
    totalCost,
  }
}

// ============================================================================
// Command
// ============================================================================

const call: LocalCommandCall = async (args): Promise<LocalCommandResult> => {
  const s = (args ?? '').trim()

  // Help
  if (!s || s === 'help' || s === '--help') {
    return {
      type: 'text',
      value: [
        '## 📊 /loop-status-v2 — 检查增强版循环操作员状态',
        '',
        '用法：',
        '  /loop-status-v2                  查看所有循环状态',
        '  /loop-status-v2 --watch          实时监控模式',
        '  /loop-status-v2 --loop-id <id>   查看特定循环',
        '  /loop-status-v2 --json           JSON 格式输出',
        '  /loop-status-v2 --dead-letter    只显示死信队列',
        '  /loop-status-v2 --metrics        只显示指标统计',
        '  /loop-status-v2 --checkpoints    只显示检查点历史',
        '  /loop-status-v2 --clean          清理过期数据（>7 天）',
        '',
        '存储位置：',
        `  检查点: ${CHECKPOINT_DIR}`,
        `  死信队列: ${DLQ_DIR}`,
        `  指标文件: ${METRICS_FILE}`,
      ].join('\n'),
    }
  }

  // Clean mode
  if (s.includes('--clean')) {
    // 清理 >7 天的文件
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
    let cleaned = 0

    for (const dir of [CHECKPOINT_DIR, DLQ_DIR]) {
      if (!existsSync(dir)) continue
      const files = readdirSync(dir).filter(f => f.endsWith('.json'))
      for (const f of files) {
        const fp = join(dir, f)
        try {
          const stat = statSync(fp)
          if (stat.mtimeMs < cutoff) {
            unlinkSync(fp)
            cleaned++
          }
        } catch {
          // skip
        }
      }
    }

    return { type: 'text', value: `✅ 已清理 ${cleaned} 个过期文件（>7 天）` }
  }

  // Dead letter only
  if (s.includes('--dead-letter')) {
    const dlq = loadDeadLetters()
    if (dlq.length === 0) {
      return { type: 'text', value: '✅ 死信队列为空。' }
    }

    const lines = ['## ⚠️ 死信队列', '', `共 ${dlq.length} 条记录`, '']
    for (const entry of dlq.slice(0, 20)) {
      lines.push(`- Task: ${entry.taskId.slice(0, 16)}`)
      lines.push(`  Loop: ${entry.loopId.slice(0, 16)}`)
      lines.push(`  Error: ${entry.error.slice(0, 60)}`)
      lines.push(`  Retries: ${entry.retries} | Status: ${entry.status}`)
      lines.push(`  Created: ${new Date(entry.createdAt).toLocaleString('zh-CN')}`)
      lines.push('')
    }

    return { type: 'text', value: lines.join('\n') }
  }

  // Metrics only
  if (s.includes('--metrics')) {
    const m = getMetrics()
    return {
      type: 'text',
      value: `## 📈 指标统计

总循环数: ${m.totalLoops}
成功率: ${(m.successRate * 100).toFixed(1)}%
失败率: ${((1 - m.successRate) * 100).toFixed(1)}%
平均耗时: ${Math.round(m.avgDurationMs / 1000)}s
Token 消耗: ${m.totalTokens.toLocaleString()}
成本估算: $${m.totalCost.toFixed(4)}`,
    }
  }

  // JSON output
  const asJson = s.includes('--json')

  // Build report
  const active = getActiveLoops()
  const metrics = getMetrics()
  const dlq = loadDeadLetters()
  const checkpoints = loadCheckpoints()

  if (asJson) {
    return {
      type: 'text',
      value: JSON.stringify({
        activeLoops: active,
        deadLetterQueue: dlq,
        metrics,
        checkpointCount: checkpoints.length,
      }, null, 2),
    }
  }

  // Text report
  const lines: string[] = ['## 📊 Loop V2 状态', '']

  // Active loops
  lines.push(`### 活跃循环 (${active.length})`)
  if (active.length === 0) {
    lines.push('暂无活跃循环')
  } else {
    for (const loop of active) {
      lines.push(`- ${loop.loopId.slice(0, 16)} | ${loop.pattern} | ${loop.status} | iter ${loop.currentIteration}/${loop.maxIterations} | ${Math.round(loop.durationMs / 1000)}s`)
    }
  }
  lines.push('')

  // Metrics
  lines.push('### 指标统计')
  lines.push(`- 总循环数: ${metrics.totalLoops}`)
  lines.push(`- 成功率: ${(metrics.successRate * 100).toFixed(1)}%`)
  lines.push(`- 平均耗时: ${Math.round(metrics.avgDurationMs / 1000)}s`)
  lines.push(`- Token 消耗: ${metrics.totalTokens.toLocaleString()}`)
  lines.push(`- 成本估算: $${metrics.totalCost.toFixed(4)}`)
  lines.push('')

  // Dead letter queue
  lines.push(`### 死信队列 (${dlq.length})`)
  if (dlq.length === 0) {
    lines.push('空队列')
  } else {
    for (const entry of dlq.slice(0, 10)) {
      lines.push(`- ${entry.error.slice(0, 50)} | retries: ${entry.retries} | ${entry.status}`)
    }
  }
  lines.push('')

  // Checkpoints
  lines.push(`### 检查点 (${checkpoints.length})`)
  lines.push(`目录: ${CHECKPOINT_DIR}`)

  return { type: 'text', value: lines.join('\n') }
}

const loopStatusV2: Command = {
  type: 'local',
  name: 'loop-status-v2',
  description: '检查增强版循环操作员状态 — 支持 --watch/--json/--dead-letter/--metrics/--clean',
  aliases: ['/loop-status-v2', '/loop2-status'],
  argumentHint: '[--watch] [--loop-id ID] [--json] [--dead-letter] [--metrics] [--clean]',
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
}

export default loopStatusV2
