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

/** 验证模式 */
export type VerifyMode = 'none' | 'test' | 'build' | 'lint' | 'files'

/** 检查点状态（用于中断恢复） */
export interface CheckpointState {
  strategy: LoopStrategyName
  goal: string
  subTasks: SubTask[]
  iteration: number
  maxIterations: number
  savedAt: string
  createdFiles: string[]
}

/** A sub-task within a loop iteration */
export interface SubTask {
  id: string
  description: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  result?: string
  error?: string
  assignedTo?: string
  /** 依赖的子任务 id 列表（全部完成后本任务才可执行）— DAG 规划 */
  dependencies?: string[]
  /** 验证条件描述（该子任务完成标准） */
  verify?: string
  /** 优先级（越大越先执行，默认 0） */
  priority?: number
  /** 失败重试次数（自动修复引擎用） */
  attempts?: number
}

/** 用户决策函数（关键节点询问，返回选择） */
export type AskUserFn = (
  question: string,
  options: string[],
) => Promise<string>

/** Loop execution options */
export interface LoopOptions {
  strategy: LoopStrategyName
  goal: LoopGoal
  onProgress?: (event: LoopEvent) => void
  language?: 'zh' | 'en'
  /** 并行执行度（多个独立任务同时执行） */
  parallel?: number
  /** 时间预算（毫秒），超过自动停止 */
  budgetMs?: number
  /** 验证模式：任务完成后自动运行验证 */
  verifyMode?: VerifyMode
  /** 检查点文件路径（保存/恢复进度） */
  checkpoint?: string
  /** 最终报告输出路径 */
  report?: string
  /** B3 安全快照：执行前自动快照，失败可回滚（默认 false） */
  snapshot?: boolean
  /** B2 自动修复：验证失败后自动生成修复子任务重试（默认 true） */
  autoRepair?: boolean
  /** 验证失败最大修复次数（默认 2） */
  maxRepairAttempts?: number
  /** B4 进度汇报间隔（毫秒，默认 60_000） */
  progressIntervalMs?: number
  /** B4 关键节点询问函数（提供则启用询问） */
  askUser?: AskUserFn
  /** 连续无进展轮数阈值（触发询问，默认 3） */
  stagnantThreshold?: number
}

/** Loop event types */
export type LoopEvent =
  | { type: 'loop_start'; strategy: LoopStrategyName; goal: string }
  | { type: 'iteration_start'; iteration: number; maxIterations?: number }
  | { type: 'iteration_end'; iteration: number; result: string }
  | { type: 'task_start'; taskId: string; description: string }
  | { type: 'task_end'; taskId: string; success: boolean; output: string }
  | { type: 'task_failed'; taskId: string; error: string }
  | { type: 'decomposition'; subTasks: SubTask[] }
  | { type: 'evaluation'; achieved: boolean; reason: string }
  | { type: 'loop_end'; success: boolean; iterations: number; duration: number; reason: string }
  | { type: 'error'; error: string }
  | { type: 'warn'; message: string }
  // ─── B1 任务规划器事件 ───
  | { type: 'plan'; subTasks: SubTask[]; hasCycle: boolean }
  // ─── B2 自动修复事件 ───
  | { type: 'repair'; taskId: string; attempt: number; error: string }
  // ─── B3 安全快照事件 ───
  | { type: 'snapshot'; action: 'create' | 'restore' | 'cleanup' | 'skip'; snapshotId: string; label?: string }
  // ─── B4 进度汇报/询问事件 ───
  | { type: 'progress'; summary: string; iteration: number; completed: number; failed: number; elapsedMs: number }
  | { type: 'ask'; question: string; options: string[] }

/** Loop execution result */
export interface LoopResult {
  success: boolean
  iterations: number
  duration: number
  reason: string
  subTasks: SubTask[]
  finalOutput: string
}

/** 任务执行器类型 — 与 engine.ts 的 TaskExecutor 保持一致 */
export type TaskExecutor = (
  prompt: string,
  systemPrompt: string,
  task: SubTask,
) => Promise<{ success: boolean; output: string; error?: string }>

/** Loop strategy interface */
export interface LoopStrategy {
  readonly name: LoopStrategyName
  readonly displayName: string
  readonly description: string
  decompose(goal: LoopGoal): SubTask[]
  evaluate(goal: LoopGoal, subTasks: SubTask[]): { achieved: boolean; reason: string } | Promise<{ achieved: boolean; reason: string }>
  getSystemPrompt(goal: LoopGoal): string
  shouldContinue(iteration: number, maxIterations: number, subTasks: SubTask[]): boolean
  /**
   * 注入任务执行器（由 LoopEngine 在循环开始前调用）
   *
   * 策略可以保存此执行器引用，在 evaluate() 中执行图节点时使用。
   * 默认实现为空操作，不需要此功能的策略无需覆盖。
   */
  setTaskExecutor?(executor: TaskExecutor): void
  /**
   * 策略是否在 evaluate() 中自行处理任务执行
   *
   * 返回 true 时，LoopEngine 主循环不会主动执行 pending 任务，
   * 而是将所有执行控制权交给策略的 evaluate() 方法。
   * 默认返回 false，LoopEngine 按默认模式执行。
   */
  handlesOwnExecution?(): boolean
}
