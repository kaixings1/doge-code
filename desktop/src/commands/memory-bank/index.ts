import { mkdir, readFile, writeFile, readdir, unlink, access } from 'node:fs/promises'
import { join } from 'node:path'
import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported memory entry types */
type MemoryType = 'context' | 'decision' | 'learning' | 'reference'

/** A single memory entry stored on disk */
interface MemoryEntry {
  id: string
  type: MemoryType
  title: string
  content: string
  tags: string[]
  createdAt: string
  updatedAt: string
  relatedFiles: string[]
}

/** The on-disk index file structure */
interface MemoryIndex {
  version: number
  entries: Array<{
    id: string
    type: MemoryType
    title: string
    tags: string[]
    createdAt: string
    updatedAt: string
    file: string
  }>
}

/** Valid memory types for validation */
const VALID_TYPES: MemoryType[] = ['context', 'decision', 'learning', 'reference']

/** Chinese labels for memory types */
const TYPE_LABELS: Record<MemoryType, string> = {
  context: '项目上下文',
  decision: '架构决策',
  learning: '经验教训',
  reference: '参考资料',
}

/** Emoji icons for memory types */
const TYPE_ICONS: Record<MemoryType, string> = {
  context: '📦',
  decision: '🏗',
  learning: '💡',
  reference: '📚',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the .memory/ directory path for the current project.
 * Uses process.cwd() because memory-bank always operates on the project root.
 */
function getMemoryDir(): string {
  return join(process.cwd(), '.memory')
}

function getIndexPath(): string {
  return join(getMemoryDir(), 'memory-index.json')
}

/** Convert a MemoryEntry ID to its on-disk filename */
function idToFilename(id: string): string {
  return `${id}.md`
}

/** Resolve the full path for a single memory file */
function getEntryPath(id: string): string {
  return join(getMemoryDir(), idToFilename(id))
}

/** ISO timestamp without milliseconds, locale-safe */
function now(): string {
  return new Date().toISOString()
}

/** Generate a unique ID: mem-YYYYMMDD-NNN based on existing entries */
async function generateId(memoryDir: string, index: MemoryIndex): Promise<string> {
  const date = new Date()
  const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
  const prefix = `mem-${dateStr}-`

  // Collect sequence numbers already used today
  const seqs: number[] = []
  for (const entry of index.entries) {
    if (entry.id.startsWith(prefix)) {
      const seq = parseInt(entry.id.slice(prefix.length), 10)
      if (!isNaN(seq)) seqs.push(seq)
    }
  }

  const next = seqs.length > 0 ? Math.max(...seqs) + 1 : 1
  return `${prefix}${String(next).padStart(3, '0')}`
}

/** Parse simple YAML frontmatter from markdown content */
function parseFrontmatter(raw: string): { frontmatter: Record<string, string | string[]>; body: string } | null {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) return null

  const frontmatter: Record<string, string | string[]> = {}
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    const rawVal = line.slice(colonIdx + 1).trim()
    // Parse as array if it looks like [a, b, c]
    if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
      frontmatter[key] = rawVal.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean)
    } else {
      frontmatter[key] = rawVal
    }
  }

  return { frontmatter, body: match[2].trim() }
}

/** Serialize a MemoryEntry to markdown with YAML frontmatter */
function entryToMarkdown(entry: MemoryEntry): string {
  const tags = `[${entry.tags.join(', ')}]`
  const relatedFiles = `[${entry.relatedFiles.join(', ')}]`
  return `---
id: ${entry.id}
type: ${entry.type}
title: ${entry.title}
tags: ${tags}
createdAt: ${entry.createdAt}
updatedAt: ${entry.updatedAt}
relatedFiles: ${relatedFiles}
---

${entry.content}
`
}

/** Parse a markdown file back into a MemoryEntry */
function markdownToEntry(raw: string): MemoryEntry | null {
  const parsed = parseFrontmatter(raw)
  if (!parsed) return null

  const { frontmatter, body } = parsed
  return {
    id: String(frontmatter['id'] || ''),
    type: (frontmatter['type'] as MemoryType) || 'context',
    title: String(frontmatter['title'] || ''),
    content: body,
    tags: Array.isArray(frontmatter['tags']) ? frontmatter['tags'] : [],
    createdAt: String(frontmatter['createdAt'] || ''),
    updatedAt: String(frontmatter['updatedAt'] || ''),
    relatedFiles: Array.isArray(frontmatter['relatedFiles']) ? frontmatter['relatedFiles'] : [],
  }
}

/** Read the index file, returning a default empty index if missing */
async function readIndex(): Promise<MemoryIndex> {
  try {
    const raw = await readFile(getIndexPath(), 'utf-8')
    return JSON.parse(raw) as MemoryIndex
  } catch {
    return { version: 1, entries: [] }
  }
}

/** Write the index file atomically */
async function writeIndex(index: MemoryIndex): Promise<void> {
  await writeFile(getIndexPath(), JSON.stringify(index, null, 2), 'utf-8')
}

/** Check whether .memory/ directory exists */
async function memoryDirExists(): Promise<boolean> {
  try {
    await access(getMemoryDir())
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Command Implementations
// ---------------------------------------------------------------------------

async function cmdInit(): Promise<string> {
  const memoryDir = getMemoryDir()
  await mkdir(memoryDir, { recursive: true })

  const index: MemoryIndex = { version: 1, entries: [] }
  await writeIndex(index)

  return `## Memory Bank 已初始化

目录: \`.memory/\`
索引: \`memory-index.json\`

**下一步**:
  /memory-bank add context "项目描述"    - 添加第一条上下文记忆
  /memory-bank help                      - 查看所有命令`
}

async function cmdAdd(args: string): Promise<string> {
  // Parse: add <type> <content>
  const parts = args.trim().split(/\s+/)
  if (parts.length < 2) {
    return `## 错误：参数不足

**用法**: /memory-bank add <类型> <内容>

**类型**: context | decision | learning | reference

**示例**:
  /memory-bank add context "使用 TypeScript + Bun 运行时"
  /memory-bank add decision "选择 SQLite 作为本地存储" --tags db,sqlite
  /memory-bank add learning "避免在 ink 组件中使用 top-level await"`
  }

  const type = parts[0].toLowerCase() as MemoryType
  if (!VALID_TYPES.includes(type)) {
    return `## 错误：无效类型 "\`${parts[0]}\`"

**有效类型**:
  - context   (项目上下文)
  - decision  (架构决策)
  - learning  (经验教训)
  - reference (参考资料)`
  }

  // Check for --tags flag in the remaining args
  let contentParts = parts.slice(1)
  let tags: string[] = []
  let relatedFiles: string[] = []

  const tagsFlagIdx = contentParts.findIndex(s => s === '--tags')
  if (tagsFlagIdx !== -1) {
    const tagsRaw = contentParts[tagsFlagIdx + 1]
    if (tagsRaw) {
      tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean)
    }
    contentParts = contentParts.filter((_, i) => i !== tagsFlagIdx && i !== tagsFlagIdx + 1)
  }

  const filesFlagIdx = contentParts.findIndex(s => s === '--files')
  if (filesFlagIdx !== -1) {
    const filesRaw = contentParts[filesFlagIdx + 1]
    if (filesRaw) {
      relatedFiles = filesRaw.split(',').map(f => f.trim()).filter(Boolean)
    }
    contentParts = contentParts.filter((_, i) => i !== filesFlagIdx && i !== filesFlagIdx + 1)
  }

  const content = contentParts.join(' ')
  if (!content) {
    return `## 错误：内容为空

请提供记忆内容，例如:
  /memory-bank add ${type} "这是要记住的内容"`
  }

  const memoryDir = getMemoryDir()
  if (!await memoryDirExists()) {
    await mkdir(memoryDir, { recursive: true })
  }

  const index = await readIndex()
  const id = await generateId(memoryDir, index)
  const timestamp = now()

  const entry: MemoryEntry = {
    id,
    type,
    title: content.length > 60 ? content.slice(0, 57) + '...' : content,
    content,
    tags,
    createdAt: timestamp,
    updatedAt: timestamp,
    relatedFiles,
  }

  // Write markdown file
  await writeFile(getEntryPath(id), entryToMarkdown(entry), 'utf-8')

  // Update index
  index.entries.push({
    id,
    type,
    title: entry.title,
    tags,
    createdAt: timestamp,
    updatedAt: timestamp,
    file: idToFilename(id),
  })
  await writeIndex(index)

  return `${TYPE_ICONS[type]} **记忆已添加** (\`${id}\`)

| 属性 | 值 |
|------|-----|
| ID | \`${id}\` |
| 类型 | ${type} (${TYPE_LABELS[type]}) |
| 内容 | ${entry.title} |
| 标签 | ${tags.length > 0 ? tags.map(t => `\`${t}\``).join(', ') : '无'} |
| 关联文件 | ${relatedFiles.length > 0 ? relatedFiles.join(', ') : '无'} |
| 时间 | ${timestamp}

💡 **后续操作**:
  /memory-bank get ${id}           - 查看完整内容
  /memory-bank update ${id} "新内容" - 更新此记忆`
}

async function cmdGet(args: string, jsonMode: boolean): Promise<string> {
  const id = args.trim()
  if (!id) {
    return `## 错误：请提供记忆 ID

**用法**: /memory-bank get <ID>

**示例**: /memory-bank get mem-20260802-001`
  }

  try {
    const raw = await readFile(getEntryPath(id), 'utf-8')
    const entry = markdownToEntry(raw)
    if (!entry) {
      return `## 错误：记忆文件格式无效

文件 \`${idToFilename(id)}\` 缺少有效的 frontmatter。`
    }

    if (jsonMode) {
      return JSON.stringify(entry, null, 2)
    }

    const tags = entry.tags.length > 0 ? entry.tags.map(t => `\`${t}\``).join(', ') : '无'
    const files = entry.relatedFiles.length > 0 ? entry.relatedFiles.join(', ') : '无'

    return `${TYPE_ICONS[entry.type]} **${entry.title}** (\`${entry.id}\`)

| 属性 | 值 |
|------|-----|
| 类型 | ${entry.type} (${TYPE_LABELS[entry.type]}) |
| 标签 | ${tags} |
| 关联文件 | ${files} |
| 创建时间 | ${entry.createdAt} |
| 更新时间 | ${entry.updatedAt} |

---

${entry.content}`
  } catch {
    return `## 错误：记忆未找到

找不到 ID 为 \`${id}\` 的记忆。

💡 使用 \`/memory-bank list\` 查看可用记忆。`
  }
}

async function cmdList(filterType?: string, jsonMode: boolean = false): Promise<string> {
  const index = await readIndex()

  if (index.entries.length === 0) {
    return `## Memory Bank 为空

📭 当前没有任何记忆条目。

🚀 **快速开始**:
  /memory-bank add context "项目描述"
  /memory-bank add decision "架构选型决策"`
  }

  let entries = index.entries
  if (filterType && VALID_TYPES.includes(filterType as MemoryType)) {
    entries = entries.filter(e => e.type === filterType)
  }

  if (entries.length === 0) {
    return `## 无匹配记忆

没有找到类型为 \`${filterType}\` 的记忆。

💡 可用类型: ${VALID_TYPES.join(' | ')}`
  }

  if (jsonMode) {
    return JSON.stringify(entries, null, 2)
  }

  const rows = entries.map(e =>
    `| \`${e.id}\` | ${TYPE_ICONS[e.type]} ${e.type} | ${e.title} | ${e.tags.map(t => `\`${t}\``).join(', ') || '无'} | ${e.updatedAt}`
  ).join('\n')

  const filterLabel = filterType ? ` (类型: ${filterType})` : ''

  return `## 记忆列表${filterLabel}

共 **${entries.length}** 条记忆：

| ID | 类型 | 标题 | 标签 | 更新时间 |
|------|------|------|------|----------|
|${rows}

💡 **提示**:
  /memory-bank list context    - 只显示上下文记忆
  /memory-bank get <ID>        - 查看完整内容
  /memory-bank search <关键词> - 全文搜索`
}

async function cmdSearch(keyword: string, jsonMode: boolean): Promise<string> {
  const query = keyword.trim().toLowerCase()
  if (!query) {
    return `## 错误：请提供搜索关键词

**用法**: /memory-bank search <关键词>

**示例**: /memory-bank search 数据库`
  }

  const index = await readIndex()
  const results: MemoryEntry[] = []

  for (const meta of index.entries) {
    try {
      const raw = await readFile(join(getMemoryDir(), meta.file), 'utf-8')
      const entry = markdownToEntry(raw)
      if (!entry) continue

      const searchable = `${entry.title} ${entry.content} ${entry.tags.join(' ')} ${entry.relatedFiles.join(' ')}`.toLowerCase()
      if (searchable.includes(query)) {
        results.push(entry)
      }
    } catch {
      // Skip unreadable entries
    }
  }

  if (results.length === 0) {
    return `## 搜索结果

没有找到包含 "\`${query}\`" 的记忆。

💡 尝试使用更短的关键词。`
  }

  if (jsonMode) {
    return JSON.stringify(results, null, 2)
  }

  const rows = results.map(e =>
    `| \`${e.id}\` | ${TYPE_ICONS[e.type]} ${e.type} | ${e.title} | ${e.tags.map(t => `\`${t}\``).join(', ') || '无'} |`
  ).join('\n')

  return `## 搜索结果：\`${query}\`

找到 **${results.length}** 条匹配记忆：

| ID | 类型 | 标题 | 标签 |
|------|------|------|------|
|${rows}`
}

async function cmdUpdate(args: string): Promise<string> {
  // Parse: update <ID> <new content>
  const parts = args.trim().split(/\s+/)
  if (parts.length < 2) {
    return `## 错误：参数不足

**用法**: /memory-bank update <ID> <新内容>
**示例**: /memory-bank update mem-20260802-001 "更新后的内容"`
  }

  const id = parts[0]

  // Check for optional flags
  let contentParts = parts.slice(1)
  let newTags: string[] | undefined
  let newRelatedFiles: string[] | undefined

  const tagsFlagIdx = contentParts.findIndex(s => s === '--tags')
  if (tagsFlagIdx !== -1) {
    const tagsRaw = contentParts[tagsFlagIdx + 1]
    if (tagsRaw) {
      newTags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean)
    }
    contentParts = contentParts.filter((_, i) => i !== tagsFlagIdx && i !== tagsFlagIdx + 1)
  }

  const filesFlagIdx = contentParts.findIndex(s => s === '--files')
  if (filesFlagIdx !== -1) {
    const filesRaw = contentParts[filesFlagIdx + 1]
    if (filesRaw) {
      newRelatedFiles = filesRaw.split(',').map(f => f.trim()).filter(Boolean)
    }
    contentParts = contentParts.filter((_, i) => i !== filesFlagIdx && i !== filesFlagIdx + 1)
  }

  const newContent = contentParts.join(' ')
  if (!newContent && newTags === undefined && newRelatedFiles === undefined) {
    return `## 错误：没有要更新的内容

请提供新内容或 --tags / --files 参数。`
  }

  try {
    const raw = await readFile(getEntryPath(id), 'utf-8')
    const entry = markdownToEntry(raw)
    if (!entry) {
      return `## 错误：记忆文件损坏

文件 \`${idToFilename(id)}\` 格式无效。`
    }

    if (newContent) {
      entry.content = newContent
      entry.title = newContent.length > 60 ? newContent.slice(0, 57) + '...' : newContent
    }
    if (newTags !== undefined) entry.tags = newTags
    if (newRelatedFiles !== undefined) entry.relatedFiles = newRelatedFiles
    entry.updatedAt = now()

    // Write updated file
    await writeFile(getEntryPath(id), entryToMarkdown(entry), 'utf-8')

    // Update index
    const index = await readIndex()
    const idx = index.entries.findIndex(e => e.id === id)
    if (idx !== -1) {
      index.entries[idx].title = entry.title
      index.entries[idx].tags = entry.tags
      index.entries[idx].updatedAt = entry.updatedAt
      await writeIndex(index)
    }

    return `## 记忆已更新 (\`${id}\`)

| 属性 | 值 |
|------|-----|
| 标题 | ${entry.title} |
| 标签 | ${entry.tags.length > 0 ? entry.tags.map(t => `\`${t}\``).join(', ') : '无'} |
| 关联文件 | ${entry.relatedFiles.length > 0 ? entry.relatedFiles.join(', ') : '无'} |
| 更新时间 | ${entry.updatedAt}`
  } catch {
    return `## 错误：记忆未找到

找不到 ID 为 \`${id}\` 的记忆。`
  }
}

async function cmdDelete(args: string): Promise<string> {
  const id = args.trim()
  if (!id) {
    return `## 错误：请提供记忆 ID

**用法**: /memory-bank delete <ID>
**示例**: /memory-bank delete mem-20260802-001`
  }

  try {
    // Remove file
    await unlink(getEntryPath(id))

    // Update index
    const index = await readIndex()
    const before = index.entries.length
    index.entries = index.entries.filter(e => e.id !== id)
    if (index.entries.length === before) {
      return `## 错误：记忆未找到

找不到 ID 为 \`${id}\` 的记忆。`
    }
    await writeIndex(index)

    return `## 记忆已删除

记忆 \`${id}\` 已从 Memory Bank 中移除。`
  } catch {
    return `## 错误：记忆未找到

找不到 ID 为 \`${id}\` 的记忆文件。`
  }
}

async function cmdSummary(jsonMode: boolean): Promise<string> {
  const index = await readIndex()

  if (index.entries.length === 0) {
    return `## 项目知识摘要

📭 Memory Bank 为空，暂无知识摘要。

🚀 **快速开始**:
  /memory-bank add context "项目描述"`
  }

  // Load all entries for full summary
  const entries: MemoryEntry[] = []
  for (const meta of index.entries) {
    try {
      const raw = await readFile(join(getMemoryDir(), meta.file), 'utf-8')
      const entry = markdownToEntry(raw)
      if (entry) entries.push(entry)
    } catch { /* skip */ }
  }

  const byType: Record<MemoryType, MemoryEntry[]> = {
    context: [],
    decision: [],
    learning: [],
    reference: [],
  }
  for (const e of entries) {
    byType[e.type].push(e)
  }

  // Collect all tags
  const tagCounts = new Map<string, number>()
  for (const e of entries) {
    for (const t of e.tags) {
      tagCounts.set(t, (tagCounts.get(t) || 0) + 1)
    }
  }
  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)

  if (jsonMode) {
    return JSON.stringify({
      total: entries.length,
      byType: {
        context: byType.context.length,
        decision: byType.decision.length,
        learning: byType.learning.length,
        reference: byType.reference.length,
      },
      topTags: Object.fromEntries(topTags),
      recentEntries: entries
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 5)
        .map(e => ({ id: e.id, type: e.type, title: e.title })),
    }, null, 2)
  }

  const typeRows = VALID_TYPES.map(t =>
    `| ${TYPE_ICONS[t]} ${TYPE_LABELS[t]} | ${byType[t].length} |`
  ).join('\n')

  const tagRows = topTags.length > 0
    ? topTags.map(([tag, count]) => `| \`${tag}\` | ${count} |`).join('\n')
    : '| (无标签) | - |'

  const recent = entries
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5)
    .map(e => `- ${TYPE_ICONS[e.type]} \`${e.id}\` ${e.title}`)
    .join('\n')

  return `## 项目知识摘要

### 统计

| 类型 | 数量 |
|------|------|
|${typeRows}
| **总计** | **${entries.length}** |

### 热门标签

| 标签 | 出现次数 |
|------|----------|
|${tagRows}

### 最近更新

${recent}

---
💡 使用 \`/memory-bank export\` 导出完整文档`
}

async function cmdExport(jsonMode: boolean): Promise<string> {
  const index = await readIndex()

  if (index.entries.length === 0) {
    return `## 导出失败

📭 Memory Bank 为空，没有可导出的内容。`
  }

  const entries: MemoryEntry[] = []
  for (const meta of index.entries) {
    try {
      const raw = await readFile(join(getMemoryDir(), meta.file), 'utf-8')
      const entry = markdownToEntry(raw)
      if (entry) entries.push(entry)
    } catch { /* skip */ }
  }

  if (jsonMode) {
    return JSON.stringify(entries, null, 2)
  }

  const byType: Record<MemoryType, MemoryEntry[]> = {
    context: [],
    decision: [],
    learning: [],
    reference: [],
  }
  for (const e of entries) {
    byType[e.type].push(e)
  }

  const sections = VALID_TYPES
    .filter(t => byType[t].length > 0)
    .map(t => {
      const items = byType[t].map(e => {
        const tags = e.tags.length > 0 ? ` (${e.tags.map(tag => `#${tag}`).join(' ')})` : ''
        const files = e.relatedFiles.length > 0 ? `\n  - 关联文件: ${e.relatedFiles.join(', ')}` : ''
        return `### ${e.title}${tags}\n\n- **ID**: \`${e.id}\`\n- **创建**: ${e.createdAt}\n- **更新**: ${e.updatedAt}${files}\n\n${e.content}`
      }).join('\n\n')
      return `## ${TYPE_ICONS[t]} ${TYPE_LABELS[t]}\n\n${items}`
    })
    .join('\n\n---\n\n')

  return `# Memory Bank 导出

> 生成时间: ${now()}
> 总条目: ${entries.length}

---

${sections}`
}

async function cmdStats(jsonMode: boolean): Promise<string> {
  const index = await readIndex()
  const memoryDir = getMemoryDir()

  // Count files and total size
  let totalSize = 0
  let fileCount = 0
  try {
    const files = await readdir(memoryDir)
    for (const f of files) {
      if (f.endsWith('.md')) {
        fileCount++
        try {
          const stat = await readFile(join(memoryDir, f), 'utf-8')
          totalSize += Buffer.byteLength(stat, 'utf-8')
        } catch { /* skip */ }
      }
    }
  } catch { /* dir may not exist */ }

  const byType: Record<string, number> = { context: 0, decision: 0, learning: 0, reference: 0 }
  for (const e of index.entries) {
    byType[e.type] = (byType[e.type] || 0) + 1
  }

  // Collect all tags
  const allTags = new Set<string>()
  for (const e of index.entries) {
    for (const t of e.tags) allTags.add(t)
  }

  // Date range
  const dates = index.entries.map(e => e.createdAt).sort()
  const oldest = dates[0] || 'N/A'
  const newest = dates[dates.length - 1] || 'N/A'

  if (jsonMode) {
    return JSON.stringify({
      totalEntries: index.entries.length,
      byType,
      totalTags: allTags.size,
      totalFiles: fileCount,
      totalSizeBytes: totalSize,
      oldestEntry: oldest,
      newestEntry: newest,
      indexVersion: index.version,
      memoryDir,
    }, null, 2)
  }

  const typeRows = VALID_TYPES.map(t =>
    `| ${TYPE_ICONS[t]} ${TYPE_LABELS[t]} | ${byType[t]} |`
  ).join('\n')

  const sizeStr = totalSize < 1024
    ? `${totalSize} B`
    : totalSize < 1024 * 1024
      ? `${(totalSize / 1024).toFixed(1)} KB`
      : `${(totalSize / (1024 * 1024)).toFixed(2)} MB`

  return `## Memory Bank 统计

### 概览

| 指标 | 值 |
|------|-----|
| 总条目数 | ${index.entries.length} |
| 文件数 | ${fileCount} |
| 占用空间 | ${sizeStr} |
| 标签总数 | ${allTags.size} |
| 索引版本 | ${index.version} |
| 存储路径 | \`${memoryDir}\` |

### 类型分布

| 类型 | 数量 |
|------|------|
|${typeRows}

### 时间范围

| 指标 | 值 |
|------|-----|
| 最早记忆 | ${oldest} |
| 最新记忆 | ${newest}`
}

// ---------------------------------------------------------------------------
// Main call function
// ---------------------------------------------------------------------------

const HELP_TEXT = `## Memory Bank 命令

**用法**: /memory-bank <子命令> [参数]

**子命令**:
  init                              - 初始化 Memory Bank（创建 .memory/ 目录）
  add <类型> <内容> [选项]          - 添加记忆
  get <ID>                          - 获取特定记忆
  list [类型]                       - 列出所有记忆（支持按类型过滤）
  search <关键词>                   - 全文搜索记忆
  update <ID> <内容> [选项]         - 更新记忆
  delete <ID>                       - 删除记忆
  summary                           - 生成项目知识摘要
  export                            - 导出为 Markdown 文档
  stats                             - 显示记忆统计
  help                              - 显示帮助

**记忆类型**:
  context   - 项目上下文（技术栈、架构概述等）
  decision  - 架构决策（ADR 风格）
  learning  - 经验教训（踩坑记录、最佳实践）
  reference - 参考资料（文档链接、API 参考）

**选项**:
  --tags <tag1,tag2>     - 添加标签
  --files <file1,file2>  - 关联文件路径
  --json                 - 以 JSON 格式输出

**示例**:
  /memory-bank init
  /memory-bank add context "使用 TypeScript + Bun 运行时"
  /memory-bank add decision "选择 SQLite 而非 PostgreSQL" --tags db,storage
  /memory-bank get mem-20260802-001
  /memory-bank list decision
  /memory-bank search 数据库
  /memory-bank update mem-20260802-001 "更新后的内容" --tags new-tag
  /memory-bank delete mem-20260802-001
  /memory-bank summary
  /memory-bank export
  /memory-bank stats
  /memory-bank list --json`

export const call: LocalCommandCall = async (args) => {
  const input = (args ?? '').trim()
  const words = input.split(/\s+/).filter(Boolean)
  const first = (words[0] ?? '').toLowerCase()

  // Check for --json flag anywhere in args
  const jsonMode = words.includes('--json')
  const cleanWords = words.filter(w => w !== '--json')
  const cleanArgs = cleanWords.slice(1).join(' ')

  // Route to subcommand
  if (first === '' || first === 'help') {
    return HELP_TEXT
  }

  if (first === 'init') {
    return await cmdInit()
  }

  if (first === 'add') {
    return await cmdAdd(cleanArgs)
  }

  if (first === 'get') {
    return await cmdGet(cleanArgs, jsonMode)
  }

  if (first === 'list') {
    const filterType = VALID_TYPES.includes(cleanArgs.split(/\s+/)[0] as MemoryType)
      ? cleanArgs.split(/\s+/)[0]
      : undefined
    return await cmdList(filterType, jsonMode)
  }

  if (first === 'search') {
    return await cmdSearch(cleanArgs, jsonMode)
  }

  if (first === 'update') {
    return await cmdUpdate(cleanArgs)
  }

  if (first === 'delete' || first === 'rm') {
    return await cmdDelete(cleanArgs)
  }

  if (first === 'summary') {
    return await cmdSummary(jsonMode)
  }

  if (first === 'export') {
    return await cmdExport(jsonMode)
  }

  if (first === 'stats') {
    return await cmdStats(jsonMode)
  }

  return `## 未知子命令 "\`${first}\`"

${HELP_TEXT}`
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

const memoryBank: Command = {
  type: 'local',
  name: 'memory-bank',
  description: '项目 Memory Bank - 结构化知识管理（上下文/决策/经验/参考）',
  aliases: ['mb', 'membank'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
}

export default memoryBank
