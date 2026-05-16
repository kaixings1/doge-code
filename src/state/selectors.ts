/**
 * 从 AppState 派生计算状态的选择器。
 * 保持选择器纯且简单——仅提取数据，无副作用。
 */

import type { InProcessTeammateTaskState } from '../tasks/InProcessTeammateTask/types.js'
import { isInProcessTeammateTask } from '../tasks/InProcessTeammateTask/types.js'
import type { LocalAgentTaskState } from '../tasks/LocalAgentTask/LocalAgentTask.js'
import type { AppState } from './AppStateStore.js'

/**
 * 获取当前正在查看的队友任务（如果有）。
 * 在以下情况下返回 undefined：
 * - 没有正在查看的队友（viewingAgentTaskId 为 undefined）
 * - 任务 ID 在 tasks 中不存在
 * - 该任务不是进程内队友任务
 */
export function getViewedTeammateTask(
  appState: Pick<AppState, 'viewingAgentTaskId' | 'tasks'>,
): InProcessTeammateTaskState | undefined {
  const { viewingAgentTaskId, tasks } = appState

  // 未查看任何队友
  if (!viewingAgentTaskId) {
    return undefined
  }

  // 查找任务
  const task = tasks[viewingAgentTaskId]
  if (!task) {
    return undefined
  }

  // 验证是否为进程内队友任务
  if (!isInProcessTeammateTask(task)) {
    return undefined
  }

  return task
}

/**
 * getActiveAgentForInput 选择器的返回类型。
 * 用于类型安全输入路由的区分联合。
 */
export type ActiveAgentForInput =
  | { type: 'leader' }
  | { type: 'viewed'; task: InProcessTeammateTaskState }
  | { type: 'named_agent'; task: LocalAgentTaskState }

/**
 * 确定用户输入应路由到哪里。
 * 返回值：
 * - { type: 'leader' } 未查看队友时（输入发往领导者）
 * - { type: 'viewed', task } 查看代理时（输入发往该代理）
 *
 * 由输入路由逻辑用于将用户消息引导到正确的代理。
 */
export function getActiveAgentForInput(
  appState: AppState,
): ActiveAgentForInput {
  const viewedTask = getViewedTeammateTask(appState)
  if (viewedTask) {
    return { type: 'viewed', task: viewedTask }
  }

  const { viewingAgentTaskId, tasks } = appState
  if (viewingAgentTaskId) {
    const task = tasks[viewingAgentTaskId]
    if (task?.type === 'local_agent') {
      return { type: 'named_agent', task }
    }
  }

  return { type: 'leader' }
}
