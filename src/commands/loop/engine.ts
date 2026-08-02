/**
 * Loop Engine Core
 *
 * Orchestrates the goal-oriented loop execution.
 * Wraps strategies and manages the iteration lifecycle.
 */

import type { LoopGoal, LoopOptions, LoopResult, LoopEvent, SubTask, LoopStrategyName } from './types.js'
import { getStrategy } from './strategies/index.js'

/** Default max iterations per loop */
const DEFAULT_MAX_ITERATIONS = 20

/** Loop execution state */
interface LoopState {
  iteration: number
  maxIterations: number
  subTasks: SubTask[]
  history: Array<{ iteration: number; event: string; details?: string }>
  startTime: number
}

/**
 * Execute a goal-oriented loop.
 *
 * @param options - Loop execution options
 * @returns Loop execution result
 */
export async function executeLoop(options: LoopOptions): Promise<LoopResult> {
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

  const emit = (event: LoopEvent) => {
    options.onProgress?.(event)
  }

  emit({ type: 'loop_start', strategy: options.strategy, goal: goal.description })

  try {
    // Phase 1: Decompose goal into sub-tasks
    state.subTasks = strategy.decompose(goal)
    emit({ type: 'decomposition', subTasks: state.subTasks })

    // Phase 2: Execute loop
    while (strategy.shouldContinue(state.iteration, state.maxIterations, state.subTasks)) {
      state.iteration++
      emit({ type: 'iteration_start', iteration: state.iteration })

      try {
        // Execute current sub-task
        const currentTask = state.subTasks.find(t => t.status === 'pending' || t.status === 'running')
        if (!currentTask) {
          // All tasks done or need re-decomposition
          const evaluation = strategy.evaluate(goal, state.subTasks)
          if (evaluation.achieved) {
            emit({ type: 'evaluation', achieved: true, reason: evaluation.reason })
            break
          }
          // Re-decompose if needed
          const newTasks = strategy.decompose(goal)
          if (newTasks.length > state.subTasks.length) {
            state.subTasks.push(...newTasks.slice(state.subTasks.length))
          } else {
            // No new tasks, check if we should stop
            break
          }
        }

        // Mark task as running
        if (currentTask) {
          currentTask.status = 'running'
          emit({ type: 'task_start', taskId: currentTask.id, description: currentTask.description })

          // Generate execution prompt
          const systemPrompt = strategy.getSystemPrompt(goal)
          const taskPrompt = buildTaskPrompt(goal, currentTask, state)

          // In a real implementation, this would call the AI API
          // For now, we simulate the execution
          const result = await simulateTaskExecution(currentTask, taskPrompt, systemPrompt)

          currentTask.status = result.success ? 'completed' : 'failed'
          currentTask.result = result.output
          currentTask.error = result.error

          if (result.success) {
            emit({ type: 'task_end', taskId: currentTask.id, success: true, output: result.output })
          } else {
            emit({ type: 'task_failed', taskId: currentTask.id, error: result.error ?? 'Unknown error' })
          }
        }

        // Evaluate progress
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

    // Phase 3: Build result
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

    emit({
      type: 'loop_end',
      success: result.success,
      iterations: result.iteration,
      duration: result.duration,
      reason: result.reason,
    })

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

/** Build task execution prompt */
function buildTaskPrompt(goal: LoopGoal, task: SubTask, state: LoopState): string {
  return `## 目标
${goal.description}

## 当前任务 (迭代 ${state.iteration}/${state.maxIterations})
${task.description}

## 子任务状态
${state.subTasks.map((t, i) => `${i + 1}. [${t.status}] ${t.description}`).join('\n')}

## 成功标准
${goal.successCriteria?.map((c, i) => `${i + 1}. ${c}`).join('\n') || '完成所有子任务'}

请执行当前任务，输出结果。如果任务完成，标记为 completed；如果失败，说明原因。`
}

/** Build final output from sub-tasks */
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

/** Simulate task execution (placeholder for real AI API call) */
async function simulateTaskExecution(
  task: SubTask,
  prompt: string,
  systemPrompt: string,
): Promise<{ success: boolean; output: string; error?: string }> {
  // In production, this would call the AI API (Anthropic/OpenAI)
  // For now, return a simulated result
  void prompt
  void systemPrompt

  // Simulate async work
  await new Promise(resolve => setTimeout(resolve, 10))

  return {
    success: true,
    output: `任务 "${task.description}" 已执行完成（模拟结果）。在实际运行中，这里会调用 AI API 执行任务。`,
  }
}

/** Validate strategy name */
export function isValidStrategy(name: string): name is LoopStrategyName {
  return ['langgraph', 'crew', 'autogpt', 'openhands', 'swe-agent'].includes(name)
}
