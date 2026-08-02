/**
 * diffParser.ts — Git diff 行范围解析器
 *
 * 功能：解析 `git diff` 输出，提取每段的文件路径、旧/新行号范围，
 * 生成可用于 AI 审查的上下文块。
 *
 * 支持格式：
 *   - Unified diff（`git diff` 默认格式）
 *   - 包含 `--- a/` 和 `+++ b/` 头的标准 diff
 */

export interface DiffHunk {
  /** 原始 diff 文本 */
  raw: string
  /** 旧文件路径 */
  oldPath: string | null
  /** 新文件路径 */
  newPath: string | null
  /** 旧文件起始行号 */
  oldStart: number
  /** 旧文件变更行数 */
  oldCount: number
  /** 新文件起始行号 */
  newStart: number
  /** 新文件变更行数 */
  newCount: number
  /** 变更行列表（含 +/- 前缀和行号） */
  changes: DiffLine[]
}

export interface DiffLine {
  /** 行号（新文件视角） */
  lineNumber: number
  /** 旧文件行号（若有） */
  oldLineNumber: number | null
  /** 行内容（不含 +/- 前缀） */
  content: string
  /** 变更类型：added / removed / context */
  type: 'added' | 'removed' | 'context'
}

export interface ParsedDiff {
  /** 文件路径 → 该文件的所有 hunk */
  hunks: Map<string, DiffHunk[]>
  /** 是否包含二进制文件变更 */
  hasBinaryChanges: boolean
  /** 变更文件总数 */
  fileCount: number
}

// ============================================================================
// 解析入口
// ============================================================================

/**
 * 解析 git diff 输出。
 * @param diffText git diff 原始文本
 */
export function parseDiff(diffText: string): ParsedDiff {
  const hunks = new Map<string, DiffHunk[]>()
  let hasBinaryChanges = false
  const seenFiles = new Set<string>()

  // 分割为文件块
  const fileBlocks = splitFileBlocks(diffText)

  for (const block of fileBlocks) {
    if (block.startsWith('Binary files')) {
      hasBinaryChanges = true
      continue
    }

    const fileHeader = parseFileHeader(block)
    if (!fileHeader) continue

    const { oldPath, newPath, normalizedPath } = fileHeader
    seenFiles.add(normalizedPath)

    const fileHunks = parseHunks(block, oldPath, newPath)
    const existing = hunks.get(normalizedPath) ?? []
    hunks.set(normalizedPath, [...existing, ...fileHunks])
  }

  return {
    hunks,
    hasBinaryChanges,
    fileCount: seenFiles.size,
  }
}

// ============================================================================
// 文件块分割
// ============================================================================

function splitFileBlocks(diffText: string): string[] {
  const blocks: string[] = []
  const lines = diffText.split('\n')
  let currentBlock: string[] = []

  for (const line of lines) {
    // 新文件块开始
    if (line.startsWith('diff --git')) {
      if (currentBlock.length > 0) {
        blocks.push(currentBlock.join('\n'))
        currentBlock = []
      }
    }
    currentBlock.push(line)
  }

  if (currentBlock.length > 0) {
    blocks.push(currentBlock.join('\n'))
  }

  return blocks
}

// ============================================================================
// 文件头解析
// ============================================================================

interface FileHeader {
  oldPath: string | null
  newPath: string | null
  normalizedPath: string
}

function parseFileHeader(block: string): FileHeader | null {
  const lines = block.split('\n')
  let oldPath: string | null = null
  let newPath: string | null = null

  for (const line of lines) {
    if (line.startsWith('--- ')) {
      oldPath = line.slice(4).replace(/^a\//, '')
    }
    if (line.startsWith('+++ ')) {
      newPath = line.slice(4).replace(/^b\//, '')
    }
  }

  // 新文件路径优先（若文件被重命名/删除，newPath 可能为 /dev/null）
  const normalizedPath = newPath && newPath !== '/dev/null' ? newPath : (oldPath ?? 'unknown')

  if (!oldPath && !newPath) return null

  return { oldPath, newPath, normalizedPath }
}

// ============================================================================
// Hunk 解析
// ============================================================================

function parseHunks(block: string, oldPath: string | null, newPath: string | null): DiffHunk[] {
  const lines = block.split('\n')
  const hunks: DiffHunk[] = []
  let currentHunk: DiffHunk | null = null
  let currentChanges: DiffLine[] = []
  let newLineNum = 0
  let oldLineNum = 0

  for (const line of lines) {
    // Hunk 头：@@ -oldStart,oldCount +newStart,newCount @@
    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
    if (hunkMatch) {
      // 保存上一个 hunk
      if (currentHunk) {
        currentHunk.changes = currentChanges
        hunks.push(currentHunk)
      }

      const oldStart = parseInt(hunkMatch[1]!, 10)
      const oldCount = parseInt(hunkMatch[2] ?? '1', 10)
      const newStart = parseInt(hunkMatch[3]!, 10)
      const newCount = parseInt(hunkMatch[4] ?? '1', 10)

      currentHunk = {
        raw: '',
        oldPath,
        newPath,
        oldStart,
        oldCount,
        newStart,
        newCount,
        changes: [],
      }
      currentChanges = []
      newLineNum = newStart
      oldLineNum = oldStart
      continue
    }

    // 收集 hunk 原始文本
    if (currentHunk) {
      currentHunk.raw += (currentHunk.raw ? '\n' : '') + line
    }

    // 变更行
    if (line.startsWith('+') && !line.startsWith('+++')) {
      currentChanges.push({
        lineNumber: newLineNum++,
        oldLineNumber: null,
        content: line.slice(1),
        type: 'added',
      })
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      currentChanges.push({
        lineNumber: null,
        oldLineNumber: oldLineNum++,
        content: line.slice(1),
        type: 'removed',
      })
    } else if (line.startsWith(' ')) {
      // Context 行
      currentChanges.push({
        lineNumber: newLineNum++,
        oldLineNumber: oldLineNum++,
        content: line.slice(1),
        type: 'context',
      })
    }
  }

  // 保存最后一个 hunk
  if (currentHunk) {
    currentHunk.changes = currentChanges
    hunks.push(currentHunk)
  }

  return hunks
}

// ============================================================================
// 辅助方法
// ============================================================================

/**
 * 提取指定文件的变更摘要（用于 AI prompt 上下文）。
 */
export function getFileChangeSummary(
  parsed: ParsedDiff,
  filePath: string,
): { addedLines: number; removedLines: number; totalChanges: number; hunks: DiffHunk[] } | null {
  const fileHunks = parsed.hunks.get(filePath)
  if (!fileHunks || fileHunks.length === 0) return null

  let addedLines = 0
  let removedLines = 0

  for (const hunk of fileHunks) {
    for (const change of hunk.changes) {
      if (change.type === 'added') addedLines++
      else if (change.type === 'removed') removedLines++
    }
  }

  return {
    addedLines,
    removedLines,
    totalChanges: addedLines + removedLines,
    hunks: fileHunks,
  }
}

/**
 * 将 diff 格式化为可读文本（用于展示）。
 */
export function formatDiffForDisplay(parsed: ParsedDiff, maxFiles = 20): string {
  const lines: string[] = []
  let fileCount = 0

  for (const [filePath, hunks] of parsed.hunks) {
    if (fileCount >= maxFiles) {
      lines.push(`... 还有 ${parsed.hunks.size - maxFiles} 个文件未显示`)
      break
    }
    fileCount++
    lines.push(`📄 ${filePath}`)

    for (const hunk of hunks) {
      lines.push(`  @@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`)
      for (const change of hunk.changes) {
        const prefix = change.type === 'added' ? '+' : change.type === 'removed' ? '-' : ' '
        const lineNum = change.lineNumber ?? change.oldLineNumber ?? '?'
        lines.push(`  ${prefix}${lineNum}: ${change.content}`)
      }
    }
    lines.push('')
  }

  return lines.join('\n')
}
