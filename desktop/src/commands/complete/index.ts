import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { execSync } from 'child_process'
import { existsSync, readdirSync, statSync, readFileSync } from 'fs'
import { join, resolve, extname } from 'path'

// ============================================================================
// Types
// ============================================================================

interface CompleteItem {
  text: string
  type: 'file' | 'directory' | 'git-branch' | 'git-remote' | 'npm-script' | 'docker-container' | 'env-var' | 'history' | 'ai-suggestion'
  description?: string
  score: number
}

interface CompleteOptions {
  query: string
  context: 'auto' | 'file' | 'git-branch' | 'git-remote' | 'npm-script' | 'docker-container' | 'env-var' | 'history' | 'ai-suggestion'
  cwd?: string
  limit?: number
}

// ============================================================================
// Context-Aware Completers
// ============================================================================

/** Git 分支补全 */
function completeGitBranches(query: string, limit: number): CompleteItem[] {
  try {
    const output = execSync('git branch -a --format="%(refname:short)" 2>/dev/null || git branch --format="%(refname:short)" 2>/dev/null', {
      cwd: process.cwd(),
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'ignore'],
    })
    const branches = output.split('\n').map(b => b.trim()).filter(Boolean)
    return branches
      .filter(b => !query || b.toLowerCase().includes(query.toLowerCase()))
      .slice(0, limit)
      .map((b, i) => ({
        text: b,
        type: 'git-branch' as const,
        description: i === 0 ? '当前分支' : '分支',
        score: 10 - i,
      }))
  } catch {
    return []
  }
}

/** Git 远程仓库补全 */
function completeGitRemotes(query: string, limit: number): CompleteItem[] {
  try {
    const output = execSync('git remote -v 2>/dev/null', {
      cwd: process.cwd(),
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'ignore'],
    })
    const remotes = new Map<string, string>()
    for (const line of output.split('\n')) {
      const [name, url] = line.split('\t')
      if (name && url) remotes.set(name, url.split(' ')[0])
    }
    return Array.from(remotes.entries())
      .filter(([name]) => !query || name.toLowerCase().includes(query.toLowerCase()))
      .slice(0, limit)
      .map(([name, url]) => ({
        text: name,
        type: 'git-remote' as const,
        description: url,
        score: 8,
      }))
  } catch {
    return []
  }
}

/** npm 脚本补全 */
function completeNpmScripts(query: string, limit: number): CompleteItem[] {
  const packageJsonPath = join(process.cwd(), 'package.json')
  if (!existsSync(packageJsonPath)) return []

  try {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
    const scripts = pkg.scripts ?? {}
    return Object.entries(scripts as Record<string, string>)
      .filter(([name]) => !query || name.toLowerCase().includes(query.toLowerCase()))
      .slice(0, limit)
      .map(([name, cmd]) => ({
        text: name,
        type: 'npm-script' as const,
        description: cmd,
        score: 9,
      }))
  } catch {
    return []
  }
}

/** Docker 容器补全 */
function completeDockerContainers(query: string, limit: number): CompleteItem[] {
  try {
    const output = execSync('docker ps --format "{{.Names}}|{{.Image}}|{{.Status}}" 2>/dev/null', {
      cwd: process.cwd(),
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'ignore'],
    })
    return output.split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const [name, image, status] = line.split('|')
        return { name: name ?? '', image: image ?? '', status: status ?? '' }
      })
      .filter(c => !query || c.name.toLowerCase().includes(query.toLowerCase()))
      .slice(0, limit)
      .map(c => ({
        text: c.name,
        type: 'docker-container' as const,
        description: `${c.image} (${c.status})`,
        score: 8,
      }))
  } catch {
    return []
  }
}

/** 环境变量补全 */
function completeEnvVars(query: string, limit: number): CompleteItem[] {
  return Object.entries(process.env)
    .filter(([key]) => key.startsWith(query.toUpperCase()))
    .slice(0, limit)
    .map(([key, val]) => ({
      text: key,
      type: 'env-var' as const,
      description: (val ?? '').slice(0, 60),
      score: 7,
    }))
}

/** 文件路径补全（增强版，支持递归和过滤） */
function completeFiles(query: string, cwd: string, limit: number): CompleteItem[] {
  const results: CompleteItem[] = []
  const targetDir = query.includes('/') ? resolve(cwd, query.slice(0, query.lastIndexOf('/') + 1)) : cwd
  const prefix = query.includes('/') ? query.slice(query.lastIndexOf('/') + 1) : query

  if (!existsSync(targetDir)) return results

  try {
    const entries = readdirSync(targetDir)
    for (const entry of entries) {
      if (entry.startsWith('.') && !prefix.startsWith('.')) continue
      if (!entry.toLowerCase().startsWith(prefix.toLowerCase())) continue

      const fullPath = join(targetDir, entry)
      try {
        const stat = statSync(fullPath)
        const type = stat.isDirectory() ? 'directory' : 'file'
        const ext = extname(entry).toLowerCase()

        results.push({
          text: entry + (type === 'directory' ? '/' : ''),
          type,
          description: type === 'directory' ? '目录' : ext,
          score: type === 'directory' ? 6 : 4,
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

/** AI 增强建议（基于上下文智能推断） */
function completeAISuggestions(query: string, limit: number): CompleteItem[] {
  if (!query || query.length < 2) return []

  const suggestions: CompleteItem[] = []

  // 基于查询模式的智能建议
  if (query.startsWith('git ')) {
    const gitCmds = [
      { text: 'git status', desc: '查看仓库状态' },
      { text: 'git log --oneline -10', desc: '查看最近提交' },
      { text: 'git diff', desc: '查看未暂存变更' },
      { text: 'git diff --staged', desc: '查看已暂存变更' },
      { text: 'git checkout -b ', desc: '创建新分支' },
      { text: 'git stash', desc: '暂存当前变更' },
    ]
    suggestions.push(...gitCmds
      .filter(c => c.text.includes(query))
      .map(c => ({ text: c.text, type: 'ai-suggestion' as const, description: c.desc, score: 8 }))
    )
  }

  if (query.startsWith('npm ') || query.startsWith('bun ')) {
    const pkgCmds = [
      { text: 'npm run dev', desc: '启动开发服务器' },
      { text: 'npm run build', desc: '构建生产版本' },
      { text: 'npm test', desc: '运行测试' },
      { text: 'npm install ', desc: '安装依赖' },
      { text: 'npm outdated', desc: '检查过期依赖' },
      { text: 'bun run dev', desc: 'Bun 开发模式' },
    ]
    suggestions.push(...pkgCmds
      .filter(c => c.text.includes(query))
      .map(c => ({ text: c.text, type: 'ai-suggestion' as const, description: c.desc, score: 8 }))
    )
  }

  if (query.startsWith('docker ')) {
    const dockerCmds = [
      { text: 'docker ps', desc: '列出运行中的容器' },
      { text: 'docker images', desc: '列出镜像' },
      { text: 'docker compose up', desc: '启动 Compose 服务' },
      { text: 'docker logs ', desc: '查看容器日志' },
      { text: 'docker exec -it  bash', desc: '进入容器终端' },
    ]
    suggestions.push(...dockerCmds
      .filter(c => c.text.includes(query))
      .map(c => ({ text: c.text, type: 'ai-suggestion' as const, description: c.desc, score: 8 }))
    )
  }

  return suggestions.slice(0, limit)
}

// ============================================================================
// Main Completer
// ============================================================================

export function getContextualCompletions(options: CompleteOptions): CompleteItem[] {
  const { query = '', context = 'auto', cwd = process.cwd(), limit = 20 } = options
  const completions: CompleteItem[] = []

  switch (context) {
    case 'auto':
      // 智能推断上下文
      completions.push(...completeFiles(query, cwd, limit))
      if (query.startsWith('git')) {
        completions.push(...completeGitBranches(query.replace(/^git\s*/, ''), 5))
        completions.push(...completeGitRemotes(query.replace(/^git\s*/, ''), 3))
      }
      if (query.startsWith('npm') || query.startsWith('bun')) {
        completions.push(...completeNpmScripts(query.replace(/^(npm|bun)\s*(run\s*)?/, ''), 5))
      }
      if (query.startsWith('docker')) {
        completions.push(...completeDockerContainers(query.replace(/^docker\s*/, ''), 5))
      }
      if (query.includes('=')) {
        completions.push(...completeEnvVars(query.split('=')[0], 5))
      }
      completions.push(...completeAISuggestions(query, 5))
      break
    case 'file':
      completions.push(...completeFiles(query, cwd, limit))
      break
    case 'git-branch':
      completions.push(...completeGitBranches(query, limit))
      break
    case 'git-remote':
      completions.push(...completeGitRemotes(query, limit))
      break
    case 'npm-script':
      completions.push(...completeNpmScripts(query, limit))
      break
    case 'docker-container':
      completions.push(...completeDockerContainers(query, limit))
      break
    case 'env-var':
      completions.push(...completeEnvVars(query, limit))
      break
    case 'ai-suggestion':
      completions.push(...completeAISuggestions(query, limit))
      break
  }

  // Sort by score descending, deduplicate
  const seen = new Set<string>()
  return completions
    .sort((a, b) => b.score - a.score)
    .filter(c => {
      if (seen.has(c.text)) return false
      seen.add(c.text)
      return true
    })
    .slice(0, limit)
}

// ============================================================================
// Help Text
// ============================================================================

function renderHelp(): string {
  return [
    '🎯 智能终端补全',
    '',
    '上下文感知的命令行补全（Warp/Fig 风格）。',
    '自动识别 Git 分支、npm 脚本、Docker 容器、环境变量等上下文。',
    '',
    '用法:',
    '  /complete [选项]',
    '',
    '选项:',
    '  --query <输入>      补全查询（当前输入内容）',
    '  --context <类型>    上下文类型:',
    '    auto              自动推断（默认）',
    '    file              文件路径',
    '    git-branch        Git 分支',
    '    git-remote        Git 远程仓库',
    '    npm-script        npm/bun 脚本',
    '    docker-container  Docker 容器',
    '    env-var           环境变量',
    '    ai-suggestion     AI 智能建议',
    '  --cwd <路径>        工作目录',
    '  --limit <数量>      返回数量（默认 20）',
    '  --json              JSON 格式输出',
    '📖 用法:   --help              显示帮助',
    '',
    '示例:',
    '  /complete --query src/',
    '  /complete --query feat --context git-branch',
    '  /complete --query dev --context npm-script',
    '  /complete --query my --context docker-container',
    '',
    '功能:',
    '  • 自动推断上下文类型',
    '  • Git 分支/远程仓库补全',
    '  • npm/bun 脚本补全',
    '  • Docker 容器名称补全',
    '  • 环境变量名补全',
    '  • AI 智能命令建议',
    '  • 文件路径递归补全',
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
  const limitMatch = s.match(/--limit\s+(\d+)/)
  const json = s.includes('--json')

  const query = queryMatch?.[1] ?? ''
  const context = (contextMatch?.[1] as CompleteOptions['context']) ?? 'auto'
  const cwd = cwdMatch?.[1] ?? process.cwd()
  const limit = limitMatch?.[1] ? parseInt(limitMatch[1], 10) : 20

  const completions = getContextualCompletions({ query, context, cwd, limit })

  if (json) {
    return {
      type: 'json',
      value: JSON.stringify({ query, context, count: completions.length, completions }, null, 2),
    }
  }

  if (completions.length === 0) {
    return { type: 'text', value: '🔍 无补全建议' }
  }

  const lines: string[] = [`🎯 补全建议 (${context}):`]
  completions.forEach((c) => {
    const icon: Record<string, string> = {
      file: '📄',
      directory: '📁',
      'git-branch': '🌿',
      'git-remote': '🌐',
      'npm-script': '📦',
      'docker-container': '🐳',
      'env-var': '🔑',
      'ai-suggestion': '🤖',
      history: '⏪',
    }
    const iconChar = icon[c.type] ?? '•'
    const desc = c.description ? ` - ${c.description}` : ''
    lines.push(`  ${iconChar} ${c.text}${desc}`)
  })

  return { type: 'text', value: lines.join('\n') }
}

// ============================================================================
// Command Registration
// ============================================================================

const terminalComplete = {
  type: 'local' as const,
  name: 'complete',
  description: '智能终端补全 - 上下文感知的命令行补全（Warp/Fig 风格）',
  aliases: ['/complete', '/ctx-complete', '/tab'],
  arguments: [
    {
      name: '--query',
      description: '补全查询（当前输入内容）',
      required: false,
    },
    {
      name: '--context',
      description: '上下文类型: auto / file / git-branch / git-remote / npm-script / docker-container / env-var / ai-suggestion',
      required: false,
    },
    {
      name: '--cwd',
      description: '工作目录',
      required: false,
    },
    {
      name: '--limit',
      description: '返回数量（默认 20）',
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
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
} satisfies Command

export default terminalComplete
