import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { readdirSync, existsSync, statSync } from 'fs'
import { join, resolve } from 'path'

// ============================================================================
// Types
// ============================================================================

interface CompletionItem {
  text: string
  type: 'command' | 'file' | 'directory' | 'flag' | 'shell'
  description?: string
  score: number
}

interface AutocompleteOptions {
  query: string
  context?: 'command' | 'flag' | 'file' | 'directory' | 'shell'
  cwd?: string
  limit?: number
  json?: boolean
}

// ============================================================================
// Completers
// ============================================================================

const KNOWN_COMMANDS = [
  '/cost', '/cost-history', '/code-review', '/code-review-assistant',
  '/security-audit', '/commit', '/commit-push-pr', '/diff-mode',
  '/block-mode', '/repo-map', '/vector-search', '/code-search',
  '/browser', '/test-gen', '/help', '/clear', '/compact',
  '/context', '/context-collapse', '/export', '/cd',
  '/add-dir', '/add-model', '/benchmark', '/btw',
  '/buddy', '/bughunter', '/changelog', '/config',
  '/copy', '/create', '/cron', '/ctx-viz',
  '/health-score', '/autocomplete', '/history',
]

const COMMON_FLAGS = [
  '--help', '--json', '--format', '--mode', '--scan', '--file',
  '--path', '--output', '--verbose', '--quiet', '--version',
  '--context', '--detailed', '--session', '--days',
]

function completeCommands(query: string, limit: number): CompletionItem[] {
  if (!query) return KNOWN_COMMANDS.slice(0, limit).map(c => ({ text: c, type: 'command', score: 10 }))

  return KNOWN_COMMANDS
    .filter(c => c.toLowerCase().includes(query.toLowerCase()))
    .slice(0, limit)
    .map(c => ({
      text: c,
      type: 'command' as const,
      score: 10 - Math.abs(c.length - query.length),
    }))
}

function completeFlags(query: string, limit: number): CompletionItem[] {
  if (!query) return COMMON_FLAGS.slice(0, limit).map(f => ({ text: f, type: 'flag', score: 10 }))

  return COMMON_FLAGS
    .filter(f => f.toLowerCase().includes(query.toLowerCase()))
    .slice(0, limit)
    .map(f => ({
      text: f,
      type: 'flag' as const,
      score: 10,
    }))
}

function completeFiles(query: string, cwd: string, limit: number): CompletionItem[] {
  const results: CompletionItem[] = []
  const dir = query.includes('/') ? resolve(cwd, query.slice(0, query.lastIndexOf('/') + 1)) : cwd
  const prefix = query.includes('/') ? query.slice(query.lastIndexOf('/') + 1) : query

  if (!existsSync(dir)) return results

  try {
    const entries = readdirSync(dir)
    for (const entry of entries) {
      if (entry.startsWith('.') && !prefix.startsWith('.')) continue
      if (!entry.toLowerCase().startsWith(prefix.toLowerCase())) continue

      const fullPath = join(dir, entry)
      try {
        const stat = statSync(fullPath)
        const type = stat.isDirectory() ? 'directory' : 'file'

        results.push({
          text: entry,
          type: type as 'directory' | 'file',
          score: type === 'directory' ? 5 : 3,
        })

        if (results.length >= limit) break
      } catch {
        // skip
      }
    }
  } catch {
    // skip
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit)
}

let _systemCommandsCache: string[] | null = null

function getSystemCommands(): string[] {
  if (_systemCommandsCache) return _systemCommandsCache

  const commands = new Set<string>()

  // Try to get commands from shell completion
  try {
    const { execSync } = require('child_process')
    const output = execSync('bash -c "compgen -c"', {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'ignore'],
    })
    for (const cmd of output.split('\n')) {
      const trimmed = cmd.trim()
      if (trimmed && !trimmed.includes(' ')) commands.add(trimmed)
    }
  } catch {
    // compgen not available (Windows or no bash) - use fallback
  }

  // Add common commands as fallback
  const common = [
    'git', 'npm', 'bun', 'node', 'python', 'python3',
    'docker', 'kubectl', 'make', 'cargo', 'go', 'rustc',
    'ls', 'cd', 'pwd', 'cat', 'grep', 'find', 'vim', 'nano',
    'git add', 'git commit', 'git push', 'git pull', 'git status',
    'git diff', 'git checkout', 'git branch', 'git merge',
  ]
  for (const cmd of common) commands.add(cmd)

  _systemCommandsCache = Array.from(commands)
  return _systemCommandsCache
}

function completeShellCommands(query: string, limit: number): CompletionItem[] {
  if (!query) return []

  const commands = getSystemCommands()

  return commands
    .filter(c => c.toLowerCase().startsWith(query.toLowerCase()))
    .slice(0, limit)
    .map(c => ({
      text: c,
      type: 'shell' as const,
      score: 7,
    }))
}

// ============================================================================
// Main Completer
// ============================================================================

export function getCompletions(options: AutocompleteOptions): CompletionItem[] {
  const { query = '', context = 'command', cwd = process.cwd(), limit = 15 } = options

  const completions: CompletionItem[] = []

  switch (context) {
    case 'command':
      completions.push(...completeCommands(query, limit))
      break
    case 'flag':
      completions.push(...completeFlags(query, limit))
      break
    case 'file':
      completions.push(...completeFiles(query, cwd, limit))
      break
    case 'directory':
      completions.push(...completeFiles(query + '/', cwd, limit).filter(c => c.type === 'directory'))
      break
    case 'shell':
      completions.push(...completeShellCommands(query, limit))
      break
  }

  // Sort by score descending
  return completions.sort((a, b) => b.score - a.score).slice(0, limit)
}

// ============================================================================
// Help Text
// ============================================================================

function renderHelp(): string {
  return [
    '⚡ 智能终端补全',
    '',
    '提供上下文感知的命令行补全建议。',
    '',
    '用法:',
    '  /autocomplete [选项]',
    '',
    '选项:',
    '  --query <输入>      补全查询（当前输入内容）',
    '  --context <类型>    上下文类型: command / flag / file / directory / shell',
    '  --cwd <路径>        工作目录（用于文件补全）',
    '  --json              JSON 格式输出',
    '  --help              显示帮助',
    '',
    '示��:',
    '  /autocomplete --query /code',
    '  /autocomplete --query -- --context flag',
    '  /autocomplete --query src/ --context file',
    '',
    '功能:',
    '  • 命令补全：自动补全 / 命令',
    '  • 标志补全：补全常见 CLI 标志',
    '  • 文件补全：文件/目录路径补全',
    '  • Shell 补全：常用 shell 命令',
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

  const queryMatch = s.match(/--query\s+(\S+)/)
  const contextMatch = s.match(/--context\s+(\S+)/)
  const cwdMatch = s.match(/--cwd\s+(\S+)/)
  const json = s.includes('--json')

  const query = queryMatch?.[1] ?? ''
  const context = (contextMatch?.[1] as AutocompleteOptions['context']) ?? 'command'
  const cwd = cwdMatch?.[1] ?? process.cwd()

  const completions = getCompletions({ query, context, cwd, limit: 15 })

  if (json) {
    return {
      type: 'json',
      value: JSON.stringify({ query, context, completions }, null, 2),
    }
  }

  if (completions.length === 0) {
    return { type: 'text', value: '🔍 无补全建议' }
  }

  const lines: string[] = ['⚡ 补全建议:']
  completions.forEach((c, i) => {
    const icon = {
      command: '>',
      flag: '--',
      file: '+',
      directory: '📁',
      shell: '$',
    }[c.type] || '•'

    const desc = c.description ? ` - ${c.description}` : ''
    lines.push(`  ${icon} ${c.text}${desc}`)
  })

  return { type: 'text', value: lines.join('\n') }
}

// ============================================================================
// Command Registration
// ============================================================================

const autocomplete = {
  type: 'local' as const,
  name: 'autocomplete',
  description: '智能终端补全 - 上下文感知的命令行补全建议',
  aliases: ['/complete', '/tab'],
  arguments: [
    {
      name: '--query',
      description: '补全查询（当前输入内容）',
      required: false,
    },
    {
      name: '--context',
      description: '上下文类型: command / flag / file / directory / shell',
      required: false,
    },
    {
      name: '--cwd',
      description: '工作目录',
      required: false,
    },
    {
      name: '--json',
      description: 'JSON 格式输出',
      required: false,
    },
    {
      name: 'help',
      description: '显示帮助',
      required: false,
    },
  ],
  supportsNonInteractive: true,
  call: call as unknown as Command['call'],
} satisfies Command

export default autocomplete
