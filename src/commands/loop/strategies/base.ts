/**
 * Base Loop Strategy
 *
 * Abstract base class for all loop strategies.
 * Provides default implementations that strategies can override.
 */

import type { LoopGoal, LoopStrategy, SubTask, LoopStrategyName } from '../types.js'

export abstract class BaseLoopStrategy implements LoopStrategy {
  abstract readonly name: LoopStrategyName
  abstract readonly displayName: string
  abstract readonly description: string

  decompose(goal: LoopGoal): SubTask[] {
    if (goal.subTasks && goal.subTasks.length > 0) {
      return goal.subTasks
    }
    return [{
      id: `task-${Date.now()}`,
      description: goal.description,
      status: 'pending',
    }]
  }

  async evaluate(goal: LoopGoal, subTasks: SubTask[]): Promise<{ achieved: boolean; reason: string }> {
    if (goal.successCriteria && goal.successCriteria.length > 0) {
      const completedCount = subTasks.filter(t => t.status === 'completed').length
      const allDone = subTasks.length > 0 && completedCount === subTasks.length
      return {
        achieved: allDone,
        reason: allDone
          ? `所有 ${subTasks.length} 个子任务已完成`
          : `已完成 ${completedCount}/${subTasks.length} 个子任务`,
      }
    }
    const completed = subTasks.filter(t => t.status === 'completed').length
    const total = subTasks.length
    return {
      achieved: total > 0 && completed === total,
      reason: `进度: ${completed}/${total} 子任务完成`,
    }
  }

  getSystemPrompt(_goal: LoopGoal): string {
    return `你是一个自动化任务执行引擎。按照给定的策略执行任务，直到目标达成。`
  }

  shouldContinue(iteration: number, maxIterations: number, _subTasks: SubTask[]): boolean {
    return iteration < maxIterations
  }

  protected createTask(description: string): SubTask {
    return {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      description,
      status: 'pending',
    }
  }
}
