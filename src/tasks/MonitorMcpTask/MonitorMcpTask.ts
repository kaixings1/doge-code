import type { TaskStateBase } from '../../Task.js'

export type MonitorMcpTaskState = TaskStateBase & {
  type: 'monitor_mcp'
  [key: string]: unknown
}

export function isMonitorMcpTask(_value: unknown): boolean {
  return false
}

// ant-only（feature('MONITOR_TOOL') 门控）的丢失导出。
// MONITOR_TOOL 在当前构建中关闭，运行时不会调用；仅补签名以满足类型检查。
export function killMonitorMcp(_taskId: string, _setAppState: unknown): void {}

export function killMonitorMcpTasksForAgent(
  _agentId: string,
  _getAppState: unknown,
  _setAppState: unknown,
): void {}
