/**
 * reviewReport.ts — 结构化代码审查报告生成器
 *
 * 功能：将 AI 审查结果组织为按严重级别分类的结构化报告，
 * 支持文本和 JSON 两种输出格式。
 */

import type { ReviewComment } from './lineMapper.js'

// ============================================================================
// Types
// ============================================================================

export interface ReviewReport {
  /** 审查摘要 */
  summary: ReportSummary
  /** 按严重级别分组的评论 */
  comments: {
    errors: ReviewComment[]
    warnings: ReviewComment[]
    info: ReviewComment[]
  }
  /** 按文件分组的评论 */
  commentsByFile: Map<string, ReviewComment[]>
  /** 未映射行号的警告 */
  unmappedWarnings: string[]
}

export interface ReportSummary {
  /** 总评论数 */
  totalComments: number
  /** 错误数量 */
  errorCount: number
  /** 警告数量 */
  warningCount: number
  /** 信息数量 */
  infoCount: number
  /** 涉及文件数 */
  filesAffected: number
  /** 审查是否通过（无 error 级别评论） */
  passed: boolean
}

export interface ReviewReportOptions {
  /** 是否显示上下文代码 */
  showContext?: boolean
  /** 每个评论显示的上下文行数 */
  contextLines?: number
  /** 过滤最低严重级别（低于此级别的评论不显示） */
  minSeverity?: 'error' | 'warning' | 'info'
  /** 最大展示文件数 */
  maxFiles?: number
}

// ============================================================================
// Report Builder
// ============================================================================

const SEVERITY_ORDER: Record<ReviewComment['severity'], number> = {
  error: 0,
  warning: 1,
  info: 2,
}

/**
 * 根据审查评论构建结构化报告。
 */
export function buildReviewReport(
  comments: ReviewComment[],
  unmappedWarnings: string[] = [],
  options: ReviewReportOptions = {},
): ReviewReport {
  const {
    showContext = false,
    contextLines = 3,
    minSeverity = 'info',
    maxFiles = 20,
  } = options

  const minSeverityLevel = SEVERITY_ORDER[minSeverity]

  // 过滤并分组
  const filtered = comments.filter(
    c => SEVERITY_ORDER[c.severity] <= minSeverityLevel,
  )

  const errors = filtered.filter(c => c.severity === 'error')
  const warnings = filtered.filter(c => c.severity === 'warning')
  const infoComments = filtered.filter(c => c.severity === 'info')

  const commentsByFile = new Map<string, ReviewComment[]>()
  for (const comment of filtered) {
    const existing = commentsByFile.get(comment.filePath) ?? []
    commentsByFile.set(comment.filePath, [...existing, comment])
  }

  const summary: ReportSummary = {
    totalComments: filtered.length,
    errorCount: errors.length,
    warningCount: warnings.length,
    infoCount: infoComments.length,
    filesAffected: commentsByFile.size,
    passed: errors.length === 0,
  }

  return {
    summary,
    comments: { errors, warnings, info: infoComments },
    commentsByFile,
    unmappedWarnings,
  }
}

// ============================================================================
// Formatters
// ============================================================================

/**
 * 将报告格式化为可读文本。
 */
export function formatReviewReport(
  report: ReviewReport,
  options: ReviewReportOptions = {},
): string {
  const lines: string[] = []
  const { showContext = false, contextLines = 3, maxFiles = 20 } = options

  // 摘要
  lines.push(' 代码审查报告')
  lines.push('─'.repeat(50))
  lines.push(`  文件数: ${report.summary.filesAffected}`)
  lines.push(`  错误: ${report.summary.errorCount}  |  警告: ${report.summary.warningCount}  |  信息: ${report.summary.infoCount}`)
  lines.push(`  总计: ${report.summary.totalComments} 条评论`)
  lines.push(
    `  结果: ${report.summary.passed ? ' 通过' : ' 未通过（存在错误级别问题）'}`,
  )
  lines.push('')

  // 按严重级别展示
  const { errors, warnings, info: infoComments } = report.comments

  if (errors.length > 0) {
    lines.push(' 错误:')
    formatComments(lines, errors, 'error', showContext, contextLines)
    lines.push('')
  }

  if (warnings.length > 0) {
    lines.push('  警告:')
    formatComments(lines, warnings, 'warning', showContext, contextLines)
    lines.push('')
  }

  if (infoComments.length > 0) {
    lines.push('ℹ  建议:')
    formatComments(lines, infoComments, 'info', showContext, contextLines)
    lines.push('')
  }

  // 未映射警告
  if (report.unmappedWarnings.length > 0) {
    lines.push('  行号映射警告:')
    report.unmappedWarnings.forEach(w => {
      lines.push(`  ${w}`)
    })
    lines.push('')
  }

  return lines.join('\n')
}

function formatComments(
  lines: string[],
  comments: ReviewComment[],
  severity: ReviewComment['severity'],
  showContext: boolean,
  contextLines: number,
): void {
  comments.forEach((comment, index) => {
    lines.push(
      `  [${index + 1}] ${comment.filePath}:${comment.lineNumber} [${comment.category}]`,
    )
    lines.push(`       ${comment.content}`)
  })
}

/**
 * 将报告序列化为 JSON。
 */
export function serializeReport(report: ReviewReport): string {
  return JSON.stringify(
    {
      summary: report.summary,
      comments: {
        errors: report.comments.errors,
        warnings: report.comments.warnings,
        info: report.comments.info,
      },
      commentsByFile: Array.from(report.commentsByFile.entries()).map(
        ([file, comments]) => ({
          file,
          comments: comments.map(c => ({
            lineNumber: c.lineNumber,
            oldLineNumber: c.oldLineNumber,
            content: c.content,
            severity: c.severity,
            category: c.category,
          })),
        }),
      ),
      unmappedWarnings: report.unmappedWarnings,
    },
    null,
    2,
  )
}

/**
 * 生成审查结果摘要字符串（用于 CLI 输出）。
 */
export function summarizeReport(report: ReviewReport): string {
  const { summary } = report

  if (summary.totalComments === 0) {
    return ' 未发现问题'
  }

  const parts: string[] = []
  parts.push(
    `发现 ${summary.totalComments} 个问题 (错误 ${summary.errorCount}, 警告 ${summary.warningCount}, 建议 ${summary.infoCount})`,
  )

  if (summary.errorCount > 0) {
    parts.push(` ${summary.errorCount} 个错误需要修复`)
  }
  if (summary.warningCount > 0) {
    parts.push(`  ${summary.warningCount} 个警告建议处理`)
  }
  if (summary.infoCount > 0) {
    parts.push(`ℹ  ${summary.infoCount} 个改进建议`)
  }

  return parts.join('\n')
}
