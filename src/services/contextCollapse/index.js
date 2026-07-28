const stats = {
    collapsedSpans: 0,
    stagedSpans: 0,
    health: {
        totalErrors: 0,
        totalEmptySpawns: 0,
        emptySpawnWarningEmitted: false,
    },
};
const listeners = new Set();
export function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
export function getStats() {
    return stats;
}
export function isContextCollapseEnabled() {
    return false;
}
export function resetContextCollapse() { }
export async function applyCollapsesIfNeeded(messages) {
    return { messages, changed: false };
}
export function isWithheldPromptTooLong() {
    return false;
}
export function recoverFromOverflow(messages) {
    return messages;
}
//# sourceMappingURL=index.js.map