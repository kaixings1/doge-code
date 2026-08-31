export function isMonitorMcpTask(_value) {
    return false;
}
// ant-only（feature('MONITOR_TOOL') 门控）的丢失导出。
// MONITOR_TOOL 在当前构建中关闭，运行时不会调用；仅补签名以满足类型检查。
export function killMonitorMcp(_taskId, _setAppState) { }
export function killMonitorMcpTasksForAgent(_agentId, _getAppState, _setAppState) { }
