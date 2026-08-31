import { randomUUID } from 'crypto';
import { getIsNonInteractiveSession, getSessionId } from '../bootstrap/state.js';
const MAX_QUEUE_SIZE = 1000;
const queue = [];
export function enqueueSdkEvent(event) {
    // SDK events are only consumed (drained) in headless/streaming mode.
    // In TUI mode they would accumulate up to the cap and never be read.
    if (!getIsNonInteractiveSession()) {
        return;
    }
    if (queue.length >= MAX_QUEUE_SIZE) {
        queue.shift();
    }
    queue.push(event);
}
export function drainSdkEvents() {
    if (queue.length === 0) {
        return [];
    }
    const events = queue.splice(0);
    return events.map(e => ({
        ...e,
        uuid: randomUUID(),
        session_id: getSessionId(),
    }));
}
/**
 * Emit a task_notification SDK event for a task reaching a terminal state.
 *
 * registerTask() always emits task_started; this is the closing bookend.
 * Call this from any exit path that sets a task terminal WITHOUT going
 * through enqueuePendingNotification-with-<task-id> (print.ts parses that
 * XML into the same SDK event, so paths that do both would double-emit).
 * Paths that suppress the XML notification (notified:true pre-set, kill
 * paths, abort branches) must call this directly so SDK consumers
 * (Scuttle's bg-task dot, VS Code subagent panel) see the task close.
 */
export function emitTaskTerminatedSdk(taskId, status, opts) {
    enqueueSdkEvent({
        type: 'system',
        subtype: 'task_notification',
        task_id: taskId,
        tool_use_id: opts?.toolUseId,
        status,
        output_file: opts?.outputFile ?? '',
        summary: opts?.summary ?? '',
        usage: opts?.usage,
    });
}
