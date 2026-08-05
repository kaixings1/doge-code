/**
 * Loop Progress Reporter (B4)
 *
 * 进度汇报 — 长时间任务定期汇报进度，关键节点询问用户。
 *
 * - createProgressReporter: 定时汇报（intervalMs 内输出进度摘要）
 * - shouldAskUser: 判断是否到达"需要用户决策"的节点（连续无进展 / 过半未达标 / 预算将尽）
 * - buildProgressSummary / buildAskQuestion: 进度文本与询问文本
 */

import type { SubTask } from './types.js'

/** 进度信息快照 */
export interface ProgressInfo {
  iteration: number
  maxIterations: number
  totalTasks: number
  completed: number
  failed: number
  currentTask: string
  elapsedMs: number
}

/** 定期汇报器 */
export interface ProgressReporter {
  start: () => void
  stop: () => void
  report: () => void
}

export interface ProgressReporterOptions {
  /** 汇报间隔（毫秒） */
  intervalMs: number
  /** 获取当前进度快照 */
  getState: () => ProgressInfo
  /** 汇报回调 */
  onReport: (summary: string) => void
}

/** 创建定时进度汇报器 */
export function createProgressReporter(opts: ProgressReporterOptions): ProgressReporter {
  let timer: ReturnType<typeof setInterval> | null = null

  const report = (): void => {
    opts.onReport(buildProgressSummary(opts.getState()))
  }

  return {
    start: () => {
      if (timer) return
      timer = setInterval(report, Math.max(1000, opts.intervalMs))
      // 防 Node 进程悬挂
      if (timer && typeof timer === 'object' && 'unref' in timer) {
        ;(timer as ReturnType<typeof setInterval> & { unref?: () => void }).unref?.()
      }
    },
    stop: () => {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    },
    report,
  }
}

/** 格式化进度摘要（单行，适合状态栏） */
export function buildProgressSummary(info: ProgressInfo): string {
  const pct = info.maxIterations > 0
    ? Math.min(100, Math.round((info.iteration / info.maxIterations) * 100))
    : 0
  const done = info.completed
  const fail = info.failed
  const total = info.totalTasks
  const elapsed = Math.round(info.elapsedMs / 1000)
  const eta = info.iteration > 0 && info.elapsedMs > 0
    ? Math.round((info.elapsedMs / info.iteration) * Math.max(0, info.maxIterations - info.iteration) / 1000)
    : 0

  const parts = [
    `迭代 ${info.iteration}/${info.maxIterations} (${pct}%)`,
    `任务 ${done}/${total} 完成${fail > 0 ? `, ${fail} 失败` : ''}`,
    `已用 ${elapsed}s${eta > 0 ? `, 预计还需 ${eta}s` : ''}`,
  ]
  if (info.currentTask) parts.push(`当前: ${info.currentTask.slice(0, 30)}`)

  return `⏱ [进度] ${parts.join(' | ')}`
}

/**
 * 判断是否到达"需要询问用户"的节点。
 *
 * 触发条件（任一）：
 * 1. 连续 consecutiveStagnantRounds（默认 3）轮迭代中，完成数没有增长且失败数增长
 * 2. 迭代超过一半且仍有失败任务（卡在修复循环）
 * 3. 时间预算已用超过 80%
 */
export function shouldAskUser(
  history: Array<{ iteration: number; event: string; completedDelta?: number }>,
  opts: {
    iteration: number
    maxIterations: number
    totalTasks: number
    completed: number
    failed: number
    elapsedMs: number
    budgetMs?: number
    consecutiveStagnantRounds?: number
  },
): boolean {
  const stagnantThreshold = opts.consecutiveStagnantRounds ?? 3

  // 1. 连续无进展
  if (opts.iteration >= stagnantThreshold) {
    const recent = history.slice(-stagnantThreshold)
    const noProgress = recent.every(h => h.event === 'iteration_complete' && (h.completedDelta ?? 0) <= 0)
    const hasFailures = opts.failed > 0
    if (noProgress && hasFailures) return true
  }

  // 2. 过半仍未达标且有失败
  if (opts.maxIterations > 0 && opts.iteration >= Math.ceil(opts.maxIterations / 2) && opts.failed > 0) {
    return true
  }

  // 3. 预算 80% 已耗尽
  if (opts.budgetMs && opts.budgetMs > 0 && opts.elapsedMs > opts.budgetMs * 0.8) {
    return true
  }

  return false
}

/** 构建询问用户的问题文本 */
export function buildAskQuestion(
  goal: string,
  info: { iteration: number; maxIterations: number; completed: number; failed: number; currentTask: string },
): string {
  const lines = [
    `🛑 需要你的决策（循环执行到关键节点）`,
    ``,
    `目标: ${goal.slice(0, 100)}`,
    `进度: 迭代 ${info.iteration}/${info.maxIterations}，${info.completed} 完成，${info.failed} 失败`,
  ]
  if (info.currentTask) lines.push(`当前: ${info.currentTask.slice(0, 50)}`)
  lines.push('', '请选择继续方向:')

  return lines.join('\n')
}

/** 汇总子任务状态（供进度信息使用） */
export function summarizeSubtasks(subTasks: SubTask[]): {
  total: number
  completed: number
  failed: number
  running: number
  pending: number
  currentTask: string
} {
  let completed = 0
  let failed = 0
  let running = 0
  let pending = 0
  let currentTask = ''

  for (const t of subTasks) {
    switch (t.status) {
      case 'completed': completed++; break
      case 'failed': failed++; break
      case 'running':
        running++
        if (!currentTask) currentTask = t.description
        break
      case 'pending':
        pending++
        break
    }
  }

  return { total: subTasks.length, completed, failed, running, pending, currentTask }
}
