/**
 * 成本历史命令 — 查看 API 成本历史记录与趋势
 *
 * 功能：
 *   - 展示当前会话/项目的成本趋势（按日/按会话/按模型）
 *   - 展示最近 N 条 API 调用记录
 *   - 支持 JSON/文本两种输出格式
 *
 * 使用 bun:sqlite 持久化层，数据存储在项目 .claudeskills/ 目录下。
 */

import type { Command } from '../../commands.js'
import { getCostDatabase, type ProjectCostSummary, type SessionCostSummary, type ModelCostBreakdown } from '../../utils/cost-database.js'
import { formatTotalCost } from '../../cost-tracker.js'

// ============================================================================
// Types
// ============================================================================

interface CostHistoryOptions {
  /** 回溯天数 */
  days?: number
  /** 按会话维度展示 */
  bySession?: boolean
  /** 按模型维度展示 */
  byModel?: boolean
  /** JSON 格式输出 */
  json?: boolean
  /** 清空历史记录 */
  clear?: boolean
}

type CostHistoryCall = (
  args: { [key: string]: string | number | boolean | undefined },
  parsed: CostHistoryOptions
) => Promise<{ type: 'text' | 'json'; value: string }>

// ============================================================================
// Formatters
// ============================================================================

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(4)}`
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US')
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

function formatSessionSummary(summary: SessionCostSummary, index: number): string {
  const lines: string[] = []
  lines.push(
    `  [${index + 1}] ${summary.sessionId.slice(0, 12)}... ` +
    `(${formatTimestamp(summary.firstTimestamp)} → ${formatTimestamp(summary.lastTimestamp)})`
  )
  lines.push(
    `      成本: ${formatCurrency(summary.totalCostUSD)}  |  ` +
    `${formatNumber(summary.requestCount)} 次请求  |  ` +
    `输入 ${formatNumber(summary.totalInputTokens)} / 输出 ${formatNumber(summary.totalOutputTokens)} tokens`
  )
  if (summary.totalCacheReadTokens > 0 || summary.totalCacheWriteTokens > 0) {
    lines.push(
      `      缓存: 读取 ${formatNumber(summary.totalCacheReadTokens)} / 写入 ${formatNumber(summary.totalCacheWriteTokens)}`
    )
  }
  if (summary.totalWebSearchRequests > 0) {
    lines.push(`      网络搜索: ${formatNumber(summary.totalWebSearchRequests)} 次`)
  }
  return lines.join('\n')
}

function formatModelBreakdown(breakdown: ModelCostBreakdown, index: number): string {
  return (
    `  [${index + 1}] ${breakdown.model}\n` +
    `      成本: ${formatCurrency(breakdown.totalCostUSD)}  |  ` +
    `${formatNumber(breakdown.requestCount)} 次请求  |  ` +
    `平均 ${formatCurrency(breakdown.avgCostPerRequest)}/次\n` +
    `      输入 ${formatNumber(breakdown.totalInputTokens)} / 输出 ${formatNumber(breakdown.totalOutputTokens)} tokens`
  )
}

function formatProjectSummary(summary: ProjectCostSummary): string {
  const lines: string[] = []
  lines.push(`📊 项目成本汇总`)
  lines.push(`  项目: ${summary.projectDir}`)
  lines.push(`  总成本: ${formatCurrency(summary.totalCostUSD)}`)
  lines.push(`  总会话数: ${summary.totalSessions}`)
  lines.push(`  总请求数: ${formatNumber(summary.totalRequests)}`)
  lines.push('')

  if (summary.modelBreakdown.length > 0) {
    lines.push('📦 按模型统计:')
    summary.modelBreakdown.forEach((b, i) => {
      lines.push(formatModelBreakdown(b, i))
      if (i < summary.modelBreakdown.length - 1) lines.push('')
    })
    lines.push('')
  }

  if (summary.sessionSummaries.length > 0) {
    lines.push('🔄 按会话统计（最近 10 个）:')
    summary.sessionSummaries.slice(0, 10).forEach((s, i) => {
      lines.push(formatSessionSummary(s, i))
      if (i < Math.min(summary.sessionSummaries.length, 10) - 1) lines.push('')
    })
  }

  return lines.join('\n')
}

// ============================================================================
// Main Command Implementation
// ============================================================================

export const call: CostHistoryCall = async (_, parsed) => {
  // 清空历史
  if (parsed.clear) {
    const db = getCostDatabase()
    db.clearAll()
    return { type: 'text', value: '✅ 成本历史记录已清空' }
  }

  // JSON 输出
  if (parsed.json) {
    const db = getCostDatabase()
    const summary = db.getProjectCosts()
    const trend = db.getCostTrend(parsed.days as number ?? 30)
    const recent = db.getRecentEntries(parsed.days as number ?? 30)

    const output = {
      summary: summary ? {
        projectDir: summary.projectDir,
        totalCostUSD: summary.totalCostUSD,
        totalSessions: summary.totalSessions,
        totalRequests: summary.totalRequests,
        modelBreakdown: summary.modelBreakdown,
        sessionSummaries: summary.sessionSummaries,
      } : null,
      trend,
      recentEntries: recent,
    }

    return {
      type: 'json',
      value: JSON.stringify(output, null, 2),
    }
  }

  // 文本输出
  const db = getCostDatabase()
  const lines: string[] = []

  // 当前会话即时成本
  lines.push(formatTotalCost())
  lines.push('')

  // 项目维度汇总
  const projectSummary = db.getProjectCosts()
  if (projectSummary) {
    lines.push(formatProjectSummary(projectSummary))
  } else {
    lines.push('📊 暂无历史成本记录（首次使用）')
  }
  lines.push('')

  // 成本趋势
  const days = parsed.days as number ?? 7
  const trend = db.getCostTrend(days)
  if (trend.length > 0) {
    lines.push(`📈 最近 ${days} 天成本趋势:`)
    const maxCost = Math.max(...trend.map(t => t.costUSD), 0.01)
    trend.forEach(day => {
      const barLength = Math.round((day.costUSD / maxCost) * 20)
      const bar = '█'.repeat(Math.max(barLength, 1))
      lines.push(
        `  ${day.date}  ${bar} ${formatCurrency(day.costUSD)} (${day.requests} 次请求)`
      )
    })
    lines.push('')
  }

  // 最近记录
  const recent = db.getRecentEntries(10)
  if (recent.length > 0) {
    lines.push(`📋 最近 ${Math.min(recent.length, 10)} 条记录:`)
    recent.forEach((entry, i) => {
      lines.push(
        `  [${i + 1}] ${formatTimestamp(entry.timestamp)} ` +
        `${entry.model} — ${formatCurrency(entry.costUSD)} ` +
        `(${formatNumber(entry.inputTokens)} 输入 / ${formatNumber(entry.outputTokens)} 输出)`
      )
    })
  }

  return { type: 'text', value: lines.join('\n') }
}

// ============================================================================
// Command Registration
// ============================================================================

const costHistory = {
  type: 'local' as const,
  name: 'cost-history',
  description: '查看 API 成本历史记录与趋势（按会话/模型/时间）',
  aliases: ['/cost-history', '/cost-history', '/costlog'],
  arguments: [
    {
      name: 'days',
      description: '回溯天数（默认 7）',
      required: false,
    },
    {
      name: '--by-session',
      description: '按会话维度展示',
      required: false,
    },
    {
      name: '--by-model',
      description: '按模型维度展示',
      required: false,
    },
    {
      name: '--json',
      description: 'JSON 格式输出',
      required: false,
    },
    {
      name: '--clear',
      description: '清空历史记录',
      required: false,
    },
  ],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
} satisfies Command

export default costHistory
