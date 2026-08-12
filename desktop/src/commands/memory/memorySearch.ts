/**
 * Memory Search / Stats / Export — local (non-JSX) subcommands.
 *
 * Provides:
 *   /memory search <关键词>  — 跨会话搜索记忆内容
 *   /memory stats            — 显示记忆统计
 *   /memory export <file>    — 导出所有记忆到 JSON 文件
 *
 * Implemented as a `local` command (not local-jsx) because all
 * output is plain text — no React UI needed.
 */

import { writeFileSync, statSync } from 'fs'
import { getMemoryFiles } from '../../utils/claudemd.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'
import { logError } from '../../utils/log.js'
import type { LocalCommandResult } from '../../types/command.js'
import type { ToolUseContext } from '../../Tool.js'

// ============================================================================
// Types
// ============================================================================

type Subcommand = 'search' | 'stats' | 'export'

interface SearchMatch {
  path: string
  type: string
  lineNumber: number
  line: string
  context: string
}

interface MemoryStats {
  totalFiles: number
  totalSize: number
  totalContentLength: number
  lastModified: number | null
  filesByType: Record<string, number>
  files: Array<{
    path: string
    type: string
    size: number
    mtime: number
    contentLength: number
  }>
}

// ============================================================================
// Search
// ============================================================================

async function searchMemory(
  query: string,
): Promise<LocalCommandResult> {
  if (!query.trim()) {
    return {
      type: 'text',
      value: '📖 用法: /memory search <关键词>\n示例：/memory search TypeScript 编码规范',
    }
  }

  try {
    const files = await getMemoryFiles(true)
    const matches: SearchMatch[] = []
    const lowerQuery = query.toLowerCase()

    for (const file of files) {
      const lines = file.content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(lowerQuery)) {
          // Context: 1 line before and after
          const start = Math.max(0, i - 1)
          const end = Math.min(lines.length - 1, i + 1)
          const context = lines
            .slice(start, end + 1)
            .map((line, idx) => {
              const lineNum = start + idx + 1
              const marker = lineNum === i + 1 ? ' >> ' : '    '
              return `${marker}${String(lineNum).padStart(4)} | ${line}`
            })
            .join('\n')

          matches.push({
            path: file.path,
            type: file.type,
            lineNumber: i + 1,
            line: lines[i].trim(),
            context,
          })
        }
      }
    }

    if (matches.length === 0) {
      return {
        type: 'text',
        value: `未找到包含 "${query}" 的记忆条目。\n\n搜索范围：${files.length} 个记忆文件\n提示：尝试使用更短的关键词或检查拼写。`,
      }
    }

    // Group matches by file
    const grouped = new Map<string, SearchMatch[]>()
    for (const m of matches) {
      const existing = grouped.get(m.path) || []
      existing.push(m)
      grouped.set(m.path, existing)
    }

    const parts: string[] = []
    parts.push(
      `找到 ${matches.length} 条匹配（跨 ${grouped.size} 个文件，关键词："${query}"）：\n`,
    )

    for (const [filePath, fileMatches] of grouped) {
      parts.push(`\n--- ${filePath} (${fileMatches[0].type}) ---`)
      for (const m of fileMatches) {
        parts.push(`  ${String(m.lineNumber).padStart(4)} | ${m.line}`)
      }
    }

    return {
      type: 'text',
      value: parts.join('\n'),
    }
  } catch (error) {
    logError(error)
    return {
      type: 'text',
      value: `搜索失败：${error}`,
    }
  }
}

// ============================================================================
// Stats
// ============================================================================

async function getMemoryStats(): Promise<MemoryStats> {
  const files = await getMemoryFiles(true)
  const result: MemoryStats = {
    totalFiles: files.length,
    totalSize: 0,
    totalContentLength: 0,
    lastModified: null,
    filesByType: {},
    files: [],
  }

  for (const file of files) {
    result.filesByType[file.type] = (result.filesByType[file.type] || 0) + 1
    result.totalContentLength += file.content.length

    let size = 0
    let mtime = 0
    try {
      const stat = statSync(file.path)
      size = stat.size
      mtime = stat.mtimeMs
    } catch {
      // File may not exist on disk (e.g., virtual files)
      size = Buffer.byteLength(file.content, 'utf-8')
      mtime = 0
    }

    result.totalSize += size
    if (mtime > (result.lastModified || 0)) {
      result.lastModified = mtime
    }

    result.files.push({
      path: file.path,
      type: file.type,
      size,
      mtime,
      contentLength: file.content.length,
    })
  }

  // Sort by content length descending
  result.files.sort((a, b) => b.contentLength - a.contentLength)

  return result
}

async function statsMemory(): Promise<LocalCommandResult> {
  try {
    const stats = await getMemoryStats()

    if (stats.totalFiles === 0) {
      return {
        type: 'text',
        value: '未找到任何记忆文件。\n\n记忆文件位置：\n  - 用户级：~/.doge/CLAUDE.md\n  - 项目级：项目根目录下的 CLAUDE.md\n  - 规则级：.claude/rules/*.md',
      }
    }

    const parts: string[] = []
    parts.push(`记忆统计摘要`)
    parts.push(`${'='.repeat(40)}`)
    parts.push(`文件总数：  ${stats.totalFiles}`)
    parts.push(`总大小：    ${formatBytes(stats.totalSize)}`)
    parts.push(`内容字符：  ${stats.totalContentLength.toLocaleString()}`)

    if (stats.lastModified) {
      parts.push(
        `最后更新：  ${formatTimestamp(stats.lastModified)}`,
      )
    }

    parts.push('')
    parts.push('按类型分布：')
    for (const [type, count] of Object.entries(stats.filesByType)) {
      const typeLabel = getTypeLabel(type)
      parts.push(`  ${typeLabel}: ${count} 个文件`)
    }

    parts.push('')
    parts.push('文件详情（按内容大小排序）：')
    parts.push('-'.repeat(60))
    parts.push(
      `${'路径'.padEnd(45)} ${'类型'.padEnd(10)} ${'大小'.padEnd(10)} ${'字符数'}`,
    )
    parts.push('-'.repeat(60))

    for (const f of stats.files) {
      const displayPath =
        f.path.length > 44 ? '...' + f.path.slice(-41) : f.path
      parts.push(
        `${displayPath.padEnd(45)} ${f.type.padEnd(10)} ${formatBytes(f.size).padEnd(10)} ${f.contentLength.toLocaleString()}`,
      )
    }

    return {
      type: 'text',
      value: parts.join('\n'),
    }
  } catch (error) {
    logError(error)
    return {
      type: 'text',
      value: `获取统计失败：${error}`,
    }
  }
}

// ============================================================================
// Export
// ============================================================================

async function exportMemory(
  outputPath: string,
): Promise<LocalCommandResult> {
  if (!outputPath.trim()) {
    return {
      type: 'text',
      value: '📖 用法: /memory export <输出文件路径>\n示例：/memory export ./memories-backup.json',
    }
  }

  try {
    const files = await getMemoryFiles(true)

    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      memoryDir: getClaudeConfigHomeDir(),
      totalFiles: files.length,
      files: files.map(f => ({
        path: f.path,
        type: f.type,
        content: f.content,
        parent: f.parent || null,
        globs: f.globs || null,
      })),
    }

    writeFileSync(outputPath, JSON.stringify(exportData, null, 2), 'utf-8')

    return {
      type: 'text',
      value: `已导出 ${files.length} 个记忆文件到：${outputPath}\n导出时间：${exportData.exportedAt}`,
    }
  } catch (error) {
    logError(error)
    return {
      type: 'text',
      value: `导出失败：${error}`,
    }
  }
}

// ============================================================================
// Helpers
// ============================================================================

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    User: '用户级',
    Project: '项目级',
    Local: '本地私有',
    Managed: '托管级',
    AutoMem: '自动记忆',
    TeamMem: '团队记忆',
  }
  return labels[type] || type
}

// ============================================================================
// Main dispatcher
// ============================================================================

/**
 * Parse the first token from args as the subcommand, return [subcommand, rest].
 */
function parseSubcommand(args: string): [Subcommand | null, string] {
  const trimmed = args.trim()
  if (!trimmed) {
    return [null, '']
  }

  const spaceIdx = trimmed.indexOf(' ')
  if (spaceIdx === -1) {
    return [trimmed as Subcommand, '']
  }

  const subcmd = trimmed.slice(0, spaceIdx) as Subcommand
  const rest = trimmed.slice(spaceIdx + 1).trim()
  return [subcmd, rest]
}

export const call = async (
  args: string,
  _context: ToolUseContext,
): Promise<LocalCommandResult> => {
  const [subcmd, rest] = parseSubcommand(args)

  switch (subcmd) {
    case 'search':
      return searchMemory(rest)
    case 'stats':
      return statsMemory()
    case 'export':
      return exportMemory(rest)
    default:
      return {
        type: 'text',
        value: [
          '记忆管理工具',
          '',
          '📖 用法: ',
          '  /memory              打开记忆文件编辑器（原有功能）',
          '  /memory search <关键词>   跨会话搜索记忆内容',
          '  /memory stats             显示记忆统计信息',
          '  /memory export <文件路径> 导出所有记忆到 JSON 文件',
          '',
          '💡 示例: ',
          '  /memory search TypeScript',
          '  /memory stats',
          '  /memory export ./my-memories.json',
        ].join('\n'),
      }
  }
}
