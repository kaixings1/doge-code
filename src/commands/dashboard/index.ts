// ============================================================================
// Dashboard Command - 用量仪表盘命令
// 打开团队/企业用量分析仪表盘
// ============================================================================

import type { Command } from '../commands.js'
import type { LocalCommandCall } from '../types/command.js'
import { startDashboardServer, isDashboardRunning, getDashboardPort, getDashboardData } from '../../services/dashboard/index.js'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'

// ============================================================================
// Helper Functions
// ============================================================================

function ensureDir(filePath: string): void {
  const dir = join(filePath, '..')
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    // 目录已存在
  }
}

// ============================================================================
// Command
// ============================================================================

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()

  if (s.includes('--help')) {
    return { type: 'text', value: renderHelp() }
  }

  const parts = s.split(/\s+/)
  const subcommand = parts[0]

  switch (subcommand) {
    case 'open':
    case 'start':
    case undefined:
    case '':
      return openDashboard()

    case 'stop':
      return stopDashboard()

    case 'status':
      return showStatus()

    case 'export':
      return exportData()

    case 'reset':
      return resetData()

    default:
      return { type: 'text', value: `❌ 未知子命令: ${subcommand}\n\n${renderHelp()}` }
  }
}

// ============================================================================
// Subcommands
// ============================================================================

async function openDashboard(): Promise<{ type: 'text'; value: string }> {
  try {
    if (isDashboardRunning()) {
      const port = getDashboardPort()
      return {
        type: 'text',
        value: `📊 仪表盘已在运行中！\n\n🌐 浏览器访问: http://127.0.0.1:${port}\n\n使用 /dashboard stop 停止服务。`
      }
    }

    const port = await startDashboardServer(3456)
    return {
      type: 'text',
      value: `📊 仪表盘已启动！\n\n🌐 浏览器访问: http://127.0.0.1:${port}\n📋 API 地址: http://127.0.0.1:${port}/api/stats\n\n使用 /dashboard stop 停止服务。`
    }
  } catch (err) {
    return {
      type: 'text',
      value: `❌ 启动仪表盘失败: ${err instanceof Error ? err.message : String(err)}`
    }
  }
}

function stopDashboard(): { type: 'text'; value: string } {
  const { stopDashboardServer } = require('../../services/dashboard/server.js') as typeof import('../../services/dashboard/server.js')
  if (!isDashboardRunning()) {
    return { type: 'text', value: '⚠️ 仪表盘未在运行。' }
  }

  stopDashboardServer()
  return { type: 'text', value: '✅ 仪表盘已停止。' }
}

function showStatus(): { type: 'text'; value: string } {
  const data = getDashboardData()
  const { stats, modelUsage } = data

  const lines: string[] = ['📊 仪表盘状态', '']
  lines.push(`🌐 运行状态: ${isDashboardRunning() ? '✅ 运行中 (端口: ' + getDashboardPort() + ')' : '❌ 未启动'}`)
  lines.push('')
  lines.push('📈 总体统计:')
  lines.push(`  总费用: $${stats.totalCostUSD.toFixed(4)} USD`)
  lines.push(`  总Token: ${(stats.totalTokens.input + stats.totalTokens.output).toLocaleString()}`)
  lines.push(`  缓存命中: ${stats.totalTokens.cacheRead.toLocaleString()}`)
  lines.push(`  代码变更: +${stats.totalLinesAdded} / -${stats.totalLinesRemoved}`)
  lines.push(`  总时长: ${(stats.totalDuration / 1000).toFixed(0)}s`)
  lines.push('')
  lines.push('🤖 模型使用:')
  for (const m of modelUsage) {
    lines.push(`  ${m.model}: $${m.costUSD.toFixed(4)} (${(m.inputTokens + m.outputTokens).toLocaleString()} tokens)`)
  }

  return { type: 'text', value: lines.join('\n') }
}

function exportData(): { type: 'text'; value: string } {
  const data = getDashboardData()
  const exportPath = join(process.cwd(), 'doge-code-stats.json')

  try {
    writeFileSync(exportPath, JSON.stringify(data, null, 2), 'utf-8')
    return { type: 'text', value: `✅ 数据已导出到: ${exportPath}` }
  } catch (err) {
    return { type: 'text', value: `❌ 导出失败: ${err instanceof Error ? err.message : String(err)}` }
  }
}

function resetData(): { type: 'text'; value: string } {
  try {
    // 重置内存中的成本状态
    const { resetCostState } = require('../../bootstrap/state.js') as typeof import('../../bootstrap/state.js')
    resetCostState()

    // 重置成本数据库
    const { resetCostDatabase } = require('../../utils/cost-database.js') as typeof import('../../utils/cost-database.js')
    resetCostDatabase()

    return { type: 'text', value: '✅ 用量数据已重置。统计从零开始。' }
  } catch (err) {
    return { type: 'text', value: `❌ 重置失败: ${err instanceof Error ? err.message : String(err)}` }
  }
}

// ============================================================================
// Help Text
// ============================================================================

function renderHelp(): string {
  return [
    '📊 用量仪表盘 - Dashboard',
    '',
    '打开团队/企业用量分析仪表盘。',
    '',
    '用法:',
    '  /dashboard [子命令]',
    '',
    '子命令:',
    '  open    open            启动仪表盘（默认）',
    '  stop                  停止仪表盘',
    '  status                显示状态和统计',
    '  export                导出数据到 JSON 文件',
    '  reset                 重置统计数据',
    '  --help                显示帮助',
    '',
    '示例:',
    '  /dashboard             启动仪表盘',
    '  /dashboard status      查看当前统计',
    '  /dashboard export      导出数据',
  ].join('\n')
}

// ============================================================================
// Command Definition
// ============================================================================

const command = {
  type: 'local' as const,
  name: 'dashboard',
  description: '用量仪表盘 - 打开用量分析仪表盘',
  aliases: ['/dashboard', '/stats', '/usage'],
  arguments: [
    { name: 'open', description: '启动仪表盘', required: false },
    { name: 'stop', description: '停止仪表盘', required: false },
    { name: 'status', description: '显示状态', required: false },
    { name: 'export', description: '导出数据', required: false },
    { name: 'reset', description: '重置数据', required: false },
    { name: 'help', description: '显示帮助', required: false },
  ],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
} satisfies Command

export default command
