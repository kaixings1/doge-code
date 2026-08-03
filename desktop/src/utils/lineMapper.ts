/**
 * lineMapper.ts — 将 diff 行号映射到代码审查评论位置
 *
 * 功能：基于 ParsedDiff 的 hunk 信息，将 AI 审查返回的评论（引用变更行）
 * 映射到新文件中的实际行号，生成内联评论数据。
 */

import type { ParsedDiff, DiffHunk, DiffLine } from './diffParser.js'

// ============================================================================
// Types
// ============================================================================

export interface ReviewComment {
  /** 文件路径 */
  filePath: string
  /** 新文件中的行号（用于内联显示） */
  lineNumber: number
  /** 旧文件中的行号（若有） */
  oldLineNumber: number | null
  /** 评论内容 */
  content: string
  /** 严重级别 */
  severity: 'error' | 'warning' | 'info'
  /** 审查规则/类别 */
  category: string
  /** 原始 diff 行引用 */
  diffReference?: string
}

export interface LineMappingResult {
  /** 按文件分组的评论 */
  commentsByFile: Map<string, ReviewComment[]>
  /** 无法映射的行号警告 */
  unmappedWarnings: string[]
  /** 总评论数 */
  totalComments: number
}

// ============================================================================
// Line Mapping
// ============================================================================

/**
 * 将 AI 审查结果中的行号引用映射到实际文件行号。
 *
 * AI 审查返回的评论可能引用新文件行号或旧文件行号，
 * 此函数根据 diff hunk 信息进行精确映射。
 */
export function mapReviewComments(
  parsed: ParsedDiff,
  aiComments: Array<{
    filePath: string
    lineNumber?: number
    oldLineNumber?: number
    content: string
    severity: 'error' | 'warning' | 'info'
    category: string
  }>,
): LineMappingResult {
  const commentsByFile = new Map<string, ReviewComment[]>()
  const unmappedWarnings: string[] = []

  for (const aiComment of aiComments) {
    const fileHunks = parsed.hunks.get(aiComment.filePath)
    if (!fileHunks || fileHunks.length === 0) {
      unmappedWarnings.push(
        `文件 ${aiComment.filePath} 未在 diff 中找到对应 hunk`,
      )
      continue
    }

    const mappedLine = resolveLineNumber(fileHunks, aiComment)
    if (mappedLine === null) {
      unmappedWarnings.push(
        `无法映射行号: ${aiComment.filePath} (新: ${aiComment.lineNumber}, 旧: ${aiComment.oldLineNumber})`,
      )
      continue
    }

    const comment: ReviewComment = {
      filePath: aiComment.filePath,
      lineNumber: mappedLine.newLineNumber,
      oldLineNumber: mappedLine.oldLineNumber,
      content: aiComment.content,
      severity: aiComment.severity,
      category: aiComment.category,
      diffReference: mappedLine.diffReference,
    }

    const existing = commentsByFile.get(aiComment.filePath) ?? []
    commentsByFile.set(aiComment.filePath, [...existing, comment])
  }

  let totalComments = 0
  for (const comments of commentsByFile.values()) {
    totalComments += comments.length
  }

  return { commentsByFile, unmappedWarnings, totalComments }
}

/**
 * 解析单个评论的行号引用。
 * 返回映射后的新/旧行号，或 null 表示无法映射。
 */
function resolveLineNumber(
  hunks: DiffHunk[],
  aiComment: {
    filePath: string
    lineNumber?: number
    oldLineNumber?: number
  },
): { newLineNumber: number; oldLineNumber: number | null; diffReference: string } | null {
  // 优先使用新文件行号
  const targetNewLine = aiComment.lineNumber
  const targetOldLine = aiComment.oldLineNumber

  for (const hunk of hunks) {
    // 匹配新文件行号
    if (targetNewLine !== undefined) {
      const change = findChangeByNewLine(hunk.changes, targetNewLine)
      if (change) {
        return {
          newLineNumber: change.lineNumber,
          oldLineNumber: change.oldLineNumber,
          diffReference: `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`,
        }
      }
    }

    // 匹配旧文件行号
    if (targetOldLine !== undefined) {
      const change = findChangeByOldLine(hunk.changes, targetOldLine)
      if (change) {
        return {
          newLineNumber: change.lineNumber ?? targetOldLine,
          oldLineNumber: change.oldLineNumber ?? targetOldLine,
          diffReference: `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`,
        }
      }
    }
  }

  return null
}

function findChangeByNewLine(
  changes: DiffLine[],
  targetLine: number,
): DiffLine | null {
  for (const change of changes) {
    if (change.lineNumber === targetLine) {
      return change
    }
  }
  return null
}

function findChangeByOldLine(
  changes: DiffLine[],
  targetLine: number,
): DiffLine | null {
  for (const change of changes) {
    if (change.oldLineNumber === targetLine) {
      return change
    }
  }
  return null
}

/**
 * 获取指定文件在 diff 中的变更上下文（用于展示评论周围的代码）。
 */
export function getChangeContext(
  hunks: DiffHunk[],
  lineNumber: number,
  contextLines = 3,
): string[] {
  const context: string[] = []

  for (const hunk of hunks) {
    const changeIndex = hunk.changes.findIndex(c => c.lineNumber === lineNumber)
    if (changeIndex === -1) continue

    const start = Math.max(0, changeIndex - contextLines)
    const end = Math.min(hunk.changes.length, changeIndex + contextLines + 1)

    for (let i = start; i < end; i++) {
      const change = hunk.changes[i]
      const marker = change.type === 'added' ? '+' : change.type === 'removed' ? '-' : ' '
      const lineNum = change.lineNumber ?? change.oldLineNumber ?? '?'
      context.push(`${marker}${lineNum}: ${change.content}`)
    }
    break
  }

  return context
}
