import { resolve } from 'path';
import { getSessionId } from '../../bootstrap/state.js';
import { SOURCES } from '../settings/constants.js';
import { getSettingsFilePathForSource, getSettingsForSource, } from '../settings/settings.js';
import { DEFAULT_HOOK_SHELL } from '../shell/shellProvider.js';
import { getSessionHooks } from './sessionHooks.js';
/**
 * Check if two hooks are equal (comparing only command/prompt content, not timeout)
 */
export function isHookEqual(a, b) {
    if (a.type !== b.type)
        return false;
    // Use switch for exhaustive type checking
    // Note: We only compare command/prompt content, not timeout
    // `if` is part of identity: same command with different `if` conditions
    // are distinct hooks (e.g., setup.sh if=Bash(git *) vs if=Bash(npm *)).
    const sameIf = (x, y) => (x.if ?? '') === (y.if ?? '');
    switch (a.type) {
        case 'command':
            // shell is part of identity: same command string with different
            // shells are distinct hooks. Default 'bash' so undefined === 'bash'.
            return (b.type === 'command' &&
                a.command === b.command &&
                (a.shell ?? DEFAULT_HOOK_SHELL) === (b.shell ?? DEFAULT_HOOK_SHELL) &&
                sameIf(a, b));
        case 'prompt':
            return b.type === 'prompt' && a.prompt === b.prompt && sameIf(a, b);
        case 'agent':
            return b.type === 'agent' && a.prompt === b.prompt && sameIf(a, b);
        case 'http':
            return b.type === 'http' && a.url === b.url && sameIf(a, b);
        case 'function':
            // Function hooks can't be compared (no stable identifier)
            return false;
    }
}
/** Get the display text for a hook */
export function getHookDisplayText(hook) {
    // Return custom status message if provided
    if ('statusMessage' in hook && hook.statusMessage) {
        return hook.statusMessage;
    }
    switch (hook.type) {
        case 'command':
            return hook.command;
        case 'prompt':
            return hook.prompt;
        case 'agent':
            return hook.prompt;
        case 'http':
            return hook.url;
        case 'callback':
            return 'callback';
        case 'function':
            return 'function';
    }
}
export function getAllHooks(appState) {
    const hooks = [];
    // Check if restricted to managed hooks only
    const policySettings = getSettingsForSource('policySettings');
    const restrictedToManagedOnly = policySettings?.allowManagedHooksOnly === true;
    // If allowManagedHooksOnly is set, don't show any hooks in the UI
    // (user/project/local are blocked, and managed hooks are intentionally hidden)
    if (!restrictedToManagedOnly) {
        // Get hooks from all editable sources
        const sources = [
            'userSettings',
            'projectSettings',
            'localSettings',
        ];
        // Track which settings files we've already processed to avoid duplicates
        // (e.g., when running from home directory, userSettings and projectSettings
        // both resolve to ~/.claude/settings.json)
        const seenFiles = new Set();
        for (const source of sources) {
            const filePath = getSettingsFilePathForSource(source);
            if (filePath) {
                const resolvedPath = resolve(filePath);
                if (seenFiles.has(resolvedPath)) {
                    continue;
                }
                seenFiles.add(resolvedPath);
            }
            const sourceSettings = getSettingsForSource(source);
            if (!sourceSettings?.hooks) {
                continue;
            }
            for (const [event, matchers] of Object.entries(sourceSettings.hooks)) {
                for (const matcher of matchers) {
                    for (const hookCommand of matcher.hooks) {
                        hooks.push({
                            event: event,
                            config: hookCommand,
                            matcher: matcher.matcher,
                            source,
                        });
                    }
                }
            }
        }
    }
    // Get session hooks
    const sessionId = getSessionId();
    const sessionHooks = getSessionHooks(appState, sessionId);
    for (const [event, matchers] of sessionHooks.entries()) {
        for (const matcher of matchers) {
            for (const hookCommand of matcher.hooks) {
                hooks.push({
                    event,
                    config: hookCommand,
                    matcher: matcher.matcher,
                    source: 'sessionHook',
                });
            }
        }
    }
    return hooks;
}
export function getHooksForEvent(appState, event) {
    return getAllHooks(appState).filter(hook => hook.event === event);
}
export function hookSourceDescriptionDisplayString(source) {
    switch (source) {
        case 'userSettings':
            return '用户设置 (~/.claude/settings.json)';
        case 'projectSettings':
            return '项目设置 (.claude/settings.json)';
        case 'localSettings':
            return '本地设置 (.claude/settings.local.json)';
        case 'pluginHook':
            // TODO: Get the actual plugin hook file paths instead of using glob pattern
            // We should capture the specific plugin paths during hook registration and display them here
            // e.g., "Plugin hooks (~/.claude/plugins/repos/source/example-plugin/example-plugin/hooks/hooks.json)"
            return '插件钩子 (~/.claude/plugins/*/hooks/hooks.json)';
        case 'sessionHook':
            return '会话钩子（内存中，临时）';
        case 'builtinHook':
            return '内置钩子（由 Claude Code 内部注册）';
        default:
            return source;
    }
}
export function hookSourceHeaderDisplayString(source) {
    switch (source) {
        case 'userSettings':
            return '用户设置';
        case 'projectSettings':
            return '项目设置';
        case 'localSettings':
            return '本地设置';
        case 'pluginHook':
            return '插件钩子';
        case 'sessionHook':
            return '会话钩子';
        case 'builtinHook':
            return '内置钩子';
        default:
            return source;
    }
}
export function hookSourceInlineDisplayString(source) {
    switch (source) {
        case 'userSettings':
            return '用户';
        case 'projectSettings':
            return '项目';
        case 'localSettings':
            return '本地';
        case 'pluginHook':
            return '插件';
        case 'sessionHook':
            return '会话';
        case 'builtinHook':
            return '内置';
        default:
            return source;
    }
}
export function sortMatchersByPriority(matchers, hooksByEventAndMatcher, selectedEvent) {
    // Create a priority map based on SOURCES order (lower index = higher priority)
    const sourcePriority = SOURCES.reduce((acc, source, index) => {
        acc[source] = index;
        return acc;
    }, {});
    return [...matchers].sort((a, b) => {
        const aHooks = hooksByEventAndMatcher[selectedEvent]?.[a] || [];
        const bHooks = hooksByEventAndMatcher[selectedEvent]?.[b] || [];
        const aSources = Array.from(new Set(aHooks.map(h => h.source)));
        const bSources = Array.from(new Set(bHooks.map(h => h.source)));
        // Sort by highest priority source first (lowest priority number)
        // Plugin hooks get lowest priority (highest number)
        const getSourcePriority = (source) => source === 'pluginHook' || source === 'builtinHook'
            ? 999
            : sourcePriority[source];
        const aHighestPriority = Math.min(...aSources.map(getSourcePriority));
        const bHighestPriority = Math.min(...bSources.map(getSourcePriority));
        if (aHighestPriority !== bHighestPriority) {
            return aHighestPriority - bHighestPriority;
        }
        // If same priority, sort by matcher name
        return a.localeCompare(b);
    });
}
//# sourceMappingURL=hooksSettings.js.map