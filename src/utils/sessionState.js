import { isEnvTruthy } from './envUtils.js';
import { enqueueSdkEvent } from './sdkEventQueue.js';
let stateListener = null;
let metadataListener = null;
let permissionModeListener = null;
export function setSessionStateChangedListener(cb) {
    stateListener = cb;
}
export function setSessionMetadataChangedListener(cb) {
    metadataListener = cb;
}
/**
 * Register a listener for permission-mode changes from onChangeAppState.
 * Wired by print.ts to emit an SDK system:status message so CCR/IDE clients
 * see mode transitions in real time — regardless of which code path mutated
 * toolPermissionContext.mode (Shift+Tab, ExitPlanMode dialog, slash command,
 * bridge set_permission_mode, etc.).
 */
export function setPermissionModeChangedListener(cb) {
    permissionModeListener = cb;
}
let hasPendingAction = false;
let currentState = 'idle';
export function getSessionState() {
    return currentState;
}
export function notifySessionStateChanged(state, details) {
    currentState = state;
    stateListener?.(state, details);
    // Mirror details into external_metadata so GetSession carries the
    // pending-action context without proto changes. Cleared via RFC 7396
    // null on the next non-blocked transition.
    if (state === 'requires_action' && details) {
        hasPendingAction = true;
        metadataListener?.({
            pending_action: details,
        });
    }
    else if (hasPendingAction) {
        hasPendingAction = false;
        metadataListener?.({ pending_action: null });
    }
    // task_summary is written mid-turn by the forked summarizer; clear it at
    // idle so the next turn doesn't briefly show the previous turn's progress.
    if (state === 'idle') {
        metadataListener?.({ task_summary: null });
    }
    // Mirror to the SDK event stream so non-CCR consumers (scmuxd, VS Code)
    // see the same authoritative idle/running signal the CCR bridge does.
    // 'idle' fires after heldBackResult flushes — lets scmuxd flip IDLE and
    // show the bg-task dot instead of a stuck generating spinner.
    //
    // Opt-in until CCR web + mobile clients learn to ignore this subtype in
    // their isWorking() last-message heuristics — the trailing idle event
    // currently pins them at "Running...".
    // https://anthropic.slack.com/archives/C093BJBD1CP/p1774152406752229
    if (isEnvTruthy(process.env.CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS)) {
        enqueueSdkEvent({
            type: 'system',
            subtype: 'session_state_changed',
            state,
        });
    }
}
export function notifySessionMetadataChanged(metadata) {
    metadataListener?.(metadata);
}
/**
 * Fired by onChangeAppState when toolPermissionContext.mode changes.
 * Downstream listeners (CCR external_metadata PUT, SDK status stream) are
 * both wired through this single choke point so no mode-mutation path can
 * silently bypass them.
 */
export function notifyPermissionModeChanged(mode) {
    permissionModeListener?.(mode);
}
