import type { Command } from '../commands.js'
import type { LocalCommandCall } from '../types/command.js'
import { execSync } from 'child_process'
import { existsSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

// ============================================================================
// Types
// ============================================================================

interface DiagnosticItem {
  name: string
  category: string
  status: 'pass' | 'warn' | 'fail'
  message: string
  suggestion?: string
}

interface DiagnosticResult {
  items: DiagnosticItem[]
  passed: number
  warned: number
  failed: number
}

// ============================================================================
// Diagnostic Checks
// ============================================================================

function checkGit(): DiagnosticItem[] {
  const items: DiagnosticItem[] = []
  try {
    const version = execSync('git --version', { encoding: 'utf-8', timeout: 5000 }).trim()
    items.push({ name: 'Git 安装', category: '环境', status: 'pass', message: version })
  } catch {
    items.push({ name: 'Git 安装', category: '环境', status: 'fail', message: '未安装 git', suggestion: '安装 git: https://git-scm.com/downloads' })
  }

  if (existsSync('.git')) {
    try {
      const status = execSync('git status --porcelain', { encoding: 'utf-8', timeout: 5000 }).trim()
      const lines = status.split('\n').filter(Boolean)
      if (lines.length > 0) {
        items.push({ name: 'Git 状态', category: '仓库', status: 'warn', message: `${lines.length} 个未提交变更` })
      } else {
        items.push({ name: 'Git 状态', category: '仓库', status: 'pass', message: '工作目录干净' })
      }
    } catch {
      items.push({ name: 'Git 状态', category: '仓库', status: 'warn', message: '无法读取 git 状态' })
    }
  } else {
    items.push({ name: 'Git 仓库', category: '仓库', status: 'warn', message: '当前目录不是 git 仓库' })
  }

  return items
}

function checkNodeEnvironment(): DiagnosticItem[] {
  const items: DiagnosticItem[] = []

  // Node.js version
  try {
    const nodeVersion = execSync('node --version', { encoding: 'utf-8', timeout: 5000 }).trim()
    const major = parseInt(nodeVersion.replace('v', ''), 10)
    if (major >= 24) {
      items.push({ name: 'Node.js', category: '环境', status: 'pass', message: nodeVersion })
    } else {
      items.push({ name: 'Node.js', category: '环境', status: 'warn', message: `${nodeVersion}（推荐 >= 24）`, suggestion: '升级到 Node.js 24+' })
    }
  } catch {
    items.push({ name: 'Node.js', category: '环境', status: 'fail', message: '未安装 Node.js', suggestion: '安装 Node.js 24+: https://nodejs.org' })
  }

  // Bun
  try {
    const bunVersion = execSync('bun --version', { encoding: 'utf-8', timeout: 5000 }).trim()
    items.push({ name: 'Bun', category: '环境', status: 'pass', message: bunVersion })
  } catch {
    items.push({ name: 'Bun', category: '环境', status: 'warn', message: '未安装 Bun', suggestion: '安装 Bun: bun.sh' })
  }

  return items
}

function checkProjectStructure(): DiagnosticItem[] {
  const items: DiagnosticItem[] = []

  const keyFiles = [
    { file: 'package.json', desc: 'Node.js 项目配置' },
    { file: 'tsconfig.json', desc: 'TypeScript 配置' },
  ]

  for (const { file, desc } of keyFiles) {
    if (existsSync(file)) {
      try {
        const content = readFileSync(file, 'utf-8')
        JSON.parse(content) // Validate JSON
        items.push({ name: file, category: '项目', status: 'pass', message: desc })
      } catch {
        items.push({ name: file, category: '项目', status: 'fail', message: `${desc} - JSON 格式无效` })
      }
    }
  }

  // Check node_modules
  if (existsSync('node_modules')) {
    try {
      const stat = statSync('node_modules')
      items.push({ name: 'node_modules', category: '依赖', status: 'pass', message: '已安装依赖' })
    } catch {
      items.push({ name: 'node_modules', category: '依赖', status: 'warn', message: '存在但无法访问' })
    }
  } else {
    items.push({ name: 'node_modules', category: '依赖', status: 'warn', message: '未安装依赖', suggestion: '运行 bun install' })
  }

  return items
}

function checkApiKeys(): DiagnosticItem[] {
  const items: DiagnosticItem[] = []

  const keys = [
    { env: 'ANTHROPIC_API_KEY', desc: 'Anthropic API Key' },
    { env: 'OPENAI_API_KEY', desc: 'OpenAI API Key' },
  ]

  for (const { env, desc } of keys) {
    const val = process.env[env]
    if (val && val.length > 0) {
      const masked = val.slice(0, 4) + '...' + val.slice(-4)
      items.push({ name: desc, category: '认证', status: 'pass', message: `已配置 (${masked})` })
    }
  }

  // Check if at least one key is configured
  const hasAnyKey = keys.some(k => process.env[k.env])
  if (!hasAnyKey) {
    items.push({ name: 'API Keys', category: '认证', status: 'warn', message: '未检测到任何 API Key', suggestion: '设置 ANTHROPIC_API_KEY 或 OPENAI_API_KEY' })
  }

  return items
}

function checkPlaywright(): DiagnosticItem[] {
  const items: DiagnosticItem[] = []

  try {
    execSync('npx playwright --version', { encoding: 'utf-8', timeout: 10000 })
    items.push({ name: 'Playwright', category: '浏览器', status: 'pass', message: '已安装' })
  } catch {
    items.push({ name: 'Playwright', category: '浏览器', status: 'warn', message: '未安装', suggestion: '运行 bun add -D playwright && npx playwright install' })
  }

  return items
}

function checkDiskSpace(): DiagnosticItem[] {
  const items: DiagnosticItem[] = []

  try {
    if (process.platform === 'win32') {
      const output = execSync('wmic logicaldisk get size,freespace,caption', { encoding: 'utf-8', timeout: 5000 })
      items.push({ name: '磁盘空间', category: '系统', status: 'pass', message: '可用（Windows）' })
    } else {
      const output = execSync('df -h .', { encoding: 'utf-8', timeout: 5000 })
      const lines = output.trim().split('\n')
      if (lines.length > 1) {
        const parts = lines[1].split(/\s+/)
        const avail = parts[3]
        const percent = parts[4]?.replace('%', '') || '0'
        const percentNum = parseInt(percent, 10)
        if (percentNum > 90) {
          items.push({ name: '磁盘空间', category: '系统', status: 'fail', message: `仅剩 ${avail} (${percent} 已用)` })
        } else if (percentNum > 70) {
          items.push({ name: '磁盘空间', category: '系统', status: 'warn', message: `剩余 ${avail} (${percent} 已用)` })
        } else {
          items.push({ name: '磁盘空间', category: '系统', status: 'pass', message: `剩余 ${avail} (${percent} 已用)` })
        }
      }
    }
  } catch {
    items.push({ name: '磁盘空间', category: '系统', status: 'warn', message: '无法检测' })
  }

  return items
}

function checkMemory(): DiagnosticItem[] {
  const items: DiagnosticItem[] = []

  try {
    const totalMem = require('os').totalmem()
    const freeMem = require('os').freemem()
    const totalGB = (totalMem / 1024 / 1024 / 1024).toFixed(1)
    const freeGB = (freeMem / 1024 / 1024 / 1024).toFixed(1)
    const usedPercent = Math.round(((totalMem - freeMem) / totalMem) * 100)

    if (usedPercent > 90) {
      items.push({ name: '系统内存', category: '系统', status: 'fail', message: `剩余 ${freeGB}GB / ${totalGB}GB (${usedPercent}% 已用)` })
    } else if (usedPercent > 70) {
      items.push({ name: '系统内存', category: '系统', status: 'warn', message: `剩余 ${freeGB}GB / ${totalGB}GB (${usedPercent}% 已用)` })
    } else {
      items.push({ name: '系统内存', category: '系统', status: 'pass', message: `剩余 ${freeGB}GB / ${totalGB}GB (${usedPercent}% 已用)` })
    }
  } catch {
    items.push({ name: '系统内存', category: '系统', status: 'warn', message: '无法检测' })
  }

  return items
}

// ============================================================================
// Main Diagnostic Runner
// ============================================================================

function runDiagnostics(): DiagnosticResult {
  const items: DiagnosticItem[] = [
    ...checkGit(),
    ...checkNodeEnvironment(),
    ...checkProjectStructure(),
    ...checkApiKeys(),
    ...checkPlaywright(),
    ...checkDiskSpace(),
    ...checkMemory(),
  ]

  return {
    items,
    passed: items.filter(i => i.status === 'pass').length,
    warned: items.filter(i => i.status === 'warn').length,
    failed: items.filter(i => i.status === 'fail').length,
  }
}

// ============================================================================
// Output Formatters
// ============================================================================

function formatTextReport(result: DiagnosticResult): string {
  const lines: string[] = []
  lines.push('🔍 系统诊断报告')
  lines.push('')

  // Group by category
  const categories = new Map<string, DiagnosticItem[]>()
  for (const item of result.items) {
    if (!categories.has(item.category)) categories.set(item.category, [])
    categories.get(item.category)!.push(item)
  }

  for (const [category, items] of categories) {
    lines.push(`  ${category}:`)
    for (const item of items) {
      const icon = item.status === 'pass' ? '✅' : item.status === 'warn' ? '⚠️' : '❌'
      lines.push(`    ${icon} ${item.name}: ${item.message}`)
      if (item.suggestion) {
        lines.push(`       \x1b[33m→ ${item.suggestion}\x1b[0m`)
      }
    }
    lines.push('')
  }

  // Summary
  const total = result.items.length
  lines.push(`📊 总结: ${result.passed}/${total} 通过 | ${result.warned} 警告 | ${result.failed} 失败`)

  if (result.failed > 0) {
    lines.push('')
    lines.push('❌ 有严重问题需要修复后再继续使用。')
  } else if (result.warned > 0) {
    lines.push('')
    lines.push('⚠️ 有警告项，建议处理但不影响基本使用。')
  } else {
    lines.push('')
    lines.push('✅ 所有检查项均通过，环境健康！')
  }

  return lines.join('\n')
}

// ============================================================================
// Help Text
// ============================================================================

function renderHelp(): string {
  return [
    '🔍 系统诊断',
    '',
    '检测环境问题、配置错误、性能瓶颈。',
    '',
    '用法:',
    '  /diagnose [选项]',
    '',
    '选项:',
    '  --json              JSON 格式输出',
    '📖 用法:   --help              显示帮助',
    '',
    '检查项:',
    '  • Git: git 安装、仓库状态',
    '  • 环境: Node.js 版本、Bun 安装',
    '  • 项目: package.json、tsconfig.json、node_modules',
    '  • 认证: API Key 配置',
    '  • 浏览器: Playwright 安装',
    '  • 系统: 磁盘空间、内存使用',
  ].join('\n')
}

// ============================================================================
// Command
// ============================================================================

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()

  if (s.includes('--help')) {
    return { type: 'text', value: renderHelp() }
  }

  const json = s.includes('--json')
  const result = runDiagnostics()

  if (json) {
    return { type: 'json', value: JSON.stringify(result, null, 2) }
  }

  return { type: 'text', value: formatTextReport(result) }
}

// ============================================================================
// Command Definition
// ============================================================================

const command = {
  type: 'local' as const,
  name: 'diagnose',
  description: '系统诊断 - 检测环境、配置、性能问题',
  aliases: ['/diagnose', '/diag', '/check'],
  arguments: [
    { name: '--json', description: 'JSON 格式输出', required: false },
    { name: 'help', description: '显示帮助', required: false },
  ],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
} satisfies Command

export default command
