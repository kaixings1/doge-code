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
import type { LoopGoal, LoopOptions, LoopResult, LoopEvent, SubTask } from './types.js'
import { getStrategy } from './strategies/index.js'

const DEFAULT_MAX_ITERATIONS = 20

interface LoopState {
  iteration: number
  maxIterations: number
  subTasks: SubTask[]
  history: Array<{ iteration: number; event: string; details?: string }>
  startTime: number
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
 * 执行目标导向循环
 */
export async function executeLoop(options: LoopEngineOptions): Promise<LoopResult> {
  const strategy = getStrategy(options.strategy)
  const goal: LoopGoal = {
    ...options.goal,
    maxIterations: options.goal.maxIterations ?? DEFAULT_MAX_ITERATIONS,
  }

  const state: LoopState = {
    iteration: 0,
    maxIterations: goal.maxIterations,
    subTasks: [],
    history: [],
    startTime: Date.now(),
  }

  const emit = (event: LoopEvent) => { options.onProgress?.(event) }

  emit({ type: 'loop_start', strategy: options.strategy, goal: goal.description })

  try {
    // 注入任务执行器，使策略能够在 evaluate() 中驱动图节点执行
    if (options.taskExecutor && strategy.setTaskExecutor) {
      strategy.setTaskExecutor(options.taskExecutor)
    }

    state.subTasks = strategy.decompose(goal)
    emit({ type: 'decomposition', subTasks: state.subTasks })

    while (strategy.shouldContinue(state.iteration, state.maxIterations, state.subTasks)) {
      state.iteration++
      emit({ type: 'iteration_start', iteration: state.iteration })

      try {
        const currentTask = state.subTasks.find(t => t.status === 'pending' || t.status === 'running')
        if (!currentTask) {
          const evaluation = strategy.evaluate(goal, state.subTasks)
          if (evaluation.achieved) {
            emit({ type: 'evaluation', achieved: true, reason: evaluation.reason })
            break
          }
          const newTasks = strategy.decompose(goal)
          if (newTasks.length > state.subTasks.length) {
            state.subTasks.push(...newTasks.slice(state.subTasks.length))
          } else {
            break
          }
        }

        if (currentTask) {
          currentTask.status = 'running'
          emit({ type: 'task_start', taskId: currentTask.id, description: currentTask.description })

          const systemPrompt = strategy.getSystemPrompt(goal)
          const taskPrompt = buildTaskPrompt(goal, currentTask, state)

          let result: { success: boolean; output: string; error?: string }

          if (options.taskExecutor) {
            // 使用外部执行器（AgentTool/QueryEngine）
            result = await options.taskExecutor(taskPrompt, systemPrompt, currentTask)
          } else {
            // 默认执行器：基于任务类型自动选择执行方式
            result = await executeTaskWithStrategy(currentTask, taskPrompt, systemPrompt)
          }

          currentTask.status = result.success ? 'completed' : 'failed'
          currentTask.result = result.output
          currentTask.error = result.error

          if (result.success) {
            emit({ type: 'task_end', taskId: currentTask.id, success: true, output: result.output })
          } else {
            emit({ type: 'task_failed', taskId: currentTask.id, error: result.error ?? 'Unknown error' })
          }
        }

        const evaluation = strategy.evaluate(goal, state.subTasks)
        emit({ type: 'evaluation', achieved: evaluation.achieved, reason: evaluation.reason })

        if (evaluation.achieved) {
          emit({ type: 'iteration_end', iteration: state.iteration, result: evaluation.reason })
          break
        }

        emit({ type: 'iteration_end', iteration: state.iteration, result: evaluation.reason })
        state.history.push({ iteration: state.iteration, event: 'iteration_complete', details: evaluation.reason })

      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error)
        emit({ type: 'error', error: errMsg })
        state.history.push({ iteration: state.iteration, event: 'error', details: errMsg })
      }
    }

    const finalEvaluation = strategy.evaluate(goal, state.subTasks)
    const duration = Date.now() - state.startTime

    const result: LoopResult = {
      success: finalEvaluation.achieved,
      iterations: state.iteration,
      duration,
      reason: finalEvaluation.reason,
      subTasks: state.subTasks,
      finalOutput: buildFinalOutput(state.subTasks, finalEvaluation),
    }

    emit({ type: 'loop_end', success: result.success, iterations: result.iterations, duration: result.duration, reason: result.reason })

    return result

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
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
  return `## 目标
${goal.description}

## 当前任务 (迭代 ${state.iteration}/${state.maxIterations})
${task.description}

## 子任务状态
${state.subTasks.map((t, i) => `${i + 1}. [${t.status}] ${t.description}`).join('\n')}

## 成功标准
${goal.successCriteria?.map((c, i) => `${i + 1}. ${c}`).join('\n') || '完成所有子任务'}

请执行当前任务，输出结果。`
}

function buildFinalOutput(subTasks: SubTask[], evaluation: { achieved: boolean; reason: string }): string {
  const lines: string[] = []
  lines.push(`# 循环执行结果`)
  lines.push('')
  lines.push(`状态: ${evaluation.achieved ? ' 成功' : ' 未完成'}`)
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
