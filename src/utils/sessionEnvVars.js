/**
 * Session-scoped environment variables set via /env.
 * Applied only to spawned child processes (via bash provider env overrides),
 * not to the REPL process itself.
 */
const sessionEnvVars = new Map();
export function getSessionEnvVars() {
    return sessionEnvVars;
}
export function setSessionEnvVar(name, value) {
    sessionEnvVars.set(name, value);
}
export function deleteSessionEnvVar(name) {
    sessionEnvVars.delete(name);
}
export function clearSessionEnvVars() {
    sessionEnvVars.clear();
}
