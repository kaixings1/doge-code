import { HOOK_EVENTS } from '../../entrypoints/agentSdkTypes.js';
import { logForDebugging } from '../debug.js';
import { addSessionHook } from './sessionHooks.js';
/**
 * Register hooks from frontmatter (agent or skill) into session-scoped hooks.
 * These hooks will be active for the duration of the session/agent and cleaned up
 * when the session/agent ends.
 *
 * @param setAppState Function to update app state
 * @param sessionId Session ID to scope the hooks (agent ID for agents, session ID for skills)
 * @param hooks The hooks settings from frontmatter
 * @param sourceName Human-readable source name for logging (e.g., "agent 'my-agent'")
 * @param isAgent If true, converts Stop hooks to SubagentStop (since subagents trigger SubagentStop, not Stop)
 */
export function registerFrontmatterHooks(setAppState, sessionId, hooks, sourceName, isAgent = false) {
    if (!hooks || Object.keys(hooks).length === 0) {
        return;
    }
    let hookCount = 0;
    for (const event of HOOK_EVENTS) {
        const matchers = hooks[event];
        if (!matchers || matchers.length === 0) {
            continue;
        }
        // For agents, convert Stop hooks to SubagentStop since that's what fires when an agent completes
        // (executeStopHooks uses SubagentStop when called with an agentId)
        let targetEvent = event;
        if (isAgent && event === 'Stop') {
            targetEvent = 'SubagentStop';
            logForDebugging(`Converting Stop hook to SubagentStop for ${sourceName} (subagents trigger SubagentStop)`);
        }
        for (const matcherConfig of matchers) {
            const matcher = matcherConfig.matcher ?? '';
            const hooksArray = matcherConfig.hooks;
            if (!hooksArray || hooksArray.length === 0) {
                continue;
            }
            for (const hook of hooksArray) {
                addSessionHook(setAppState, sessionId, targetEvent, matcher, hook);
                hookCount++;
            }
        }
    }
    if (hookCount > 0) {
        logForDebugging(`Registered ${hookCount} frontmatter hook(s) from ${sourceName} for session ${sessionId}`);
    }
}
//# sourceMappingURL=registerFrontmatterHooks.js.map