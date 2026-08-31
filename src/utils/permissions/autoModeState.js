// Auto mode state functions — lives in its own module so callers can
// conditionally require() it on feature('TRANSCRIPT_CLASSIFIER').
let autoModeActive = false;
let autoModeFlagCli = false;
// Set by the async verifyAutoModeGateAccess check when it
// reads a fresh tengu_auto_mode_config.enabled === 'disabled' from GrowthBook.
// Used by isAutoModeGateEnabled() to block SDK/explicit re-entry after kick-out.
let autoModeCircuitBroken = false;
export function setAutoModeActive(active) {
    autoModeActive = active;
}
export function isAutoModeActive() {
    return autoModeActive;
}
export function setAutoModeFlagCli(passed) {
    autoModeFlagCli = passed;
}
export function getAutoModeFlagCli() {
    return autoModeFlagCli;
}
export function setAutoModeCircuitBroken(broken) {
    autoModeCircuitBroken = broken;
}
export function isAutoModeCircuitBroken() {
    return autoModeCircuitBroken;
}
export function _resetForTesting() {
    autoModeActive = false;
    autoModeFlagCli = false;
    autoModeCircuitBroken = false;
}
