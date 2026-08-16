import type { LocalCommandResult } from '../../commands.js'
import type { ToolUseContext } from '../../Tool.js'
import { readFile } from 'fs/promises'
import { join } from 'path'
import {
  getProjectsDir,
  listCandidates,
  readSessionLite,
  parseSessionInfoFromLite,
} from '../../utils/listSessionsImpl.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReplayOptions {
  sessionId: string | null
  limit: number
}

interface Turn {
  index: number
  role: 'user' | 'assistant' | 'tool_result' | 'summary'
  summary: string
  tools: string[]
  durationMs: number | null
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(args: string): ReplayOptions {
  const parts = args.trim().split(/\s+/).filter(Boolean)
  const opts: ReplayOptions = {
    sessionId: null,
    limit: 50,
  }

  let i = 0
  while (i < parts.length) {
    const p = parts[i]!
    if (p === '--session' && i + 1 < parts.length) {
      opts.sessionId = parts[++i]!
    } else if (p === '--limit' && i + 1 < parts.length) {
      const n = parseInt(parts[++i]!, 10)
      if (!Number.isNaN(n) && n > 0) opts.limit = n
    }
    i++
  }

  return opts
}

// ---------------------------------------------------------------------------
// JSONL scanning — read head+tail, no full load
// ---------------------------------------------------------------------------

async function readSessionHeadTail(
  filePath: string,
  maxLines = 500,
): Promise<{ entries: Array<Record<string, unknown>>; truncated: boolean }> {
  const buf = Buffer.allocUnsafe(256 * 1024)
  const { open } = await import('fs/promises')
  const fd = await open(filePath, 'r')

  try {
    const stat = await fd.stat()
    const fileSize = stat.size

    const headSize = Math.min(128 * 1024, fileSize)
    const tailSize = Math.min(128 * 1024, fileSize - headSize)
    const tailOffset = fileSize - tailSize

    const headBuf = Buffer.allocUnsafe(headSize)
    const tailBuf = Buffer.allocUnsafe(tailSize)

    await fd.read(headBuf, 0, headSize, 0)
    if (tailOffset > 0) {
      await fd.read(tailBuf, 0, tailSize, tailOffset)
    }

    const combined = headBuf.toString('utf8') + '\n' + tailBuf.toString('utf8')
    const lines = combined.split('\n').filter(l => l.trim().length > 0)

    const seen = new Set<string>()
    const entries: Array<Record<string, unknown>> = []
    for (const line of lines) {
      const key = line.slice(0, 64)
      if (!seen.has(key)) {
        seen.add(key)
        entries.push(JSON.parse(line) as Record<string, unknown>)
      }
    }

    const truncated = entries.length >= maxLines
    return { entries: entries.slice(0, maxLines), truncated }
  } finally {
    await fd.close()
  }
}

// ---------------------------------------------------------------------------
// Turn extraction
// ---------------------------------------------------------------------------

function extractTurns(entries: Array<Record<string, unknown>>): Turn[] {
  const turns: Turn[] = []

  for (const entry of entries) {
    const type = entry.type as string | undefined
    if (!type) continue

    if (type === 'system' || type === 'meta') continue
    if (type === 'tool_result' || type === 'tool_use') continue

    if (type === 'user') {
      const rec = entry as Record<string, unknown>
      const message = rec.message as Record<string, unknown> | undefined
      const content = message?.content as Array<Record<string, unknown>> | string | undefined
      const text = extractText(content)

      turns.push({
        index: turns.length,
        role: 'user',
        summary: text ? text.slice(0, 120) + (text.length > 120 ? '...' : '') : '(空消息)',
        tools: [],
        durationMs: null,
      })
    } else if (type === 'assistant') {
      const rec = entry as Record<string, unknown>
      const message = rec.message as Record<string, unknown> | undefined
      const content = message?.content as Array<Record<string, unknown>> | string | undefined
      const text = extractText(content)
      const toolUses = extractToolUses(content)

      turns.push({
        index: turns.length,
        role: 'assistant',
        summary: text ? text.slice(0, 120) + (text.length > 120 ? '...' : '') : toolUses.length > 0 ? `(调用 ${toolUses.length} 个工具)` : '(空回复)',
        tools: toolUses,
        durationMs: null,
      })
    } else if (type === 'summary') {
      turns.push({
        index: turns.length,
        role: 'summary',
        summary: (entry.summary as string)?.slice(0, 120) ?? '(无摘要)',
        tools: [],
        durationMs: null,
      })
    }
  }

  return turns
}

function extractText(
  content: Array<Record<string, unknown>> | string | undefined,
): string | null {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return null
  const parts: string[] = []
  for (const block of content) {
    if (block.type === 'text' && typeof block.text === 'string') {
      parts.push(block.text)
    }
  }
  return parts.length > 0 ? parts.join(' ').trim() : null
}

function extractToolUses(
  content: Array<Record<string, unknown>> | string | undefined,
): string[] {
  if (!Array.isArray(content)) return []
  const tools: string[] = []
  for (const block of content) {
    if (block.type === 'tool_use' && typeof block.name === 'string') {
      tools.push(block.name)
    }
  }
  return tools
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatTurns(turns: Turn[], sessionId: string, filePath: string): string {
  const lines: string[] = []

  lines.push(`🔄 会话重放: ${sessionId.slice(0, 12)}`)
  lines.push(`   文件: ${filePath}`)
  lines.push(`   轮次: ${turns.length} 条`)
  lines.push('')

  for (const turn of turns) {
    const roleIcon = turn.role === 'user' ? '👤' : turn.role === 'assistant' ? '🤖' : '📝'
    const roleLabel = turn.role === 'user' ? '用户' : turn.role === 'assistant' ? '助手' : '摘要'

    lines.push(`${roleIcon} [${turn.index + 1}] ${roleLabel}: ${turn.summary}`)

    if (turn.tools.length > 0) {
      lines.push(`     🔧 工具: ${turn.tools.join(', ')}`)
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

  let targetPath: string | null = null
  let targetId = opts.sessionId

  if (opts.sessionId) {
    const projectsDir = getProjectsDir()
    const candidates = await listCandidates(projectsDir, true)
    const found = candidates.find(c => c.sessionId === opts.sessionId || c.sessionId.startsWith(opts.sessionId!))
    if (found) {
      targetPath = found.filePath
      targetId = found.sessionId
    }
  } else {
    const projectsDir = getProjectsDir()
    const candidates = await listCandidates(projectsDir, true)
    candidates.sort((a, b) => b.mtime - a.mtime)
    if (candidates.length > 0) {
      targetPath = candidates[0]!.filePath
      targetId = candidates[0]!.sessionId
    }
  }

  if (!targetPath) {
    return {
      type: 'text',
      value: opts.sessionId
        ? `未找到会话: ${opts.sessionId}`
        : '未找到任何历史会话。\n\n会话存储目录: ' + join(getClaudeConfigHomeDir(), 'projects'),
    }
  }

  let entries: Array<Record<string, unknown>>
  try {
    const result = await readSessionHeadTail(targetPath, opts.limit * 3)
    entries = result.entries
  } catch (e) {
    return {
      type: 'text',
      value: `❌ 无法读取会话文件: ${targetPath}\n   ${e instanceof Error ? e.message : String(e)}`,
    }
  }

  if (entries.length === 0) {
    return {
      type: 'text',
      value: `会话为空: ${targetId}`,
    }
  }

  const turns = extractTurns(entries).slice(-opts.limit)
  const output = formatTurns(turns, targetId, targetPath)

  return {
    type: 'text',
    value: output,
  }
}
