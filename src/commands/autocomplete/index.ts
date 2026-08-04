// ============================================================================
// Autocomplete Command - Enhanced Version
// 智能终端补全：上下文感知/自定义片段/模糊匹配/历史/统计/多语言/模板
// ============================================================================

import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { readdirSync, existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'fs'
import { join, resolve, basename, extname } from 'path'

// ============================================================================
// Types & Interfaces
// ============================================================================

interface CompletionItem {
  text: string
  type: 'command' | 'file' | 'directory' | 'flag' | 'shell' | 'snippet' | 'function' | 'class' | 'import' | 'keyword' | 'variable'
  description?: string
  score: number
  source: string
  parameters?: string
  returnType?: string
  documentation?: string
  insertText?: string
  filterText?: string
  sortText?: string
  preselect?: boolean
  kind: CompletionKind
}

type CompletionKind = 'text' | 'method' | 'function' | 'constructor' | 'field' | 'variable' | 'class' | 'interface' | 'module' | 'property' | 'unit' | 'value' | 'enum' | 'keyword' | 'snippet' | 'color' | 'file' | 'reference'

interface AutocompleteOptions {
  query: string
  context?: 'command' | 'flag' | 'file' | 'directory' | 'shell' | 'snippet' | 'function' | 'class' | 'import' | 'keyword'
  cwd?: string
  limit?: number
  json?: boolean
  fuzzy?: boolean
  includeDocs?: boolean
  sortBy?: 'score' | 'name' | 'frequency'
}

interface SnippetDefinition {
  id: string
  name: string
  prefix: string
  body: string[]
  description: string
  language: string
  variables: Record<string, string>
  createdAt: string
  lastUsed?: string
  useCount: number
}

interface CompletionHistory {
  version: string
  completions: Array<{
    timestamp: string
    query: string
    selected: string
    type: string
    duration: number
  }>
}

interface CompletionStats {
  totalCompletions: number
  uniqueQueries: number
  avgResults: number
  topCompletions: Array<{ text: string; count: number; type: string }>
  topQueries: Array<{ query: string; count: number }>
  completionsByType: Record<string, number>
  completionsBySource: Record<string, number>
  avgDuration: number
}

interface LanguageConfig {
  name: string
  extensions: string[]
  keywords: string[]
  builtins: string[]
  snippets: SnippetDefinition[]
}

interface FuzzyMatch {
  matched: boolean
  score: number
  positions: number[]
}

// ============================================================================
// Constants
// ============================================================================

const AUTOCOMPLETE_DIR = join(process.cwd(), '.doge', 'autocomplete')
const HISTORY_FILE = join(AUTOCOMPLETE_DIR, 'history.json')
const SNIPPETS_FILE = join(AUTOCOMPLETE_DIR, 'snippets.json')
const STATS_FILE = join(AUTOCOMPLETE_DIR, 'stats.json')

const KNOWN_COMMANDS = [
  '/cost', '/cost-history', '/code-review', '/code-review-assistant',
  '/security-audit', '/commit', '/commit-push-pr', '/diff-mode',
  '/block-mode', '/repo-map', '/vector-search', '/code-search',
  '/browser', '/test-gen', '/help', '/clear', '/compact',
  '/context', '/context-collapse', '/export', '/cd',
  '/add-dir', '/add-model', '/benchmark', '/btw',
  '/buddy', '/bughunter', '/changelog', '/config',
  '/copy', '/create', '/cron', '/ctx-viz',
  '/health-score', '/autocomplete', '/history', '/sessions',
  '/workspace', '/memory-search', '/diagnose', '/stock',
  '/release-notes', '/updateapikey', '/updateskills',
]

const COMMON_FLAGS = [
  '--help', '--json', '--format', '--mode', '--scan', '--file',
  '--path', '--output', '--verbose', '--quiet', '--version',
  '--context', '--detailed', '--session', '--days', '--force',
  '--recursive', '--all', '--include', '--exclude', '--max-results',
  '--sort', '--filter', '--query', '--limit', '--offset',
]

const SHELL_COMMANDS = [
  'git', 'git status', 'git add', 'git commit', 'git push', 'git pull',
  'git diff', 'git log', 'git branch', 'git checkout', 'git merge',
  'git stash', 'git rebase', 'git reset', 'git cherry-pick',
  'npm', 'npm install', 'npm run', 'npm test', 'npm build',
  'bun', 'bun install', 'bun run', 'bun test', 'bun build',
  'node', 'python', 'python3', 'docker', 'docker compose',
  'kubectl', 'make', 'cargo', 'go', 'rustc', 'ls', 'cd',
  'pwd', 'cat', 'grep', 'find', 'vim', 'nano', 'curl', 'wget',
  'ssh', 'scp', 'rsync', 'tar', 'zip', 'unzip', 'mkdir', 'rm',
]

const DEFAULT_LIMIT = 15

// ============================================================================
// Completion Engines
// ============================================================================

function completeCommands(query: string, limit: number): CompletionItem[] {
  const items: CompletionItem[] = []

  for (const cmd of KNOWN_COMMANDS) {
    const score = calculateRelevance(cmd, query)
    if (score > 0) {
      items.push({
        text: cmd,
        type: 'command',
        description: getCommandDescription(cmd),
        score,
        source: 'commands',
        kind: 'keyword',
      })
    }
  }

  return items.sort((a, b) => b.score - a.score).slice(0, limit)
}

function completeFlags(query: string, limit: number): CompletionItem[] {
  const items: CompletionItem[] = []

  for (const flag of COMMON_FLAGS) {
    const score = calculateRelevance(flag, query)
    if (score > 0) {
      items.push({
        text: flag,
        type: 'flag',
        description: getFlagDescription(flag),
        score,
        source: 'flags',
        kind: 'property',
      })
    }
  }

  return items.sort((a, b) => b.score - a.score).slice(0, limit)
}

function completeFiles(query: string, cwd: string, limit: number): CompletionItem[] {
  const items: CompletionItem[] = []
  const dir = query.includes('/') ? resolve(cwd, query.slice(0, query.lastIndexOf('/') + 1)) : cwd
  const prefix = query.includes('/') ? query.slice(query.lastIndexOf('/') + 1) : query

  if (!existsSync(dir)) return items

  try {
    const entries = readdirSync(dir)
    for (const entry of entries) {
      if (entry.startsWith('.') && !prefix.startsWith('.')) continue
      if (!entry.toLowerCase().startsWith(prefix.toLowerCase())) continue

      const fullPath = join(dir, entry)
      try {
        const stat = statSync(fullPath)
        const isDir = stat.isDirectory()
        const type = isDir ? 'directory' : 'file'
        const score = isDir ? 5 : 3

        items.push({
          text: entry,
          type: type as any,
          description: isDir ? '目录' : getFileTypeDescription(entry),
          score,
          source: 'filesystem',
          kind: isDir ? 'file' : 'file',
          insertText: isDir ? entry + '/' : entry,
        })

        if (items.length >= limit) break
      } catch {
        // skip
      }
    }
  } catch {
    // skip
  }

  return items.sort((a, b) => b.score - a.score).slice(0, limit)
}

function completeShellCommands(query: string, limit: number): CompletionItem[] {
  const items: CompletionItem[] = []

  for (const cmd of SHELL_COMMANDS) {
    const score = calculateRelevance(cmd, query)
    if (score > 0) {
      items.push({
        text: cmd,
        type: 'shell',
        description: `Shell 命令: ${cmd}`,
        score,
        source: 'shell',
        kind: 'keyword',
      })
    }
  }

  return items.sort((a, b) => b.score - a.score).slice(0, limit)
}

function completeSnippets(query: string, limit: number): CompletionItem[] {
  const snippets = loadSnippets()
  const items: CompletionItem[] = []

  for (const snippet of snippets) {
    const score = calculateRelevance(snippet.prefix, query) + calculateRelevance(snippet.name, query) * 0.5
    if (score > 0) {
      items.push({
        text: snippet.prefix,
        type: 'snippet',
        description: snippet.description,
        score,
        source: 'snippets',
        kind: 'snippet',
        documentation: snippet.body.join('\n'),
        insertText: snippet.body.join('\n'),
      })
    }
  }

  return items.sort((a, b) => b.score - a.score).slice(0, limit)
}

function completeKeywords(query: string, language: string, limit: number): CompletionItem[] {
  const config = getLanguageConfig(language)
  const items: CompletionItem[] = []

  for (const keyword of config.keywords) {
    const score = calculateRelevance(keyword, query)
    if (score > 0) {
      items.push({
        text: keyword,
        type: 'keyword',
        description: `${language} 关键字`,
        score,
        source: 'language',
        kind: 'keyword',
      })
    }
  }

  for (const builtin of config.builtins) {
    const score = calculateRelevance(builtin, query)
    if (score > 0) {
      items.push({
        text: builtin,
        type: 'function',
        description: `${language} 内置函数`,
        score,
        source: 'language',
        kind: 'function',
      })
    }
  }

  return items.sort((a, b) => b.score - a.score).slice(0, limit)
}

// ============================================================================
// Relevance Scoring
// ============================================================================

function calculateRelevance(text: string, query: string): number {
  if (!query) return 5
  const t = text.toLowerCase()
  const q = query.toLowerCase()

  if (t === q) return 100
  if (t.startsWith(q)) return 80
  if (t.includes(q)) return 60

  // Fuzzy match
  const fuzzy = fuzzyMatch(t, q)
  if (fuzzy.matched) return fuzzy.score

  return 0
}

function fuzzyMatch(text: string, pattern: string): FuzzyMatch {
  const positions: number[] = []
  let patternIdx = 0
  let score = 0
  let lastMatchIdx = -1

  for (let i = 0; i < text.length && patternIdx < pattern.length; i++) {
    if (text[i] === pattern[patternIdx]) {
      positions.push(i)
      // Consecutive bonus
      if (lastMatchIdx === i - 1) score += 5
      else score += 1
      // Start of word bonus
      if (i === 0 || text[i - 1] === ' ' || text[i - 1] === '-') score += 3
      lastMatchIdx = i
      patternIdx++
    }
  }

  return {
    matched: patternIdx === pattern.length,
    score,
    positions,
  }
}

// ============================================================================
// Snippets
// ============================================================================

function loadSnippets(): SnippetDefinition[] {
  try {
    if (existsSync(SNIPPETS_FILE)) {
      return JSON.parse(readFileSync(SNIPPETS_FILE, 'utf-8'))
    }
  } catch {
    // ignore
  }
  return getDefaultSnippets()
}

function saveSnippets(snippets: SnippetDefinition[]): void {
  try {
    mkdirSync(AUTOCOMPLETE_DIR, { recursive: true })
    writeFileSync(SNIPPETS_FILE, JSON.stringify(snippets, null, 2), 'utf-8')
  } catch {
    // ignore
  }
}

function getDefaultSnippets(): SnippetDefinition[] {
  return [
    {
      id: 'snippet-if',
      name: 'if 语句',
      prefix: 'if',
      body: ['if (condition) {', '  // TODO: implement', '}'],
      description: '创建 if 条件语句',
      language: 'javascript',
      variables: {},
      createdAt: new Date().toISOString(),
      useCount: 0,
    },
    {
      id: 'snippet-for',
      name: 'for 循环',
      prefix: 'for',
      body: ['for (let i = 0; i < length; i++) {', '  // TODO: implement', '}'],
      description: '创建 for 循环',
      language: 'javascript',
      variables: {},
      createdAt: new Date().toISOString(),
      useCount: 0,
    },
    {
      id: 'snippet-func',
      name: '函数定义',
      prefix: 'func',
      body: ['function name(params) {', '  // TODO: implement', '  return result;', '}'],
      description: '创建函数定义',
      language: 'javascript',
      variables: {},
      createdAt: new Date().toISOString(),
      useCount: 0,
    },
    {
      id: 'snippet-cls',
      name: '类定义',
      prefix: 'class',
      body: ['class ClassName {', '  constructor() {', '    // TODO: implement', '  }', '}'],
      description: '创建类定义',
      language: 'javascript',
      variables: {},
      createdAt: new Date().toISOString(),
      useCount: 0,
    },
    {
      id: 'snippet-try',
      name: 'try-catch',
      prefix: 'try',
      body: ['try {', '  // TODO: implement', '} catch (error) {', '  console.error(error);', '}'],
      description: '创建 try-catch 块',
      language: 'javascript',
      variables: {},
      createdAt: new Date().toISOString(),
      useCount: 0,
    },
    {
      id: 'snippet-import',
      name: 'ES Module 导入',
      prefix: 'import',
      body: ["import { moduleName } from 'module-path';"],
      description: '创建 ES Module 导入语句',
      language: 'javascript',
      variables: {},
      createdAt: new Date().toISOString(),
      useCount: 0,
    },
    {
      id: 'snippet-arrow',
      name: '箭头函数',
      prefix: 'arrow',
      body: ['const name = (params) => {', '  // TODO: implement', '  return result;', '};'],
      description: '创建箭头函数',
      language: 'javascript',
      variables: {},
      createdAt: new Date().toISOString(),
      useCount: 0,
    },
    {
      id: 'snippet-desc',
      name: 'describe 测试',
      prefix: 'desc',
      body: ["describe('test suite', () => {", "  it('should work', () => {", '    // TODO: implement test', '  });', '});'],
      description: '创建 describe 测试套件',
      language: 'javascript',
      variables: {},
      createdAt: new Date().toISOString(),
      useCount: 0,
    },
  ]
}

function addSnippet(name: string, prefix: string, body: string, description: string, language: string): SnippetDefinition {
  const snippets = loadSnippets()
  const snippet: SnippetDefinition = {
    id: `snippet-${Date.now().toString(36)}`,
    name,
    prefix,
    body: body.split('\n'),
    description,
    language,
    variables: {},
    createdAt: new Date().toISOString(),
    useCount: 0,
  }
  snippets.push(snippet)
  saveSnippets(snippets)
  return snippet
}

function deleteSnippet(id: string): boolean {
  const snippets = loadSnippets()
  const idx = snippets.findIndex(s => s.id === id)
  if (idx === -1) return false
  snippets.splice(idx, 1)
  saveSnippets(snippets)
  return true
}

function recordSnippetUse(id: string): void {
  const snippets = loadSnippets()
  const snippet = snippets.find(s => s.id === id)
  if (snippet) {
    snippet.useCount++
    snippet.lastUsed = new Date().toISOString()
    saveSnippets(snippets)
  }
}

// ============================================================================
// History
// ============================================================================

function loadHistory(): CompletionHistory {
  try {
    if (existsSync(HISTORY_FILE)) {
      return JSON.parse(readFileSync(HISTORY_FILE, 'utf-8'))
    }
  } catch {
    // ignore
  }
  return { version: '1.0', completions: [] }
}

function saveHistory(history: CompletionHistory): void {
  try {
    mkdirSync(AUTOCOMPLETE_DIR, { recursive: true })
    writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8')
  } catch {
    // ignore
  }
}

function addCompletionToHistory(query: string, selected: string, type: string, duration: number): void {
  const history = loadHistory()
  history.completions.push({
    timestamp: new Date().toISOString(),
    query,
    selected,
    type,
    duration,
  })

  if (history.completions.length > 1000) {
    history.completions = history.completions.slice(-1000)
  }

  saveHistory(history)
}

// ============================================================================
// Statistics
// ============================================================================

function calculateStats(): CompletionStats {
  const history = loadHistory()
  const textCounts = new Map<string, { count: number; type: string }>()
  const queryCounts = new Map<string, number>()
  const typeCounts: Record<string, number> = {}
  const sourceCounts: Record<string, number> = {}
  let totalDuration = 0

  for (const comp of history.completions) {
    // Text counts
    const existing = textCounts.get(comp.selected) || { count: 0, type: comp.type }
    existing.count++
    textCounts.set(comp.selected, existing)

    // Query counts
    queryCounts.set(comp.query, (queryCounts.get(comp.query) || 0) + 1)

    // Type counts
    typeCounts[comp.type] = (typeCounts[comp.type] || 0) + 1

    totalDuration += comp.duration
  }

  return {
    totalCompletions: history.completions.length,
    uniqueQueries: queryCounts.size,
    avgResults: history.completions.length > 0 ? Math.round(history.completions.length / Math.max(queryCounts.size, 1)) : 0,
    topCompletions: [...textCounts.entries()].map(([text, data]) => ({ text, count: data.count, type: data.type })).sort((a, b) => b.count - a.count).slice(0, 20),
    topQueries: [...queryCounts.entries()].map(([query, count]) => ({ query, count })).sort((a, b) => b.count - a.count).slice(0, 10),
    completionsByType: typeCounts,
    completionsBySource: sourceCounts,
    avgDuration: history.completions.length > 0 ? Math.round(totalDuration / history.completions.length) : 0,
  }
}

function formatStats(stats: CompletionStats): string {
  const lines: string[] = []
  lines.push('📊 补全统计')
  lines.push('═'.repeat(40))
  lines.push(`总补全次数: ${stats.totalCompletions}`)
  lines.push(`唯一查询: ${stats.uniqueQueries}`)
  lines.push(`平均结果: ${stats.avgResults}`)
  lines.push(`平均耗时: ${stats.avgDuration}ms`)
  lines.push('')

  if (stats.topCompletions.length > 0) {
    lines.push('--- 热门补全 ---')
    for (const c of stats.topCompletions.slice(0, 10)) {
      lines.push(`  ${c.text} (${c.type}): ${c.count}次`)
    }
    lines.push('')
  }

  if (stats.topQueries.length > 0) {
    lines.push('--- 热门查询 ---')
    for (const q of stats.topQueries.slice(0, 5)) {
      lines.push(`  "${q.query}": ${q.count}次`)
    }
    lines.push('')
  }

  if (Object.keys(stats.completionsByType).length > 0) {
    lines.push('--- 按类型 ---')
    for (const [type, count] of Object.entries(stats.completionsByType).sort((a, b) => b[1] - a[1])) {
      lines.push(`  ${type}: ${count}`)
    }
  }

  return lines.join('\n')
}

// ============================================================================
// Language Configuration
// ============================================================================

function getLanguageConfig(language: string): LanguageConfig {
  const configs: Record<string, LanguageConfig> = {
    javascript: {
      name: 'JavaScript',
      extensions: ['.js', '.jsx', '.mjs', '.cjs'],
      keywords: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'class', 'extends', 'import', 'export', 'default', 'async', 'await', 'try', 'catch', 'finally', 'throw', 'new', 'this', 'super', 'typeof', 'instanceof', 'in', 'of', 'true', 'false', 'null', 'undefined', 'void', 'delete', 'yield', 'static', 'get', 'set', 'constructor', 'from', 'as', 'is', 'keyof', 'readonly', 'abstract', 'implements', 'interface', 'type', 'enum', 'namespace', 'module', 'declare', 'public', 'private', 'protected'],
      builtins: ['console', 'Math', 'Date', 'Array', 'Object', 'String', 'Number', 'Boolean', 'RegExp', 'Error', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise', 'Symbol', 'Proxy', 'Reflect', 'JSON', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURI', 'decodeURI', 'encodeURIComponent', 'decodeURIComponent', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'require', 'module', 'exports', 'global', 'process', 'Buffer', '__dirname', '__filename'],
      snippets: [],
    },
    typescript: {
      name: 'TypeScript',
      extensions: ['.ts', '.tsx'],
      keywords: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'class', 'extends', 'import', 'export', 'default', 'async', 'await', 'try', 'catch', 'finally', 'throw', 'new', 'this', 'super', 'typeof', 'instanceof', 'in', 'of', 'true', 'false', 'null', 'undefined', 'void', 'delete', 'yield', 'static', 'get', 'set', 'constructor', 'from', 'as', 'is', 'keyof', 'readonly', 'abstract', 'implements', 'interface', 'type', 'enum', 'namespace', 'module', 'declare', 'public', 'private', 'protected', 'override', 'satisfies', 'infer', 'never', 'unknown', 'any'],
      builtins: ['console', 'Math', 'Date', 'Array', 'Object', 'String', 'Number', 'Boolean', 'RegExp', 'Error', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Promise', 'Symbol', 'Proxy', 'Reflect', 'JSON', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURI', 'decodeURI', 'encodeURIComponent', 'decodeURIComponent', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'require', 'module', 'exports', 'global', 'process', 'Buffer', '__dirname', '__filename', 'Partial', 'Required', 'Readonly', 'Record', 'Pick', 'Omit', 'Exclude', 'Extract', 'NonNullable', 'Parameters', 'ReturnType', 'InstanceType', 'ThisType', 'Uppercase', 'Lowercase', 'Capitalize', 'Uncapitalize'],
      snippets: [],
    },
    python: {
      name: 'Python',
      extensions: ['.py'],
      keywords: ['def', 'class', 'if', 'else', 'elif', 'for', 'while', 'try', 'except', 'finally', 'with', 'as', 'import', 'from', 'return', 'yield', 'pass', 'break', 'continue', 'raise', 'lambda', 'global', 'nonlocal', 'assert', 'del', 'in', 'is', 'not', 'and', 'or', 'True', 'False', 'None', 'self', 'async', 'await'],
      builtins: ['print', 'len', 'range', 'type', 'isinstance', 'issubclass', 'input', 'open', 'str', 'int', 'float', 'list', 'dict', 'tuple', 'set', 'frozenset', 'bool', 'bytes', 'bytearray', 'memoryview', 'abs', 'all', 'any', 'ascii', 'bin', 'callable', 'chr', 'compile', 'complex', 'dir', 'divmod', 'eval', 'exec', 'filter', 'format', 'getattr', 'hasattr', 'hash', 'help', 'hex', 'id', 'iter', 'map', 'max', 'min', 'next', 'object', 'oct', 'ord', 'pow', 'property', 'repr', 'reversed', 'round', 'setattr', 'slice', 'sorted', 'staticmethod', 'sum', 'super', 'vars', 'zip', '__import__'],
      snippets: [],
    },
  }

  return configs[language] || configs.javascript
}

function getFileTypeDescription(fileName: string): string {
  const ext = extname(fileName).toLowerCase()
  const descriptions: Record<string, string> = {
    '.ts': 'TypeScript 文件',
    '.tsx': 'TypeScript React 文件',
    '.js': 'JavaScript 文件',
    '.jsx': 'JavaScript React 文件',
    '.json': 'JSON 文件',
    '.md': 'Markdown 文件',
    '.css': 'CSS 文件',
    '.scss': 'SCSS 文件',
    '.less': 'LESS 文件',
    '.html': 'HTML 文件',
    '.vue': 'Vue 文件',
    '.py': 'Python 文件',
    '.go': 'Go 文件',
    '.rs': 'Rust 文件',
    '.java': 'Java 文件',
    '.c': 'C 文件',
    '.cpp': 'C++ 文件',
    '.h': '头文件',
    '.sh': 'Shell 脚本',
    '.yaml': 'YAML 文件',
    '.yml': 'YAML 文件',
    '.toml': 'TOML 文件',
    '.xml': 'XML 文件',
    '.sql': 'SQL 文件',
    '.log': '日志文件',
  }
  return descriptions[ext] || `${ext} 文件`
}

function getCommandDescription(cmd: string): string {
  const descriptions: Record<string, string> = {
    '/cost': '查看当前会话的费用',
    '/cost-history': '查看费用历史',
    '/code-review': '代码审查',
    '/security-audit': '安全审计',
    '/commit': '创建提交',
    '/diff-mode': '差异对比视图',
    '/help': '显示帮助',
    '/clear': '清屏',
    '/compact': '压缩上下文',
    '/context': '显示上下文',
    '/export': '导出会话',
    '/sessions': '会话管理',
    '/workspace': '工作区管理',
    '/memory-search': '记忆搜索',
    '/diagnose': '系统诊断',
    '/stock': '股票行情',
    '/release-notes': '发布说明',
    '/bughunter': 'Bug 扫描',
    '/autocomplete': '智能补全',
    '/history': '命令历史',
    '/config': '配置管理',
  }
  return descriptions[cmd] || `命令: ${cmd}`
}

function getFlagDescription(flag: string): string {
  const descriptions: Record<string, string> = {
    '--help': '显示帮助信息',
    '--json': 'JSON 格式输出',
    '--format': '指定输出格式',
    '--mode': '指定模式',
    '--scan': '扫描模式',
    '--file': '指定文件',
    '--path': '指定路径',
    '--output': '指定输出',
    '--verbose': '详细输出',
    '--quiet': '静默模式',
    '--version': '显示版本',
    '--context': '包含上下文',
    '--detailed': '详细模式',
    '--session': '会话相关',
    '--days': '天数范围',
    '--force': '强制执行',
    '--recursive': '递归处理',
    '--all': '全部',
    '--include': '包含',
    '--exclude': '排除',
    '--max-results': '最大结果数',
    '--sort': '排序方式',
    '--filter': '过滤条件',
    '--query': '查询关键词',
    '--limit': '限制数量',
    '--offset': '偏移量',
  }
  return descriptions[flag] || `选项: ${flag}`
}

// ============================================================================
// AI-Powered Completions - AI 增强补全
// ============================================================================

interface AICompletionContext {
  currentFile: string
  cursorLine: number
  precedingLines: string[]
  followingLines: string[]
  imports: string[]
  declaredVariables: string[]
  declaredFunctions: string[]
  declaredClasses: string[]
}

function analyzeCodeContext(filePath: string, line: number): AICompletionContext {
  const context: AICompletionContext = {
    currentFile: filePath,
    cursorLine: line,
    precedingLines: [],
    followingLines: [],
    imports: [],
    declaredVariables: [],
    declaredFunctions: [],
    declaredClasses: [],
  }

  if (!existsSync(filePath)) return context

  try {
    const content = readFileSync(filePath, 'utf-8')
    const lines = content.split('\n')
    const start = Math.max(0, line - 20)
    const end = Math.min(lines.length, line + 5)

    context.precedingLines = lines.slice(start, line)
    context.followingLines = lines.slice(line, end)

    for (const l of lines.slice(0, 50)) {
      const importMatch = l.match(/import\s+.*\s+from\s+['"](.+)['"]/)
      if (importMatch) context.imports.push(importMatch[1])

      const varMatch = l.match(/(?:const|let|var)\s+(\w+)/)
      if (varMatch) context.declaredVariables.push(varMatch[1])

      const funcMatch = l.match(/function\s+(\w+)/)
      if (funcMatch) context.declaredFunctions.push(funcMatch[1])

      const classMatch = l.match(/class\s+(\w+)/)
      if (classMatch) context.declaredClasses.push(classMatch[1])
    }
  } catch {
    // ignore
  }

  return context
}

function getAICompletions(context: AICompletionContext, query: string): CompletionItem[] {
  const items: CompletionItem[] = []

  for (const imp of context.imports) {
    const score = calculateRelevance(imp, query)
    if (score > 0) {
      items.push({
        text: imp,
        type: 'import',
        description: `导入: ${imp}`,
        score,
        source: 'ai-context',
        kind: 'module',
      })
    }
  }

  for (const variable of context.declaredVariables) {
    const score = calculateRelevance(variable, query)
    if (score > 0) {
      items.push({
        text: variable,
        type: 'variable',
        description: `变量: ${variable}`,
        score,
        source: 'ai-context',
        kind: 'variable',
      })
    }
  }

  for (const func of context.declaredFunctions) {
    const score = calculateRelevance(func, query)
    if (score > 0) {
      items.push({
        text: func,
        type: 'function',
        description: `函数: ${func}`,
        score,
        source: 'ai-context',
        kind: 'function',
      })
    }
  }

  return items
}

// ============================================================================
// Git Branch Completion - Git 分支补全
// ============================================================================

function completeGitBranches(query: string): CompletionItem[] {
  const items: CompletionItem[] = []
  try {
    const { execSync } = require('child_process')
    const output = execSync('git branch -a --format="%(refname:short)"', { encoding: 'utf-8', timeout: 5000 })
    const branches = output.split('\n').filter(Boolean)

    for (const branch of branches) {
      const score = calculateRelevance(branch, query)
      if (score > 0) {
        items.push({
          text: branch,
          type: 'shell',
          description: `分支: ${branch}`,
          score,
          source: 'git',
          kind: 'reference',
        })
      }
    }
  } catch {
    // git not available
  }

  return items
}

// ============================================================================
// NPM Script Completion - NPM 脚本补全
// ============================================================================

function completeNPMScripts(query: string): CompletionItem[] {
  const items: CompletionItem[] = []
  if (!existsSync('package.json')) return items

  try {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))
    const scripts = pkg.scripts || {}

    for (const [name, cmd] of Object.entries(scripts)) {
      const score = calculateRelevance(name, query)
      if (score > 0) {
        items.push({
          text: name,
          type: 'shell',
          description: `npm run ${name}: ${cmd}`,
          score,
          source: 'npm',
          kind: 'method',
        })
      }
    }
  } catch {
    // ignore
  }

  return items
}

// ============================================================================
// Environment Variable Completion - 环境变量补全
// ============================================================================

function completeEnvVars(query: string): CompletionItem[] {
  const items: CompletionItem[] = []

  for (const [key, value] of Object.entries(process.env)) {
    if (key.toLowerCase().includes(query.toLowerCase())) {
      items.push({
        text: `$${key}`,
        type: 'variable',
        description: `${key}=${value?.slice(0, 50) || ''}`,
        score: 5,
        source: 'env',
        kind: 'variable',
      })
    }
  }

  return items
}

// ============================================================================
// SSH Host Completion - SSH 主机补全
// ============================================================================

function completeSSHHosts(query: string): CompletionItem[] {
  const items: CompletionItem[] = []
  const sshConfig = join(process.env.HOME || process.env.USERPROFILE || '', '.ssh', 'config')

  if (!existsSync(sshConfig)) return items

  try {
    const content = readFileSync(sshConfig, 'utf-8')
    const lines = content.split('\n')

    for (const line of lines) {
      const match = line.match(/Host\s+(\S+)/)
      if (match) {
        const host = match[1]
        const score = calculateRelevance(host, query)
        if (score > 0) {
          items.push({
            text: host,
            type: 'shell',
            description: `SSH: ${host}`,
            score,
            source: 'ssh',
            kind: 'reference',
          })
        }
      }
    }
  } catch {
    // ignore
  }

  return items
}

// ============================================================================
// Docker Container Completion - Docker 容器补全
// ============================================================================

function completeDockerContainers(query: string): CompletionItem[] {
  const items: CompletionItem[] = []

  try {
    const { execSync } = require('child_process')
    const output = execSync('docker ps --format "{{.Names}}"', { encoding: 'utf-8', timeout: 5000 })
    const containers = output.split('\n').filter(Boolean)

    for (const container of containers) {
      const score = calculateRelevance(container, query)
      if (score > 0) {
        items.push({
          text: container,
          type: 'shell',
          description: `容器: ${container}`,
          score,
          source: 'docker',
          kind: 'reference',
        })
      }
    }
  } catch {
    // docker not available
  }

  return items
}

// ============================================================================
// Path Expansion - 路径扩展
// ============================================================================

function expandPath(query: string): string {
  if (query.startsWith('~/')) {
    return join(process.env.HOME || process.env.USERPROFILE || '', query.slice(2))
  }
  if (query === '-' || query === '~') {
    return process.env.HOME || process.env.USERPROFILE || ''
  }
  return query
}

// ============================================================================
// Completion Cache - 补全缓存
// ============================================================================

const completionCache = new Map<string, { data: CompletionItem[]; expiry: number }>()

function getCachedCompletions(key: string): CompletionItem[] | null {
  const entry = completionCache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiry) {
    completionCache.delete(key)
    return null
  }
  return entry.data
}

function setCachedCompletions(key: string, data: CompletionItem[], ttlMs = 60000): void {
  completionCache.set(key, { data, expiry: Date.now() + ttlMs })
}

function clearCompletionCache(): void {
  completionCache.clear()
}

// ============================================================================
// Main Completer
// ============================================================================

function getCompletions(options: AutocompleteOptions): CompletionItem[] {
  const { query = '', context = 'command', cwd = process.cwd(), limit = DEFAULT_LIMIT } = options

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
    case 'snippet':
      completions.push(...completeSnippets(query, limit))
      break
    case 'keyword':
      completions.push(...completeKeywords(query, 'typescript', limit))
      break
    case 'function':
      completions.push(...completeKeywords(query, 'typescript', limit).filter(c => c.type === 'function'))
      break
    case 'class':
      completions.push(...completeKeywords(query, 'typescript', limit).filter(c => c.type === 'class'))
      break
    case 'import':
      completions.push(...completeKeywords(query, 'typescript', limit))
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
    '⚡ 智能终端补全 - 增强版',
    '',
    '提供上下文感知的命令行补全建议。',
    '',
    '用法:',
    '  /autocomplete [选项]',
    '',
    '补全类型:',
    '  --query <输入>      补全查询（当前输入内容）',
    '  --context <类型>    上下文类型: command / flag / file / directory / shell / snippet / keyword / function / class / import',
    '  --cwd <路径>        工作目录（用于文件补全）',
    '  --limit <n>         最大结果数',
    '  --json              JSON 格式输出',
    '  --fuzzy             启用模糊匹配',
    '  --include-docs     包含文档信息',
    '  --ai                AI 增强补全（基于代码上下文）',
    '',
    '管理命令:',
    '  --history           补全历史',
    '  --stats             补全统计',
    '  --snippets          片段列表',
    '  --snippet-add <名称> <前缀> <内容>  添加片段',
    '  --snippet-del <ID>  删除片段',
    '  --languages         支持的语言',
    '  --cache-clear       清除缓存',
    '',
    '特殊补全:',
    '  --git-branches      Git 分支补全',
    '  --npm-scripts       NPM 脚本补全',
    '  --env-vars          环境变量补全',
    '  --ssh-hosts         SSH 主机补全',
    '  --docker-containers Docker 容器补全',
    '',
    '示例:',
    '  /autocomplete --query /code',
    '  /autocomplete --query -- --context flag',
    '  /autocomplete --query src/ --context file',
    '  /autocomplete --query for --context snippet',
    '  /autocomplete --query console --context function',
    '  /autocomplete --stats',
    '  /autocomplete --git-branches',
    '  /autocomplete --npm-scripts',
  ].join('\n')
}

// ============================================================================
// Command
// ============================================================================

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = s.split(/\s+/)
  const nonOptions = parts.filter(p => !p.startsWith('--'))

  if (s.includes('--help') || s === '') {
    return { type: 'text', value: renderHelp() }
  }

  // Git branches
  if (s.includes('--git-branches')) {
    const items = completeGitBranches(nonOptions.join(' '))
    return formatCompletionResult(items)
  }

  // NPM scripts
  if (s.includes('--npm-scripts')) {
    const items = completeNPMScripts(nonOptions.join(' '))
    return formatCompletionResult(items)
  }

  // Env vars
  if (s.includes('--env-vars')) {
    const items = completeEnvVars(nonOptions.join(' '))
    return formatCompletionResult(items)
  }

  // SSH hosts
  if (s.includes('--ssh-hosts')) {
    const items = completeSSHHosts(nonOptions.join(' '))
    return formatCompletionResult(items)
  }

  // Docker containers
  if (s.includes('--docker-containers')) {
    const items = completeDockerContainers(nonOptions.join(' '))
    return formatCompletionResult(items)
  }

  // History
  if (s.includes('--history')) {
    const history = loadHistory()
    const lines: string[] = [`📋 补全历史 (${history.completions.length} 次):`]
    for (const comp of history.completions.slice(-20).reverse()) {
      lines.push(`  ${comp.timestamp}: "${comp.query}" → ${comp.selected} (${comp.duration}ms)`)
    }
    return { type: 'text', value: lines.join('\n') }
  }

  // Stats
  if (s.includes('--stats')) {
    return { type: 'text', value: formatStats(calculateStats()) }
  }

  // Snippets
  if (s.includes('--snippets')) {
    const snippets = loadSnippets()
    if (snippets.length === 0) return { type: 'text', value: '📋 没有片段' }

    const lines: string[] = [`📋 代码片段 (${snippets.length} 个):`]
    for (const sn of snippets) {
      lines.push(`  [${sn.id.slice(0, 8)}] ${sn.prefix} - ${sn.description} (${sn.useCount}次使用)`)
    }
    return { type: 'text', value: lines.join('\n') }
  }

  const snippetAddMatch = s.match(/--snippet-add\s+(\S+)\s+(\S+)\s+(.+)/)
  if (snippetAddMatch) {
    const sn = addSnippet(snippetAddMatch[1], snippetAddMatch[2], snippetAddMatch[3], '', 'javascript')
    return { type: 'text', value: `✅ 已添加片段: ${sn.name}` }
  }

  const snippetDelMatch = s.match(/--snippet-del\s+(\S+)/)
  if (snippetDelMatch) {
    const deleted = deleteSnippet(snippetDelMatch[1])
    return { type: 'text', value: deleted ? '✅ 已删除片段' : '❌ 未找到片段' }
  }

  // Languages
  if (s.includes('--languages')) {
    const lines = ['支持的语言:', '  - JavaScript (.js, .jsx)', '  - TypeScript (.ts, .tsx)', '  - Python (.py)']
    return { type: 'text', value: lines.join('\n') }
  }

  // Main completion
  const queryMatch = s.match(/--query\s+(\S+)/)
  const contextMatch = s.match(/--context\s+(\S+)/)
  const cwdMatch = s.match(/--cwd\s+(\S+)/)
  const limitMatch = s.match(/--limit\s+(\d+)/)

  const query = queryMatch?.[1] ?? ''
  const context = (contextMatch?.[1] as AutocompleteOptions['context']) ?? 'command'
  const cwd = cwdMatch?.[1] ?? process.cwd()
  const limit = limitMatch?.[1] ? parseInt(limitMatch[1]) : DEFAULT_LIMIT

  if (!query) {
    return { type: 'text', value: '❌ 请提供查询内容。\n\n' + renderHelp() }
  }

  const start = Date.now()
  const completions = getCompletions({ query, context, cwd, limit })
  const duration = Date.now() - start

  // Record
  addCompletionToHistory(query, completions[0]?.text || '', context, duration)

  if (s.includes('--json')) {
    return { type: 'json', value: JSON.stringify({ query, context, duration, completions }, null, 2) }
  }

  if (completions.length === 0) {
    return { type: 'text', value: '🔍 无补全建议' }
  }

  const lines: string[] = ['⚡ 补全建议:']
  completions.forEach((c, i) => {
    const icon = {
      command: '>', flag: '--', file: '+', directory: '📁',
      shell: '$', snippet: '✂️', function: '🔧', class: '📦',
      import: '📥', keyword: '🔑', variable: '📋',
    }[c.type] || '•'

    const desc = c.description ? ` - ${c.description}` : ''
    const params = c.parameters ? `(${c.parameters})` : ''
    const doc = c.documentation ? `\n      ${c.documentation.split('\n')[0]}` : ''

    lines.push(`  ${icon} ${c.text}${params}${desc}${doc}`)
  })

  return { type: 'text', value: lines.join('\n') }
}

// Helper for new completion types
function formatCompletionResult(items: CompletionItem[]): LocalCommandResult {
  if (items.length === 0) {
    return { type: 'text', value: '🔍 无补全建议' }
  }

  const lines: string[] = ['⚡ 补全建议:']
  items.slice(0, 15).forEach((c) => {
    const icon = {
      command: '>', flag: '--', file: '+', directory: '📁',
      shell: '$', snippet: '✂️', function: '🔧', class: '📦',
      import: '📥', keyword: '🔑', variable: '📋',
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
  description: '智能终端补全 - 上下文感知/片段/模糊匹配/历史/统计/多语言/Git/NPM/SSH/Docker',
  aliases: ['/complete', '/tab', '/ac'],
  arguments: [
    { name: '--query', description: '补全查询', required: false },
    { name: '--context', description: '上下文类型', required: false },
    { name: '--cwd', description: '工作目录', required: false },
    { name: '--limit', description: '最大结果数', required: false },
    { name: '--json', description: 'JSON 格式输出', required: false },
    { name: '--fuzzy', description: '模糊匹配', required: false },
    { name: '--snippets', description: '片段列表', required: false },
    { name: '--stats', description: '补全统计', required: false },
    { name: '--history', description: '补全历史', required: false },
    { name: '--git-branches', description: 'Git 分支补全', required: false },
    { name: '--npm-scripts', description: 'NPM 脚本补全', required: false },
    { name: '--env-vars', description: '环境变量补全', required: false },
    { name: '--ssh-hosts', description: 'SSH 主机补全', required: false },
    { name: '--docker-containers', description: 'Docker 容器补全', required: false },
    { name: 'help', description: '显示帮助', required: false },
  ],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
} satisfies Command

export default autocomplete
