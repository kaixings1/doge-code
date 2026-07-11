// Union of all concrete task state types
// Use this for components that need to work with any task type
/**
 * Check if a task should be shown in the background tasks indicator.
 * A task is considered a background task if:
 * 1. It is running or pending
 * 2. It has been explicitly backgrounded (not a foreground task)
 */
export function isBackgroundTask(task) {
    if (task.status !== 'running' && task.status !== 'pending') {
        return false;
    }
    // Foreground tasks (isBackgrounded === false) are not yet "background tasks"
    if ('isBackgrounded' in task && task.isBackgrounded === false) {
        return false;
    }
    return true;
}
