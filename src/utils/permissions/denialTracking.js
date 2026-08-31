/**
 * Denial tracking infrastructure for permission classifiers.
 * Tracks consecutive denials and total denials to determine
 * when to fall back to prompting.
 */
export const DENIAL_LIMITS = {
    maxConsecutive: 3,
    maxTotal: 20,
};
export function createDenialTrackingState() {
    return {
        consecutiveDenials: 0,
        totalDenials: 0,
    };
}
export function recordDenial(state) {
    return {
        ...state,
        consecutiveDenials: state.consecutiveDenials + 1,
        totalDenials: state.totalDenials + 1,
    };
}
export function recordSuccess(state) {
    if (state.consecutiveDenials === 0)
        return state; // No change needed
    return {
        ...state,
        consecutiveDenials: 0,
    };
}
export function shouldFallbackToPrompting(state) {
    return (state.consecutiveDenials >= DENIAL_LIMITS.maxConsecutive ||
        state.totalDenials >= DENIAL_LIMITS.maxTotal);
}
