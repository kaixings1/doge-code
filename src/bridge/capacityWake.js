/**
 * Shared capacity-wake primitive for bridge poll loops.
 *
 * Both replBridge.ts and bridgeMain.ts need to sleep while "at capacity"
 * but wake early when either (a) the outer loop signal aborts (shutdown),
 * or (b) capacity frees up (session done / transport lost). This module
 * encapsulates the mutable wake-controller + two-signal merger that both
 * poll loops previously duplicated byte-for-byte.
 */
export function createCapacityWake(outerSignal) {
    let wakeController = new AbortController();
    function wake() {
        wakeController.abort();
        wakeController = new AbortController();
    }
    function signal() {
        const merged = new AbortController();
        const abort = () => merged.abort();
        if (outerSignal.aborted || wakeController.signal.aborted) {
            merged.abort();
            return { signal: merged.signal, cleanup: () => { } };
        }
        outerSignal.addEventListener('abort', abort, { once: true });
        const capSig = wakeController.signal;
        capSig.addEventListener('abort', abort, { once: true });
        return {
            signal: merged.signal,
            cleanup: () => {
                outerSignal.removeEventListener('abort', abort);
                capSig.removeEventListener('abort', abort);
            },
        };
    }
    return { signal, wake };
}
