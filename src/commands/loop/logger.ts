/**
 * Loop 统一日志层（方向 1：详细日志）
 *
 * 为所有 loop 命令（/loop、/loop-v2、/loop-start-v2、策略命令）提供统一的
 * 逐事件结构化日志能力，解决「无法全量检查错在哪」的问题。
 *
 * 三层输出：
 * - L1 实时状态行（由 progress-ui.ts 负责，原地更新）
 * - L2 屏幕滚动日志（本模块 formatLogLine，逐条追加、历史保留）
 * - L3 落盘 JSONL（本模块 LogSink，逐事件追加，可离线全量分析）
 *
 * 落盘目录约定：~/.doge/loops/logs/{loopId}.jsonl
 */

import { createWriteStream, existsSync, mkdirSync, type WriteStream } from 'fs'
import { join } from 'path'
import type { LoopEvent } from './types.js'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/** 单条日志记录（JSONL 一行） */
export interface LogEntry {
  ts: string
  loopId: string
  source: string
  pattern?: string
  strategy?: string
  iteration: number
  level: LogLevel
  event: string
  detail: string
  data?: unknown
  tokens?: number
  cost?: number
}

/** 日志写入器上下文（emit 时附带） */
export interface LogContext {
  loopId: string
  source: string
  strategy?: string
  pattern?: string
  iteration: number
}

/** 屏幕滚动日志行的级别图标 */
const LEVEL_ICON: Record<LogLevel, string> = {
  debug: '·',
  info: ' ',
  warn: '⚠️',
  error: '❌',
}

/** 时间戳 → HH:MM:SS 本地时间 */
function formatTime(ts: string): string {
  try {
    const d = new Date(ts)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  } catch {
    return ts
  }
}

/**
 * 把 LoopEvent 映射为 LogEntry（统一的事件 → 日志转换）
 */
export function toLogEntry(event: LoopEvent, ctx: LogContext): LogEntry {
  const base = {
    ts: new Date().toISOString(),
    loopId: ctx.loopId,
    source: ctx.source,
    strategy: ctx.strategy,
    pattern: ctx.pattern,
    iteration: ctx.iteration,
  }

  switch (event.type) {
    case 'loop_start':
      return { ...base, level: 'info', event: 'loop_start', detail: `启动循环：${event.goal.slice(0, 120)}` }
    case 'iteration_start':
      return { ...base, level: 'info', event: 'iteration_start', iteration: event.iteration, detail: `迭代 ${event.iteration}${event.maxIterations ? `/${event.maxIterations}` : ''} 开始` }
    case 'iteration_end':
      return { ...base, level: 'info', event: 'iteration_end', iteration: event.iteration, detail: `迭代 ${event.iteration} 结束：${event.result.slice(0, 120)}` }
    case 'task_start':
      return { ...base, level: 'info', event: 'task_start', data: { taskId: event.taskId }, detail: `任务开始：${event.description.slice(0, 120)}` }
    case 'task_end':
      return { ...base, level: event.success ? 'info' : 'warn', event: 'task_end', data: { taskId: event.taskId, success: event.success }, detail: `任务${event.success ? '完成' : '结束'}：输出 ${event.output.length} 字符` }
    case 'task_failed':
      return { ...base, level: 'error', event: 'task_failed', data: { taskId: event.taskId, error: event.error }, detail: `任务失败：${event.error.slice(0, 200)}` }
    case 'decomposition':
      return { ...base, level: 'info', event: 'decomposition', data: { taskCount: event.subTasks.length }, detail: `分解为 ${event.subTasks.length} 个子任务` }
    case 'evaluation':
      return { ...base, level: event.achieved ? 'info' : 'warn', event: 'evaluation', detail: `评估${event.achieved ? '达成' : '未达成'}：${event.reason.slice(0, 200)}` }
    case 'loop_end':
      return { ...base, level: event.success ? 'info' : 'warn', event: 'loop_end', iteration: event.iterations, detail: `循环结束（${event.success ? '成功' : '未完成'}）：${event.reason.slice(0, 120)}` }
    case 'error':
      return { ...base, level: 'error', event: 'error', detail: event.error.slice(0, 300) }
    case 'warn':
      return { ...base, level: 'warn', event: 'warn', detail: event.message.slice(0, 300) }
    case 'plan':
      return { ...base, level: 'debug', event: 'plan', data: { taskCount: event.subTasks.length, hasCycle: event.hasCycle }, detail: `规划完成：${event.subTasks.length} 任务${event.hasCycle ? '（检测到环）' : ''}` }
    case 'repair':
      return { ...base, level: 'warn', event: 'repair', data: { taskId: event.taskId, attempt: event.attempt }, detail: `自动修复（第 ${event.attempt} 次）：${event.error.slice(0, 150)}` }
    case 'snapshot':
      return { ...base, level: 'info', event: 'snapshot', data: { action: event.action, snapshotId: event.snapshotId }, detail: `快照 ${event.action}：${event.snapshotId}${event.label ? `（${event.label}）` : ''}` }
    case 'progress':
      return { ...base, level: 'debug', event: 'progress', detail: event.summary.slice(0, 150) }
    case 'ask':
      return { ...base, level: 'warn', event: 'ask', data: { options: event.options }, detail: `询问用户：${event.question.slice(0, 120)}` }
    default:
      return { ...base, level: 'debug', event: 'unknown', detail: JSON.stringify(event).slice(0, 200) }
  }
}

/**
 * 格式化为屏幕滚动日志行（L2）
 */
export function formatLogLine(entry: LogEntry): string {
  const icon = LEVEL_ICON[entry.level]
  const iter = entry.iteration > 0 ? ` #${entry.iteration}` : ''
  const head = `${formatTime(entry.ts)} ${icon} [${entry.source}${iter}]`
  return `${head} ${entry.detail}`
}

/**
 * 落盘 JSONL 写入器（L3）
 *
 * 使用流式异步写，避免阻塞主循环。循环结束时调用 close()。
 */
export interface LogSink {
  append: (entry: LogEntry) => void
  close: () => void
  path: string
}

export function createLogSink(logPath: string): LogSink {
  const resolved = logPath
  const dir = logPath.includes('/') || logPath.includes('\\')
    ? resolved.slice(0, Math.max(resolved.lastIndexOf('/'), resolved.lastIndexOf('\\')))
    : '.'
  if (dir && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  let stream: WriteStream | null = createWriteStream(resolved, { flags: 'a' })

  return {
    path: resolved,
    append: (entry: LogEntry) => {
      if (!stream) return
      stream.write(JSON.stringify(entry) + '\n')
    },
    close: () => {
      if (stream) {
        stream.end()
        stream = null
      }
    },
  }
}

/** 生成默认日志路径：~/.doge/loops/logs/{loopId}.jsonl */
export function defaultLogPath(loopId: string, home: string): string {
  return join(home, '.doge', 'loops', 'logs', `${loopId}.jsonl`)
}
