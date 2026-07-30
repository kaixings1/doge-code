/**
 * WorkflowAutomation — 工作流自动化数据模型
 */

export interface WorkflowStep {
  id: string
  name: string
  description?: string
  /** 步骤类型：prompt | tool | condition | loop */
  type: 'prompt' | 'tool' | 'condition' | 'loop'
  /** 步骤参数 */
  params: Record<string, unknown>
  /** 下一步 ID（条件分支时使用） */
  nextStepId?: string
  /** 条件满足时的下一步 */
  trueStepId?: string
  /** 条件不满足时的下一步 */
  falseStepId?: string
  /** 循环体的下一步 */
  loopStepId?: string
  /** 循环结束后的下一步 */
  afterLoopStepId?: string
}

export interface WorkflowDefinition {
  id: string
  name: string
  description?: string
  icon?: string
  /** 步骤列表 */
  steps: WorkflowStep[]
  /** 触发器类型 */
  trigger: 'manual' | 'file-save' | 'timer'
  /** 触发器配置 */
  triggerConfig?: Record<string, unknown>
  /** 是否是内置模板 */
  isTemplate?: boolean
  /** 创建时间 */
  createdAt: number
  /** 最后执行时间 */
  lastRunAt?: number
}

export interface WorkflowRunResult {
  /** 工作流 ID */
  workflowId: string
  /** 执行状态 */
  status: 'running' | 'completed' | 'failed' | 'cancelled'
  /** 开始时间 */
  startedAt: number
  /** 结束时间 */
  finishedAt?: number
  /** 每一步的结果 */
  stepResults: Array<{
    stepId: string
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
    output?: string
    error?: string
    durationMs: number
  }>
  /** 最终输出 */
  output?: string
  /** 错误信息 */
  error?: string
}
