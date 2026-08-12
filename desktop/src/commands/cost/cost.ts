import chalk from 'chalk'
import { writeFileSync } from 'fs'
import { formatTotalCost, getModelUsage, getTotalCost, getTotalInputTokens, getTotalOutputTokens, getTotalCacheReadInputTokens, getTotalCacheCreationInputTokens, getTotalAPIDuration, getTotalDuration, getTotalLinesAdded, getTotalLinesRemoved } from '../../cost-tracker.js'
import { getCostDatabase, type CostEntry } from '../../utils/cost-database.js'
import { formatDuration, formatNumber } from '../../utils/format.js'
import type { LocalCommandCall } from '../../types/command.js'
import { isClaudeAISubscriber } from '../../utils/auth.js'

// ============================================================================
// Types
// ============================================================================

interface CostOptions {
  /** 按模型维度展示费用 breakdown */
  byModel?: boolean
  /** 按 token 类型展示费用分布 */
  byType?: boolean
  /** 显示最近 N 次 API 调用的费用趋势 */
  trend?: number
  /** 导出成本数据到 JSON 文件 */
  export?: string
}

// ============================================================================
// Formatters
// ============================================================================

function formatCost(cost: number): string {
  return `$${cost > 0.5 ? (Math.round(cost * 100) / 100).toFixed(2) : cost.toFixed(4)}`
}

function renderBar(percentage: number, maxWidth: number = 20): string {
  const filled = Math.round((percentage / 100) * maxWidth)
  const clamped = Math.max(0, Math.min(filled, maxWidth))
  return chalk.hex('#61afef')('█'.repeat(clamped)) + chalk.dim('░'.repeat(maxWidth - clamped))
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

// ============================================================================
// Report Generators
// ============================================================================

function generateBasicReport(): string {
  return formatTotalCost()
}

function generateByModelReport(): string {
  const modelUsageMap = getModelUsage()
  const totalCost = getTotalCost()
  const lines: string[] = []

  lines.push(chalk.bold('📊 成本报告 — 按模型'))
  lines.push('')

  if (Object.keys(modelUsageMap).length === 0 || totalCost === 0) {
    lines.push(chalk.dim('  暂无成本数据'))
    return lines.join('\n')
  }

  // Accumulate usage by canonical short name
  const usageByShortName: { [shortName: string]: { inputTokens: number; outputTokens: number; cacheReadInputTokens: number; cacheCreationInputTokens: number; costUSD: number; requestCount: number } } = {}

  for (const [model, usage] of Object.entries(modelUsageMap)) {
    // Derive short name (strip version suffix for grouping)
    const shortName = model.replace(/-v\d+$/, '').replace(/-\d{8}$/, '')
    if (!usageByShortName[shortName]) {
      usageByShortName[shortName] = { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUSD: 0, requestCount: 0 }
    }
    const acc = usageByShortName[shortName]
    acc.inputTokens += usage.inputTokens
    acc.outputTokens += usage.outputTokens
    acc.cacheReadInputTokens += usage.cacheReadInputTokens
    acc.cacheCreationInputTokens += usage.cacheCreationInputTokens
    acc.costUSD += usage.costUSD
    acc.requestCount++
  }

  // Sort by cost descending
  const sorted = Object.entries(usageByShortName).sort(([, a], [, b]) => b.costUSD - a.costUSD)

  // Find the longest model name for alignment
  const maxNameLen = Math.max(...sorted.map(([name]) => name.length), 12)

  for (const [name, usage] of sorted) {
    const percentage = totalCost > 0 ? (usage.costUSD / totalCost) * 100 : 0
    const paddedName = name.padEnd(maxNameLen)
    const costStr = chalk.yellow(formatCost(usage.costUSD).padStart(10))
    const pctStr = chalk.dim(`(${percentage.toFixed(1)}%)`.padStart(8))
    lines.push(`  ${chalk.cyan(paddedName)}  ${costStr}  ${pctStr}  ${renderBar(percentage)}`)
  }

  lines.push('')
  lines.push(chalk.dim(`  总费用: ${formatCost(totalCost)}`))

  return lines.join('\n')
}

function generateByTypeReport(): string {
  const totalCost = getTotalCost()
  const inputTokens = getTotalInputTokens()
  const outputTokens = getTotalOutputTokens()
  const cacheReadTokens = getTotalCacheReadInputTokens()
  const cacheCreateTokens = getTotalCacheCreationInputTokens()
  const lines: string[] = []

  lines.push(chalk.bold('📊 成本报告 — 按 Token 类型'))
  lines.push('')

  // We need per-type cost breakdown from model usage
  const modelUsageMap = getModelUsage()
  let totalInputCost = 0
  let totalOutputCost = 0
  let totalCacheReadCost = 0
  let totalCacheCreateCost = 0

  for (const usage of Object.values(modelUsageMap)) {
    const cost = usage.costUSD
    const totalTokens = usage.inputTokens + usage.outputTokens + usage.cacheReadInputTokens + usage.cacheCreationInputTokens
    if (totalTokens > 0) {
      // Approximate per-type cost by token proportion (exact pricing requires per-model rate lookup)
      totalInputCost += cost * (usage.inputTokens / totalTokens)
      totalOutputCost += cost * (usage.outputTokens / totalTokens)
      totalCacheReadCost += cost * (usage.cacheReadInputTokens / totalTokens)
      totalCacheCreateCost += cost * (usage.cacheCreationInputTokens / totalTokens)
    }
  }

  const typeBreakdown = [
    { label: 'Input tokens', cost: totalInputCost, tokens: inputTokens, color: chalk.green },
    { label: 'Output tokens', cost: totalOutputCost, tokens: outputTokens, color: chalk.blue },
    { label: 'Cache read', cost: totalCacheReadCost, tokens: cacheReadTokens, color: chalk.magenta },
    { label: 'Cache create', cost: totalCacheCreateCost, tokens: cacheCreateTokens, color: chalk.yellow },
  ]

  const maxLabelLen = Math.max(...typeBreakdown.map(t => t.label.length), 14)

  for (const { label, cost, tokens: tok, color } of typeBreakdown) {
    const percentage = totalCost > 0 ? (cost / totalCost) * 100 : 0
    const paddedLabel = label.padEnd(maxLabelLen)
    const costStr = color(formatCost(cost).padStart(10))
    const pctStr = chalk.dim(`(${percentage.toFixed(1)}%)`.padStart(8))
    const tokenStr = chalk.dim(`${formatNumber(tok)} tokens`.padStart(15))
    lines.push(`  ${chalk.cyan(paddedLabel)}  ${costStr}  ${pctStr}  ${tokenStr}  ${renderBar(percentage)}`)
  }

  lines.push('')
  lines.push(chalk.dim(`  总费用: ${formatCost(totalCost)}  |  总 Input: ${formatNumber(inputTokens)}  总 Output: ${formatNumber(outputTokens)}`))

  return lines.join('\n')
}

function generateTrendReport(count: number): string {
  const db = getCostDatabase()
  const entries: CostEntry[] = db.getRecentEntries(count)
  const lines: string[] = []

  lines.push(chalk.bold(`📊 成本报告 — 最近 ${count} 次 API 调用趋势`))
  lines.push('')

  if (entries.length === 0) {
    lines.push(chalk.dim('  暂无 API 调用记录'))
    return lines.join('\n')
  }

  // Reverse to show oldest → newest
  const sorted = [...entries].reverse()
  const maxCost = Math.max(...sorted.map(e => e.costUSD), 0.0001)
  const barMaxWidth = 25

  for (const entry of sorted) {
    const barLength = Math.round((entry.costUSD / maxCost) * barMaxWidth)
    const bar = chalk.hex('#61afef')('█'.repeat(Math.max(barLength, 1)))
    const costStr = chalk.yellow(formatCost(entry.costUSD).padStart(10))
    const modelShort = entry.model.length > 16 ? entry.model.slice(0, 14) + '..' : entry.model.padEnd(16)
    const timeStr = chalk.dim(formatTimestamp(entry.timestamp))
    lines.push(`  ${timeStr}  ${chalk.cyan(modelShort)}  ${costStr}  ${bar}`)
  }

  // Summary
  const totalRecentCost = sorted.reduce((sum, e) => sum + e.costUSD, 0)
  const totalRecentTokens = sorted.reduce((sum, e) => sum + e.inputTokens + e.outputTokens, 0)
  lines.push('')
  lines.push(chalk.dim(`  本时段合计: ${formatCost(totalRecentCost)}  |  ${formatNumber(totalRecentTokens)} tokens  |  ${sorted.length} 次调用`))

  return lines.join('\n')
}

function generateFullReport(): string {
  const lines: string[] = []

  // Header
  lines.push(chalk.bold('📊 成本报告'))
  lines.push('')

  // Summary
  const totalCost = getTotalCost()
  const apiDuration = getTotalAPIDuration()
  const totalDur = getTotalDuration()
  const linesAdded = getTotalLinesAdded()
  const linesRemoved = getTotalLinesRemoved()

  const db = getCostDatabase()
  const entries = db.getRecentEntries(999999)
  const totalRequests = entries.length

  lines.push(`  总费用:           ${chalk.yellow(formatCost(totalCost))}`)
  lines.push(`  总时长 (API):     ${chalk.cyan(formatDuration(apiDuration))}`)
  lines.push(`  总时长 (实际):    ${chalk.cyan(formatDuration(totalDur))}`)
  lines.push(`  API 调用次数:     ${chalk.cyan(totalRequests.toString())}`)
  lines.push(`  代码变更:         +${linesAdded} / -${linesRemoved} 行`)
  lines.push('')

  // By model
  const modelUsageMap = getModelUsage()
  if (Object.keys(modelUsageMap).length > 0) {
    lines.push(chalk.bold('  按模型:'))

    const usageByShortName: { [shortName: string]: { costUSD: number; requestCount: number } } = {}
    for (const [model, usage] of Object.entries(modelUsageMap)) {
      const shortName = model.replace(/-v\d+$/, '').replace(/-\d{8}$/, '')
      if (!usageByShortName[shortName]) {
        usageByShortName[shortName] = { costUSD: 0, requestCount: 0 }
      }
      usageByShortName[shortName].costUSD += usage.costUSD
      usageByShortName[shortName].requestCount++
    }

    const sorted = Object.entries(usageByShortName).sort(([, a], [, b]) => b.costUSD - a.costUSD)
    const maxNameLen = Math.max(...sorted.map(([name]) => name.length), 12)

    for (const [name, usage] of sorted) {
      const percentage = totalCost > 0 ? (usage.costUSD / totalCost) * 100 : 0
      const paddedName = name.padEnd(maxNameLen)
      const costStr = chalk.yellow(formatCost(usage.costUSD).padStart(10))
      const pctStr = chalk.dim(`(${percentage.toFixed(1)}%)`.padStart(8))
      lines.push(`    ${chalk.cyan(paddedName)}  ${costStr}  ${pctStr}  ${renderBar(percentage)}`)
    }
    lines.push('')
  }

  // By type
  const inputTokens = getTotalInputTokens()
  const outputTokens = getTotalOutputTokens()
  const cacheReadTokens = getTotalCacheReadInputTokens()
  const cacheCreateTokens = getTotalCacheCreationInputTokens()
  const totalTokens = inputTokens + outputTokens + cacheReadTokens + cacheCreateTokens

  if (totalTokens > 0) {
    lines.push(chalk.bold('  按类型:'))
    const typeData = [
      { label: 'Input tokens', cost: totalCost * (inputTokens / totalTokens), percentage: (inputTokens / totalTokens) * 100, color: chalk.green },
      { label: 'Output tokens', cost: totalCost * (outputTokens / totalTokens), percentage: (outputTokens / totalTokens) * 100, color: chalk.blue },
      { label: 'Cache read', cost: totalCost * (cacheReadTokens / totalTokens), percentage: (cacheReadTokens / totalTokens) * 100, color: chalk.magenta },
      { label: 'Cache create', cost: totalCost * (cacheCreateTokens / totalTokens), percentage: (cacheCreateTokens / totalTokens) * 100, color: chalk.yellow },
    ]

    const maxLabelLen = Math.max(...typeData.map(t => t.label.length), 14)

    for (const { label, cost, percentage, color } of typeData) {
      const paddedLabel = label.padEnd(maxLabelLen)
      const costStr = color(formatCost(cost).padStart(10))
      const pctStr = chalk.dim(`(${percentage.toFixed(1)}%)`.padStart(8))
      lines.push(`    ${chalk.cyan(paddedLabel)}  ${costStr}  ${pctStr}  ${renderBar(percentage)}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

// ============================================================================
// Export Function
// ============================================================================

function exportCostData(filePath: string): string {
  const db = getCostDatabase()
  const entries = db.getRecentEntries(999999)
  const projectSummary = db.getProjectCosts()
  const trend = db.getCostTrend(30)

  const exportPayload = {
    exportedAt: new Date().toISOString(),
    session: {
      totalCostUSD: getTotalCost(),
      totalInputTokens: getTotalInputTokens(),
      totalOutputTokens: getTotalOutputTokens(),
      totalCacheReadInputTokens: getTotalCacheReadInputTokens(),
      totalCacheCreationInputTokens: getTotalCacheCreationInputTokens(),
      totalAPIDuration: getTotalAPIDuration(),
      totalDuration: getTotalDuration(),
      modelUsage: getModelUsage(),
    },
    project: projectSummary,
    trendLast30Days: trend,
    recentEntries: entries.slice(0, 1000),
    metadata: {
      totalEntries: entries.length,
      exportVersion: '1.0',
    },
  }

  const json = JSON.stringify(exportPayload, null, 2)
  writeFileSync(filePath, json, 'utf-8')

  return ` 成本数据已导出到 ${filePath}\n   共 ${entries.length} 条记录 (${json.length} 字节)`
}

// ============================================================================
// Argument Parsing
// ============================================================================

function parseCostArgs(args: { [key: string]: string | number | boolean | undefined }): CostOptions {
  const opts: CostOptions = {}

  if (args['--by-model'] === true || args['by-model'] === true) {
    opts.byModel = true
  }
  if (args['--by-type'] === true || args['by-type'] === true) {
    opts.byType = true
  }
  if (args['--export'] !== undefined && args['--export'] !== false && args['--export'] !== null) {
    opts.export = String(args['--export'])
  }

  // --trend accepts a number (default 10)
  const trendVal = args['--trend'] ?? args['trend']
  if (trendVal !== undefined && trendVal !== false) {
    if (typeof trendVal === 'number') {
      opts.trend = trendVal
    } else if (typeof trendVal === 'string') {
      const parsed = parseInt(trendVal, 10)
      if (!isNaN(parsed) && parsed > 0) {
        opts.trend = parsed
      } else {
        opts.trend = 10 // default
      }
    } else {
      opts.trend = 10 // --trend with no value = default
    }
  }

  return opts
}

// ============================================================================
// Main Command
// ============================================================================

export const call: LocalCommandCall = async (args) => {
  if (isClaudeAISubscriber()) {
    let value: string

    if (process.env.USER_TYPE === 'ant') {
      // Ant users see cost even with subscriber auth
      const opts = parseCostArgs(args ?? {})

      if (opts.export) {
        value = exportCostData(opts.export)
      } else if (opts.byModel) {
        value = generateByModelReport()
      } else if (opts.byType) {
        value = generateByTypeReport()
      } else if (opts.trend !== undefined) {
        value = generateTrendReport(opts.trend)
      } else {
        // Default: show full report
        value = generateFullReport()
      }

      return { type: 'text', value: `[ANT-ONLY]\n${value}` }
    }

    // Non-ant subscribers see subscription info
    const { currentLimits } = await import('../../services/claudeAiLimits.js')
    if (currentLimits.isUsingOverage) {
      value = '您当前正在使用超额用量来支持 Claude Code 的使用。当订阅配额重置后，我们将自动切换回订阅速率限制'
    } else {
      value = '您当前正在使用您的订阅来支持 Claude Code 的使用'
    }
    return { type: 'text', value }
  }

  // Parse arguments
  const opts = parseCostArgs(args ?? {})

  let value: string

  if (opts.export) {
    value = exportCostData(opts.export)
  } else if (opts.byModel) {
    value = generateByModelReport()
  } else if (opts.byType) {
    value = generateByTypeReport()
  } else if (opts.trend !== undefined) {
    value = generateTrendReport(opts.trend)
  } else {
    // Backward-compatible: no args → show original total cost display
    value = generateBasicReport()
  }

  return { type: 'text', value }
}
