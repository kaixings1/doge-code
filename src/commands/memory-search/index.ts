import type { Command } from '../../commands.js'
import type { LocalCommandCall } from '../../types/command.js'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join, resolve } from 'path'

// ============================================================================
// Types
// ============================================================================

interface MemoryMatch {
  file: string
  line: number
  content: string
  context: string
}

// ============================================================================
// Memory Search Engine
// ============================================================================

function findMemoryFiles(dir: string, depth = 5): string[] {
  const results: string[] = []
  if (depth <= 0) return results

  try {
    const entries = readdirSync(dir)
    for (const entry of entries) {
      if (entry === 'node_modules' || entry === 'dist' || entry === 'build' || entry.startsWith('.')) continue
      const fullPath = join(dir, entry)
      try {
        const stat = statSync(fullPath)
        if (stat.isDirectory()) {
          results.push(...findMemoryFiles(fullPath, depth - 1))
        } else if (entry === 'CLAUDE.md' || entry === 'CLAUDE.local.md' || entry.endsWith('.md')) {
          results.push(fullPath)
        }
      } catch {
        // skip
      }
    }
  } catch {
    // skip
  }

  return results
}

function searchInFile(filePath: string, keyword: string): MemoryMatch[] {
  const matches: MemoryMatch[] = []
  try {
    const content = readFileSync(filePath, 'utf-8')
    const lines = content.split('\n')
    const keywordLower = keyword.toLowerCase()

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(keywordLower)) {
        // Get context (2 lines before and after)
        const contextStart = Math.max(0, i - 2)
        const contextEnd = Math.min(lines.length, i + 3)
        const context = lines.slice(contextStart, contextEnd).join('\n')

        matches.push({
          file: filePath,
          line: i + 1,
          content: lines[i].trim(),
          context,
        })
      }
    }
  } catch {
    // skip
  }

  return matches
}

function searchGlobalMemories(keyword: string): MemoryMatch[] {
  const matches: MemoryMatch[] = []

  // Search in home directory
  const homeDir = process.env.HOME || process.env.USERPROFILE || ''
  if (homeDir && existsSync(join(homeDir, '.doge'))) {
    const dogeFiles = findMemoryFiles(join(homeDir, '.doge'))
    for (const file of dogeFiles) {
      matches.push(...searchInFile(file, keyword))
    }
  }

  // Search in current project
  const projectFiles = findMemoryFiles(process.cwd())
  for (const file of projectFiles) {
    matches.push(...searchInFile(file, keyword))
  }

  return matches
}

// ============================================================================
// Output Formatters
// ============================================================================

function formatTextReport(matches: MemoryMatch[], keyword: string): string {
  if (matches.length === 0) {
    return `🔍 未找到包含 "${keyword}" 的记忆。`
  }

  const lines: string[] = [`🔍 记忆搜索: "${keyword}"`, `   找到 ${matches.length} 个匹配`, '']

  // Group by file
  const byFile = new Map<string, MemoryMatch[]>()
  for (const match of matches) {
    if (!byFile.has(match.file)) byFile.set(match.file, [])
    byFile.get(match.file)!.push(match)
  }

  for (const [file, fileMatches] of byFile) {
    lines.push(`\n📄 ${file}`)
    for (const match of fileMatches) {
      lines.push(`   第 ${match.line} 行: ${match.content.slice(0, 80)}`)
    }
  }

  return lines.join('\n')
}

// ============================================================================
// Help Text
// ============================================================================

function renderHelp(): string {
  return [
    '🔍 跨会话记忆搜索',
    '',
    '搜索所有 CLAUDE.md 文件中的内容。',
    '',
    '用法:',
    '  /memory-search <关键词>',
    '',
    '选项:',
    '  --json              JSON 格式输出',
    '  --export <file>     导出所有记忆到 JSON 文件',
    '  --help              显示帮助',
    '',
    '示例:',
    '  /memory-search "API设计"',
    '  /memory-search "数据库" --json',
    '  /memory-search --export all-memories.json',
    '',
    '搜索范围:',
    '  - 项目目录下的 CLAUDE.md 文件',
    '  - ~/.doge/ 目录下的记忆文件',
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

  // Export mode
  const exportMatch = s.match(/--export\s+(\S+)/)
  if (exportMatch) {
    const files = findMemoryFiles(process.cwd())
    const allMemories: Array<{ file: string; content: string }> = []
    for (const file of files) {
      try {
        allMemories.push({ file, content: readFileSync(file, 'utf-8') })
      } catch { /* skip */ }
    }
    try {
      const fs = require('fs')
      fs.writeFileSync(exportMatch[1], JSON.stringify(allMemories, null, 2), 'utf-8')
      return { type: 'text', value: `✅ 已导出 ${allMemories.length} 个记忆文件到 ${exportMatch[1]}` }
    } catch (err) {
      return { type: 'text', value: `❌ 导出失败: ${err instanceof Error ? err.message : String(err)}` }
    }
  }

  // Search mode
  const keyword = s.replace('--json', '').trim()
  const json = s.includes('--json')

  if (!keyword) {
    return { type: 'text', value: '❌ 请提供搜索关键词。\n\n' + renderHelp() }
  }

  const matches = searchGlobalMemories(keyword)

  if (json) {
    return { type: 'json', value: JSON.stringify({ keyword, count: matches.length, matches }, null, 2) }
  }

  return { type: 'text', value: formatTextReport(matches, keyword) }
}

// ============================================================================
// Command Registration
// ============================================================================

const memorySearch = {
  type: 'local' as const,
  name: 'memory-search',
  description: '跨会话记忆搜索 - 搜索所有 CLAUDE.md 文件',
  aliases: ['/memory-search', '/mem-search', '/ms'],
  arguments: [
    { name: 'keyword', description: '搜索关键词', required: false },
    { name: '--json', description: 'JSON 格式输出', required: false },
    { name: '--export', description: '导出所有记忆到 JSON 文件', required: false },
    { name: 'help', description: '显示帮助', required: false },
  ],
  supportsNonInteractive: true,
  call: call as unknown as Command['call'],
} satisfies Command

export default memorySearch
