let listener = null;
export function setCommandLifecycleListener(cb) {
    listener = cb;
}
export function notifyCommandLifecycle(uuid, state) {
    listener?.(uuid, state);
}
