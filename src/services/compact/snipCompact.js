export function snipCompactIfNeeded(messages, _options) {
    return { messages, changed: false };
}
export function isSnipBoundaryMessage() {
    return false;
}
