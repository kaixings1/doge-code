import { type Tool } from '../../engine/types.js'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

// 尝试加载 TokenBudgetManager（如果可用）
// @ts-ignore - 引擎可能不在所有环境加载
let TokenBudgetManager: any = null
try {
  const mod = require('../../engine/tokenBudgetManager.js')
  TokenBudgetManager = mod.TokenBudgetManager
} catch { /* 引擎不可用 */ }

interface InspectReport {
  environment: Record<string, string | number>
  memory: Record<string, string>
  stats: Record<string, any>
  budget: Record<string, any> | null
  issues: string[]
}

export class CtxInspectTool implements Tool {
  name = 'context_inspect'
  description = 'Inspect current context: token usage, message count, memory, environment, and budget status'
  parameters = {
    type: 'object' as const,
    properties: {
      detail: { type: 'string', description: 'Detail level: summary or full', enum: ['summary', 'full'] },
      includeEnv: { type: 'boolean', description: 'Include environment variables' },
      includeMemory: { type: 'boolean', description: 'Include memory usage' }
    },
    required: []
  }
  validate = () => ({ valid: true })
  isEnabled = () => true
  async prompt() {
    return this.description
  }
  userFacingName() {
    return this.name
  }

  private buildReport(detail: string, includeEnv: boolean, includeMemory: boolean): InspectReport {
    const report: InspectReport = {
      environment: {},
      memory: {},
      stats: {},
      budget: null,
      issues: [],
    }

    // Environment
    if (includeEnv) {
      report.environment = {
        cwd: process.cwd(),
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        pid: process.pid,
        uptimeSec: Math.round(process.uptime()),
        cpuCount: require('os').cpus().length,
        totalMemMB: Math.round(require('os').totalmem() / 1024 / 1024),
      }
    }

    // Memory
    if (includeMemory) {
      const mem = process.memoryUsage()
      report.memory = {
        rssMB: (mem.rss / 1024 / 1024).toFixed(1),
        heapTotalMB: (mem.heapTotal / 1024 / 1024).toFixed(1),
        heapUsedMB: (mem.heapUsed / 1024 / 1024).toFixed(1),
        externalMB: (mem.external / 1024 / 1024).toFixed(1),
        arrayBuffersMB: (mem.arrayBuffers / 1024 / 1024).toFixed(1),
      }
      // 内存健康检查
      const heapRatio = mem.heapUsed / mem.heapTotal
      if (heapRatio > 0.9) report.issues.push(`⚠️ 堆内存使用率 ${(heapRatio * 100).toFixed(0)}%，接近上限`)
      else if (heapRatio > 0.75) report.issues.push(`⚠️ 堆内存使用率 ${(heapRatio * 100).toFixed(0)}%，建议关注`)
    }

    // Stats from .doge/stats.json
    const statsPath = join(process.cwd(), '.doge', 'stats.json')
    if (existsSync(statsPath)) {
      try {
        const stats = JSON.parse(readFileSync(statsPath, 'utf-8'))
        report.stats = stats
        if (stats.totalTokens) {
          const total = (stats.totalTokens.input || 0) + (stats.totalTokens.output || 0)
          report.stats.displayTotalTokens = total.toLocaleString()
        }
      } catch { /* ignore */ }
    }

    // Budget from TokenBudgetManager（如果引擎可用）
    if (TokenBudgetManager) {
      try {
        const mgr = new TokenBudgetManager()
        // 尝试从会话文件估算 token 使用 + 每会话独立统计
        const sessionsDir = join(homedir(), '.doge', 'sessions')
        let totalEstTokens = 0
        let messageCount = 0
        const perSession: Array<{ id: string; messages: number; tokens: number }> = []
        if (existsSync(sessionsDir)) {
          try {
            const fs = require('fs')
            const files = fs.readdirSync(sessionsDir).filter((f: string) => f.endsWith('.json'))
            for (const file of files) {
              try {
                const data = JSON.parse(readFileSync(join(sessionsDir, file), 'utf-8'))
                const msgs = data.messages || []
                let sessionTokens = 0
                messageCount += msgs.length
                for (const m of msgs) {
                  const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '')
                  sessionTokens += Math.ceil(text.length / 4)
                }
                totalEstTokens += sessionTokens
                if (msgs.length > 0) {
                  perSession.push({
                    id: (data.id || file.replace('.json', '')).slice(0, 20),
                    messages: msgs.length,
                    tokens: sessionTokens,
                  })
                }
              } catch { /* ignore */ }
            }
            // 按 token 降序排列，取前 5
            perSession.sort((a, b) => b.tokens - a.tokens)
          } catch { /* ignore */ }
        }
        report.budget = {
          maxContextTokens: 128000,
          warningThreshold: 0.75,
          dangerThreshold: 0.85,
          limitThreshold: 0.95,
          compactTriggerRatio: 0.8,
          estimatedTokensUsed: totalEstTokens,
          estimatedMessages: messageCount,
          estimatedPercentage: totalEstTokens > 0 ? Math.min(100, Math.round((totalEstTokens / 128000) * 100)) : 0,
          engineAvailable: true,
          perSession: perSession.slice(0, 5),
        }
      } catch { /* ignore */ }
    }

    return report
  }

  execute = async (params: Record<string, any>) => {
    const detail = params?.detail || 'summary'
    const includeEnv = params?.includeEnv !== false
    const includeMemory = params?.includeMemory !== false

    const report = this.buildReport(detail, includeEnv, includeMemory)
    const lines: string[] = ['## Context Inspection', '']

    // Issues 优先显示
    if (report.issues.length > 0) {
      lines.push('### ⚠️ Health Issues', '')
      report.issues.forEach(i => lines.push(`- ${i}`))
      lines.push('')
    }

    if (Object.keys(report.stats).length > 0) {
      lines.push('### Usage Stats', '')
      if (report.stats.displayTotalTokens) {
        lines.push(`- **Total Tokens:** ${report.stats.displayTotalTokens}`)
        lines.push(`- **Input:** ${(report.stats.totalTokens?.input || 0).toLocaleString()}`)
        lines.push(`- **Output:** ${(report.stats.totalTokens?.output || 0).toLocaleString()}`)
      }
      if (report.stats.totalCostUSD !== undefined) lines.push(`- **Total Cost:** $${report.stats.totalCostUSD}`)
      if (report.stats.totalCommands !== undefined) lines.push(`- **Commands Run:** ${report.stats.totalCommands}`)
      if (report.stats.totalFilesModified !== undefined) lines.push(`- **Files Modified:** ${report.stats.totalFilesModified}`)
      lines.push('')
    }

    if (detail === 'full') {
      if (includeEnv) {
        lines.push('### Environment', '')
        Object.entries(report.environment).forEach(([k, v]) => lines.push(`- **${k}:** ${v}`))
        lines.push('')
      }
      if (includeMemory) {
        lines.push('### Memory Usage', '')
        Object.entries(report.memory).forEach(([k, v]) => lines.push(`- **${k}:** ${v}`))
        lines.push('')
      }
      if (report.budget) {
        lines.push('### Token Budget', '')
        lines.push(`- **Max Context:** ${report.budget.maxContextTokens}`)
        if (report.budget.estimatedTokensUsed != null) {
          lines.push(`- **Estimated Used:** ${report.budget.estimatedTokensUsed.toLocaleString()} tokens`)
          lines.push(`- **Estimated Messages:** ${report.budget.estimatedMessages}`)
          lines.push(`- **Usage:** ${report.budget.estimatedPercentage}%`)
          if (report.budget.estimatedPercentage > 95) lines.push('  ⚠️ 接近限制，建议 /compact 或 /clear')
          else if (report.budget.estimatedPercentage > 80) lines.push('  ⚠️ 建议 /compact 压缩上下文')
        }
        lines.push(`- **Warning at:** ${(report.budget.warningThreshold * 100).toFixed(0)}%`)
        lines.push(`- **Compact at:** ${(report.budget.compactTriggerRatio * 100).toFixed(0)}%`)
        lines.push(`- **Limit at:** ${(report.budget.limitThreshold * 100).toFixed(0)}%`)
        if (report.budget.perSession && report.budget.perSession.length > 0) {
          lines.push('', '**Top Sessions by Token Usage:**', '')
          report.budget.perSession.forEach((s: any, i: number) => {
            lines.push(`  ${i + 1}. \`${s.id}\` - ${s.tokens.toLocaleString()} tokens (${s.messages} msgs)`)
          })
        }
        lines.push('')
      }
      lines.push('### Detail Level', `- ${detail}`)
    } else {
      lines.push('**Detail Level:** summary (use detail=full for more)')
    }

    return { content: [{ type: 'text', text: lines.join('\n') }] }
  }
}