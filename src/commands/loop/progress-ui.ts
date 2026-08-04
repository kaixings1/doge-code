/**
 * Loop Progress UI — 循环引擎进度显示共享模块
 *
 * 提供统一的进度显示格式，包括：
 * - 实时状态行（原地更新，无闪烁）
 * - 颜色编码（成功/失败/警告/信息）
 * - 进度条
 * - 已用时间/预估剩余时间
 * - 文件创建追踪
 */

export interface ProgressState {
  strategy: string
  currentIteration: number
  maxIterations: number
  currentTask: string
  fileCount: number
  startTime: number
  phase: 'idle' | 'planning' | 'executing' | 'verifying' | 'done' | 'error'
}

/**
 * 格式化时间为可读字符串
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const mins = Math.floor(ms / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  return `${mins}m${secs}s`
}

/**
 * 生成进度条字符串
 */
export function progressBar(current: number, total: number, width: number = 20): string {
  if (total <= 0) return '[' + '░'.repeat(width) + ']'
  const filled = Math.round((current / total) * width)
  const empty = width - filled
  return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']'
}

/**
 * 生成实时状态行（单行，用于原地更新）
 */
export function formatStatusLine(state: ProgressState): string {
  const elapsed = Date.now() - state.startTime
  const elapsedStr = formatDuration(elapsed)

  switch (state.phase) {
    case 'idle':
      return `[${state.strategy}] 准备中...`
    case 'planning':
      return `[${state.strategy}] 📋 规划中... | ${elapsedStr}`
    case 'executing': {
      const progress = progressBar(state.currentIteration, state.maxIterations)
      return `[${state.strategy}] ${progress} ${state.currentIteration}/${state.maxIterations} | ${state.currentTask.slice(0, 30)} | ${elapsedStr} | 📁${state.fileCount}`
    }
    case 'verifying':
      return `[${state.strategy}] 🔍 验证结果... | ${elapsedStr}`
    case 'done': {
      const statusIcon = state.fileCount > 0 ? '✅' : '✓'
      return `[${state.strategy}] ${statusIcon} 完成 | ${state.currentIteration}轮 ${elapsedStr} | 📁${state.fileCount}`
    }
    case 'error':
      return `[${state.strategy}] ❌ 错误 | ${elapsedStr}`
    default:
      return `[${state.strategy}] ${elapsedStr}`
  }
}

/**
 * 生成最终报告（多行，执行完成后显示）
 */
export function formatFinalReport(
  state: ProgressState,
  success: boolean,
  reason: string,
  createdFiles: string[],
): string {
  const elapsed = Date.now() - state.startTime
  const lines: string[] = []

  // 标题行
  const statusIcon = success ? '✅' : '⏸️'
  lines.push(`${statusIcon} [${state.strategy}] 循环完成 — ${state.currentIteration}轮 | ${formatDuration(elapsed)}`)
  lines.push(`结果: ${reason}`)

  // 文件列表
  if (createdFiles.length > 0) {
    const uniqueFiles = [...new Set(createdFiles)]
    lines.push('')
    lines.push(`📁 创建了 ${uniqueFiles.length} 个文件:`)
    for (const f of uniqueFiles.slice(0, 30)) {
      lines.push(`   • ${f}`)
    }
    if (uniqueFiles.length > 30) {
      lines.push(`   ... 还有 ${uniqueFiles.length - 30} 个文件`)
    }
  }

  return lines.join('\n')
}

/**
 * 生成子任务摘要
 */
export function formatSubTaskSummary(subTasks: Array<{ status: string; description: string; result?: string }>): string {
  const lines: string[] = []
  lines.push('')
  lines.push('子任务:')
  subTasks.forEach((t, i) => {
    const icon = t.status === 'completed' ? '✅' : t.status === 'failed' ? '❌' : '⏳'
    const resultLen = t.result?.length ?? 0
    lines.push(`  ${i + 1}. ${icon} ${t.description}${resultLen > 0 ? ` (${resultLen}字符)` : ''}`)
  })
  return lines.join('\n')
}
