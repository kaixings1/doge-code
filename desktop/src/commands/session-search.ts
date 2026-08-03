import type { Command, LocalCommandCall, LocalCommandResult } from '../types/command.js'
import { readFile, stat } from 'fs/promises'
import { join } from 'path'
import {
  type Candidate,
  getProjectsDir,
  listCandidates,
  readSessionLite,
  parseSessionInfoFromLite,
} from '../utils/listSessionsImpl.js'
import { getClaudeConfigHomeDir } from '../utils/envUtils.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SearchOptions = {
  keyword: string
  dateFrom: number | null // epoch ms, inclusive
  dateTo: number | null   // epoch ms, inclusive
  limit: number
  projectName: string | null
}

type SearchMatch = {
  sessionId: string
  title: string
  filePath: string
  lastModified: number
  fileSize: number
  projectPath: string | undefined
  matchType: 'title' | 'summary' | 'tag' | 'branch' | 'prompt' | 'content'
  matchSnippet: string
}

// ---------------------------------------------------------------------------
// JSONL content search — read file in chunks, scan for keyword
// ---------------------------------------------------------------------------

/**
 * Search inside a JSONL session file for lines containing the keyword.
 * Returns the first matching snippet (truncated) or null.
 *
 * We read the file in 256KB chunks to avoid loading multi-GB sessions into
 * memory.  Each JSONL line is a self-contained JSON object so partial lines
 * at chunk boundaries are handled by carrying over the trailing fragment.
 */
async function searchJsonlContent(
  filePath: string,
  keywordLower: string,
  buf: Buffer,
): Promise<string | null> {
  let fd: import('fs/promises').FileHandle | null = null
  try {
    const { open } = await import('fs/promises')
    fd = await open(filePath, 'r')
  } catch {
    return null
  }

  const CHUNK = 256 * 1024
  let carry = ''
  let offset = 0

  try {
    while (true) {
      const { bytesRead } = await fd.read(buf, 0, CHUNK, offset)
      if (bytesRead === 0) break
      offset += bytesRead

      const chunk = carry + buf.toString('utf8', 0, bytesRead)
      const lines = chunk.split('\n')
      // Last element is the incomplete line (or empty if chunk ended on \n)
      carry = lines.pop() ?? ''

      for (const line of lines) {
        if (line.length === 0) continue
        // Quick substring check before any JSON parsing
        if (!line.toLowerCase().includes(keywordLower)) continue

        try {
          const entry = JSON.parse(line) as Record<string, unknown>
          const text = extractSearchableText(entry)
          if (text && text.toLowerCase().includes(keywordLower)) {
            const idx = text.toLowerCase().indexOf(keywordLower)
            const start = Math.max(0, idx - 40)
            const end = Math.min(text.length, idx + keywordLower.length + 40)
            const snippet = (start > 0 ? '...' : '') +
              text.slice(start, end).replace(/\s+/g, ' ').trim() +
              (end < text.length ? '...' : '')
            return snippet
          }
        } catch {
          // Skip unparseable lines
        }
      }

      // If carry is very large (no newline in 256KB — huge single line),
      // skip it to prevent unbounded growth
      if (carry.length > CHUNK) {
        carry = carry.slice(-CHUNK)
      }
    }
  } finally {
    await fd.close()
  }

  return null
}

/**
 * Extract human-readable text from a JSONL entry for searching.
 * Returns null if the entry has no searchable text content.
 */
function extractSearchableText(entry: Record<string, unknown>): string | null {
  const type = entry.type as string | undefined

  // User / assistant messages
  if (type === 'user' || type === 'assistant') {
    const message = entry.message as Record<string, unknown> | undefined
    if (!message) return null
    const content = message.content
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      const texts: string[] = []
      for (const block of content as Record<string, unknown>[]) {
        if (block.type === 'text' && typeof block.text === 'string') {
          texts.push(block.text)
        }
      }
      return texts.length > 0 ? texts.join(' ') : null
    }
    return null
  }

  // Summary messages
  if (type === 'summary' && typeof entry.summary === 'string') {
    return entry.summary
  }

  // Custom title
  if (type === 'custom-title' && typeof entry.customTitle === 'string') {
    return entry.customTitle
  }

  // Tag
  if (type === 'tag' && typeof entry.tag === 'string') {
    return entry.tag
  }

  return null
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(args: string): SearchOptions {
  const parts = args.trim().split(/\s+/).filter(Boolean)
  const opts: SearchOptions = {
    keyword: '',
    dateFrom: null,
    dateTo: null,
    limit: 20,
    projectName: null,
  }

  let keywordParts: string[] = []
  let i = 0
  while (i < parts.length) {
    const p = parts[i]!
    if (p === '--date' && i + 1 < parts.length) {
      // --date YYYY-MM-DD or --date YYYY-MM-DD..YYYY-MM-DD
      const range = parts[++i]!
      const dotdot = range.indexOf('..')
      if (dotdot !== -1) {
        const from = Date.parse(range.slice(0, dotdot) + 'T00:00:00Z')
        const to = Date.parse(range.slice(dotdot + 2) + 'T23:59:59Z')
        if (!Number.isNaN(from)) opts.dateFrom = from
        if (!Number.isNaN(to)) opts.dateTo = to
      } else {
        const from = Date.parse(range + 'T00:00:00Z')
        const to = Date.parse(range + 'T23:59:59Z')
        if (!Number.isNaN(from)) opts.dateFrom = from
        if (!Number.isNaN(to)) opts.dateTo = to
      }
    } else if (p === '--limit' && i + 1 < parts.length) {
      const n = parseInt(parts[++i]!, 10)
      if (!Number.isNaN(n) && n > 0) opts.limit = n
    } else if (p === '--project' && i + 1 < parts.length) {
      opts.projectName = parts[++i]!
    } else {
      keywordParts.push(p)
    }
    i++
  }

  opts.keyword = keywordParts.join(' ').trim()
  return opts
}

// ---------------------------------------------------------------------------
// Session enumeration across all projects
// ---------------------------------------------------------------------------

async function gatherAllCandidates(): Promise<Candidate[]> {
  const projectsDir = getProjectsDir()
  let names: string[]
  try {
    names = await (await import('fs/promises')).readdir(projectsDir)
  } catch {
    return []
  }

  const allCandidates: Candidate[] = []
  await Promise.all(
    names.map(async name => {
      const projectPath = join(projectsDir, name)
      try {
        const s = await stat(projectPath)
        if (!s.isDirectory()) return
      } catch {
        return
      }
      const candidates = await listCandidates(projectPath, true)
      // Attach project directory name for display
      for (const c of candidates) {
        c.projectPath = name
      }
      allCandidates.push(...candidates)
    }),
  )

  // Deduplicate by sessionId (prefer newest mtime)
  const byId = new Map<string, Candidate>()
  for (const c of allCandidates) {
    const existing = byId.get(c.sessionId)
    if (!existing || c.mtime > existing.mtime) {
      byId.set(c.sessionId, c)
    }
  }

  return [...byId.values()]
}

// ---------------------------------------------------------------------------
// Search logic
// ---------------------------------------------------------------------------

async function searchSessions(opts: SearchOptions): Promise<SearchMatch[]> {
  const keywordLower = opts.keyword.toLowerCase()
  const results: SearchMatch[] = []
  const buf = Buffer.allocUnsafe(256 * 1024)

  const candidates = await gatherAllCandidates()

  // Sort by mtime desc so we process newest first
  candidates.sort((a, b) => b.mtime - a.mtime)

  for (const candidate of candidates) {
    if (results.length >= opts.limit) break

    // Date range filter
    if (opts.dateFrom !== null && candidate.mtime < opts.dateFrom) continue
    if (opts.dateTo !== null && candidate.mtime > opts.dateTo) continue

    // Project name filter
    if (opts.projectName && candidate.projectPath) {
      const projLower = candidate.projectPath.toLowerCase()
      if (!projLower.includes(opts.projectName.toLowerCase())) continue
    }

    // Read lite metadata (head + tail, cheap)
    const lite = await readSessionLite(candidate.filePath)
    if (!lite) continue

    const info = parseSessionInfoFromLite(candidate.sessionId, lite, candidate.projectPath)
    if (!info) continue

    const title = info.customTitle || info.summary || info.firstPrompt || candidate.sessionId.slice(0, 8)

    // Metadata-level matching (no need to scan full file)
    if (keywordLower === '') {
      // No keyword — list recent sessions
      results.push({
        sessionId: candidate.sessionId,
        title,
        filePath: candidate.filePath,
        lastModified: candidate.mtime,
        fileSize: lite.size,
        projectPath: candidate.projectPath,
        matchType: 'prompt',
        matchSnippet: info.firstPrompt || info.summary || '',
      })
      continue
    }

    // Check title / customTitle
    if (info.customTitle?.toLowerCase().includes(keywordLower)) {
      results.push({
        sessionId: candidate.sessionId,
        title,
        filePath: candidate.filePath,
        lastModified: candidate.mtime,
        fileSize: lite.size,
        projectPath: candidate.projectPath,
        matchType: 'title',
        matchSnippet: info.customTitle,
      })
      continue
    }

    // Check summary
    // summary may come from customTitle or lastPrompt tail field — check raw text
    if (info.summary?.toLowerCase().includes(keywordLower)) {
      results.push({
        sessionId: candidate.sessionId,
        title,
        filePath: candidate.filePath,
        lastModified: candidate.mtime,
        fileSize: lite.size,
        projectPath: candidate.projectPath,
        matchType: 'summary',
        matchSnippet: info.summary,
      })
      continue
    }

    // Check tag
    if (info.tag?.toLowerCase().includes(keywordLower)) {
      results.push({
        sessionId: candidate.sessionId,
        title,
        filePath: candidate.filePath,
        lastModified: candidate.mtime,
        fileSize: lite.size,
        projectPath: candidate.projectPath,
        matchType: 'tag',
        matchSnippet: info.tag,
      })
      continue
    }

    // Check branch
    if (info.gitBranch?.toLowerCase().includes(keywordLower)) {
      results.push({
        sessionId: candidate.sessionId,
        title,
        filePath: candidate.filePath,
        lastModified: candidate.mtime,
        fileSize: lite.size,
        projectPath: candidate.projectPath,
        matchType: 'branch',
        matchSnippet: info.gitBranch,
      })
      continue
    }

    // Check first prompt
    if (info.firstPrompt?.toLowerCase().includes(keywordLower)) {
      results.push({
        sessionId: candidate.sessionId,
        title,
        filePath: candidate.filePath,
        lastModified: candidate.mtime,
        fileSize: lite.size,
        projectPath: candidate.projectPath,
        matchType: 'prompt',
        matchSnippet: info.firstPrompt,
      })
      continue
    }

    // Full content scan (expensive — last resort)
    const snippet = await searchJsonlContent(candidate.filePath, keywordLower, buf)
    if (snippet) {
      results.push({
        sessionId: candidate.sessionId,
        title,
        filePath: candidate.filePath,
        lastModified: candidate.mtime,
        fileSize: lite.size,
        projectPath: candidate.projectPath,
        matchType: 'content',
        matchSnippet: snippet,
      })
    }
  }

  return results
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatMatchType(matchType: SearchMatch['matchType']): string {
  switch (matchType) {
    case 'title': return '标题'
    case 'summary': return '摘要'
    case 'tag': return '标签'
    case 'branch': return '分支'
    case 'prompt': return '提示'
    case 'content': return '内容'
  }
}

function formatResults(matches: SearchMatch[], opts: SearchOptions): string {
  if (matches.length === 0) {
    if (opts.keyword === '') {
      return [
        '未找到任何会话。',
        '',
        `会话存储目录: ${join(getClaudeConfigHomeDir(), 'projects')}`,
        '使用 /session-search <关键词> 搜索会话内容。',
      ].join('\n')
    }
    return `未找到包含 "${opts.keyword}" 的会话。`
  }

  const lines: string[] = []

  if (opts.keyword !== '') {
    lines.push(`搜索结果 — "${opts.keyword}" (${matches.length} 个匹配)`)
  } else {
    lines.push(`最近会话 (${matches.length} 个)`)
  }
  lines.push('')

  for (const m of matches) {
    const date = new Date(m.lastModified).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    const projectLabel = m.projectPath ? `[${m.projectPath}] ` : ''
    const sizeLabel = m.fileSize > 1024 * 1024
      ? `${(m.fileSize / 1024 / 1024).toFixed(1)}MB`
      : `${(m.fileSize / 1024).toFixed(0)}KB`

    lines.push(`  ${projectLabel}${m.title}`)
    lines.push(`    ID: ${m.sessionId.slice(0, 8)} | ${date} | ${sizeLabel} | 匹配: ${formatMatchType(m.matchType)}`)
    if (m.matchSnippet) {
      lines.push(`    "${m.matchSnippet.slice(0, 120)}"`)
    }
  }

  lines.push('')
  lines.push(`共 ${matches.length} 个结果`)

  if (opts.keyword !== '') {
    lines.push('')
    lines.push('提示: 使用 --date YYYY-MM-DD 按日期过滤，--limit N 限制结果数，--project NAME 按项目过滤')
  }

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Command implementation
// ---------------------------------------------------------------------------

const call: LocalCommandCall = async (args: string): Promise<LocalCommandResult> => {
  const opts = parseArgs(args)

  if (opts.keyword === '') {
    // No keyword — show recent sessions with help hint
    const matches = await searchSessions(opts)
    return {
      type: 'text',
      value: [
        '用法: /session-search <关键词> [选项]',
        '',
        '选项:',
        '  --date YYYY-MM-DD          按日期过滤（单天）',
        '  --date YYYY-MM-DD..YYYY-MM-DD  按日期范围过滤',
        '  --project NAME            按项目名称过滤',
        '  --limit N                 最大结果数（默认 20）',
        '',
        '示例:',
        '  /session-search "error handling"',
        '  /session-search bug --date 2026-08-01 --limit 10',
        '  /session-search "API" --project my-app',
        '  /session-search --date 2026-07-15..2026-08-01',
        '',
        formatResults(matches, opts),
      ].join('\n'),
    }
  }

  const matches = await searchSessions(opts)
  return {
    type: 'text',
    value: formatResults(matches, opts),
  }
}

const sessionSearch: Command = {
  type: 'local',
  name: 'session-search',
  description: '按内容关键词搜索历史会话（支持标题/摘要/标签/分支/消息内容）',
  aliases: ['ss', 'session-s'],
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
}

export default sessionSearch
