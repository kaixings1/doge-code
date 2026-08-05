import type { TaskStateBase } from '../../Task.js'

export type LocalWorkflowTaskState = TaskStateBase & {
  type: 'local_workflow'
  [key: string]: unknown
}

export function isLocalWorkflowTask(_value: unknown): boolean {
  return false
}

// ant-only（feature('WORKFLOW_SCRIPTS') 门控）的丢失导出。
// WORKFLOW_SCRIPTS 在当前构建中关闭，运行时不会调用；仅补签名以满足类型检查。
export function killWorkflowTask(_taskId: string, _setAppState: unknown): void {}

export function skipWorkflowAgent(
  _taskId: string,
  _agentId: string,
  _setAppState: unknown,
): void {}

export function retryWorkflowAgent(
  _taskId: string,
  _agentId: string,
  _setAppState: unknown,
): void {}
