import { feature } from 'bun:bundle';
import { DreamTask } from './tasks/DreamTask/DreamTask.js';
import { LocalAgentTask } from './tasks/LocalAgentTask/LocalAgentTask.js';
import { LocalShellTask } from './tasks/LocalShellTask/LocalShellTask.js';
import { RemoteAgentTask } from './tasks/RemoteAgentTask/RemoteAgentTask.js';
const LocalWorkflowTask = feature('WORKFLOW_SCRIPTS')
    ? require('./tasks/LocalWorkflowTask/LocalWorkflowTask.js').LocalWorkflowTask
    : null;
const MonitorMcpTask = feature('MONITOR_TOOL')
    ? require('./tasks/MonitorMcpTask/MonitorMcpTask.js').MonitorMcpTask
    : null;
/**
 * Get all tasks.
 * Mirrors the pattern from tools.ts
 * Note: Returns array inline to avoid circular dependency issues with top-level const
 */
export function getAllTasks() {
    const tasks = [
        LocalShellTask,
        LocalAgentTask,
        RemoteAgentTask,
        DreamTask,
    ];
    if (LocalWorkflowTask)
        tasks.push(LocalWorkflowTask);
    if (MonitorMcpTask)
        tasks.push(MonitorMcpTask);
    return tasks;
}
/**
 * Get a task by its type.
 */
export function getTaskByType(type) {
    return getAllTasks().find(t => t.type === type);
}
//# sourceMappingURL=tasks.js.map