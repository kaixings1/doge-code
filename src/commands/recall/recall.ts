import type { LocalCommandResult } from '../../commands.js'
import type { ToolUseContext } from '../../Tool.js'
import {
  getProjectsDir,
  listCandidates,
  readSessionLite,
  parseSessionInfoFromLite,
} from '../../utils/listSessionsImpl.js'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RecallOptions {
  query: string
  sessionId: string | null
  limit: number
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(args: string): RecallOptions {
  const parts = args.trim().split(/\s+/).filter(Boolean)
  const opts: RecallOptions = {
    query: '',
    sessionId: null,
    limit: 10,
  }

  let i = 0
  while (i < parts.length) {
    const p = parts[i]!
    if (p === '--session' && i + 1 < parts.length) {
      opts.sessionId = parts[++i]!
    } else if (p === '--limit' && i + 1 < parts.length) {
      const n = parseInt(parts[++i]!, 10)
      if (!Number.isNaN(n) && n > 0) opts.limit = n
    } else if (!p.startsWith('--')) {
      opts.query = opts.query ? opts.query + ' ' + p : p
    }
    i++
  }

  return opts
}

// ---------------------------------------------------------------------------
// Search logic
// ---------------------------------------------------------------------------

async function searchSessions(
  query: string,
  sessionId: string | null,
  limit: number,
): Promise<Array<{ sessionId: string; summary: string; snippet: string; filePath: string }>> {
  const projectsDir = getProjectsDir()
  const candidates = await listCandidates(projectsDir, true)
  const queryLower = query.toLowerCase()
  const results: Array<{ sessionId: string; summary: string; snippet: string; filePath: string }> = []

  // If sessionId specified, only search that session
  let filtered = candidates
  if (sessionId) {
    filtered = candidates.filter(c => c.sessionId === sessionId || c.sessionId.startsWith(sessionId))
  }

  // Sort by mtime descending
  filtered.sort((a, b) => b.mtime - a.mtime)

  for (const candidate of filtered.slice(0, limit * 3)) {
    try {
      const lite = await readSessionLite(candidate.filePath)
      const info = parseSessionInfoFromLite(candidate.sessionId, lite, candidate.projectPath)
      if (!info) continue

      // Search in summary/title
      const searchText = (info.summary || '').toLowerCase()
      if (queryLower && !searchText.includes(queryLower)) continue

      // Extract a snippet from the head
      const head = lite.head
      const snippetMatch = extractSnippet(head, queryLower)
      const snippet = snippetMatch || (info.summary || '').slice(0, 120)

      results.push({
        sessionId: candidate.sessionId,
        summary: info.summary || '(无标题)',
        snippet,
        filePath: candidate.filePath,
      })

      if (results.length >= limit) break
    } catch {
      continue
    }
  }

  return results
}

function extractSnippet(head: string, queryLower: string): string {
  const lines = head.split('\n')
  for (const line of lines) {
    if (line.toLowerCase().includes(queryLower)) {
      try {
        const entry = JSON.parse(line) as Record<string, unknown>
        const message = entry.message as Record<string, unknown> | undefined
        const content = message?.content
        if (typeof content === 'string') {
          return content.slice(0, 120)
        }
        if (Array.isArray(content)) {
          const textParts = content.filter((b: Record<string, unknown>) => b.type === 'text' && typeof b.text === 'string') as Array<{ text: string }>
          if (textParts.length > 0) {
            return textParts.map(t => t.text).join(' ').slice(0, 120)
          }
        }
      } catch {
        // skip
      }
    }
  }
  return ''
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatResults(
  results: Array<{ sessionId: string; summary: string; snippet: string; filePath: string }>,
  query: string,
): string {
  const lines: string[] = []

  lines.push(`🔍 回忆搜索: "${query}"`)
  lines.push(`   找到 ${results.length} 条结果`)
  lines.push('')

  for (const r of results) {
    lines.push(`📌 ${r.sessionId.slice(0, 12)}`)
    lines.push(`   标题: ${r.summary}`)
    if (r.snippet) {
      lines.push(`   片段: ${r.snippet}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export const call = async (
  args: string,
  _context: ToolUseContext,
): Promise<LocalCommandResult> => {
  const opts = parseArgs(args)

  if (!opts.query) {
    return {
      type: 'text',
      value: '用法: /recall <关键词> [--session <id>] [--limit N]\n\n示例:\n  /recall react\n  /recall api --session abc-123\n  /recall bug --limit 5',
    }
  }

  try {
    const results = await searchSessions(opts.query, opts.sessionId, opts.limit)

    if (results.length === 0) {
      return {
        type: 'text',
        value: `未找到与 "${opts.query}" 相关的历史对话。\n\n会话存储目录: ${join(getClaudeConfigHomeDir(), 'projects')}`,
      }
    }

    return {
      type: 'text',
      value: formatResults(results, opts.query),
    }
  } catch (err) {
    return {
      type: 'text',
      value: `❌ 搜索失败: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}
