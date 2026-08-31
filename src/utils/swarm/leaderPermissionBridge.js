/**
 * Leader Permission Bridge
 *
 * Module-level bridge that allows the REPL to register its setToolUseConfirmQueue
 * and setToolPermissionContext functions for in-process teammates to use.
 *
 * When an in-process teammate requests permissions, it uses the standard
 * ToolUseConfirm dialog rather than the worker permission badge. This bridge
 * makes the REPL's queue setter and permission context setter accessible
 * from non-React code in the in-process runner.
 */
let registeredSetter = null;
let registeredPermissionContextSetter = null;
export function registerLeaderToolUseConfirmQueue(setter) {
    registeredSetter = setter;
}
export function getLeaderToolUseConfirmQueue() {
    return registeredSetter;
}
export function unregisterLeaderToolUseConfirmQueue() {
    registeredSetter = null;
}
export function registerLeaderSetToolPermissionContext(setter) {
    registeredPermissionContextSetter = setter;
}
export function getLeaderSetToolPermissionContext() {
    return registeredPermissionContextSetter;
}
export function unregisterLeaderSetToolPermissionContext() {
    registeredPermissionContextSetter = null;
}
