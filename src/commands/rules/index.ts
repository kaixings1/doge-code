// ============================================================================
// Rules Command - 持久化规则管理
// 管理 .dogerules 文件，提供跨会话的持久化指令
// ============================================================================

import type { Command } from '../commands.js'
import type { LocalCommandCall } from '../types/command.js'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { loadDogerules, formatDogerulesForSystemPrompt, hasDogerules } from '../../utils/dogerules.js'

// ============================================================================
// Helper Functions
// ============================================================================

function getGlobalRulesPath(): string {
  return join(getClaudeConfigHomeDir(), 'dogerules')
}

function getProjectRulesPath(): string {
  return join(process.cwd(), '.dogerules')
}

function getLocalRulesPath(): string {
  return join(process.cwd(), '.dogerules.local')
}

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
    case 'list':
    case undefined:
    case '':
      return listRules()

    case 'show':
      return showRules()

    case 'add':
    case 'set':
      return addRule(parts.slice(1).join(' '))

    case 'remove':
    case 'rm':
    case 'delete':
      return removeRule(parts.slice(1).join(' '))

    case 'edit':
      return editRule(parts.slice(1).join(' '))

    case 'init':
      return initRules()

    case 'clear':
      return clearRules()

    default:
      return { type: 'text', value: `❌ 未知子命令: ${subcommand}\n\n${renderHelp()}` }
  }
}

// ============================================================================
// Subcommands
// ============================================================================

function listRules(): { type: 'text'; value: string } {
  const entries = loadDogerules()
  if (entries.length === 0) {
    return {
      type: 'text',
      value: '📋 当前没有配置任何规则。\n\n使用 /rules init 创建初始规则文件。\n使用 /rules add <规则内容> 添加规则。'
    }
  }

  const lines: string[] = ['📋 持久化规则列表：', '']
  for (const entry of entries) {
    const typeIcon = entry.type === 'global' ? '🌍' : entry.type === 'project' ? '📁' : '👤'
    const preview = entry.content.slice(0, 60).replace(/\n/g, ' ')
    lines.push(`  ${typeIcon} [${entry.type}] ${entry.path}`)
    lines.push(`     ${preview}${entry.content.length > 60 ? '...' : ''}`)
    lines.push('')
  }

  return { type: 'text', value: lines.join('\n') }
}

function showRules(): { type: 'text'; value: string } {
  const entries = loadDogerules()
  if (entries.length === 0) {
    return {
      type: 'text',
      value: '📋 当前没有配置任何规则。\n\n使用 /rules init 创建初始规则文件。'
    }
  }

  const lines: string[] = ['📋 持久化规则详情：', '']
  for (const entry of entries) {
    const typeIcon = entry.type === 'global' ? '🌍' : entry.type === 'project' ? '📁' : '👤'
    lines.push(`${typeIcon} [${entry.type.toUpperCase()}] ${entry.path}`)
    lines.push('─'.repeat(50))
    lines.push(entry.content)
    lines.push('─'.repeat(50))
    lines.push('')
  }

  return { type: 'text', value: lines.join('\n') }
}

function addRule(content: string): { type: 'text'; value: string } {
  if (!content.trim()) {
    return { type: 'text', value: '❌ 请提供规则内容。\n用法: /rules add <规则内容>' }
  }

  const rulesPath = getProjectRulesPath()
  let existingContent = ''

  if (existsSync(rulesPath)) {
    existingContent = readFileSync(rulesPath, 'utf-8')
  }

  const newContent = existingContent
    ? `${existingContent}\n\n${content}`
    : content

  try {
    ensureDir(rulesPath)
    writeFileSync(rulesPath, newContent, 'utf-8')
    return {
      type: 'text',
      value: `✅ 规则已添加到 ${rulesPath}\n\n使用 /rules show 查看完整规则。`
    }
  } catch (err) {
    return {
      type: 'text',
      value: `❌ 添加规则失败: ${err instanceof Error ? err.message : String(err)}`
    }
  }
}

function removeRule(identifier: string): { type: 'text'; value: string } {
  if (!identifier.trim()) {
    return { type: 'text', value: '❌ 请提供要删除的规则内容或行号。\n用法: /rules remove <规则内容或行号>' }
  }

  const rulesPath = getProjectRulesPath()
  if (!existsSync(rulesPath)) {
    return { type: 'text', value: '❌ 项目规则文件不存在。' }
  }

  const content = readFileSync(rulesPath, 'utf-8')
  const lines = content.split('\n')

  // 尝试按行号删除
  const lineNum = parseInt(identifier, 10)
  if (!isNaN(lineNum) && lineNum > 0 && lineNum <= lines.length) {
    lines.splice(lineNum - 1, 1)
    const newContent = lines.join('\n')
    writeFileSync(rulesPath, newContent, 'utf-8')
    return { type: 'text', value: `✅ 第 ${lineNum} 行规则已删除。` }
  }

  // 尝试按内容删除
  const index = lines.findIndex(l => l.includes(identifier))
  if (index >= 0) {
    lines.splice(index, 1)
    const newContent = lines.join('\n')
    writeFileSync(rulesPath, newContent, 'utf-8')
    return { type: 'text', value: `✅ 规则 "${identifier}" 已删除。` }
  }

  return { type: 'text', value: `❌ 未找到匹配的规则: ${identifier}` }
}

function editRule(content: string): { type: 'text'; value: string } {
  if (!content.trim()) {
    return { type: 'text', value: '❌ 请提供新的规则内容。\n用法: /rules edit <新规则内容>' }
  }

  const rulesPath = getProjectRulesPath()
  try {
    ensureDir(rulesPath)
    writeFileSync(rulesPath, content, 'utf-8')
    return {
      type: 'text',
      value: `✅ 规则已更新到 ${rulesPath}\n\n使用 /rules show 查看完整规则。`
    }
  } catch (err) {
    return {
      type: 'text',
      value: `❌ 更新规则失败: ${err instanceof Error ? err.message : String(err)}`
    }
  }
}

function initRules(): { type: 'text'; value: string } {
  const rulesPath = getProjectRulesPath()
  if (existsSync(rulesPath)) {
    return {
      type: 'text',
      value: `⚠️ 规则文件已存在: ${rulesPath}\n\n使用 /rules show 查看当前规则。\n使用 /rules edit <内容> 修改规则。`
    }
  }

  const defaultRules = `# Dogerules - 项目级持久化规则

# 在这里添加项目的编码规范和约定
# 所有规则会对所有 AI 交互生效

# 示例规则：
# - 代码风格使用 2 空格缩进
# - 提交前必须运行测试
# - 使用 TypeScript 而非 JavaScript
# - 优先使用函数式编程风格
`

  try {
    ensureDir(rulesPath)
    writeFileSync(rulesPath, defaultRules, 'utf-8')
    return {
      type: 'text',
      value: `✅ 规则文件已创建: ${rulesPath}\n\n使用 /rules edit <内容> 修改规则。\n使用 /rules add <内容> 添加规则。`
    }
  } catch (err) {
    return {
      type: 'text',
      value: `❌ 创建规则文件失败: ${err instanceof Error ? err.message : String(err)}`
    }
  }
}

function clearRules(): { type: 'text'; value: string } {
  const rulesPath = getProjectRulesPath()
  if (!existsSync(rulesPath)) {
    return { type: 'text', value: '❌ 项目规则文件不存在。' }
  }

  try {
    writeFileSync(rulesPath, '', 'utf-8')
    return { type: 'text', value: '✅ 项目规则已清空。' }
  } catch (err) {
    return {
      type: 'text',
      value: `❌ 清空规则失败: ${err instanceof Error ? err.message : String(err)}`
    }
  }
}

// ============================================================================
// Help Text
// ============================================================================

function renderHelp(): string {
  return [
    '📋 持久化规则管理 - Dogerules',
    '',
    '管理跨会话的持久化指令，类似 Cursor 的 .cursorrules。',
    '',
    '📖 📖 用法: ',
    '  /rules [子命令] [参数]',
    '',
    '⌨️ ⌨️ 子命令: ',
    '  list                列出所有规则（默认）',
    '  show                显示规则详情',
    '  add <内容>          添加规则到项目规则文件',
    '  set <内容>          同 add',
    '  edit <内容>         替换整个项目规则文件',
    '  remove <内容|行号>  删除匹配的规则',
    '  rm <内容|行号>      同 remove',
    '  init                创建初始规则文件',
    '  clear               清空项目规则',
    '  --help              显示帮助',
    '',
    '规则文件位置:',
    `  全局: ~/.doge/dogerules`,
    `  项目: ./.dogerules`,
    `  本地: ./.dogerules.local`,
    '',
    '💡 💡 示例: ',
    '  /rules init',
    '  /rules add 代码风格使用 2 空格缩进',
    '  /rules add 提交前必须运行测试',
    '  /rules show',
    '  /rules remove 2',
    '  /rules edit # 新规则内容',
  ].join('\n')
}

// ============================================================================
// Command Definition
// ============================================================================

const command = {
  type: 'local' as const,
  name: 'rules',
  description: '持久化规则管理 - 管理跨会话的 AI 交互指令',
  aliases: ['/rules', '/rule', '/dogerules'],
  arguments: [
    { name: 'list', description: '列出所有规则', required: false },
    { name: 'show', description: '显示规则详情', required: false },
    { name: 'add', description: '添加规则', required: false },
    { name: 'edit', description: '编辑规则', required: false },
    { name: 'remove', description: '删除规则', required: false },
    { name: 'init', description: '初始化规则文件', required: false },
    { name: 'clear', description: '清空规则', required: false },
    { name: 'help', description: '显示帮助', required: false },
  ],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
} satisfies Command

export default command
