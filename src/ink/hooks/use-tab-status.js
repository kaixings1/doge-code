import { useContext, useEffect, useRef } from 'react';
import { CLEAR_TAB_STATUS, supportsTabStatus, tabStatus, wrapForMultiplexer, } from '../termio/osc.js';
import { TerminalWriteContext } from '../useTerminalNotification.js';
const rgb = (r, g, b) => ({
    type: 'rgb',
    r,
    g,
    b,
});
// Per the OSC 21337 usage guide's suggested mapping.
const TAB_STATUS_PRESETS = {
    idle: {
        indicator: rgb(0, 215, 95),
        status: 'Idle',
        statusColor: rgb(136, 136, 136),
    },
    busy: {
        indicator: rgb(255, 149, 0),
        status: 'Working…',
        statusColor: rgb(255, 149, 0),
    },
    waiting: {
        indicator: rgb(95, 135, 255),
        status: 'Waiting',
        statusColor: rgb(95, 135, 255),
    },
};
/**
 * Declaratively set the tab-status indicator (OSC 21337).
 *
 * Emits a colored dot + short status text to the tab sidebar. Terminals
 * that don't support OSC 21337 discard the sequence silently, so this is
 * safe to call unconditionally. Wrapped for tmux/screen passthrough.
 *
 * Pass `null` to opt out. If a status was previously set, transitioning to
 * `null` emits CLEAR_TAB_STATUS so toggling off mid-session doesn't leave
 * a stale dot. Process-exit cleanup is handled by ink.tsx's unmount path.
 */
export function useTabStatus(kind, sessionId) {
    const writeRaw = useContext(TerminalWriteContext);
    const prevKindRef = useRef(null);
    const prevSessionRef = useRef("");
    useEffect(() => {
        // When kind transitions from non-null to null (e.g. user toggles off
        // showStatusInTerminalTab mid-session), clear the stale dot.
        if (kind === null) {
            if ((prevKindRef.current !== null || prevSessionRef.current !== "") && writeRaw && supportsTabStatus()) {
                writeRaw(wrapForMultiplexer(CLEAR_TAB_STATUS));
            }
            prevKindRef.current = null;
            prevSessionRef.current = "";
            return;
        }
        prevKindRef.current = kind;
        prevSessionRef.current = sessionId || "";
        if (!writeRaw || !supportsTabStatus())
            return;
        const preset = TAB_STATUS_PRESETS[kind];
        // Append full session ID to status text for crash recovery
        const suffix = sessionId ? ` ${sessionId}` : '';
        writeRaw(wrapForMultiplexer(tabStatus({
            indicator: preset.indicator,
            status: preset.status + suffix,
            statusColor: preset.statusColor,
        })));
    }, [kind, sessionId, writeRaw]);
}
