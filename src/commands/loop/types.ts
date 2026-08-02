/**
 * Loop Engine Types
 *
 * Shared types for the goal-oriented loop engine.
 * Inspired by LangGraph, CrewAI, AutoGPT, OpenHands, SWE-agent.
 */

/** Loop strategy identifiers */
export type LoopStrategyName = 'langgraph' | 'crew' | 'autogpt' | 'openhands' | 'swe-agent'

/** Goal specification */
export interface LoopGoal {
  description: string
  subTasks?: SubTask[]
  successCriteria?: string[]
  maxIterations?: number
  maxConcurrent?: number
}

/** A sub-task within a loop iteration */
export interface SubTask {
  id: string
  description: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  result?: string
  error?: string
  assignedTo?: string
}

/** Loop execution options */
export interface LoopOptions {
  strategy: LoopStrategyName
  goal: LoopGoal
  onProgress?: (event: LoopEvent) => void
  language?: 'zh' | 'en'
}

/** Loop event types */
export type LoopEvent =
  | { type: 'loop_start'; strategy: LoopStrategyName; goal: string }
  | { type: 'iteration_start'; iteration: number }
  | { type: 'iteration_end'; iteration: number; result: string }
  | { type: 'task_start'; taskId: string; description: string }
  | { type: 'task_end'; taskId: string; success: boolean; output: string }
  | { type: 'task_failed'; taskId: string; error: string }
  | { type: 'decomposition'; subTasks: SubTask[] }
  | { type: 'evaluation'; achieved: boolean; reason: string }
  | { type: 'loop_end'; success: boolean; iterations: number; duration: number; reason: string }
  | { type: 'error'; error: string }
  | { type: 'warn'; message: string }

/** Loop execution result */
export interface LoopResult {
  success: boolean
  iterations: number
  duration: number
  reason: string
  subTasks: SubTask[]
  finalOutput: string
}

/** Loop strategy interface */
export interface LoopStrategy {
  readonly name: LoopStrategyName
  readonly displayName: string
  readonly description: string
  decompose(goal: LoopGoal): SubTask[]
  evaluate(goal: LoopGoal, subTasks: SubTask[]): { achieved: boolean; reason: string }
  getSystemPrompt(goal: LoopGoal): string
  shouldContinue(iteration: number, maxIterations: number, subTasks: SubTask[]): boolean
}
