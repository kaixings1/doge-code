let active = false;
let paused = false;
let contextBlocked = false;
let nextTickAt = null;
const listeners = new Set();
function emit() {
    for (const listener of listeners)
        listener();
}
export function subscribeToProactiveChanges(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
export function isProactiveActive() {
    return active;
}
export function isProactivePaused() {
    return paused;
}
export function activateProactive(_source) {
    active = true;
    paused = false;
    nextTickAt = null;
    emit();
}
export function deactivateProactive() {
    active = false;
    paused = false;
    nextTickAt = null;
    emit();
}
export function pauseProactive() {
    paused = true;
    emit();
}
export function resumeProactive() {
    paused = false;
    emit();
}
export function setContextBlocked(value) {
    contextBlocked = value;
    void contextBlocked;
    emit();
}
export function getNextTickAt() {
    return nextTickAt;
}
