export function isLocalWorkflowTask(_value) {
    return false;
}
// ant-only（feature('WORKFLOW_SCRIPTS') 门控）的丢失导出。
// WORKFLOW_SCRIPTS 在当前构建中关闭，运行时不会调用；仅补签名以满足类型检查。
export function killWorkflowTask(_taskId, _setAppState) { }
export function skipWorkflowAgent(_taskId, _agentId, _setAppState) { }
export function retryWorkflowAgent(_taskId, _agentId, _setAppState) { }
