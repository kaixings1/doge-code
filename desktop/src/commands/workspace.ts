import type { Command } from '../commands.js'
import type { LocalCommandCall } from '../types/command.js'
import { execSync } from 'child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join, basename } from 'path'

// ============================================================================
// Types
// ============================================================================

interface WorkspaceSnapshot {
  savedAt: string
  project: string
  branch: string
  summary: string
  files: string[]
  diff: string
  recentCommits: string[]
}

const WORKSPACE_DIR = join(process.cwd(), '.doge', 'workspaces')
const WORKSPACE_FILE = join(WORKSPACE_DIR, 'current.json')

// ============================================================================
// Helpers
// ============================================================================

function ensureDir(): void {
  try { mkdirSync(WORKSPACE_DIR, { recursive: true }) } catch { /* ignore */ }
}

function getProjectInfo(): { name: string; branch: string } {
  try {
    const branch = execSync('git branch --show-current', { encoding: 'utf-8', timeout: 5000 }).trim()
    return { name: basename(process.cwd()), branch }
  } catch {
    return { name: basename(process.cwd()), branch: 'unknown' }
  }
}

// ============================================================================
// Actions
// ============================================================================

function saveWorkspace(summary: string): string {
  try {
    ensureDir()
    const { name, branch } = getProjectInfo()

    let diff = ''
    try {
      diff = execSync('git diff HEAD', { encoding: 'utf-8', maxBuffer: 5 * 1024 * 1024, timeout: 10000 })
    } catch { /* ignore */ }

    let files: string[] = []
    try {
      const status = execSync('git status --porcelain', { encoding: 'utf-8', timeout: 5000 })
      files = status.split('\n').map(l => l.slice(3).trim()).filter(Boolean)
    } catch { /* ignore */ }

    let recentCommits: string[] = []
    try {
      const log = execSync('git log --oneline -5', { encoding: 'utf-8', timeout: 5000 })
      recentCommits = log.split('\n').filter(Boolean)
    } catch { /* ignore */ }

    const snapshot: WorkspaceSnapshot = {
      savedAt: new Date().toISOString(),
      project: name,
      branch,
      summary: summary || `Auto-saved at ${new Date().toLocaleString('zh-CN')}`,
      files,
      diff,
      recentCommits,
    }

    writeFileSync(WORKSPACE_FILE, JSON.stringify(snapshot, null, 2), 'utf-8')
    return ` 工作上下文已保存到 .doge/workspaces/current.json\n   项目: ${name}\n   分支: ${branch}\n   文件: ${files.length} 个变更`
  } catch (err) {
    return ` 保存失败: ${err instanceof Error ? err.message : String(err)}`
  }
}

function loadWorkspace(): string {
  try {
    if (!existsSync(WORKSPACE_FILE)) {
      return ' 没有找到保存的工作上下文。先运行 /workspace save 保存一个。'
    }

    const snapshot: WorkspaceSnapshot = JSON.parse(readFileSync(WORKSPACE_FILE, 'utf-8'))
    const { name: currentBranch } = getProjectInfo()

    const lines: string[] = []
    lines.push('📋 保存的工作上下文')
    lines.push(`   项目: ${snapshot.project}`)
    lines.push(`   分支: ${snapshot.branch}`)
    lines.push(`   保存时间: ${new Date(snapshot.savedAt).toLocaleString('zh-CN')}`)
    lines.push(`   摘要: ${snapshot.summary}`)
    lines.push('')
    lines.push('📝 当时修改的文件:')
    snapshot.files.slice(0, 20).forEach(f => lines.push(`   • ${f}`))
    if (snapshot.files.length > 20) {
      lines.push(`   ... 和另外 ${snapshot.files.length - 20} 个文件`)
    }
    lines.push('')
    lines.push('🔄 当前状态对比:')
    lines.push(`   当前分支: ${currentBranch}`)
    lines.push(`   分支是否相同: ${currentBranch === snapshot.branch ? ' 是' : ' 否'}`)

    // Check if files still exist
    const existingFiles = snapshot.files.filter(f => existsSync(f))
    lines.push(`   文件仍存在: ${existingFiles.length}/${snapshot.files.length}`)

    // Check for uncommitted changes
    try {
      const currentStatus = execSync('git status --porcelain', { encoding: 'utf-8', timeout: 5000 }).trim()
      const hasChanges = currentStatus.length > 0
      lines.push(`   当前有未提交变更: ${hasChanges ? ' 是' : ' 否'}`)
    } catch { /* ignore */ }

    return lines.join('\n')
  } catch (err) {
    return ` 加载失败: ${err instanceof Error ? err.message : String(err)}`
  }
}

function listWorkspaces(): string {
  try {
    ensureDir()
    const files = readdirSync(WORKSPACE_DIR).filter(f => f.endsWith('.json'))

    if (files.length === 0) {
      return '📋 没有保存的工作上下文。使用 /workspace save 创建一个。'
    }

    const lines: string[] = ['📋 所有工作上下文:']

    for (const file of files.sort().reverse()) {
      try {
        const content = JSON.parse(readFileSync(join(WORKSPACE_DIR, file), 'utf-8')) as WorkspaceSnapshot
        const stat = statSync(join(WORKSPACE_DIR, file))
        lines.push(`\n  📁 ${file}`)
        lines.push(`     项目: ${content.project} | 分支: ${content.branch}`)
        lines.push(`     保存: ${new Date(content.savedAt).toLocaleString('zh-CN')}`)
        lines.push(`     摘要: ${content.summary.slice(0, 60)}`)
      } catch {
        lines.push(`\n  📁 ${file} (无法读取)`)
      }
    }

    return lines.join('\n')
  } catch {
    return ' 没有保存的工作上下文。'
  }
}

// ============================================================================
// Help Text
// ============================================================================

function renderHelp(): string {
  return [
    '📋 工作区管理',
    '',
    '保存和恢复工作上下文（分支、diff、修改的文件）。',
    '',
    '用法:',
    '  /workspace <action> [参数]',
    '',
    '操作:',
    '  save [摘要]          保存当前工作上下文',
    '  load                 恢复最近保存的工作上下文',
    '  list                 列出所有保存的工作上下文',
    ' 用法:   --help               显示帮助',
    '',
    '示例:',
    '  /workspace save "重构用户模块中"',
    '  /workspace load',
    '  /workspace list',
    '',
    '存储位置: .doge/workspaces/',
  ].join('\n')
}

// ============================================================================
// Command
// ============================================================================

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()

  if (s.includes('--help') || s === '') {
    return { type: 'text', value: renderHelp() }
  }

  const parts = s.split(/\s+/)
  const action = parts[0]?.toLowerCase()
  const rest = parts.slice(1).join(' ')

  switch (action) {
    case 'save':
      return { type: 'text', value: saveWorkspace(rest) }
    case 'load':
      return { type: 'text', value: loadWorkspace() }
    case 'list':
      return { type: 'text', value: listWorkspaces() }
    default:
      return { type: 'text', value: ` 未知操作: ${action}\n\n${renderHelp()}` }
  }
}

// ============================================================================
// Command Definition
// ============================================================================

const command = {
  type: 'local' as const,
  name: 'workspace',
  description: '工作区管理 - 保存/恢复工作上下文',
  aliases: ['/workspace', '/ws', '/save-work'],
  arguments: [
    { name: 'save', description: '保存当前工作上下文', required: false },
    { name: 'load', description: '恢复最近保存的工作上下文', required: false },
    { name: 'list', description: '列出所有工作上下文', required: false },
    { name: 'help', description: '显示帮助', required: false },
  ],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
} satisfies Command

export default command
