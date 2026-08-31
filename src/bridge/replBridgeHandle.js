import { updateSessionBridgeId } from '../utils/concurrentSessions.js';
import { toCompatSessionId } from './sessionIdCompat.js';
/**
 * Global pointer to the active REPL bridge handle, so callers outside
 * useReplBridge's React tree (tools, slash commands) can invoke handle methods
 * like subscribePR. Same one-bridge-per-process justification as bridgeDebug.ts
 * — the handle's closure captures the sessionId and getAccessToken that created
 * the session, and re-deriving those independently (BriefTool/upload.ts pattern)
 * risks staging/prod token divergence.
 *
 * Set from useReplBridge.tsx when init completes; cleared on teardown.
 */
let handle = null;
export function setReplBridgeHandle(h) {
    handle = h;
    // Publish (or clear) our bridge session ID in the session record so other
    // local peers can dedup us out of their bridge list — local is preferred.
    void updateSessionBridgeId(getSelfBridgeCompatId() ?? null).catch(() => { });
}
export function getReplBridgeHandle() {
    return handle;
}
/**
 * Our own bridge session ID in the session_* compat format the API returns
 * in /v1/sessions responses — or undefined if bridge isn't connected.
 */
export function getSelfBridgeCompatId() {
    const h = getReplBridgeHandle();
    return h ? toCompatSessionId(h.bridgeSessionId) : undefined;
}
