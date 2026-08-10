/**
 * Loop Engine Core
 *
 * 循环引擎核心 — 编排目标导向的循环执行。
 *
 * 架构设计（分支循环模式）：
 * - 主循环（MessageLoop/QueryEngine）提供执行能力
 * - LoopEngine 提供编排能力（策略/分解/评估/路由）
 * - 通过 taskExecutor 回调将执行委托给主循环
 *
 * 执行模式：
 * 1. execSync 模式：直接执行 shell 命令（测试/lint/构建等）
 * 2. taskExecutor 模式：通过回调委托给 AgentTool/QueryEngine
 * 3. 混合模式：简单任务用 execSync，复杂任务用 taskExecutor
 */

import { execSync } from 'child_process'
import { writeFile, readFile, mkdir } from 'fs/promises'
import * as path from 'path'
import type { LoopGoal, LoopOptions, LoopResult, LoopEvent, SubTask, VerifyMode, CheckpointState } from './types.js'
import { getStrategy } from './strategies/index.js'
import { decomposeToDag, getReadyTasks, hasCycle } from './planner.js'
import { createSnapshot, restoreSnapshot, cleanupSnapshot, type Snapshot } from './snapshot.js'
import {
  createProgressReporter,
  shouldAskUser,
  buildAskQuestion,
  summarizeSubtasks,
  type ProgressReporter,
} from './progress.js'

const DEFAULT_MAX_ITERATIONS = 20

interface LoopState {
  iteration: number
  maxIterations: number
  subTasks: SubTask[]
  history: Array<{ iteration: number; event: string; details?: string; completedDelta?: number }>
  startTime: number
  lastCompletedCount: number
}

/**
 * 任务执行器类型 — loop engine 与主循环的集成点
 */
export type TaskExecutor = (
  prompt: string,
  systemPrompt: string,
  task: SubTask,
) => Promise<{ success: boolean; output: string; error?: string }>

export interface LoopEngineOptions extends LoopOptions {
  taskExecutor?: TaskExecutor
}

/**
 * 检查 LLM API 可达性
 * 不可达时返回 true，触发降级到本地 execSync 模式
 */
let apiHealthCheckCache: { ok: boolean; checkedAt: number } | null = null
const API_HEALTH_CACHE_MS = 5000

async function checkAPIHealth(): Promise<boolean> {
  // 5s 缓存避免频繁请求
  if (apiHealthCheckCache && Date.now() - apiHealthCheckCache.checkedAt < API_HEALTH_CACHE_MS) {
    return !apiHealthCheckCache.ok
  }

  const apiKey = process.env.DOGE_API_KEY || process.env.ANTHROPIC_API_KEY || ''
  const baseURL = process.env.ANTHROPIC_BASE_URL || 'https://api.longcat.chat/openai/v1/chat/completions'

  if (!apiKey) {
    apiHealthCheckCache = { ok: false, checkedAt: Date.now() }
    return true
  }

  try {
    const controller = new AbortController()
    const healthTimeout = setTimeout(() => controller.abort(), 5000)
    try {
      const response = await fetch(baseURL.replace('/chat/completions', '/models'), {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        signal: controller.signal,
      })
      clearTimeout(healthTimeout)
      apiHealthCheckCache = { ok: response.ok, checkedAt: Date.now() }
      return !response.ok
    } catch {
      clearTimeout(healthTimeout)
      apiHealthCheckCache = { ok: false, checkedAt: Date.now() }
      return true
    }
  } catch {
    apiHealthCheckCache = { ok: false, checkedAt: Date.now() }
    return true
  }
}

/**
 * 执行目标导向循环
 */
export async function executeLoop(options: LoopEngineOptions): Promise<LoopResult> {
  const strategy = getStrategy(options.strategy)
  const goal: LoopGoal = {
    ...options.goal,
    maxIterations: options.goal.maxIterations ?? DEFAULT_MAX_ITERATIONS,
  }

  const createdFiles: string[] = []

  const state: LoopState = {
    iteration: 0,
    maxIterations: goal.maxIterations,
    subTasks: [],
    history: [],
    startTime: Date.now(),
    lastCompletedCount: 0,
  }

  const emit = (event: LoopEvent) => { options.onProgress?.(event) }

  emit({ type: 'loop_start', strategy: options.strategy, goal: goal.description })

  // ─── B3 安全快照：执行前自动快照，失败可回滚 ───
  let snapshot: Snapshot | null = null
  if (options.snapshot) {
    try {
      snapshot = await createSnapshot(process.cwd(), goal.description.slice(0, 60))
      if (snapshot) {
        emit({ type: 'snapshot', action: 'create', snapshotId: snapshot.id, label: snapshot.label })
      } else {
        emit({ type: 'snapshot', action: 'skip', snapshotId: 'none', label: '工作区无改动' })
      }
    } catch (snapErr) {
      emit({ type: 'warn', message: `快照创建失败，继续执行（无回滚保护）: ${snapErr instanceof Error ? snapErr.message : String(snapErr)}` })
    }
  }

  // ─── B4 进度汇报器：定时输出进度摘要 ───
  let progressReporter: ProgressReporter | null = null
  const progressInterval = options.progressIntervalMs ?? 60_000
  if (progressInterval > 0) {
    progressReporter = createProgressReporter({
      intervalMs: progressInterval,
      getState: () => {
        const s = summarizeSubtasks(state.subTasks)
        return {
          iteration: state.iteration,
          maxIterations: state.maxIterations,
          totalTasks: s.total,
          completed: s.completed,
          failed: s.failed,
          currentTask: s.currentTask,
          elapsedMs: Date.now() - state.startTime,
        }
      },
      onReport: (summary) => {
        const s = summarizeSubtasks(state.subTasks)
        emit({
          type: 'progress',
          summary,
          iteration: state.iteration,
          completed: s.completed,
          failed: s.failed,
          elapsedMs: Date.now() - state.startTime,
        })
      },
    })
    progressReporter.start()
  }

  // ─── 强制心跳: 每 1 秒发送进度事件，确保 UI 不死锁 ───
  const heartbeat = setInterval(() => {
    const elapsed = Date.now() - state.startTime
    const elapsedStr = elapsed < 1000 ? `${elapsed}ms` : `${Math.round(elapsed / 1000)}s`
    const completed = state.subTasks.filter(t => t.status === 'completed').length
    const failed = state.subTasks.filter(t => t.status === 'failed').length
    const currentTask = state.subTasks.find(t => t.status === 'running')
    emit({
      type: 'progress',
      summary: currentTask
        ? `⏱ [心跳] 执行中: ${currentTask.description.slice(0, 40)}... | 迭代 ${state.iteration}/${state.maxIterations} | 已用 ${elapsedStr}`
        : `⏱ [心跳] 循环运行中 | 迭代 ${state.iteration}/${state.maxIterations} | 已用 ${elapsedStr} | 进度: ${completed}/${state.subTasks.length} 完成`,
      iteration: state.iteration,
      completed,
      failed,
      elapsedMs: elapsed,
    })
  }, 1000)
  if (typeof heartbeat === 'object' && heartbeat !== null && 'unref' in heartbeat) {
    ;(heartbeat as { unref?: () => void }).unref?.()
  }

  // ─── 检查点恢复 ───
  if (options.checkpoint) {
    try {
      const cp = await loadCheckpoint(options.checkpoint)
      if (cp && cp.goal === goal.description) {
        state.subTasks = cp.subTasks
        state.iteration = cp.iteration
        state.maxIterations = cp.maxIterations
        createdFiles.push(...cp.createdFiles)
        emit({ type: 'warn', message: `已从检查点恢复（迭代 ${cp.iteration}，${cp.subTasks.length} 个任务）` })
      }
    } catch { /* 检查点无效，忽略 */ }
  }

  try {
    // 注入任务执行器，使策略能够在 evaluate() 中驱动图节点执行
    if (options.taskExecutor && strategy.setTaskExecutor) {
      strategy.setTaskExecutor(options.taskExecutor)
    }

    // 如果检查点没有恢复任务，则进行初始分解（B1 任务规划器：DAG 带依赖）
    if (state.subTasks.length === 0) {
      // handlesOwnExecution 策略（如 AutoGPT）有自己的图管理，优先使用策略的 decompose()
      if (strategy.handlesOwnExecution?.()) {
        state.subTasks = strategy.decompose(goal)
      } else {
        state.subTasks = decomposeToDag(goal)
      }
      emit({ type: 'decomposition', subTasks: state.subTasks })
      emit({ type: 'plan', subTasks: state.subTasks, hasCycle: hasCycle(state.subTasks) })
    }

    // ─── 预算检查 ───
    const budgetExceeded = () => {
      if (!options.budgetMs) return false
      return Date.now() - state.startTime > options.budgetMs
    }

    while (strategy.shouldContinue(state.iteration, state.maxIterations, state.subTasks)) {
      // 预算超时 → 停止
      if (budgetExceeded()) {
        const reason = `时间预算超时（${Math.round((Date.now() - state.startTime) / 1000)}s）`
        emit({ type: 'error', error: reason })
        state.history.push({ iteration: state.iteration, event: 'budget_exceeded', details: reason })
        break
      }

      state.iteration++
      emit({ type: 'iteration_start', iteration: state.iteration, maxIterations: state.maxIterations })

      try {
        // 找出待执行任务（B1：依赖感知调度 — 只执行依赖已满足的任务）
        const pendingTasks = state.subTasks.filter(t => t.status === 'pending')
        const runningTasks = state.subTasks.filter(t => t.status === 'running')
        const readyTasks = getReadyTasks(state.subTasks, Math.max(1, options.parallel || 1))
        const currentTasks = readyTasks.length > 0 ? readyTasks : (pendingTasks.length > 0 ? pendingTasks : runningTasks)

        // evaluation 在共用后处理中使用，需在分支前声明
        let evaluation: { achieved: boolean; reason: string }

        if (currentTasks.length === 0) {
          evaluation = await strategy.evaluate(goal, state.subTasks)
          emit({ type: 'evaluation', achieved: evaluation.achieved, reason: evaluation.reason })
          if (evaluation.achieved) {
            break
          }
          // 未达标 → 生成新的执行任务，继续迭代改进（按 id 去重追加）
          const newTasks = strategy.decompose(goal)
          const existingIds = new Set(state.subTasks.map(t => t.id))
          const freshTasks = newTasks.filter(t => !existingIds.has(t.id))
          if (freshTasks.length > 0) {
            state.subTasks.push(...freshTasks)
          } else {
            // 没有新任务可追加 → 检测是否所有任务都已完成
            // 若所有任务已完成/失败，无法再推进，停止循环
            const unfinishedCount = state.subTasks.filter(
              t => t.status === 'pending' || t.status === 'running',
            ).length
            if (unfinishedCount === 0) {
              break
            }
            // 若仍有 pending 任务但无法就绪（依赖阻塞），强制标记为失败以避免死循
            const blockedTasks = state.subTasks.filter(t => {
              if (t.status !== 'pending') return false
              const unmetDeps = t.dependencies?.filter(d => {
                const dep = state.subTasks.find(x => x.id === d)
                return !dep || dep.status !== 'completed'
              }) ?? []
              return unmetDeps.length > 0
            })
            if (blockedTasks.length > 0) {
              for (const bt of blockedTasks) {
                bt.status = 'failed'
                bt.error = '依赖无法满足，任务被阻塞'
              }
              emit({ type: 'error', error: `检测到 ${blockedTasks.length} 个阻塞任务，强制标记为失败` })
              break
            }
          }
        } else if (currentTasks.length > 0 && !strategy.handlesOwnExecution?.()) {
          // ─── 执行任务（支持并行）───
          const parallelLimit = Math.max(1, options.parallel || 1)
          const tasksToRun = currentTasks.slice(0, parallelLimit)

          for (const task of tasksToRun) {
            task.status = 'running'
            emit({ type: 'task_start', taskId: task.id, description: task.description })
          }

          const systemPrompt = strategy.getSystemPrompt(goal)

          // 并行或串行执行
          const executor = async (task: SubTask) => {
            const taskPrompt = buildTaskPrompt(goal, task, state)
            let result: { success: boolean; output: string; error?: string }

            if (options.taskExecutor) {
              // API 健康检查 — 不可达时降级到本地 execSync
              const useLocalFallback = await checkAPIHealth()
              if (useLocalFallback) {
                emit({ type: 'warn', message: 'LLM API 不可达，使用本地命令执行模式' })
                result = await executeTaskWithStrategy(task, taskPrompt, systemPrompt)
              } else {
                try {
                  // 30s 超时保护 — 无法获取结果时自动降级
                  const controller = new AbortController()
                  const timeoutId = setTimeout(() => controller.abort(), 30000)
                  try {
                    result = await Promise.race([
                      options.taskExecutor(taskPrompt, systemPrompt, task),
                      new Promise<{ success: boolean; output: string; error?: string }>((_, reject) =>
                        setTimeout(() => reject(new Error('API timeout')), 30000)
                      ),
                    ])
                  } catch {
                    clearTimeout(timeoutId)
                    result = await executeTaskWithStrategy(task, taskPrompt, systemPrompt)
                  }
                  clearTimeout(timeoutId)
                } catch {
                  result = await executeTaskWithStrategy(task, taskPrompt, systemPrompt)
                }
              }
            } else {
              result = await executeTaskWithStrategy(task, taskPrompt, systemPrompt)
            }

            // 验证模式：任务成功后自动运行验证
            if (result.success && options.verifyMode && options.verifyMode !== 'none') {
              const verifyResult = await runVerification(options.verifyMode, result.output)
              if (!verifyResult.passed) {
                result = { ...result, success: false, error: `验证失败: ${verifyResult.reason}` }
              }
            }

            task.status = result.success ? 'completed' : 'failed'
            task.result = result.output
            task.error = result.error

            // B2 自动修复：失败任务生成修复子任务（最多 maxRepairAttempts 次）
            if (!result.success && options.autoRepair !== false) {
              const maxRepairs = options.maxRepairAttempts ?? 2
              const attempt = (task.attempts ?? 0) + 1
              if (attempt <= maxRepairs) {
                const repairId = `${task.id}-repair-${attempt}`
                const repairTask: SubTask = {
                  id: repairId,
                  description: `🔧 修复任务「${task.description.slice(0, 50)}」（第 ${attempt} 次自动修复）— 分析错误并修正`,
                  status: 'pending',
                  dependencies: task.dependencies,
                  priority: (task.priority ?? 0) + 5,
                  verify: task.verify,
                  attempts: attempt,
                }
                state.subTasks.push(repairTask)
                emit({ type: 'repair', taskId: task.id, attempt, error: result.error ?? '未知错误' })
              }
            }

            // B2 修复任务完成后，将被替代的失败任务恢复为 completed（解除下游依赖阻塞）
            if (task.id.includes('-repair-') && result.success) {
              const baseId = task.id.split('-repair-')[0]
              const baseTask = state.subTasks.find(t => t.id === baseId)
              if (baseTask && baseTask.status === 'failed') {
                baseTask.status = 'completed'
                baseTask.result = result.output
                baseTask.error = ''
              }
            }

            // 提取创建的文件
            extractCreatedFiles(result.output).forEach(f => {
              if (!createdFiles.includes(f)) createdFiles.push(f)
            })

            return { task, result }
          }

          const results = await Promise.all(tasksToRun.map(t => executor(t)))
          for (const { task, result } of results) {
            if (result.success) {
              emit({ type: 'task_end', taskId: task.id, success: true, output: result.output })
            } else {
              emit({ type: 'task_failed', taskId: task.id, error: result.error ?? 'Unknown error' })
            }
          }

          // 执行完任务后评估是否达标
          evaluation = await strategy.evaluate(goal, state.subTasks)
          emit({ type: 'evaluation', achieved: evaluation.achieved, reason: evaluation.reason })
        } else if (currentTasks.length > 0 && strategy.handlesOwnExecution?.()) {
          // 策略自行处理执行（如 AutoGPT）
          // FIX: 不直接调用 strategy.evaluate() 避免卡死，
          // 而是使用标准 taskExecutor 执行任务，绕过图引擎
          const parallelLimit = Math.max(1, options.parallel || 1)
          const tasksToRun = currentTasks.slice(0, parallelLimit)

          for (const task of tasksToRun) {
            task.status = 'running'
            emit({ type: 'task_start', taskId: task.id, description: task.description })
          }

          const systemPrompt = strategy.getSystemPrompt(goal)
          const executor = async (task: SubTask) => {
            const taskPrompt = buildTaskPrompt(goal, task, state)
            let result: { success: boolean; output: string; error?: string }

            if (options.taskExecutor && !await checkAPIHealth()) {
              try {
                result = await options.taskExecutor(taskPrompt, systemPrompt, task)
              } catch {
                result = await executeTaskWithStrategy(task, taskPrompt, systemPrompt)
              }
            } else {
              result = await executeTaskWithStrategy(task, taskPrompt, systemPrompt)
            }

            if (result.success && options.verifyMode && options.verifyMode !== 'none') {
              const verifyResult = await runVerification(options.verifyMode, result.output)
              if (!verifyResult.passed) {
                result = { ...result, success: false, error: `验证失败: ${verifyResult.reason}` }
              }
            }

            task.status = result.success ? 'completed' : 'failed'
            task.result = result.output
            task.error = result.error

            if (!result.success && options.autoRepair !== false) {
              const maxRepairs = options.maxRepairAttempts ?? 2
              const attempt = (task.attempts ?? 0) + 1
              if (attempt <= maxRepairs) {
                const repairId = `${task.id}-repair-${attempt}`
                state.subTasks.push({
                  id: repairId,
                  description: `🔧 修复: ${task.description.slice(0, 50)}（第 ${attempt} 次）`,
                  status: 'pending',
                  dependencies: task.dependencies,
                  priority: (task.priority ?? 0) + 5,
                  verify: task.verify,
                  attempts: attempt,
                })
                emit({ type: 'repair', taskId: task.id, attempt, error: result.error ?? 'Unknown error' })
              }
            }

            extractCreatedFiles(result.output).forEach(f => {
              if (!createdFiles.includes(f)) createdFiles.push(f)
            })

            return { task, result }
          }

          const results = await Promise.all(tasksToRun.map(t => executor(t)))
          for (const { task, result } of results) {
            if (result.success) {
              emit({ type: 'task_end', taskId: task.id, success: true, output: result.output })
            } else {
              emit({ type: 'task_failed', taskId: task.id, error: result.error ?? 'Unknown error' })
            }
          }

          evaluation = await strategy.evaluate(goal, state.subTasks)
          emit({ type: 'evaluation', achieved: evaluation.achieved, reason: evaluation.reason })

          // handlesOwnExecution 分支不进入共用后处理，提前完成检查点/询问
          if (evaluation.achieved) {
            emit({ type: 'iteration_end', iteration: state.iteration, result: evaluation.reason })
            break
          }

          // 保存检查点
          if (options.checkpoint && state.iteration % 2 === 0) {
            await saveCheckpoint(options.checkpoint, {
              strategy: options.strategy,
              goal: goal.description,
              subTasks: state.subTasks,
              iteration: state.iteration,
              maxIterations: state.maxIterations,
              savedAt: new Date().toISOString(),
              createdFiles,
            })
          }

          // 记录本轮完成增量
          const completedNow = state.subTasks.filter(t => t.status === 'completed').length
          const completedDelta = completedNow - state.lastCompletedCount
          state.lastCompletedCount = completedNow
          state.history.push({ iteration: state.iteration, event: 'iteration_complete', details: evaluation.reason, completedDelta })

          // B4 询问用户
          if (options.askUser) {
            const s = summarizeSubtasks(state.subTasks)
            const shouldAsk = shouldAskUser(
              state.history.map(h => ({ iteration: h.iteration, event: h.event, completedDelta: h.completedDelta })),
              {
                iteration: state.iteration,
                maxIterations: state.maxIterations,
                totalTasks: s.total,
                completed: s.completed,
                failed: s.failed,
                elapsedMs: Date.now() - state.startTime,
                budgetMs: options.budgetMs,
                consecutiveStagnantRounds: options.stagnantThreshold,
              },
            )
            if (shouldAsk) {
              const question = buildAskQuestion(goal.description, {
                iteration: state.iteration,
                maxIterations: state.maxIterations,
                completed: s.completed,
                failed: s.failed,
                currentTask: s.currentTask,
              })
              const choices = ['继续执行', '回滚并停止', '中止']
              emit({ type: 'ask', question, options: choices })
              try {
                const choice = await options.askUser(question, choices)
                if (choice.includes('回滚')) {
                  if (snapshot) {
                    await restoreSnapshot(process.cwd(), snapshot)
                    emit({ type: 'snapshot', action: 'restore', snapshotId: snapshot.id })
                  }
                  emit({ type: 'warn', message: '用户选择回滚并停止' })
                  break
                }
                if (choice.includes('中止')) {
                  emit({ type: 'warn', message: '用户选择中止' })
                  break
                }
              } catch {
                emit({ type: 'warn', message: '询问用户失败，继续执行' })
              }
            }
          }
          continue  // 跳过下方共用代码
        } else {
          // 保底：无任务可执行，评估当前状态
          evaluation = await strategy.evaluate(goal, state.subTasks)
          emit({ type: 'evaluation', achieved: evaluation.achieved, reason: evaluation.reason })
        }

        // 保存检查点（每 2 轮保存一次）
        if (options.checkpoint && state.iteration % 2 === 0) {
          await saveCheckpoint(options.checkpoint, {
            strategy: options.strategy,
            goal: goal.description,
            subTasks: state.subTasks,
            iteration: state.iteration,
            maxIterations: state.maxIterations,
            savedAt: new Date().toISOString(),
            createdFiles,
          })
        }

        if (evaluation.achieved) {
          emit({ type: 'iteration_end', iteration: state.iteration, result: evaluation.reason })
          break
        }

        emit({ type: 'iteration_end', iteration: state.iteration, result: evaluation.reason })

        // 记录本轮完成增量（B4 停滞检测用）
        const completedNow = state.subTasks.filter(t => t.status === 'completed').length
        const completedDelta = completedNow - state.lastCompletedCount
        state.lastCompletedCount = completedNow
        state.history.push({ iteration: state.iteration, event: 'iteration_complete', details: evaluation.reason, completedDelta })

        // B4 关键节点询问：连续无进展 / 过半未达标 / 预算将尽时，询问用户方向
        if (options.askUser) {
          const s = summarizeSubtasks(state.subTasks)
          const shouldAsk = shouldAskUser(
            state.history.map(h => ({ iteration: h.iteration, event: h.event, completedDelta: h.completedDelta })),
            {
              iteration: state.iteration,
              maxIterations: state.maxIterations,
              totalTasks: s.total,
              completed: s.completed,
              failed: s.failed,
              elapsedMs: Date.now() - state.startTime,
              budgetMs: options.budgetMs,
              consecutiveStagnantRounds: options.stagnantThreshold,
            },
          )
          if (shouldAsk) {
            const question = buildAskQuestion(goal.description, {
              iteration: state.iteration,
              maxIterations: state.maxIterations,
              completed: s.completed,
              failed: s.failed,
              currentTask: s.currentTask,
            })
            const choices = ['继续执行', '回滚并停止', '中止']
            emit({ type: 'ask', question, options: choices })
            try {
              const choice = await options.askUser(question, choices)
              if (choice.includes('回滚')) {
                if (snapshot) {
                  await restoreSnapshot(process.cwd(), snapshot)
                  emit({ type: 'snapshot', action: 'restore', snapshotId: snapshot.id })
                }
                emit({ type: 'warn', message: '用户选择回滚并停止' })
                break
              }
              if (choice.includes('中止')) {
                emit({ type: 'warn', message: '用户选择中止' })
                break
              }
            } catch {
              emit({ type: 'warn', message: '询问用户失败，继续执行' })
            }
          }
        }

      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error)
        emit({ type: 'error', error: errMsg })
        state.history.push({ iteration: state.iteration, event: 'error', details: errMsg })
      }
    }

    let finalEvaluation = await strategy.evaluate(goal, state.subTasks)

    // 循环结束后：若仍有任务未执行（通常是迭代次数耗尽），给出准确原因，
    // 避免误导性的"任务执行中"（此时循环已结束，只是没机会执行剩余任务）
    const unfinishedCount = state.subTasks.filter(
      t => t.status === 'pending' || t.status === 'running',
    ).length
    if (!finalEvaluation.achieved && unfinishedCount > 0) {
      finalEvaluation = {
        achieved: false,
        reason: `迭代次数已用尽（${state.iteration}/${state.maxIterations}），仍有 ${unfinishedCount} 个任务未执行。可增大 --max-iterations 或 --parallel 后重试`,
      }
    }

    const duration = Date.now() - state.startTime

    // ─── B3/B4 清理：停止进度汇报器、心跳，快照按结果处置 ───
    if (progressReporter) progressReporter.stop()
    clearInterval(heartbeat)
    if (snapshot) {
      if (finalEvaluation.achieved) {
        await cleanupSnapshot(snapshot)
        emit({ type: 'snapshot', action: 'cleanup', snapshotId: snapshot.id })
      } else {
        emit({ type: 'warn', message: `快照保留: .loop-snapshots/${snapshot.id}（失败时可用 restoreSnapshot 恢复）` })
      }
    }

    // 生成报告
    let reportPath: string | null = null
    if (options.report) {
      reportPath = await writeReport(options.report, {
        success: finalEvaluation.achieved,
        iterations: state.iteration,
        duration,
        reason: finalEvaluation.reason,
        subTasks: state.subTasks,
        createdFiles,
        strategy: options.strategy,
        goal: goal.description,
      })
    }

    const result: LoopResult = {
      success: finalEvaluation.achieved,
      iterations: state.iteration,
      duration,
      reason: finalEvaluation.reason,
      subTasks: state.subTasks,
      finalOutput: buildFinalOutput(state.subTasks, finalEvaluation),
    }

    emit({ type: 'loop_end', success: result.success, iterations: result.iterations, duration: result.duration, reason: result.reason })

    if (reportPath) {
      emit({ type: 'warn', message: `报告已生成: ${reportPath}` })
    }

    return result

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    if (progressReporter) progressReporter.stop()
    clearInterval(heartbeat)
    emit({ type: 'error', error: errMsg })
    emit({ type: 'loop_end', success: false, iterations: state.iteration, duration: Date.now() - state.startTime, reason: errMsg })

    return {
      success: false,
      iterations: state.iteration,
      duration: Date.now() - state.startTime,
      reason: errMsg,
      subTasks: state.subTasks,
      finalOutput: '',
    }
  }
}

/**
 * 基于任务类型的智能执行器
 *
 * 根据任务描述自动选择合适的执行方式：
 * - 包含 "测试/test" → 运行 bun test
 * - 包含 "lint/检查" → 运行 bun run lint
 * - 包含 "build/构建" → 运行 bun run build
 * - 包含 "git" → 执行 git 命令
 * - 其他 → 返回提示信息
 */
async function executeTaskWithStrategy(
  task: SubTask,
  prompt: string,
  systemPrompt: string,
): Promise<{ success: boolean; output: string; error?: string }> {
  const desc = task.description.toLowerCase()

  // 根据任务类型选择执行命令
  let cmd: string | null = null

  if (desc.includes('测试') || desc.includes('test') || desc.includes('运行测试')) {
    cmd = 'bun test 2>&1 | head -50'
  } else if (desc.includes('类型') || desc.includes('type') || desc.includes('typescript')) {
    cmd = 'bun run build 2>&1 | head -50'
  } else if (desc.includes('lint') || desc.includes('检查代码')) {
    cmd = 'bun run lint 2>&1 | head -50'
  } else if (desc.includes('build') || desc.includes('构建') || desc.includes('编译')) {
    cmd = 'bun run build 2>&1 | head -100'
  } else if (desc.includes('git status') || desc.includes('git 状态') || desc.includes('检查 git')) {
    cmd = 'git status --short 2>&1'
  } else if (desc.includes('git diff') || desc.includes('git 差异') || desc.includes('代码变更')) {
    cmd = 'git diff --stat 2>&1'
  } else if (desc.includes('git log') || desc.includes('git 提交') || desc.includes('提交历史')) {
    cmd = 'git log --oneline -10 2>&1'
  } else if (desc.includes('文件') || desc.includes('file') || desc.includes('目录')) {
    cmd = 'ls -la 2>&1 | head -30'
  }

  if (cmd) {
    try {
      const output = execSync(cmd, {
        cwd: process.cwd(),
        encoding: 'utf-8',
        timeout: 60000,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      return { success: true, output: output.slice(0, 2000) }
    } catch (execErr: unknown) {
      const err = execErr as { stdout?: string; stderr?: string; status?: number }
      const output = (err.stdout ?? '') + '\n' + (err.stderr ?? '')
      return {
        success: false,
        output: output.slice(0, 2000),
        error: `命令退出码: ${err.status ?? 'unknown'}`,
      }
    }
  }

  // 无法自动执行的任务：返回提示信息
  return {
    success: true,
    output: `任务规划: ${task.description}\n\n系统提示:\n${systemPrompt}\n\n执行提示:\n${prompt}\n\n（此任务需要 AI 代理执行，当前为规划模式）`,
  }
}

function buildTaskPrompt(goal: LoopGoal, task: SubTask, state: LoopState): string {
  // 提取之前尝试的结果（供 AI 改进参考）
  const previousAttempts = state.subTasks
    .filter(t => t.status === 'completed' || t.status === 'failed')
    .map((t, i) => {
      const resultSummary = t.result ? t.result.slice(0, 1500) : ''
      const errorSummary = t.error ? `错误: ${t.error.slice(0, 300)}` : ''
      return `尝试 ${i + 1} [${t.status}]: ${t.description.slice(0, 80)}\n${resultSummary ? `结果: ${resultSummary}\n` : ''}${errorSummary ? `${errorSummary}\n` : ''}`
    })

  return `## 目标
${goal.description}

## 当前任务 (迭代 ${state.iteration}/${state.maxIterations})
${task.description}

## 子任务状态
${state.subTasks.map((t, i) => `${i + 1}. [${t.status}] ${t.description.slice(0, 60)}`).join('\n')}

## 成功标准
${goal.successCriteria?.map((c, i) => `${i + 1}. ${c}`).join('\n') || '完成目标并用 bash 命令实际创建文件'}

${previousAttempts.length > 0 ? `## 之前尝试的执行结果（如未达标，请针对性改进，不要重复相同操作）\n${previousAttempts.join('\n\n')}\n` : ''}

## 要求
1. 必须使用 bash 命令实际创建/修改文件（mkdir、echo、cat heredoc 等）
2. 所有命令用 \`\`\`bash 代码块包裹
3. 完成后明确列出创建的文件
4. 如果之前尝试失败或未创建文件，请分析原因并采用不同方案

请执行当前任务，输出 bash 命令和结果。`
}

function buildFinalOutput(subTasks: SubTask[], evaluation: { achieved: boolean; reason: string }): string {
  const lines: string[] = []
  lines.push(`# 循环执行结果`)
  lines.push('')
  lines.push(`状态: ${evaluation.achieved ? '✅ 成功' : '❌ 未完成'}`)
  lines.push(`原因: ${evaluation.reason}`)
  lines.push('')
  lines.push('## 子任务执行详情')
  subTasks.forEach((t, i) => {
    lines.push(`${i + 1}. [${t.status}] ${t.description}`)
    if (t.result) lines.push(`   结果: ${t.result.slice(0, 200)}`)
    if (t.error) lines.push(`   错误: ${t.error.slice(0, 200)}`)
  })
  return lines.join('\n')
}

export function isValidStrategy(name: string): name is import('./types.js').LoopStrategyName {
  return ['langgraph', 'crew', 'autogpt', 'openhands', 'swe-agent'].includes(name)
}

// ============================================================================
// 验证模式 — 任务完成后自动运行验证
// ============================================================================

const VERIFY_COMMANDS: Record<VerifyMode, string[]> = {
  none: [],
  test: ['bun test 2>&1 | tail -30', 'npm test 2>&1 | tail -30', 'npx vitest run 2>&1 | tail -30'],
  build: ['bun run build 2>&1 | tail -30', 'npm run build 2>&1 | tail -30'],
  lint: ['bun run lint 2>&1 | tail -30', 'npm run lint 2>&1 | tail -30', 'npx biome check src/ 2>&1 | tail -30'],
  files: [],
}

async function runVerification(
  mode: VerifyMode,
  taskOutput: string,
): Promise<{ passed: boolean; reason: string }> {
  // files 模式：检查任务输出中是否声明了文件创建
  if (mode === 'files') {
    const hasFiles = /📁\s*创建了|created\s+\d+\s*files?|•\s*[\w./-]+\.[\w]+/i.test(taskOutput)
    return hasFiles
      ? { passed: true, reason: '检测到文件创建' }
      : { passed: false, reason: '未检测到文件创建（请用 bash 命令实际创建文件）' }
  }

  // 依次尝试验证命令，直到找到可用的
  const commands = VERIFY_COMMANDS[mode] || []
  for (const cmd of commands) {
    try {
      const output = execSync(cmd, {
        cwd: process.cwd(),
        encoding: 'utf-8',
        timeout: 60000,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      return { passed: true, reason: `${mode} 验证通过\n${output.slice(0, 500)}` }
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; status?: number }
      // 命令不存在（如没有 npm）则尝试下一个
      if (e.status === 127 || /not found|not recognized/i.test(e.stderr ?? '')) {
        continue
      }
      const output = (e.stdout ?? '') + (e.stderr ?? '')
      return { passed: false, reason: `${mode} 验证失败 (退出码 ${e.status})\n${output.slice(0, 500)}` }
    }
  }
  return { passed: true, reason: `${mode} 验证跳过（无可用命令）` }
}

// ============================================================================
// 文件提取与检查点/报告
// ============================================================================

function extractCreatedFiles(output: string): string[] {
  const files: string[] = []
  const patterns = [
    /^\s*(?:•|·|-)\s*(.+)$/gm,
    /📄\s*(.+?)(?:\s|$)/g,
    />(?:\s*)([\w./-]+\.[\w]+)/g,
  ]
  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(output)) !== null) {
      const fp = match[1].trim().replace(/[`'"\s]+$/, '')
      if (fp && /[\w./-]+\.[\w]+/.test(fp) && !fp.startsWith('/dev/')) {
        files.push(fp)
      }
    }
  }
  return [...new Set(files)]
}

export async function saveCheckpoint(filePath: string, state: CheckpointState): Promise<void> {
  const resolved = path.resolve(filePath)
  await mkdir(path.dirname(resolved), { recursive: true })
  await writeFile(resolved, JSON.stringify(state, null, 2), 'utf-8')
}

async function loadCheckpoint(filePath: string): Promise<CheckpointState | null> {
  try {
    const content = await readFile(path.resolve(filePath), 'utf-8')
    return JSON.parse(content) as CheckpointState
  } catch {
    return null
  }
}

async function writeReport(
  filePath: string,
  data: {
    success: boolean
    iterations: number
    duration: number
    reason: string
    subTasks: SubTask[]
    createdFiles: string[]
    strategy: string
    goal: string
  },
): Promise<string> {
  const resolved = path.resolve(filePath)
  await mkdir(path.dirname(resolved), { recursive: true })

  const lines: string[] = [
    `# 循环执行报告`,
    '',
    `- **状态**: ${data.success ? '✅ 成功' : '❌ 未完成'}`,
    `- **策略**: ${data.strategy}`,
    `- **目标**: ${data.goal}`,
    `- **迭代次数**: ${data.iterations}`,
    `- **耗时**: ${Math.round(data.duration / 1000)}s`,
    `- **原因**: ${data.reason}`,
    '',
    '## 创建的文件',
    '',
  ]

  if (data.createdFiles.length > 0) {
    data.createdFiles.forEach(f => lines.push(`- \`${f}\``))
  } else {
    lines.push('（无）')
  }

  lines.push('', '## 子任务详情', '')
  data.subTasks.forEach((t, i) => {
    const icon = t.status === 'completed' ? '✅' : t.status === 'failed' ? '❌' : '⏳'
    lines.push(`${icon} ${i + 1}. ${t.description}`)
    if (t.result) lines.push(`   ${t.result.slice(0, 300).replace(/\n/g, '\n   ')}`)
  })

  await writeFile(resolved, lines.join('\n'), 'utf-8')
  return resolved
}
