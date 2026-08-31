import { getMainThreadAgentType } from '../bootstrap/state.js';
import { createAttachmentMessage } from './attachments.js';
import { logForDebugging } from './debug.js';
import { isBareMode } from './envUtils.js';
import { updateWatchPaths } from './hooks/fileChangedWatcher.js';
import { shouldAllowManagedHooksOnly } from './hooks/hooksConfigSnapshot.js';
import { executeSessionStartHooks, executeSetupHooks } from './hooks.js';
import { logError } from './log.js';
import { loadPluginHooks } from './plugins/loadPluginHooks.js';
// Set by processSessionStartHooks when a hook emits initialUserMessage;
// consumed once by takeInitialUserMessage. This side channel avoids changing
// the Promise<HookResultMessage[]> return type that main.tsx and print.ts
// both already await on (sessionStartHooksPromise is kicked in main.tsx and
// joined later — rippling a structural return-type change through that
// handoff would touch five callsites for what is a print-mode-only value).
let pendingInitialUserMessage;
export function takeInitialUserMessage() {
    const v = pendingInitialUserMessage;
    pendingInitialUserMessage = undefined;
    return v;
}
// Note to CLAUDE: do not add ANY "warmup" logic. It is **CRITICAL** that you do not add extra work on startup.
export async function processSessionStartHooks(source, { sessionId, agentType, model, forceSyncExecution, } = {}) {
    // --bare skips all hooks. executeHooks already early-returns under --bare
    // (hooks.ts:1861), but this skips the loadPluginHooks() await below too —
    // no point loading plugin hooks that'll never run.
    if (isBareMode()) {
        return [];
    }
    const hookMessages = [];
    const additionalContexts = [];
    const allWatchPaths = [];
    // Skip loading plugin hooks if restricted to managed hooks only
    // Plugin hooks are untrusted external code that should be blocked by policy
    if (shouldAllowManagedHooksOnly()) {
        logForDebugging('Skipping plugin hooks - allowManagedHooksOnly is enabled');
    }
    else {
        // Ensure plugin hooks are loaded before executing SessionStart hooks.
        // loadPluginHooks() may be called early during startup (fire-and-forget, non-blocking)
        // to pre-load hooks, but we must guarantee hooks are registered before executing them.
        // This function is memoized, so if hooks are already loaded, this returns immediately
        // with negligible overhead (just a cache lookup).
        try {
            await loadPluginHooks();
        }
        catch (error) {
            // Log error but don't crash - continue with session start without plugin hooks
            const enhancedError = error instanceof Error
                ? new Error(`Failed to load plugin hooks during ${source}: ${error.message}`)
                : new Error(`Failed to load plugin hooks during ${source}: ${String(error)}`);
            if (error instanceof Error && error.stack) {
                enhancedError.stack = error.stack;
            }
            logError(enhancedError);
            // Provide specific guidance based on error type
            const errorMessage = error instanceof Error ? error.message : String(error);
            let userGuidance = '';
            if (errorMessage.includes('Failed to clone') ||
                errorMessage.includes('network') ||
                errorMessage.includes('ETIMEDOUT') ||
                errorMessage.includes('ENOTFOUND')) {
                userGuidance =
                    '这似乎是网络问题。请检查您的网络连接并重试。';
            }
            else if (errorMessage.includes('Permission denied') ||
                errorMessage.includes('EACCES') ||
                errorMessage.includes('EPERM')) {
                userGuidance =
                    '这似乎是权限问题。请检查 ~/.claude/plugins/ 的文件权限。';
            }
            else if (errorMessage.includes('Invalid') ||
                errorMessage.includes('parse') ||
                errorMessage.includes('JSON') ||
                errorMessage.includes('schema')) {
                userGuidance =
                    '这似乎是配置问题。请检查 .claude/settings.json 中的插件设置。';
            }
            else {
                userGuidance =
                    '请修复插件配置，或从设置中删除有问题的插件。';
            }
            logForDebugging(`Warning: Failed to load plugin hooks. SessionStart hooks from plugins will not execute. ` +
                `Error: ${errorMessage}. ${userGuidance}`, { level: 'warn' });
            // Continue execution - plugin hooks won't be available, but project-level hooks
            // from .claude/settings.json (loaded via captureHooksConfigSnapshot) will still work
        }
    }
    // Execute SessionStart hooks, ignoring blocking errors
    // Use the provided agentType or fall back to the one stored in bootstrap state
    const resolvedAgentType = agentType ?? getMainThreadAgentType();
    for await (const hookResult of executeSessionStartHooks(source, sessionId, resolvedAgentType, model, undefined, undefined, forceSyncExecution)) {
        if (hookResult.message) {
            hookMessages.push(hookResult.message);
        }
        if (hookResult.additionalContexts &&
            hookResult.additionalContexts.length > 0) {
            additionalContexts.push(...hookResult.additionalContexts);
        }
        if (hookResult.initialUserMessage) {
            pendingInitialUserMessage = hookResult.initialUserMessage;
        }
        if (hookResult.watchPaths && hookResult.watchPaths.length > 0) {
            allWatchPaths.push(...hookResult.watchPaths);
        }
    }
    if (allWatchPaths.length > 0) {
        updateWatchPaths(allWatchPaths);
    }
    // If hooks provided additional context, add it as a message
    if (additionalContexts.length > 0) {
        const contextMessage = createAttachmentMessage({
            type: 'hook_additional_context',
            content: additionalContexts,
            hookName: 'SessionStart',
            toolUseID: 'SessionStart',
            hookEvent: 'SessionStart',
        });
        hookMessages.push(contextMessage);
    }
    return hookMessages;
}
export async function processSetupHooks(trigger, { forceSyncExecution } = {}) {
    // Same rationale as processSessionStartHooks above.
    if (isBareMode()) {
        return [];
    }
    const hookMessages = [];
    const additionalContexts = [];
    if (shouldAllowManagedHooksOnly()) {
        logForDebugging('Skipping plugin hooks - allowManagedHooksOnly is enabled');
    }
    else {
        try {
            await loadPluginHooks();
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logForDebugging(`Warning: Failed to load plugin hooks. Setup hooks from plugins will not execute. Error: ${errorMessage}`, { level: 'warn' });
        }
    }
    for await (const hookResult of executeSetupHooks(trigger, undefined, undefined, forceSyncExecution)) {
        if (hookResult.message) {
            hookMessages.push(hookResult.message);
        }
        if (hookResult.additionalContexts &&
            hookResult.additionalContexts.length > 0) {
            additionalContexts.push(...hookResult.additionalContexts);
        }
    }
    if (additionalContexts.length > 0) {
        const contextMessage = createAttachmentMessage({
            type: 'hook_additional_context',
            content: additionalContexts,
            hookName: 'Setup',
            toolUseID: 'Setup',
            hookEvent: 'Setup',
        });
        hookMessages.push(contextMessage);
    }
    return hookMessages;
}
