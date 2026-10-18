import type { SetAppState, Task, TaskStateBase } from '../../Task.js'
import { createTaskStateBase, generateTaskId } from '../../Task.js'
import { createAbortController } from '../../utils/abortController.js'
import { registerCleanup } from '../../utils/cleanupRegistry.js'
import { evictTaskOutput } from '../../utils/task/diskOutput.js'
import { updateTaskState } from '../../utils/task/framework.js'

export type LocalWorkflowTaskState = TaskStateBase & {
  type: 'local_workflow'
  workflowName: string
  steps: string[]
  currentStep: number
  stepResults: string[]
  failed: boolean
  summary?: string
  abortController?: AbortController
  unregisterCleanup?: () => void
}

export function isLocalWorkflowTask(value: unknown): value is LocalWorkflowTaskState {
  return typeof value === 'object' && value !== null && 'type' in value && value.type === 'local_workflow'
}

/**
 * 创建并注册一个 local_workflow 后台任务。
 * 由 WorkflowTool 的 run 路径调用（feature('WORKFLOW_SCRIPTS') 门控）。
 * 返回构造好的状态对象，调用方负责驱动 steps 循环并每步 updateTaskState。
 */
export function registerWorkflowTask(params: {
  workflowName: string
  steps: string[]
  setAppState: SetAppState
}): LocalWorkflowTaskState {
  const abortController = createAbortController()
  const taskId = generateTaskId('local_workflow')
  const taskState: LocalWorkflowTaskState = {
    ...createTaskStateBase(taskId, 'local_workflow', params.workflowName),
    type: 'local_workflow',
    status: 'running',
    workflowName: params.workflowName,
    steps: params.steps,
    currentStep: 0,
    stepResults: [],
    failed: false,
    abortController,
  }

  const unregisterCleanup = registerCleanup(async () => {
    killWorkflowTask(taskState.id, params.setAppState)
  })
  taskState.unregisterCleanup = unregisterCleanup

  params.setAppState(prev => {
    const { [taskState.id]: _existing, ...rest } = prev.tasks ?? {}
    return {
      ...prev,
      tasks: {
        ...rest,
        [taskState.id]: taskState,
      },
    }
  })

  return taskState
}

/**
 * Kill 一个 workflow 任务。无操作若已非 running。
 */
export function killWorkflowTask(taskId: string, setAppState: SetAppState): void {
  let killed = false
  updateTaskState<LocalWorkflowTaskState>(taskId, setAppState, task => {
    if (task.status !== 'running') {
      return task
    }
    killed = true
    task.abortController?.abort()
    task.unregisterCleanup?.()
    return {
      ...task,
      status: 'killed',
      endTime: Date.now(),
      abortController: undefined,
      unregisterCleanup: undefined,
    }
  })
  if (killed) {
    void evictTaskOutput(taskId)
  }
}

/**
 * skipWorkflowAgent / retryWorkflowAgent 在当前 workflow 模型中无独立「agent」子单元
 * （steps 是同步顺序循环，见 WorkflowTool.executeWorkflowStep）。保留签名与接线点，
 * 行为为 no-op，避免 BackgroundTasksDialog 的 onSkipAgent/onRetryAgent 悬空。
 * 若未来 workflow 引入可中断的并发 step 子单元，再在此接入真实逻辑。
 */
export function skipWorkflowAgent(
  _taskId: string,
  _agentId: string,
  _setAppState: SetAppState,
): void {}

export function retryWorkflowAgent(
  _taskId: string,
  _agentId: string,
  _setAppState: SetAppState,
): void {}

/**
 * 推进 workflow 后台任务的进度（每步调用）。Abort 中断时也走此函数置 terminal 态。
 * partial 仅含要更新的字段；status 为可选，用于把任务置为 killed/completed 等终态。
 */
export function updateWorkflowProgress(
  taskId: string,
  setAppState: SetAppState,
  partial: {
    currentStep?: number
    stepResults?: string[]
    failed?: boolean
    status?: TaskStateBase['status']
  },
): void {
  updateTaskState<LocalWorkflowTaskState>(taskId, setAppState, task => {
    const next: LocalWorkflowTaskState = {
      ...task,
      currentStep: partial.currentStep ?? task.currentStep,
      stepResults: partial.stepResults ?? task.stepResults,
      failed: partial.failed ?? task.failed,
    }
    if (partial.status) {
      next.status = partial.status
      if (next.status !== 'running') {
        next.endTime = Date.now()
        next.abortController = void 0
        next.unregisterCleanup = void 0
      }
    }
    return next
  })
}

/**
 * 标记 workflow 任务完成（成功）。
 */
export function completeWorkflowTask(taskId: string, summary: string, setAppState: SetAppState): void {
  updateTaskState<LocalWorkflowTaskState>(taskId, setAppState, task => {
    if (task.status !== 'running') return task
    task.unregisterCleanup?.()
    return {
      ...task,
      status: 'completed',
      summary,
      endTime: Date.now(),
      abortController: void 0,
      unregisterCleanup: void 0,
    }
  })
}

/**
 * 标记 workflow 任务失败。
 */
export function failWorkflowTask(taskId: string, summary: string, setAppState: SetAppState): void {
  updateTaskState<LocalWorkflowTaskState>(taskId, setAppState, task => {
    if (task.status !== 'running') return task
    task.unregisterCleanup?.()
    return {
      ...task,
      status: 'failed',
      failed: true,
      summary,
      endTime: Date.now(),
      abortController: void 0,
      unregisterCleanup: void 0,
    }
  })
}

export const LocalWorkflowTask: Task = {
  name: 'LocalWorkflowTask',
  type: 'local_workflow',
  async kill(taskId: string, setAppState: SetAppState) {
    killWorkflowTask(taskId, setAppState)
  },
}
