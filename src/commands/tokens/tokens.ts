import type { LocalCommandResult } from '../../commands.js'
import type { ToolUseContext } from '../../Tool.js'
import {
  getTotalInputTokens,
  getTotalOutputTokens,
  getTotalCacheReadInputTokens,
  getTotalCacheCreationInputTokens,
  getTotalCostUSD,
  getModelUsage,
} from '../../cost-tracker.js'
import { getContextWindowForModel } from '../../utils/context.js'
import { getMainLoopModelOverride } from '../../bootstrap/state.js'
import { formatNumber } from '../../utils/format.js'
import chalk from 'chalk'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TokensOptions {
  byModel: boolean
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(args: string): TokensOptions {
  const parts = args.trim().split(/\s+/).filter(Boolean)
  const opts: TokensOptions = {
    byModel: false,
  }

  let i = 0
  while (i < parts.length) {
    const p = parts[i]!
    if (p === '--by-model') {
      opts.byModel = true
    }
    i++
  }

  return opts
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatBasicReport(opts: TokensOptions): string {
  const inputTokens = getTotalInputTokens()
  const outputTokens = getTotalOutputTokens()
  const cacheReadTokens = getTotalCacheReadInputTokens()
  const cacheCreateTokens = getTotalCacheCreationInputTokens()
  const totalTokens = inputTokens + outputTokens + cacheReadTokens + cacheCreateTokens
  const costUSD = getTotalCostUSD()

  const lines: string[] = []

  lines.push(chalk.bold('📊 Token 用量报告'))
  lines.push('')

  // Summary
  lines.push(`  总费用:         ${chalk.yellow(`$${costUSD.toFixed(4)}`)}`)
  lines.push(`  总 Tokens:      ${chalk.cyan(formatNumber(totalTokens))}`)
  lines.push('')
  lines.push(`  Input:          ${formatNumber(inputTokens)}`)
  lines.push(`  Output:         ${formatNumber(outputTokens)}`)
  lines.push(`  Cache read:     ${formatNumber(cacheReadTokens)}`)
  lines.push(`  Cache create:   ${formatNumber(cacheCreateTokens)}`)
  lines.push('')

  // Context window usage
  const modelSetting = getMainLoopModelOverride()
  if (modelSetting) {
    const ctxWindow = getContextWindowForModel(modelSetting)
    const usagePct = ctxWindow > 0 ? ((totalTokens / ctxWindow) * 100).toFixed(1) : '?'
    const barWidth = 20
    const filled = Math.round((Math.min(totalTokens / ctxWindow, 1)) * barWidth)
    const bar = chalk.hex('#61afef')('█'.repeat(filled)) + chalk.dim('░'.repeat(barWidth - filled))
    lines.push(`  上下文窗口:     ${formatNumber(ctxWindow)} tokens`)
    lines.push(`  当前使用:       ${usagePct}%  ${bar}`)
    lines.push('')
  }

  // By model breakdown
  if (opts.byModel) {
    const modelUsage = getModelUsage()
    if (Object.keys(modelUsage).length > 0) {
      lines.push(chalk.bold('  按模型:'))
      lines.push('')

      const sorted = Object.entries(modelUsage).sort(([, a], [, b]) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens))
      const maxNameLen = Math.max(...sorted.map(([name]) => name.length), 8)

      for (const [model, usage] of sorted) {
        const modelTotal = usage.inputTokens + usage.outputTokens + usage.cacheReadInputTokens + usage.cacheCreationInputTokens
        const pct = totalTokens > 0 ? ((modelTotal / totalTokens) * 100).toFixed(1) : '0.0'
        const paddedName = model.padEnd(maxNameLen)
        lines.push(`    ${chalk.cyan(paddedName)}  ${formatNumber(modelTotal)} tokens  ${chalk.dim(`(${pct}%)`)}`)
      }
      lines.push('')
    }
  }

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export const call = async (
  args: string,
  _context: ToolUseContext,
): Promise<LocalCommandResult> => {
  const opts = parseArgs(args)
  const output = formatBasicReport(opts)

  return {
    type: 'text',
    value: output,
  }
}
