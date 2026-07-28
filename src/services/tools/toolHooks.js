import { logEvent, } from '../../services/analytics/index.js';
import { sanitizeToolNameForAnalytics } from '../../services/analytics/metadata.js';
import { createAttachmentMessage } from '../../utils/attachments.js';
import { logForDebugging } from '../../utils/debug.js';
import { executePostToolHooks, executePostToolUseFailureHooks, executePreToolHooks, getPreToolHookBlockingMessage, } from '../../utils/hooks.js';
import { logError } from '../../utils/log.js';
import { getRuleBehaviorDescription, } from '../../utils/permissions/PermissionResult.js';
import { checkRuleBasedPermissions } from '../../utils/permissions/permissions.js';
import { formatError } from '../../utils/toolErrors.js';
import { isMcpTool } from '../mcp/utils.js';
export async function* runPostToolUseHooks(toolUseContext, tool, toolUseID, messageId, toolInput, toolResponse, requestId, mcpServerType, mcpServerBaseUrl) {
    const postToolStartTime = Date.now();
    try {
        const appState = toolUseContext.getAppState();
        const permissionMode = appState.toolPermissionContext.mode;
        let toolOutput = toolResponse;
        for await (const result of executePostToolHooks(tool.name, toolUseID, toolInput, toolOutput, toolUseContext, permissionMode, toolUseContext.abortController.signal)) {
            try {
                // Check if we were aborted during hook execution
                // IMPORTANT: We emit a cancelled event per hook
                if (result.message?.type === 'attachment' &&
                    result.message.attachment.type === 'hook_cancelled') {
                    logEvent('tengu_post_tool_hooks_cancelled', {
                        toolName: sanitizeToolNameForAnalytics(tool.name),
                        queryChainId: toolUseContext.queryTracking
                            ?.chainId,
                        queryDepth: toolUseContext.queryTracking?.depth,
                    });
                    yield {
                        message: createAttachmentMessage({
                            type: 'hook_cancelled',
                            hookName: `PostToolUse:${tool.name}`,
                            toolUseID,
                            hookEvent: 'PostToolUse',
                        }),
                    };
                    continue;
                }
                // For JSON {decision:"block"} hooks, executeHooks yields two results:
                // {blockingError} and {message: hook_blocking_error attachment}. The
                // blockingError path below creates that same attachment, so skip it
                // here to avoid displaying the block reason twice (#31301). The
                // exit-code-2 path only yields {blockingError}, so it's unaffected.
                if (result.message &&
                    !(result.message.type === 'attachment' &&
                        result.message.attachment.type === 'hook_blocking_error')) {
                    yield { message: result.message };
                }
                if (result.blockingError) {
                    yield {
                        message: createAttachmentMessage({
                            type: 'hook_blocking_error',
                            hookName: `PostToolUse:${tool.name}`,
                            toolUseID: toolUseID,
                            hookEvent: 'PostToolUse',
                            blockingError: result.blockingError,
                        }),
                    };
                }
                // If hook indicated to prevent continuation, yield a stop reason message
                if (result.preventContinuation) {
                    yield {
                        message: createAttachmentMessage({
                            type: 'hook_stopped_continuation',
                            message: result.stopReason || 'Execution stopped by PostToolUse hook',
                            hookName: `PostToolUse:${tool.name}`,
                            toolUseID: toolUseID,
                            hookEvent: 'PostToolUse',
                        }),
                    };
                    return;
                }
                // If hooks provided additional context, add it as a message
                if (result.additionalContexts && result.additionalContexts.length > 0) {
                    yield {
                        message: createAttachmentMessage({
                            type: 'hook_additional_context',
                            content: result.additionalContexts,
                            hookName: `PostToolUse:${tool.name}`,
                            toolUseID: toolUseID,
                            hookEvent: 'PostToolUse',
                        }),
                    };
                }
                // If hooks provided updatedMCPToolOutput, yield it if this is an MCP tool
                if (result.updatedMCPToolOutput && isMcpTool(tool)) {
                    toolOutput = result.updatedMCPToolOutput;
                    yield {
                        updatedMCPToolOutput: toolOutput,
                    };
                }
            }
            catch (error) {
                const postToolDurationMs = Date.now() - postToolStartTime;
                logEvent('tengu_post_tool_hook_error', {
                    messageID: messageId,
                    toolName: sanitizeToolNameForAnalytics(tool.name),
                    isMcp: tool.isMcp ?? false,
                    duration: postToolDurationMs,
                    queryChainId: toolUseContext.queryTracking
                        ?.chainId,
                    queryDepth: toolUseContext.queryTracking?.depth,
                    ...(mcpServerType
                        ? {
                            mcpServerType: mcpServerType,
                        }
                        : {}),
                    ...(requestId
                        ? {
                            requestId: requestId,
                        }
                        : {}),
                });
                yield {
                    message: createAttachmentMessage({
                        type: 'hook_error_during_execution',
                        content: formatError(error),
                        hookName: `PostToolUse:${tool.name}`,
                        toolUseID: toolUseID,
                        hookEvent: 'PostToolUse',
                    }),
                };
            }
        }
    }
    catch (error) {
        logError(error);
    }
}
export async function* runPostToolUseFailureHooks(toolUseContext, tool, toolUseID, messageId, processedInput, error, isInterrupt, requestId, mcpServerType, mcpServerBaseUrl) {
    const postToolStartTime = Date.now();
    try {
        const appState = toolUseContext.getAppState();
        const permissionMode = appState.toolPermissionContext.mode;
        for await (const result of executePostToolUseFailureHooks(tool.name, toolUseID, processedInput, error, toolUseContext, isInterrupt, permissionMode, toolUseContext.abortController.signal)) {
            try {
                // Check if we were aborted during hook execution
                if (result.message?.type === 'attachment' &&
                    result.message.attachment.type === 'hook_cancelled') {
                    logEvent('tengu_post_tool_failure_hooks_cancelled', {
                        toolName: sanitizeToolNameForAnalytics(tool.name),
                        queryChainId: toolUseContext.queryTracking
                            ?.chainId,
                        queryDepth: toolUseContext.queryTracking?.depth,
                    });
                    yield {
                        message: createAttachmentMessage({
                            type: 'hook_cancelled',
                            hookName: `PostToolUseFailure:${tool.name}`,
                            toolUseID,
                            hookEvent: 'PostToolUseFailure',
                        }),
                    };
                    continue;
                }
                // Skip hook_blocking_error in result.message — blockingError path
                // below creates the same attachment (see #31301 / PostToolUse above).
                if (result.message &&
                    !(result.message.type === 'attachment' &&
                        result.message.attachment.type === 'hook_blocking_error')) {
                    yield { message: result.message };
                }
                if (result.blockingError) {
                    yield {
                        message: createAttachmentMessage({
                            type: 'hook_blocking_error',
                            hookName: `PostToolUseFailure:${tool.name}`,
                            toolUseID: toolUseID,
                            hookEvent: 'PostToolUseFailure',
                            blockingError: result.blockingError,
                        }),
                    };
                }
                // If hooks provided additional context, add it as a message
                if (result.additionalContexts && result.additionalContexts.length > 0) {
                    yield {
                        message: createAttachmentMessage({
                            type: 'hook_additional_context',
                            content: result.additionalContexts,
                            hookName: `PostToolUseFailure:${tool.name}`,
                            toolUseID: toolUseID,
                            hookEvent: 'PostToolUseFailure',
                        }),
                    };
                }
            }
            catch (hookError) {
                const postToolDurationMs = Date.now() - postToolStartTime;
                logEvent('tengu_post_tool_failure_hook_error', {
                    messageID: messageId,
                    toolName: sanitizeToolNameForAnalytics(tool.name),
                    isMcp: tool.isMcp ?? false,
                    duration: postToolDurationMs,
                    queryChainId: toolUseContext.queryTracking
                        ?.chainId,
                    queryDepth: toolUseContext.queryTracking?.depth,
                    ...(mcpServerType
                        ? {
                            mcpServerType: mcpServerType,
                        }
                        : {}),
                    ...(requestId
                        ? {
                            requestId: requestId,
                        }
                        : {}),
                });
                yield {
                    message: createAttachmentMessage({
                        type: 'hook_error_during_execution',
                        content: formatError(hookError),
                        hookName: `PostToolUseFailure:${tool.name}`,
                        toolUseID: toolUseID,
                        hookEvent: 'PostToolUseFailure',
                    }),
                };
            }
        }
    }
    catch (outerError) {
        logError(outerError);
    }
}
/**
 * Resolve a PreToolUse hook's permission result into a final PermissionDecision.
 *
 * Encapsulates the invariant that hook 'allow' does NOT bypass settings.json
 * deny/ask rules — checkRuleBasedPermissions still applies (inc-4788 analog).
 * Also handles the requiresUserInteraction/requireCanUseTool guards and the
 * 'ask' forceDecision passthrough.
 *
 * Shared by toolExecution.ts (main query loop) and REPLTool/toolWrappers.ts
 * (REPL inner calls) so the permission semantics stay in lockstep.
 */
export async function resolveHookPermissionDecision(hookPermissionResult, tool, input, toolUseContext, canUseTool, assistantMessage, toolUseID) {
    const requiresInteraction = tool.requiresUserInteraction?.();
    const requireCanUseTool = toolUseContext.requireCanUseTool;
    if (hookPermissionResult?.behavior === 'allow') {
        const hookInput = hookPermissionResult.updatedInput ?? input;
        // Hook provided updatedInput for an interactive tool — the hook IS the
        // user interaction (e.g. headless wrapper that collected AskUserQuestion
        // answers). Treat as non-interactive for the rule-check path.
        const interactionSatisfied = requiresInteraction && hookPermissionResult.updatedInput !== undefined;
        if ((requiresInteraction && !interactionSatisfied) || requireCanUseTool) {
            logForDebugging(`Hook approved tool use for ${tool.name}, but canUseTool is required`);
            return {
                decision: await canUseTool(tool, hookInput, toolUseContext, assistantMessage, toolUseID),
                input: hookInput,
            };
        }
        // Hook allow skips the interactive prompt, but deny/ask rules still apply.
        const ruleCheck = await checkRuleBasedPermissions(tool, hookInput, toolUseContext);
        if (ruleCheck === null) {
            logForDebugging(interactionSatisfied
                ? `Hook satisfied user interaction for ${tool.name} via updatedInput`
                : `Hook approved tool use for ${tool.name}, bypassing permission prompt`);
            return { decision: hookPermissionResult, input: hookInput };
        }
        if (ruleCheck.behavior === 'deny') {
            logForDebugging(`Hook approved tool use for ${tool.name}, but deny rule overrides: ${ruleCheck.message}`);
            return { decision: ruleCheck, input: hookInput };
        }
        // ask rule — dialog required despite hook approval
        logForDebugging(`Hook approved tool use for ${tool.name}, but ask rule requires prompt`);
        return {
            decision: await canUseTool(tool, hookInput, toolUseContext, assistantMessage, toolUseID),
            input: hookInput,
        };
    }
    if (hookPermissionResult?.behavior === 'deny') {
        logForDebugging(`Hook denied tool use for ${tool.name}`);
        return { decision: hookPermissionResult, input };
    }
    // No hook decision or 'ask' — normal permission flow, possibly with
    // forceDecision so the dialog shows the hook's ask message.
    const forceDecision = hookPermissionResult?.behavior === 'ask' ? hookPermissionResult : undefined;
    const askInput = hookPermissionResult?.behavior === 'ask' &&
        hookPermissionResult.updatedInput
        ? hookPermissionResult.updatedInput
        : input;
    return {
        decision: await canUseTool(tool, askInput, toolUseContext, assistantMessage, toolUseID, forceDecision),
        input: askInput,
    };
}
export async function* runPreToolUseHooks(toolUseContext, tool, processedInput, toolUseID, messageId, requestId, mcpServerType, mcpServerBaseUrl) {
    const hookStartTime = Date.now();
    try {
        const appState = toolUseContext.getAppState();
        for await (const result of executePreToolHooks(tool.name, toolUseID, processedInput, toolUseContext, appState.toolPermissionContext.mode, toolUseContext.abortController.signal, undefined, // timeoutMs - use default
        toolUseContext.requestPrompt, tool.getToolUseSummary?.(processedInput))) {
            try {
                if (result.message) {
                    yield { type: 'message', message: { message: result.message } };
                }
                if (result.blockingError) {
                    const denialMessage = getPreToolHookBlockingMessage(`PreToolUse:${tool.name}`, result.blockingError);
                    yield {
                        type: 'hookPermissionResult',
                        hookPermissionResult: {
                            behavior: 'deny',
                            message: denialMessage,
                            decisionReason: {
                                type: 'hook',
                                hookName: `PreToolUse:${tool.name}`,
                                reason: denialMessage,
                            },
                        },
                    };
                }
                // Check if hook wants to prevent continuation
                if (result.preventContinuation) {
                    yield {
                        type: 'preventContinuation',
                        shouldPreventContinuation: true,
                    };
                    if (result.stopReason) {
                        yield { type: 'stopReason', stopReason: result.stopReason };
                    }
                }
                // Check for hook-defined permission behavior
                if (result.permissionBehavior !== undefined) {
                    logForDebugging(`Hook result has permissionBehavior=${result.permissionBehavior}`);
                    const decisionReason = {
                        type: 'hook',
                        hookName: `PreToolUse:${tool.name}`,
                        hookSource: result.hookSource,
                        reason: result.hookPermissionDecisionReason,
                    };
                    if (result.permissionBehavior === 'allow') {
                        yield {
                            type: 'hookPermissionResult',
                            hookPermissionResult: {
                                behavior: 'allow',
                                updatedInput: result.updatedInput,
                                decisionReason,
                            },
                        };
                    }
                    else if (result.permissionBehavior === 'ask') {
                        yield {
                            type: 'hookPermissionResult',
                            hookPermissionResult: {
                                behavior: 'ask',
                                updatedInput: result.updatedInput,
                                message: result.hookPermissionDecisionReason ||
                                    `Hook PreToolUse:${tool.name} ${getRuleBehaviorDescription(result.permissionBehavior)} this tool`,
                                decisionReason,
                            },
                        };
                    }
                    else {
                        // deny - updatedInput is irrelevant since tool won't run
                        yield {
                            type: 'hookPermissionResult',
                            hookPermissionResult: {
                                behavior: result.permissionBehavior,
                                message: result.hookPermissionDecisionReason ||
                                    `Hook PreToolUse:${tool.name} ${getRuleBehaviorDescription(result.permissionBehavior)} this tool`,
                                decisionReason,
                            },
                        };
                    }
                }
                // Yield updatedInput for passthrough case (no permission decision)
                // This allows hooks to modify input while letting normal permission flow continue
                if (result.updatedInput && result.permissionBehavior === undefined) {
                    yield {
                        type: 'hookUpdatedInput',
                        updatedInput: result.updatedInput,
                    };
                }
                // If hooks provided additional context, add it as a message
                if (result.additionalContexts && result.additionalContexts.length > 0) {
                    yield {
                        type: 'additionalContext',
                        message: {
                            message: createAttachmentMessage({
                                type: 'hook_additional_context',
                                content: result.additionalContexts,
                                hookName: `PreToolUse:${tool.name}`,
                                toolUseID,
                                hookEvent: 'PreToolUse',
                            }),
                        },
                    };
                }
                // Check if we were aborted during hook execution
                if (toolUseContext.abortController.signal.aborted) {
                    logEvent('tengu_pre_tool_hooks_cancelled', {
                        toolName: sanitizeToolNameForAnalytics(tool.name),
                        queryChainId: toolUseContext.queryTracking
                            ?.chainId,
                        queryDepth: toolUseContext.queryTracking?.depth,
                    });
                    yield {
                        type: 'message',
                        message: {
                            message: createAttachmentMessage({
                                type: 'hook_cancelled',
                                hookName: `PreToolUse:${tool.name}`,
                                toolUseID,
                                hookEvent: 'PreToolUse',
                            }),
                        },
                    };
                    yield { type: 'stop' };
                    return;
                }
            }
            catch (error) {
                logError(error);
                const durationMs = Date.now() - hookStartTime;
                logEvent('tengu_pre_tool_hook_error', {
                    messageID: messageId,
                    toolName: sanitizeToolNameForAnalytics(tool.name),
                    isMcp: tool.isMcp ?? false,
                    duration: durationMs,
                    queryChainId: toolUseContext.queryTracking
                        ?.chainId,
                    queryDepth: toolUseContext.queryTracking?.depth,
                    ...(mcpServerType
                        ? {
                            mcpServerType: mcpServerType,
                        }
                        : {}),
                    ...(requestId
                        ? {
                            requestId: requestId,
                        }
                        : {}),
                });
                yield {
                    type: 'message',
                    message: {
                        message: createAttachmentMessage({
                            type: 'hook_error_during_execution',
                            content: formatError(error),
                            hookName: `PreToolUse:${tool.name}`,
                            toolUseID: toolUseID,
                            hookEvent: 'PreToolUse',
                        }),
                    },
                };
                yield { type: 'stop' };
            }
        }
    }
    catch (error) {
        logError(error);
        yield { type: 'stop' };
        return;
    }
}
//# sourceMappingURL=toolHooks.js.map