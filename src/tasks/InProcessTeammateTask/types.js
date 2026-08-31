export function isInProcessTeammateTask(task) {
    return (typeof task === 'object' &&
        task !== null &&
        'type' in task &&
        task.type === 'in_process_teammate');
}
/**
 * Cap on the number of messages kept in task.messages (the AppState UI mirror).
 *
 * task.messages exists purely for the zoomed transcript dialog, which only
 * needs recent context. The full conversation lives in the local allMessages
 * array (inProcessRunner) and on disk at the agent transcript path.
 *
 * BQ analysis (round 9, 2026-03-20) showed ~20MB RSS per agent at 500+ turn
 * sessions and ~125MB per concurrent agent in swarm bursts. Whale session
 * 9a990de8 launched 292 agents in 2 minutes and reached 36.8GB. The dominant
 * cost is this array holding a second full copy of every message.
 */
export const TEAMMATE_MESSAGES_UI_CAP = 50;
/**
 * Append an item to a message array, capping the result at
 * TEAMMATE_MESSAGES_UI_CAP entries by dropping the oldest. Always returns
 * a new array (AppState immutability).
 */
export function appendCappedMessage(prev, item) {
    if (prev === undefined || prev.length === 0) {
        return [item];
    }
    if (prev.length >= TEAMMATE_MESSAGES_UI_CAP) {
        const next = prev.slice(-(TEAMMATE_MESSAGES_UI_CAP - 1));
        next.push(item);
        return next;
    }
    return [...prev, item];
}
