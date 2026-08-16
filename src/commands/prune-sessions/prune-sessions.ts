import type { LocalCommandResult } from '../../commands.js'
import type { ToolUseContext } from '../../Tool.js'
import { getProjectsDir } from '../../utils/listSessionsImpl.js'
import { stat, unlink, readdir } from 'fs/promises'
import { join, basename } from 'path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PruneOptions {
  olderThanDays: number
  dryRun: boolean
  force: boolean
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(args: string): PruneOptions {
  const parts = args.trim().split(/\s+/).filter(Boolean)
  const opts: PruneOptions = {
    olderThanDays: 30,
    dryRun: false,
    force: false,
  }

  let i = 0
  while (i < parts.length) {
    const p = parts[i]!
    if (p === '--older-than' && i + 1 < parts.length) {
      const n = parseInt(parts[++i]!, 10)
      if (!Number.isNaN(n) && n > 0) opts.olderThanDays = n
    } else if (p === '--dry-run') {
      opts.dryRun = true
    } else if (p === '--force') {
      opts.force = true
    }
    i++
  }

  return opts
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

export async function findOldSessions(
  olderThanDays: number,
): Promise<Array<{ sessionId: string; filePath: string; ageDays: number }>> {
  const projectsDir = getProjectsDir()
  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000
  const oldSessions: Array<{ sessionId: string; filePath: string; ageDays: number }> = []

  // Walk all project subdirectories
  let entries: { name: string; isDirectory: () => boolean }[]
  try {
    entries = await readdir(projectsDir, { withFileTypes: true })
  } catch {
    return oldSessions
  }

  const dirs = entries.filter(e => e.isDirectory()).map(e => e.name)
  if (dirs.length === 0) {
    // Fallback: sessions may be directly in projectsDir
    dirs.push('')
  }

  for (const dir of dirs) {
    const dirPath = dir ? join(projectsDir, dir) : projectsDir
    let files: string[]
    try {
      files = await readdir(dirPath)
    } catch {
      continue
    }

    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue
      const sessionId = file.slice(0, -6)
      const filePath = join(dirPath, file)
      try {
        const s = await stat(filePath)
        const mtime = s.mtime.getTime()
        if (mtime < cutoff) {
          const ageDays = Math.floor((Date.now() - mtime) / (24 * 60 * 60 * 1000))
          oldSessions.push({ sessionId, filePath, ageDays })
        }
      } catch {
        continue
      }
    }
  }

  return oldSessions.sort((a, b) => b.ageDays - a.ageDays)
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatResult(
  oldSessions: Array<{ sessionId: string; filePath: string; ageDays: number }>,
  olderThanDays: number,
  dryRun: boolean,
): string {
  const lines: string[] = []

  lines.push(`🗑️  会话清理: 查找超过 ${olderThanDays} 天的会话`)
  lines.push('')

  if (oldSessions.length === 0) {
    lines.push(`✅ 没有找到超过 ${olderThanDays} 天的过期会话。`)
    return lines.join('\n')
  }

  const action = dryRun ? '将删除' : '已删除'
  lines.push(`找到 ${oldSessions.length} 个过期会话（${action}）:`)
  lines.push('')

  for (const s of oldSessions) {
    const fileName = basename(s.filePath)
    lines.push(`  ${s.sessionId.slice(0, 12)}  ${s.ageDays}天前  ${fileName}`)
  }

  lines.push('')
  if (dryRun) {
    lines.push(`💡 使用 --force 参数执行实际删除（跳过确认）`)
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
  const oldSessions = await findOldSessions(opts.olderThanDays)

  if (oldSessions.length === 0) {
    return {
      type: 'text',
      value: `✅ 没有找到超过 ${opts.olderThanDays} 天的过期会话。`,
    }
  }

  // Dry run: just show what would be deleted
  if (opts.dryRun) {
    return {
      type: 'text',
      value: formatResult(oldSessions, opts.olderThanDays, true),
    }
  }

  // Non-dry-run: confirm then delete
  if (!opts.force) {
    const preview = formatResult(oldSessions, opts.olderThanDays, false)
    return {
      type: 'text',
      value: `${preview}\n\n⚠️  确认删除以上 ${oldSessions.length} 个会话？\n使用 --force 参数跳过此确认并直接删除。`,
    }
  }

  // Force delete
  let deleted = 0
  let failed = 0
  for (const s of oldSessions) {
    try {
      await unlink(s.filePath)
      deleted++
    } catch {
      failed++
    }
  }

  const lines: string[] = []
  lines.push(`🗑️  清理完成:`)
  lines.push(`  ✅ 已删除: ${deleted} 个会话`)
  if (failed > 0) {
    lines.push(`  ❌ 失败: ${failed} 个会话（可能被占用）`)
  }
  lines.push('')

  return {
    type: 'text',
    value: lines.join('\n'),
  }
}
