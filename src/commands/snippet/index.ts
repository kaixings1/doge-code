import type { Command } from '../commands.js'
import type { LocalCommandCall } from '../types/command.js'
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, statSync, renameSync, copyFileSync } from 'fs'
import { join, basename, extname } from 'path'
import { homedir } from 'os'
import { execSync } from 'child_process'

// ============================================================================
// Types
// ============================================================================

interface Snippet {
  name: string
  code: string
  language: string
  tags: string[]
  description: string
  createdAt: string
  updatedAt: string
  useCount: number
  favorite: boolean
  lastUsed: string
}

interface SnippetImportData {
  name: string
  code: string
  language?: string
  tags?: string[]
  description?: string
  favorite?: boolean
  useCount?: number
  lastUsed?: string
  content?: string
}

// ============================================================================
// Storage Path
// ============================================================================

function getSnippetsDir(): string {
  return join(homedir(), '.doge', 'snippets')
}

function getSnippetPath(name: string): string {
  return join(getSnippetsDir(), `${name}.json`)
}

function ensureSnippetsDir(): void {
  const dir = getSnippetsDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

// ============================================================================
// CRUD Operations
// ============================================================================

function loadSnippet(name: string): Snippet | null {
  const path = getSnippetPath(name)
  if (!existsSync(path)) return null
  try {
    const raw = readFileSync(path, 'utf-8')
    const data = JSON.parse(raw) as Partial<Snippet>
    // Apply defaults for fields added after initial creation
    const now = new Date().toISOString()
    return {
      name: data.name ?? name,
      code: data.code ?? '',
      language: data.language ?? 'plaintext',
      tags: data.tags ?? [],
      description: data.description ?? '',
      createdAt: data.createdAt ?? now,
      updatedAt: data.updatedAt ?? now,
      useCount: data.useCount ?? 0,
      favorite: data.favorite ?? false,
      lastUsed: data.lastUsed ?? data.updatedAt ?? now,
    }
  } catch {
    return null
  }
}

function saveSnippet(snippet: Snippet): { success: boolean; message: string } {
  ensureSnippetsDir()
  const path = getSnippetPath(snippet.name)
  try {
    const now = new Date().toISOString()
    const data: Snippet = {
      ...snippet,
      updatedAt: now,
      favorite: snippet.favorite ?? false,
      lastUsed: snippet.lastUsed ?? now,
    }
    writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8')
    return { success: true, message: path }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    return { success: false, message: errMsg }
  }
}

function listSnippets(): Snippet[] {
  ensureSnippetsDir()
  const dir = getSnippetsDir()
  const results: Snippet[] = []
  try {
    const entries = readdirSync(dir)
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue
      try {
        const full = join(dir, entry)
        const raw = readFileSync(full, 'utf-8')
        const data = JSON.parse(raw) as Snippet
        results.push(data)
      } catch {
        // skip invalid files
      }
    }
  } catch {
    // directory may not exist yet
  }
  return results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

function deleteSnippet(name: string): { success: boolean; message: string } {
  const path = getSnippetPath(name)
  if (!existsSync(path)) {
    return { success: false, message: `片段不存在: ${name}` }
  }
  try {
    unlinkSync(path)
    return { success: true, message: path }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    return { success: false, message: errMsg }
  }
}

// ============================================================================
// Search
// ============================================================================

function searchSnippets(snippets: Snippet[], query: string): Snippet[] {
  const q = query.toLowerCase()
  return snippets.filter(s =>
    s.name.toLowerCase().includes(q) ||
    s.description.toLowerCase().includes(q) ||
    s.code.toLowerCase().includes(q) ||
    s.tags.some(t => t.toLowerCase().includes(q))
  )
}

// ============================================================================
// Language Detection
// ============================================================================

function detectLanguage(code: string, fileName?: string): string {
  if (fileName) {
    const ext = extname(fileName).toLowerCase()
    const extMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.go': 'go',
      '.rs': 'rust',
      '.java': 'java',
      '.rb': 'ruby',
      '.sh': 'bash',
      '.bash': 'bash',
      '.sql': 'sql',
      '.json': 'json',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.toml': 'toml',
      '.html': 'html',
      '.css': 'css',
      '.md': 'markdown',
      '.xml': 'xml',
    }
    if (extMap[ext]) return extMap[ext]
  }
  // Heuristic detection
  if (code.includes('import ') && code.includes('from ')) return 'typescript'
  if (code.includes('interface ') || code.includes(': string') || code.includes(': number')) return 'typescript'
  if (code.includes('def ') && code.includes(':')) return 'python'
  if (code.includes('func ') && code.includes('package ')) return 'go'
  if (code.includes('fn ') && code.includes('let mut')) return 'rust'
  if (code.includes('public class ') || code.includes('private void')) return 'java'
  if (code.includes('<!DOCTYPE') || code.includes('<html')) return 'html'
  if (code.includes('SELECT ') && code.includes('FROM ')) return 'sql'
  if (code.includes('{') && code.includes('"')) return 'json'
  return 'plaintext'
}

// ============================================================================
// Formatting Helpers
// ============================================================================

function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString)
    const pad = (n: number) => n.toString().padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return isoString
  }
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen - 1) + '…'
}

function renderTable(snippets: Snippet[]): string {
  if (snippets.length === 0) {
    return '  (无片段)\n'
  }

  const nameWidth = Math.max(8, ...snippets.map(s => s.name.length))
  const langWidth = 10
  const tagsWidth = 20
  const lines: string[] = []

  // Header
  lines.push(
    `  ${' '.padEnd(2)}  ${'名称'.padEnd(nameWidth)}  ${'语言'.padEnd(langWidth)}  ${'标签'.padEnd(tagsWidth)}  ${'使用'.padEnd(6)}  ${'更新时间'}`
  )
  lines.push(
    `  ${'─'.repeat(2)}  ${'─'.repeat(nameWidth)}  ${'─'.repeat(langWidth)}  ${'─'.repeat(tagsWidth)}  ${'─'.repeat(6)}  ${'─'.repeat(16)}`
  )

  for (const s of snippets) {
    const tags = truncate(s.tags.join(', ') || '-', tagsWidth)
    const fav = s.favorite ? '⭐' : '  '
    lines.push(
      `  ${fav}  ${s.name.padEnd(nameWidth)}  ${s.language.padEnd(langWidth)}  ${tags.padEnd(tagsWidth)}  ${String(s.useCount).padEnd(6)}  ${formatDate(s.updatedAt)}`
    )
  }

  return lines.join('\n') + '\n'
}

function renderSnippetDetail(s: Snippet): string {
  const lines: string[] = []
  lines.push(`┌─────────────────────────────────────────────`)
  lines.push(`│ ${s.favorite ? '⭐' : '📄'} ${s.name}${s.favorite ? ' (已收藏)' : ''}`)
  lines.push(`├─────────────────────────────────────────────`)
  if (s.description) {
    lines.push(`│ 📝 ${s.description}`)
  }
  lines.push(`│ 🔤 语言: ${s.language}`)
  lines.push(`│ 🏷️  标签: ${s.tags.join(', ') || '(无)'}`)
  lines.push(`│ 📊 使用次数: ${s.useCount}`)
  lines.push(`│ 🕐 创建: ${formatDate(s.createdAt)}`)
  lines.push(`│ 🕐 更新: ${formatDate(s.updatedAt)}`)
  lines.push(`│ 🕐 最后使用: ${formatDate(s.lastUsed)}`)
  lines.push(`├─────────────────────────────────────────────`)
  // Code lines with border
  const codeLines = s.code.split('\n')
  for (const cl of codeLines.slice(0, 50)) {
    lines.push(`│ ${cl}`)
  }
  if (codeLines.length > 50) {
    lines.push(`│ ... (${codeLines.length - 50} 更多行)`)
  }
  lines.push(`└─────────────────────────────────────────────`)
  return lines.join('\n')
}

function renderTagsIndex(snippets: Snippet[]): string {
  const tagMap = new Map<string, string[]>()
  for (const s of snippets) {
    if (s.tags.length === 0) {
      const list = tagMap.get('(未标记)') ?? []
      list.push(s.name)
      tagMap.set('(未标记)', list)
    }
    for (const tag of s.tags) {
      const list = tagMap.get(tag) ?? []
      list.push(s.name)
      tagMap.set(tag, list)
    }
  }

  const lines: string[] = []
  const sortedTags = [...tagMap.keys()].sort()
  for (const tag of sortedTags) {
    const names = tagMap.get(tag)!
    lines.push(`  🏷️  ${tag} (${names.length})`)
    for (const name of names) {
      lines.push(`     • ${name}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

// ============================================================================
// Command Handlers (Original)
// ============================================================================

function handleSave(args: string): { type: 'text'; value: string } {
  // parse: save <name> [--code "..."] [--lang <lang>] [--tags "a,b,c"] [--desc "..."] [--file <path>]
  const parts = parseArgs(args)
  const name = parts.positional[0]
  if (!name) {
    return { type: 'text', value: '❌ 用法: /snippet save <名称> [--code "..."] [--lang <lang>] [--tags "a,b,c"] [--desc "..."] [--file <path>]' }
  }

  // Check if name already exists
  const existing = loadSnippet(name)
  if (existing && !parts.flags.force) {
    return { type: 'text', value: `⚠️ 片段 "${name}" 已存在。使用 --force 覆盖，或先用 /snippet delete ${name} 删除。` }
  }

  // Get code content
  let code: string | undefined
  if (parts.flags.code) {
    code = parts.flags.code
  } else if (parts.flags.file) {
    const filePath = parts.flags.file
    if (!existsSync(filePath)) {
      return { type: 'text', value: `❌ 文件不存在: ${filePath}` }
    }
    try {
      code = readFileSync(filePath, 'utf-8')
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      return { type: 'text', value: `❌ 读取文件失败: ${errMsg}` }
    }
  }

  if (!code) {
    return { type: 'text', value: '❌ 请通过 --code "代码内容" 或 --file <文件路径> 提供代码' }
  }

  const language = parts.flags.lang || detectLanguage(code, parts.flags.file)
  const tagsStr = parts.flags.tags || ''
  const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : []
  const description = parts.flags.desc || parts.flags.description || ''
  const now = new Date().toISOString()

  const snippet: Snippet = {
    name,
    code,
    language,
    tags,
    description,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    useCount: existing?.useCount ?? 0,
    favorite: existing?.favorite ?? false,
    lastUsed: existing?.lastUsed ?? now,
  }

  const result = saveSnippet(snippet)
  if (!result.success) {
    return { type: 'text', value: `❌ 保存失败: ${result.message}` }
  }

  const action = existing ? '更新' : '保存'
  return { type: 'text', value: `✅ 已${action}片段: ${name} (${language}, ${code.split('\n').length} 行)` }
}

function handleList(args: string, allSnippets: Snippet[], json: boolean): { type: 'text'; value: string } {
  const parts = parseArgs(args)
  const query = parts.positional.join(' ').trim()
  const tagFilter = parts.flags.tag || parts.flags.tags

  let filtered = allSnippets

  if (query) {
    filtered = searchSnippets(filtered, query)
  }

  if (tagFilter) {
    const tags = tagFilter.split(',').map(t => t.trim().toLowerCase())
    filtered = filtered.filter(s =>
      s.tags.some(t => tags.includes(t.toLowerCase()))
    )
  }

  if (json) {
    return { type: 'text', value: JSON.stringify(filtered, null, 2) }
  }

  const lines: string[] = []
  lines.push(`📋 代码片段列表 (${filtered.length}/${allSnippets.length} 个)`)
  lines.push('')
  lines.push(renderTable(filtered))

  if (query) {
    lines.push(`  🔍 搜索: "${query}"`)
  }
  if (tagFilter) {
    lines.push(`  🏷️  标签过滤: ${tagFilter}`)
  }

  return { type: 'text', value: lines.join('\n') }
}

function handleGet(args: string, json: boolean): { type: 'text'; value: string } {
  const name = args.trim()
  if (!name) {
    return { type: 'text', value: '❌ 用法: /snippet get <名称>' }
  }

  const snippet = loadSnippet(name)
  if (!snippet) {
    return { type: 'text', value: `❌ 片段不存在: ${name}` }
  }

  if (json) {
    return { type: 'text', value: JSON.stringify(snippet, null, 2) }
  }

  return { type: 'text', value: renderSnippetDetail(snippet) }
}

function handleUse(args: string, allSnippets: Snippet[]): { type: 'text'; value: string } {
  const name = args.trim()
  if (!name) {
    return { type: 'text', value: '❌ 用法: /snippet use <名称>' }
  }

  const snippet = loadSnippet(name)
  if (!snippet) {
    return { type: 'text', value: `❌ 片段不存在: ${name}` }
  }

  // Increment use count
  snippet.useCount++
  snippet.lastUsed = new Date().toISOString()
  saveSnippet(snippet)

  const lines: string[] = []
  lines.push(`📋 片段: ${name} (${snippet.language})`)
  if (snippet.description) {
    lines.push(`📝 ${snippet.description}`)
  }
  lines.push('')
  lines.push('```' + snippet.language)
  lines.push(snippet.code)
  lines.push('```')
  lines.push('')
  lines.push(`📊 已使用 ${snippet.useCount} 次`)

  return { type: 'text', value: lines.join('\n') }
}

function handleDelete(args: string): { type: 'text'; value: string } {
  const name = args.trim()
  if (!name) {
    return { type: 'text', value: '❌ 用法: /snippet delete <名称>' }
  }

  const result = deleteSnippet(name)
  if (!result.success) {
    return { type: 'text', value: `❌ ${result.message}` }
  }

  return { type: 'text', value: `✅ 已删除片段: ${name}` }
}

function handleExport(args: string): { type: 'text'; value: string } {
  const parts = parseArgs(args)
  const name = parts.positional[0]
  const outputPath = parts.positional[1] || parts.flags.output || parts.flags.out

  if (!name) {
    return { type: 'text', value: '❌ 用法: /snippet export <名称> [<输出路径>]' }
  }

  const snippet = loadSnippet(name)
  if (!snippet) {
    return { type: 'text', value: `❌ 片段不存在: ${name}` }
  }

  // Determine output path
  let targetPath: string
  if (outputPath) {
    targetPath = outputPath
  } else {
    // Use name + appropriate extension
    const extMap: Record<string, string> = {
      typescript: '.ts',
      javascript: '.js',
      python: '.py',
      go: '.go',
      rust: '.rs',
      java: '.java',
      ruby: '.rb',
      bash: '.sh',
      sql: '.sql',
      json: '.json',
      yaml: '.yaml',
      html: '.html',
      css: '.css',
      markdown: '.md',
    }
    const ext = extMap[snippet.language] || '.txt'
    targetPath = join(process.cwd(), `${name}${ext}`)
  }

  try {
    writeFileSync(targetPath, snippet.code, 'utf-8')
    return { type: 'text', value: `✅ 已导出片段 "${name}" 到: ${targetPath}` }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    return { type: 'text', value: `❌ 导出失败: ${errMsg}` }
  }
}

function handleImport(args: string): { type: 'text'; value: string } {
  const parts = parseArgs(args)
  const filePath = parts.positional[0] || parts.flags.file

  if (!filePath) {
    return { type: 'text', value: '❌ 用法: /snippet import <文件路径> [--name <名称>] [--tags "a,b,c"] [--desc "描述"]' }
  }

  if (!existsSync(filePath)) {
    return { type: 'text', value: `❌ 文件不存在: ${filePath}` }
  }

  let code: string
  try {
    code = readFileSync(filePath, 'utf-8')
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    return { type: 'text', value: `❌ 读取文件失败: ${errMsg}` }
  }

  // Determine name: explicit flag > filename without ext > filename
  const fileName = basename(filePath, extname(filePath))
  const name = parts.flags.name || fileName

  const existing = loadSnippet(name)
  if (existing && !parts.flags.force) {
    return { type: 'text', value: `⚠️ 片段 "${name}" 已存在。使用 --force 覆盖，或先用 /snippet delete ${name} 删除。` }
  }

  const language = parts.flags.lang || detectLanguage(code, filePath)
  const tagsStr = parts.flags.tags || ''
  const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : []
  const description = parts.flags.desc || parts.flags.description || ''
  const now = new Date().toISOString()

  const snippet: Snippet = {
    name,
    code,
    language,
    tags,
    description,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    useCount: existing?.useCount ?? 0,
    favorite: existing?.favorite ?? false,
    lastUsed: existing?.lastUsed ?? now,
  }

  const result = saveSnippet(snippet)
  if (!result.success) {
    return { type: 'text', value: `❌ 导入失败: ${result.message}` }
  }

  const action = existing ? '更新' : '导入'
  return { type: 'text', value: `✅ 已${action}片段: ${name} (${language}, ${code.split('\n').length} 行)` }
}

function handleTags(allSnippets: Snippet[], json: boolean): { type: 'text'; value: string } {
  if (json) {
    const tagMap = new Map<string, string[]>()
    for (const s of allSnippets) {
      if (s.tags.length === 0) {
        const list = tagMap.get('(未标记)') ?? []
        list.push(s.name)
        tagMap.set('(未标记)', list)
      }
      for (const tag of s.tags) {
        const list = tagMap.get(tag) ?? []
        list.push(s.name)
        tagMap.set(tag, list)
      }
    }
    const obj: Record<string, string[]> = {}
    for (const [tag, names] of [...tagMap.entries()].sort()) {
      obj[tag] = names
    }
    return { type: 'text', value: JSON.stringify(obj, null, 2) }
  }

  if (allSnippets.length === 0) {
    return { type: 'text', value: '📋 暂无代码片段。使用 /snippet save <名称> --code "..." 创建第一个片段。' }
  }

  const lines: string[] = []
  lines.push(`🏷️  标签索引 (${allSnippets.length} 个片段)`)
  lines.push('')
  lines.push(renderTagsIndex(allSnippets))
  return { type: 'text', value: lines.join('\n') }
}

// ============================================================================
// New: Insert - Copy snippet to clipboard + temp file for editor insertion
// ============================================================================

function handleInsert(args: string): { type: 'text'; value: string } {
  const name = args.trim()
  if (!name) {
    return { type: 'text', value: '❌ 用法: /snippet insert <名称>' }
  }
  const snippet = loadSnippet(name)
  if (!snippet) {
    return { type: 'text', value: `❌ 片段不存在: ${name}` }
  }
  snippet.useCount++
  snippet.lastUsed = new Date().toISOString()
  saveSnippet(snippet)
  const tmpDir = join(homedir(), '.doge', 'temp')
  if (!existsSync(tmpDir)) {
    mkdirSync(tmpDir, { recursive: true })
  }
  const extMap: Record<string, string> = {
    typescript: '.ts', javascript: '.js', python: '.py', go: '.go',
    rust: '.rs', java: '.java', ruby: '.rb', bash: '.sh', sql: '.sql',
    json: '.json', yaml: '.yaml', html: '.html', css: '.css', markdown: '.md',
  }
  const ext = extMap[snippet.language] || '.txt'
  const tmpPath = join(tmpDir, `snippet-${name}${ext}`)
  writeFileSync(tmpPath, snippet.code, 'utf-8')
  try {
    execSync(`clip < "${tmpPath}"`, { shell: 'cmd.exe' })
  } catch {
    try {
      execSync(`powershell -Command "Get-Content -Path '${tmpPath}' -Raw | Set-Clipboard"`)
    } catch {
      // clipboard not available
    }
  }
  const lines: string[] = []
  lines.push(`📋 片段已就绪: ${name}`)
  lines.push(`📋 已复制到剪贴板，可直接粘贴到编辑器`)
  lines.push(`📄 临时文件: ${tmpPath}`)
  lines.push('')
  lines.push('```' + snippet.language)
  lines.push(snippet.code)
  lines.push('```')
  lines.push('')
  lines.push(`📊 已使用 ${snippet.useCount} 次`)
  return { type: 'text', value: lines.join('\n') }
}

// ============================================================================
// New: Copy - Copy snippet to clipboard
// ============================================================================

function handleCopy(args: string): { type: 'text'; value: string } {
  const name = args.trim()
  if (!name) {
    return { type: 'text', value: '❌ 用法: /snippet copy <名称>' }
  }
  const snippet = loadSnippet(name)
  if (!snippet) {
    return { type: 'text', value: `❌ 片段不存在: ${name}` }
  }
  snippet.useCount++
  snippet.lastUsed = new Date().toISOString()
  saveSnippet(snippet)
  const tmpDir = join(homedir(), '.doge', 'temp')
  if (!existsSync(tmpDir)) {
    mkdirSync(tmpDir, { recursive: true })
  }
  const tmpPath = join(tmpDir, `snippet-${name}.txt`)
  writeFileSync(tmpPath, snippet.code, 'utf-8')
  let clipboardOk = false
  try {
    execSync(`clip < "${tmpPath}"`, { shell: 'cmd.exe' })
    clipboardOk = true
  } catch {
    try {
      execSync(`powershell -Command "Get-Content -Path '${tmpPath}' -Raw | Set-Clipboard"`)
      clipboardOk = true
    } catch {
      // clipboard not available
    }
  }
  if (clipboardOk) {
    return { type: 'text', value: `✅ 已将片段 "${name}" 复制到剪贴板 (${snippet.code.length} 字符, ${snippet.code.split('\n').length} 行)` }
  }
  return { type: 'text', value: `⚠️ 剪贴板不可用。片段内容已写入: ${tmpPath}` }
}

// ============================================================================
// New: Edit - Open snippet in default editor
// ============================================================================

function handleEdit(args: string): { type: 'text'; value: string } {
  const name = args.trim()
  if (!name) {
    return { type: 'text', value: '❌ 用法: /snippet edit <名称>' }
  }
  const snippet = loadSnippet(name)
  if (!snippet) {
    return { type: 'text', value: `❌ 片段不存在: ${name}` }
  }
  const tmpDir = join(homedir(), '.doge', 'temp')
  if (!existsSync(tmpDir)) {
    mkdirSync(tmpDir, { recursive: true })
  }
  const extMap: Record<string, string> = {
    typescript: '.ts', javascript: '.js', python: '.py', go: '.go',
    rust: '.rs', java: '.java', ruby: '.rb', bash: '.sh', sql: '.sql',
    json: '.json', yaml: '.yaml', html: '.html', css: '.css', markdown: '.md',
  }
  const ext = extMap[snippet.language] || '.txt'
  const tmpPath = join(tmpDir, `snippet-edit-${name}${ext}`)
  writeFileSync(tmpPath, snippet.code, 'utf-8')
  const editor = process.env.EDITOR || process.env.VISUAL || 'notepad'
  try {
    execSync(`"${editor}" "${tmpPath}"`, { stdio: 'inherit', shell: 'cmd.exe' })
  } catch {
    // editor may fail in non-interactive mode
  }
  const updatedCode = readFileSync(tmpPath, 'utf-8')
  if (updatedCode !== snippet.code) {
    snippet.code = updatedCode
    snippet.updatedAt = new Date().toISOString()
    saveSnippet(snippet)
    return { type: 'text', value: `✅ 片段 "${name}" 已更新 (${updatedCode.split('\n').length} 行)` }
  }
  return { type: 'text', value: `ℹ️ 片段 "${name}" 未做修改` }
}

// ============================================================================
// New: Rename - Rename a snippet
// ============================================================================

function handleRename(args: string): { type: 'text'; value: string } {
  const parts = parseArgs(args)
  const oldName = parts.positional[0]
  const newName = parts.positional[1]
  if (!oldName || !newName) {
    return { type: 'text', value: '❌ 用法: /snippet rename <旧名> <新名>' }
  }
  const snippet = loadSnippet(oldName)
  if (!snippet) {
    return { type: 'text', value: `❌ 片段不存在: ${oldName}` }
  }
  if (loadSnippet(newName)) {
    return { type: 'text', value: `⚠️ 目标名称 "${newName}" 已存在。请选择其他名称。` }
  }
  const updated: Snippet = { ...snippet, name: newName, updatedAt: new Date().toISOString() }
  const saveResult = saveSnippet(updated)
  if (!saveResult.success) {
    return { type: 'text', value: `❌ 重命名失败: ${saveResult.message}` }
  }
  try {
    unlinkSync(getSnippetPath(oldName))
  } catch {
    // ignore cleanup failure
  }
  return { type: 'text', value: `✅ 已将片段 "${oldName}" 重命名为 "${newName}"` }
}

// ============================================================================
// New: Duplicate - Copy a snippet to a new name
// ============================================================================

function handleDuplicate(args: string): { type: 'text'; value: string } {
  const parts = parseArgs(args)
  const name = parts.positional[0]
  const newName = parts.positional[1]
  if (!name || !newName) {
    return { type: 'text', value: '❌ 用法: /snippet duplicate <名称> <新名>' }
  }
  const snippet = loadSnippet(name)
  if (!snippet) {
    return { type: 'text', value: `❌ 片段不存在: ${name}` }
  }
  if (loadSnippet(newName)) {
    return { type: 'text', value: `⚠️ 目标名称 "${newName}" 已存在。请选择其他名称。` }
  }
  const now = new Date().toISOString()
  const duplicate: Snippet = {
    ...snippet,
    name: newName,
    createdAt: now,
    updatedAt: now,
    useCount: 0,
    lastUsed: now,
    favorite: false,
  }
  const result = saveSnippet(duplicate)
  if (!result.success) {
    return { type: 'text', value: `❌ 复制失败: ${result.message}` }
  }
  return { type: 'text', value: `✅ 已将片段 "${name}" 复制为 "${newName}"` }
}

// ============================================================================
// New: Favorite - Toggle favorite status or list favorites
// ============================================================================

function handleFavorite(args: string): { type: 'text'; value: string } {
  const name = args.trim()
  if (!name) {
    const all = listSnippets().filter(s => s.favorite)
    if (all.length === 0) {
      return { type: 'text', value: '⭐ 暂无收藏片段。使用 /snippet favorite <名称> 收藏片段。' }
    }
    const lines: string[] = []
    lines.push(`⭐ 收藏片段 (${all.length} 个)`)
    lines.push('')
    lines.push(renderTable(all))
    return { type: 'text', value: lines.join('\n') }
  }
  const snippet = loadSnippet(name)
  if (!snippet) {
    return { type: 'text', value: `❌ 片段不存在: ${name}` }
  }
  snippet.favorite = !snippet.favorite
  snippet.updatedAt = new Date().toISOString()
  const result = saveSnippet(snippet)
  if (!result.success) {
    return { type: 'text', value: `❌ 操作失败: ${result.message}` }
  }
  if (snippet.favorite) {
    return { type: 'text', value: `⭐ 已收藏片段: ${name}` }
  }
  return { type: 'text', value: `☆ 已取消收藏: ${name}` }
}

// ============================================================================
// New: Recent - Show recently used snippets
// ============================================================================

function handleRecent(args: string, allSnippets: Snippet[]): { type: 'text'; value: string } {
  const parts = parseArgs(args)
  const limitStr = parts.positional[0] || parts.flags.limit || '10'
  const limit = parseInt(limitStr, 10) || 10
  const sorted = [...allSnippets]
    .filter(s => s.useCount > 0)
    .sort((a, b) => b.lastUsed.localeCompare(a.lastUsed))
    .slice(0, limit)
  if (sorted.length === 0) {
    return { type: 'text', value: '🕐 暂无使用记录。使用 /snippet use <名称> 开始使用片段。' }
  }
  const lines: string[] = []
  lines.push(`🕐 最近使用 (${sorted.length} 个)`)
  lines.push('')
  lines.push(renderTable(sorted))
  return { type: 'text', value: lines.join('\n') }
}

// ============================================================================
// New: Stats - Usage statistics
// ============================================================================

function handleStats(args: string, allSnippets: Snippet[]): { type: 'text'; value: string } {
  const json = args.includes('--json')
  if (allSnippets.length === 0) {
    return { type: 'text', value: '📊 暂无片段数据。使用 /snippet save <名称> --code "..." 创建第一个片段。' }
  }
  const totalUses = allSnippets.reduce((sum, s) => sum + s.useCount, 0)
  const mostUsed = [...allSnippets].sort((a, b) => b.useCount - a.useCount).slice(0, 5)
  const leastUsed = [...allSnippets].filter(s => s.useCount === 0)
  const favorites = allSnippets.filter(s => s.favorite)
  const byLanguage = new Map<string, { count: number; uses: number }>()
  for (const s of allSnippets) {
    const entry = byLanguage.get(s.language) ?? { count: 0, uses: 0 }
    entry.count++
    entry.uses += s.useCount
    byLanguage.set(s.language, entry)
  }
  if (json) {
    const stats = {
      totalSnippets: allSnippets.length,
      totalUses,
      favoriteCount: favorites.length,
      unusedCount: leastUsed.length,
      mostUsed: mostUsed.map(s => ({ name: s.name, useCount: s.useCount })),
      byLanguage: Object.fromEntries(byLanguage),
    }
    return { type: 'text', value: JSON.stringify(stats, null, 2) }
  }
  const lines: string[] = []
  lines.push('📊 代码片段统计')
  lines.push('')
  lines.push(`  总片段数:    ${allSnippets.length}`)
  lines.push(`  总使用次数:  ${totalUses}`)
  lines.push(`  收藏数:      ${favorites.length}`)
  lines.push(`  未使用数:    ${leastUsed.length}`)
  lines.push('')
  if (mostUsed.length > 0 && mostUsed[0].useCount > 0) {
    lines.push('  🏆 最常用片段:')
    for (const s of mostUsed) {
      if (s.useCount === 0) break
      const bar = '█'.repeat(Math.min(s.useCount, 20))
      lines.push(`     ${s.name.padEnd(20)}  ${String(s.useCount).padStart(4)}  ${bar}`)
    }
    lines.push('')
  }
  if (leastUsed.length > 0) {
    lines.push(`  💤 从未使用 (${leastUsed.length} 个):`)
    for (const s of leastUsed.slice(0, 10)) {
      lines.push(`     • ${s.name}`)
    }
    if (leastUsed.length > 10) {
      lines.push(`     ... 还有 ${leastUsed.length - 10} 个`)
    }
    lines.push('')
  }
  const sortedLangs = [...byLanguage.entries()].sort((a, b) => b[1].count - a[1].count)
  if (sortedLangs.length > 0) {
    lines.push('  🔤 按语言分布:')
    for (const [lang, data] of sortedLangs) {
      lines.push(`     ${lang.padEnd(14)}  ${String(data.count).padStart(3)} 片段  ${String(data.uses).padStart(4)} 次使用`)
    }
    lines.push('')
  }
  if (favorites.length > 0) {
    lines.push('  ⭐ 收藏片段:')
    for (const s of favorites) {
      lines.push(`     • ${s.name}`)
    }
  }
  return { type: 'text', value: lines.join('\n') }
}

// ============================================================================
// New: Sync - Export all snippets as shareable format
// ============================================================================

function handleSync(args: string): { type: 'text'; value: string } {
  const parts = parseArgs(args)
  const outputPath = parts.positional[0] || parts.flags.output || parts.flags.out
  const format = parts.flags.format || 'json'
  const all = listSnippets()
  if (all.length === 0) {
    return { type: 'text', value: '📋 暂无片段可同步。' }
  }
  let content: string
  let ext: string
  if (format === 'markdown') {
    ext = '.md'
    const lines: string[] = []
    lines.push(`# 代码片段集 - 导出于 ${new Date().toISOString()}`)
    lines.push('')
    lines.push(`共 ${all.length} 个片段`)
    lines.push('')
    for (const s of all.sort((a, b) => a.name.localeCompare(b.name))) {
      lines.push(`## ${s.name}`)
      if (s.description) lines.push(`> ${s.description}`)
      lines.push(`- 语言: ${s.language}`)
      lines.push(`- 标签: ${s.tags.join(', ') || '(无)'}`)
      lines.push(`- 使用次数: ${s.useCount}`)
      lines.push('```' + s.language)
      lines.push(s.code)
      lines.push('```')
      lines.push('')
    }
    content = lines.join('\n')
  } else {
    ext = '.json'
    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      snippets: all.sort((a, b) => a.name.localeCompare(b.name)).map(s => ({
        name: s.name,
        content: s.code,
        language: s.language,
        tags: s.tags,
        description: s.description,
        useCount: s.useCount,
        favorite: s.favorite,
      })),
    }
    content = JSON.stringify(exportData, null, 2)
  }
  if (!outputPath) {
    return { type: 'text', content }
  }
  const targetPath = outputPath.endsWith(ext) ? outputPath : outputPath + ext
  try {
    writeFileSync(targetPath, content, 'utf-8')
    return { type: 'text', value: `✅ 已导出 ${all.length} 个片段到: ${targetPath} (${format} 格式)` }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    return { type: 'text', value: `❌ 导出失败: ${errMsg}` }
  }
}

// ============================================================================
// New: Import URL - Fetch snippet from URL
// ============================================================================

async function handleImportUrl(args: string): Promise<{ type: 'text'; value: string }> {
  const parts = parseArgs(args)
  const url = parts.positional[0] || parts.flags.url
  if (!url) {
    return { type: 'text', value: '❌ 用法: /snippet import-url <URL> [--name <名称>] [--tags "a,b,c"] [--desc "描述"]' }
  }
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    return { type: 'text', value: `❌ 无效的 URL: ${url}` }
  }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return { type: 'text', value: '❌ 仅支持 HTTP/HTTPS 协议' }
  }
  let rawContent: string
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'doge-code-snippet-importer/1.0' },
      signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) {
      return { type: 'text', value: `❌ 请求失败: HTTP ${response.status} ${response.statusText}` }
    }
    rawContent = await response.text()
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    return { type: 'text', value: `❌ 获取失败: ${errMsg}` }
  }
  if (!rawContent.trim()) {
    return { type: 'text', value: '❌ 获取到的内容为空' }
  }
  let code: string | undefined
  let detectedName: string | undefined
  let language: string | undefined
  let tags: string[] = []
  let description: string | undefined
  let isBatchImport = false
  try {
    const parsed = JSON.parse(rawContent)
    if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.snippets)) {
        isBatchImport = true
      } else if (parsed.content && typeof parsed.content === 'string') {
        code = parsed.content
        detectedName = parsed.name
        language = parsed.language
        tags = parsed.tags || []
        description = parsed.description
      }
    }
  } catch {
    // not JSON, treat as raw code
  }
  if (isBatchImport) {
    try {
      const parsed = JSON.parse(rawContent) as { snippets: SnippetImportData[] }
      const items = parsed.snippets
      if (!Array.isArray(items) || items.length === 0) {
        return { type: 'text', value: '❌ 导入数据中没有片段' }
      }
      let imported = 0
      let skipped = 0
      for (const item of items) {
        const sName = item.name
        const sCode = item.code || item.content || ''
        if (!sName || !sCode) {
          skipped++
          continue
        }
        const existing = loadSnippet(sName)
        if (existing && !parts.flags.force) {
          skipped++
          continue
        }
        const sLang = item.language || detectLanguage(sCode)
        const sTags = item.tags || []
        const sDesc = item.description || ''
        const now = new Date().toISOString()
        const snip: Snippet = {
          name: sName,
          code: sCode,
          language: sLang,
          tags: sTags,
          description: sDesc,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          useCount: existing?.useCount ?? item.useCount ?? 0,
          favorite: existing?.favorite ?? item.favorite ?? false,
          lastUsed: existing?.lastUsed ?? item.lastUsed ?? now,
        }
        const r = saveSnippet(snip)
        if (r.success) imported++
        else skipped++
      }
      return { type: 'text', value: `✅ 批量导入完成: ${imported} 个已导入, ${skipped} 个已跳过` }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      return { type: 'text', value: `❌ 批量导入解析失败: ${errMsg}` }
    }
  }
  if (!code) {
    code = rawContent
  }
  const urlName = basename(parsedUrl.pathname, extname(parsedUrl.pathname))
  const finalName = parts.flags.name || detectedName || urlName || 'imported'
  const existing = loadSnippet(finalName)
  if (existing && !parts.flags.force) {
    return { type: 'text', value: `⚠️ 片段 "${finalName}" 已存在。使用 --force 覆盖。` }
  }
  const finalLanguage = parts.flags.lang || language || detectLanguage(code)
  const tagsStr = parts.flags.tags || ''
  const finalTags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : tags
  const finalDesc = parts.flags.desc || parts.flags.description || description || `从 ${url} 导入`
  const now = new Date().toISOString()
  const snip: Snippet = {
    name: finalName,
    code,
    language: finalLanguage,
    tags: finalTags,
    description: finalDesc,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    useCount: existing?.useCount ?? 0,
    favorite: existing?.favorite ?? false,
    lastUsed: existing?.lastUsed ?? now,
  }
  const r = saveSnippet(snip)
  if (!r.success) {
    return { type: 'text', value: `❌ 导入失败: ${r.message}` }
  }
  const action = existing ? '更新' : '导入'
  return { type: 'text', value: `✅ 已${action}片段: ${finalName} (${finalLanguage}, ${code.split('\n').length} 行)` }
}

// ============================================================================
// Argument Parser
// ============================================================================

interface ParsedArgs {
  positional: string[]
  flags: Record<string, string>
}

function parseArgs(input: string): ParsedArgs {
  const flags: Record<string, string> = {}
  const positional: string[] = []
  // eslint-disable-next-line no-useless-escape
  const regex = /(--[\w-]+)(?:=|\s+)("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\S+)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\S+)/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(input)) !== null) {
    if (match[1]) {
      // flag
      const key = match[1].replace(/^--/, '')
      let val = match[2] || ''
      // Strip quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      flags[key] = val
    } else if (match[3]) {
      // positional
      let val = match[3]
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      positional.push(val)
    }
  }

  return { positional, flags }
}

// ============================================================================
// Help
// ============================================================================

function renderHelp(): string {
  return [
    '📋 代码片段管理',
    '',
    '保存、管理和重用代码片段。片段存储在 ~/.doge/snippets/ 目录。',
    '',
    '📖 用法: ',
    '  /snippet save <名称> [--code "..."] [--lang <lang>] [--tags "a,b,c"] [--desc "描述"] [--file <路径>]',
    '  /snippet list [--tag <标签>] [--json]             列出所有片段（支持搜索/过滤）',
    '  /snippet get <名称> [--json]                      查看片段内容',
    '  /snippet use <名称>                               将片段插入到当前上下文',
    '  /snippet insert <名称>                            复制片段到剪贴板 + 临时文件（可粘贴到编辑器）',
    '  /snippet copy <名称>                              复制片段到剪贴板',
    '  /snippet edit <名称>                              在编辑器中打开片段进行编辑',
    '  /snippet rename <旧名> <新名>                     重命名片段',
    '  /snippet duplicate <名称> <新名>                  复制片段为新名称',
    '  /snippet favorite [名称]                          收藏/取消收藏片段（省略名称则列出所有收藏）',
    '  /snippet recent [数量]                            显示最近使用的片段',
    '  /snippet stats [--json]                           使用统计（最常用/未使用/按语言分布）',
    '  /snippet sync [<输出路径>] [--format json|markdown] 导出所有片段为可分享格式',
    '  /snippet import-url <URL> [--name <名称>]          从 URL 导入代码片段',
    '  /snippet delete <名称>                            删除片段',
    '  /snippet export <名称> [<输出路径>]               导出片段为文件',
    '  /snippet import <文件路径> [--name <名称>] [--tags "a,b,c"] [--desc "描述"]',
    '  /snippet tags [--json]                            按标签浏览',
    '',
    '选项:',
    '  --code "..."          代码内容（save 时）',
    '  --file <路径>         从文件读取代码（save/import 时）',
    '  --lang <语言>         指定语言（自动检测作为回退）',
    '  --tags "a,b,c"        逗号分隔的标签列表',
    '  --desc "描述"         片段描述',
    '  --name <名称>         指定片段名称（import 时）',
    '  --output <路径>       输出路径（export/sync 时）',
    '  --force               强制覆盖已有片段',
    '  --json                JSON 格式输出',
    '  --format <格式>       导出格式: json 或 markdown（sync 时）',
    '  --limit <数量>        限制数量（recent 时）',
    '  --url <URL>           URL 地址（import-url 时）',
    '',
    '搜索:',
    '  /snippet list <关键词>     按名称、描述、标签、代码内容搜索',
    '  /snippet list --tag react  按标签过滤',
    '',
    '💡 示例: ',
    '  /snippet save fetch-api --code "fetch(url).then(r => r.json())" --lang javascript --tags "api,http" --desc "基础 fetch 请求"',
    '  /snippet list                             列出所有片段',
    '  /snippet list react                       搜索包含 react 的片段',
    '  /snippet list --tag api                   按 api 标签过滤',
    '  /snippet get fetch-api                    查看片段详情',
    '  /snippet use fetch-api                    使用片段',
    '  /snippet insert fetch-api                 复制到剪贴板供粘贴',
    '  /snippet copy fetch-api                   复制到剪贴板',
    '  /snippet edit fetch-api                   在编辑器中编辑',
    '  /snippet rename fetch-api http-fetch      重命名',
    '  /snippet duplicate fetch-api fetch-api-v2 复制为新名称',
    '  /snippet favorite fetch-api               收藏片段',
    '  /snippet favorite                         列出所有收藏',
    '  /snippet recent 5                         最近 5 个使用的片段',
    '  /snippet stats                            使用统计',
    '  /snippet sync ./my-snippets.json          导出所有片段',
    '  /snippet sync ./snippets --format markdown 导出为 Markdown',
    '  /snippet import-url https://example.com/snippet.json',
    '  /snippet export fetch-api ./fetch.js      导出为文件',
    '  /snippet import ./utils.py --name pyutil  从文件导入',
    '  /snippet tags                             浏览标签',
  ].join('\n')
}

// ============================================================================
// Main Command
// ============================================================================

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const parts = parseArgs(s)

  // Determine subcommand
  const subcmd = parts.positional.shift() ?? ''
  const remaining = parts.positional.join(' ')
  const json = !!parts.flags.json

  // Re-parse remaining args for subcommand-specific flags
  // We need original positional after subcmd for some commands
  const allSnippets = listSnippets()

  switch (subcmd) {
    case 'save':
      return handleSave(remaining + ' ' + rebuildFlags(parts.flags))
    case 'list':
      // Need to reconstruct args: remaining positional + flags
      return handleList(remaining + ' ' + rebuildFlags(parts.flags), allSnippets, json)
    case 'get':
      return handleGet(remaining, json)
    case 'use':
      return handleUse(remaining, allSnippets)
    case 'insert':
      return handleInsert(remaining)
    case 'copy':
      return handleCopy(remaining)
    case 'edit':
      return handleEdit(remaining)
    case 'rename':
      return handleRename(remaining)
    case 'duplicate':
      return handleDuplicate(remaining)
    case 'favorite':
      return handleFavorite(remaining)
    case 'recent':
      return handleRecent(remaining, allSnippets)
    case 'stats':
      return handleStats(remaining, allSnippets)
    case 'sync':
      return handleSync(remaining + ' ' + rebuildFlags(parts.flags))
    case 'import-url':
      return await handleImportUrl(remaining + ' ' + rebuildFlags(parts.flags))
    case 'delete':
      return handleDelete(remaining)
    case 'export':
      return handleExport(remaining + ' ' + rebuildFlags(parts.flags))
    case 'import':
      return handleImport(remaining + ' ' + rebuildFlags(parts.flags))
    case 'tags':
      return handleTags(allSnippets, json)
    case 'help':
    case '--help':
    case '':
    default:
      if (s.includes('--help')) {
        return { type: 'text', value: renderHelp() }
      }
      if (!subcmd) {
        return { type: 'text', value: renderHelp() }
      }
      return { type: 'text', value: `❌ 未知子命令: ${subcmd}\n\n${renderHelp()}` }
  }
}

/**
 * Rebuild flags string from parsed flags object for passing to subcommand handlers.
 */
function rebuildFlags(flags: Record<string, string>): string {
  const parts: string[] = []
  for (const [key, val] of Object.entries(flags)) {
    if (jsonFlag(key)) continue
    if (val === '' || val === 'true') {
      parts.push(`--${key}`)
    } else {
      parts.push(`--${key} "${val}"`)
    }
  }
  return parts.join(' ')
}

function jsonFlag(key: string): boolean {
  return key === 'json'
}

// ============================================================================
// Command Definition
// ============================================================================

const command = {
  type: 'local' as const,
  name: 'snippet',
  description: '代码片段管理 - 保存、搜索、使用和分享代码片段',
  aliases: ['/snippet', '/snip'],
  arguments: [
    { name: 'subcommand', description: '子命令: save | list | get | use | insert | copy | edit | rename | duplicate | favorite | recent | stats | sync | import-url | delete | export | import | tags', required: true },
    { name: 'name-or-file', description: '片段名称或文件路径', required: false },
    { name: '--code', description: '代码内容', required: false },
    { name: '--file', description: '从文件读取代码', required: false },
    { name: '--lang', description: '指定语言', required: false },
    { name: '--tags', description: '逗号分隔的标签列表', required: false },
    { name: '--desc', description: '片段描述', required: false },
    { name: '--name', description: '指定片段名称', required: false },
    { name: '--output', description: '导出输出路径', required: false },
    { name: '--force', description: '强制覆盖', required: false },
    { name: '--json', description: 'JSON 格式输出', required: false },
    { name: '--format', description: '导出格式 (json|markdown)', required: false },
    { name: '--limit', description: '限制数量', required: false },
    { name: '--url', description: 'URL 地址', required: false },
    { name: 'help', description: '显示帮助', required: false },
  ],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call: call as unknown as Command['call'] }),
} satisfies Command

export default command
