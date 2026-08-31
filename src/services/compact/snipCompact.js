export function snipCompactIfNeeded(messages, _options) {
    return { messages, changed: false };
}
export function isSnipBoundaryMessage() {
    return false;
}
export function isSnipRuntimeEnabled() {
    return false;
}
export const SNIP_NUDGE_TEXT = '';
