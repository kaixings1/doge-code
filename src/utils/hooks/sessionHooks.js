import { HOOK_EVENTS } from '../../entrypoints/agentSdkTypes.js';
import { logForDebugging } from '../debug.js';
import { isHookEqual } from './hooksSettings.js';
/**
 * Add a command or prompt hook to the session.
 * Session hooks are temporary, in-memory only, and cleared when session ends.
 */
export function addSessionHook(setAppState, sessionId, event, matcher, hook, onHookSuccess, skillRoot) {
    addHookToSession(setAppState, sessionId, event, matcher, hook, onHookSuccess, skillRoot);
}
/**
 * Add a function hook to the session.
 * Function hooks execute TypeScript callbacks in-memory for validation.
 * @returns The hook ID (for removal)
 */
export function addFunctionHook(setAppState, sessionId, event, matcher, callback, errorMessage, options) {
    const id = options?.id || `function-hook-${Date.now()}-${Math.random()}`;
    const hook = {
        type: 'function',
        id,
        timeout: options?.timeout || 5000,
        callback,
        errorMessage,
    };
    addHookToSession(setAppState, sessionId, event, matcher, hook);
    return id;
}
/**
 * Remove a function hook by ID from the session.
 */
export function removeFunctionHook(setAppState, sessionId, event, hookId) {
    setAppState(prev => {
        const store = prev.sessionHooks.get(sessionId);
        if (!store) {
            return prev;
        }
        const eventMatchers = store.hooks[event] || [];
        // Remove the hook with matching ID from all matchers
        const updatedMatchers = eventMatchers
            .map(matcher => {
            const updatedHooks = matcher.hooks.filter(h => {
                if (h.hook.type !== 'function')
                    return true;
                return h.hook.id !== hookId;
            });
            return updatedHooks.length > 0
                ? { ...matcher, hooks: updatedHooks }
                : null;
        })
            .filter((m) => m !== null);
        const newHooks = updatedMatchers.length > 0
            ? { ...store.hooks, [event]: updatedMatchers }
            : Object.fromEntries(Object.entries(store.hooks).filter(([e]) => e !== event));
        prev.sessionHooks.set(sessionId, { hooks: newHooks });
        return prev;
    });
    logForDebugging(`Removed function hook ${hookId} for event ${event} in session ${sessionId}`);
}
/**
 * Internal helper to add a hook to session state
 */
function addHookToSession(setAppState, sessionId, event, matcher, hook, onHookSuccess, skillRoot) {
    setAppState(prev => {
        const store = prev.sessionHooks.get(sessionId) ?? { hooks: {} };
        const eventMatchers = store.hooks[event] || [];
        // Find existing matcher or create new one
        const existingMatcherIndex = eventMatchers.findIndex(m => m.matcher === matcher && m.skillRoot === skillRoot);
        let updatedMatchers;
        if (existingMatcherIndex >= 0) {
            // Add to existing matcher
            updatedMatchers = [...eventMatchers];
            const existingMatcher = updatedMatchers[existingMatcherIndex];
            updatedMatchers[existingMatcherIndex] = {
                matcher: existingMatcher.matcher,
                skillRoot: existingMatcher.skillRoot,
                hooks: [...existingMatcher.hooks, { hook, onHookSuccess }],
            };
        }
        else {
            // Create new matcher
            updatedMatchers = [
                ...eventMatchers,
                {
                    matcher,
                    skillRoot,
                    hooks: [{ hook, onHookSuccess }],
                },
            ];
        }
        const newHooks = { ...store.hooks, [event]: updatedMatchers };
        prev.sessionHooks.set(sessionId, { hooks: newHooks });
        return prev;
    });
    logForDebugging(`Added session hook for event ${event} in session ${sessionId}`);
}
/**
 * Remove a specific hook from the session
 * @param setAppState The function to update the app state
 * @param sessionId The session ID
 * @param event The hook event
 * @param hook The hook command to remove
 */
export function removeSessionHook(setAppState, sessionId, event, hook) {
    setAppState(prev => {
        const store = prev.sessionHooks.get(sessionId);
        if (!store) {
            return prev;
        }
        const eventMatchers = store.hooks[event] || [];
        // Remove the hook from all matchers
        const updatedMatchers = eventMatchers
            .map(matcher => {
            const updatedHooks = matcher.hooks.filter(h => !isHookEqual(h.hook, hook));
            return updatedHooks.length > 0
                ? { ...matcher, hooks: updatedHooks }
                : null;
        })
            .filter((m) => m !== null);
        const newHooks = updatedMatchers.length > 0
            ? { ...store.hooks, [event]: updatedMatchers }
            : { ...store.hooks };
        if (updatedMatchers.length === 0) {
            delete newHooks[event];
        }
        prev.sessionHooks.set(sessionId, { ...store, hooks: newHooks });
        return prev;
    });
    logForDebugging(`Removed session hook for event ${event} in session ${sessionId}`);
}
/**
 * Convert session hook matchers to regular hook matchers
 * @param sessionMatchers The session hook matchers to convert
 * @returns Regular hook matchers (with optional skillRoot preserved)
 */
function convertToHookMatchers(sessionMatchers) {
    return sessionMatchers.map(sm => ({
        matcher: sm.matcher,
        skillRoot: sm.skillRoot,
        // Filter out function hooks - they can't be persisted to HookMatcher format
        hooks: sm.hooks
            .map(h => h.hook)
            .filter((h) => h.type !== 'function'),
    }));
}
/**
 * Get all session hooks for a specific event (excluding function hooks)
 * @param appState The app state
 * @param sessionId The session ID
 * @param event Optional event to filter by
 * @returns Hook matchers for the event, or all hooks if no event specified
 */
export function getSessionHooks(appState, sessionId, event) {
    const store = appState.sessionHooks.get(sessionId);
    if (!store) {
        return new Map();
    }
    const result = new Map();
    if (event) {
        const sessionMatchers = store.hooks[event];
        if (sessionMatchers) {
            result.set(event, convertToHookMatchers(sessionMatchers));
        }
        return result;
    }
    for (const evt of HOOK_EVENTS) {
        const sessionMatchers = store.hooks[evt];
        if (sessionMatchers) {
            result.set(evt, convertToHookMatchers(sessionMatchers));
        }
    }
    return result;
}
/**
 * Get all session function hooks for a specific event
 * Function hooks are kept separate because they can't be persisted to HookMatcher format.
 * @param appState The app state
 * @param sessionId The session ID
 * @param event Optional event to filter by
 * @returns Function hook matchers for the event
 */
export function getSessionFunctionHooks(appState, sessionId, event) {
    const store = appState.sessionHooks.get(sessionId);
    if (!store) {
        return new Map();
    }
    const result = new Map();
    const extractFunctionHooks = (sessionMatchers) => {
        return sessionMatchers
            .map(sm => ({
            matcher: sm.matcher,
            hooks: sm.hooks
                .map(h => h.hook)
                .filter((h) => h.type === 'function'),
        }))
            .filter(m => m.hooks.length > 0);
    };
    if (event) {
        const sessionMatchers = store.hooks[event];
        if (sessionMatchers) {
            const functionMatchers = extractFunctionHooks(sessionMatchers);
            if (functionMatchers.length > 0) {
                result.set(event, functionMatchers);
            }
        }
        return result;
    }
    for (const evt of HOOK_EVENTS) {
        const sessionMatchers = store.hooks[evt];
        if (sessionMatchers) {
            const functionMatchers = extractFunctionHooks(sessionMatchers);
            if (functionMatchers.length > 0) {
                result.set(evt, functionMatchers);
            }
        }
    }
    return result;
}
/**
 * Get the full hook entry (including callbacks) for a specific session hook
 */
export function getSessionHookCallback(appState, sessionId, event, matcher, hook) {
    const store = appState.sessionHooks.get(sessionId);
    if (!store) {
        return undefined;
    }
    const eventMatchers = store.hooks[event];
    if (!eventMatchers) {
        return undefined;
    }
    // Find the hook in the matchers
    for (const matcherEntry of eventMatchers) {
        if (matcherEntry.matcher === matcher || matcher === '') {
            const hookEntry = matcherEntry.hooks.find(h => isHookEqual(h.hook, hook));
            if (hookEntry) {
                return hookEntry;
            }
        }
    }
    return undefined;
}
/**
 * Clear all session hooks for a specific session
 * @param setAppState The function to update the app state
 * @param sessionId The session ID
 */
export function clearSessionHooks(setAppState, sessionId) {
    setAppState(prev => {
        prev.sessionHooks.delete(sessionId);
        return prev;
    });
    logForDebugging(`Cleared all session hooks for session ${sessionId}`);
}
//# sourceMappingURL=sessionHooks.js.map