import { feature } from 'bun:bundle';
import { logEvent, } from '../../services/analytics/index.js';
import { sanitizeToolNameForAnalytics } from '../../services/analytics/metadata.js';
import { awaitClassifierAutoApproval } from '../../tools/BashTool/bashPermissions.js';
import { BASH_TOOL_NAME } from '../../tools/BashTool/toolName.js';
import { setClassifierApproval } from '../../utils/classifierApprovals.js';
import { logForDebugging } from '../../utils/debug.js';
import { executePermissionRequestHooks } from '../../utils/hooks.js';
import { REJECT_MESSAGE, REJECT_MESSAGE_WITH_REASON_PREFIX, SUBAGENT_REJECT_MESSAGE, SUBAGENT_REJECT_MESSAGE_WITH_REASON_PREFIX, withMemoryCorrectionHint, } from '../../utils/messages.js';
import { applyPermissionUpdates, persistPermissionUpdates, supportsPersistence, } from '../../utils/permissions/PermissionUpdate.js';
import { logPermissionDecision, } from './permissionLogging.js';
function createResolveOnce(resolve) {
    let claimed = false;
    let delivered = false;
    return {
        resolve(value) {
            if (delivered)
                return;
            delivered = true;
            claimed = true;
            resolve(value);
        },
        isResolved() {
            return claimed;
        },
        claim() {
            if (claimed)
                return false;
            claimed = true;
            return true;
        },
    };
}
function createPermissionContext(tool, input, toolUseContext, assistantMessage, toolUseID, setToolPermissionContext, queueOps) {
    const messageId = assistantMessage.message.id;
    const ctx = {
        tool,
        input,
        toolUseContext,
        assistantMessage,
        messageId,
        toolUseID,
        logDecision(args, opts) {
            logPermissionDecision({
                tool,
                input: opts?.input ?? input,
                toolUseContext,
                messageId,
                toolUseID,
            }, args, opts?.permissionPromptStartTimeMs);
        },
        logCancelled() {
            logEvent('tengu_tool_use_cancelled', {
                messageID: messageId,
                toolName: sanitizeToolNameForAnalytics(tool.name),
            });
        },
        async persistPermissions(updates) {
            if (updates.length === 0)
                return false;
            persistPermissionUpdates(updates);
            const appState = toolUseContext.getAppState();
            setToolPermissionContext(applyPermissionUpdates(appState.toolPermissionContext, updates));
            return updates.some(update => supportsPersistence(update.destination));
        },
        resolveIfAborted(resolve) {
            if (!toolUseContext.abortController.signal.aborted)
                return false;
            this.logCancelled();
            resolve(this.cancelAndAbort(undefined, true));
            return true;
        },
        cancelAndAbort(feedback, isAbort, contentBlocks) {
            const sub = !!toolUseContext.agentId;
            const baseMessage = feedback
                ? `${sub ? SUBAGENT_REJECT_MESSAGE_WITH_REASON_PREFIX : REJECT_MESSAGE_WITH_REASON_PREFIX}${feedback}`
                : sub
                    ? SUBAGENT_REJECT_MESSAGE
                    : REJECT_MESSAGE;
            const message = sub ? baseMessage : withMemoryCorrectionHint(baseMessage);
            if (isAbort || (!feedback && !contentBlocks?.length && !sub)) {
                logForDebugging(`Aborting: tool=${tool.name} isAbort=${isAbort} hasFeedback=${!!feedback} isSubagent=${sub}`);
                toolUseContext.abortController.abort();
            }
            return { behavior: 'ask', message, contentBlocks };
        },
        ...(feature('BASH_CLASSIFIER')
            ? {
                async tryClassifier(pendingClassifierCheck, updatedInput) {
                    if (tool.name !== BASH_TOOL_NAME || !pendingClassifierCheck) {
                        return null;
                    }
                    const classifierDecision = await awaitClassifierAutoApproval(pendingClassifierCheck, toolUseContext.abortController.signal, toolUseContext.options.isNonInteractiveSession);
                    if (!classifierDecision) {
                        return null;
                    }
                    if (feature('TRANSCRIPT_CLASSIFIER') &&
                        classifierDecision.type === 'classifier') {
                        const matchedRule = classifierDecision.reason.match(/^Allowed by prompt rule: "(.+)"$/)?.[1];
                        if (matchedRule) {
                            setClassifierApproval(toolUseID, matchedRule);
                        }
                    }
                    logPermissionDecision({ tool, input, toolUseContext, messageId, toolUseID }, { decision: 'accept', source: { type: 'classifier' } }, undefined);
                    return {
                        behavior: 'allow',
                        updatedInput: updatedInput ?? input,
                        userModified: false,
                        decisionReason: classifierDecision,
                    };
                },
            }
            : {}),
        async runHooks(permissionMode, suggestions, updatedInput, permissionPromptStartTimeMs) {
            for await (const hookResult of executePermissionRequestHooks(tool.name, toolUseID, input, toolUseContext, permissionMode, suggestions, toolUseContext.abortController.signal)) {
                if (hookResult.permissionRequestResult) {
                    const decision = hookResult.permissionRequestResult;
                    if (decision.behavior === 'allow') {
                        const finalInput = decision.updatedInput ?? updatedInput ?? input;
                        return await this.handleHookAllow(finalInput, decision.updatedPermissions ?? [], permissionPromptStartTimeMs);
                    }
                    else if (decision.behavior === 'deny') {
                        this.logDecision({ decision: 'reject', source: { type: 'hook' } }, { permissionPromptStartTimeMs });
                        if (decision.interrupt) {
                            logForDebugging(`Hook interrupt: tool=${tool.name} hookMessage=${decision.message}`);
                            toolUseContext.abortController.abort();
                        }
                        return this.buildDeny(decision.message || 'Permission denied by hook', {
                            type: 'hook',
                            hookName: 'PermissionRequest',
                            reason: decision.message,
                        });
                    }
                }
            }
            return null;
        },
        buildAllow(updatedInput, opts) {
            return {
                behavior: 'allow',
                updatedInput,
                userModified: opts?.userModified ?? false,
                ...(opts?.decisionReason && { decisionReason: opts.decisionReason }),
                ...(opts?.acceptFeedback && { acceptFeedback: opts.acceptFeedback }),
                ...(opts?.contentBlocks &&
                    opts.contentBlocks.length > 0 && {
                    contentBlocks: opts.contentBlocks,
                }),
            };
        },
        buildDeny(message, decisionReason) {
            return { behavior: 'deny', message, decisionReason };
        },
        async handleUserAllow(updatedInput, permissionUpdates, feedback, permissionPromptStartTimeMs, contentBlocks, decisionReason) {
            const acceptedPermanentUpdates = await this.persistPermissions(permissionUpdates);
            this.logDecision({
                decision: 'accept',
                source: { type: 'user', permanent: acceptedPermanentUpdates },
            }, { input: updatedInput, permissionPromptStartTimeMs });
            const userModified = tool.inputsEquivalent
                ? !tool.inputsEquivalent(input, updatedInput)
                : false;
            const trimmedFeedback = feedback?.trim();
            return this.buildAllow(updatedInput, {
                userModified,
                decisionReason,
                acceptFeedback: trimmedFeedback || undefined,
                contentBlocks,
            });
        },
        async handleHookAllow(finalInput, permissionUpdates, permissionPromptStartTimeMs) {
            const acceptedPermanentUpdates = await this.persistPermissions(permissionUpdates);
            this.logDecision({
                decision: 'accept',
                source: { type: 'hook', permanent: acceptedPermanentUpdates },
            }, { input: finalInput, permissionPromptStartTimeMs });
            return this.buildAllow(finalInput, {
                decisionReason: { type: 'hook', hookName: 'PermissionRequest' },
            });
        },
        pushToQueue(item) {
            queueOps?.push(item);
        },
        removeFromQueue() {
            queueOps?.remove(toolUseID);
        },
        updateQueueItem(patch) {
            queueOps?.update(toolUseID, patch);
        },
    };
    return Object.freeze(ctx);
}
/**
 * Create a PermissionQueueOps backed by a React state setter.
 * This is the bridge between React's `setToolUseConfirmQueue` and the
 * generic queue interface used by PermissionContext.
 */
function createPermissionQueueOps(setToolUseConfirmQueue) {
    return {
        push(item) {
            setToolUseConfirmQueue(queue => [...queue, item]);
        },
        remove(toolUseID) {
            setToolUseConfirmQueue(queue => queue.filter(item => item.toolUseID !== toolUseID));
        },
        update(toolUseID, patch) {
            setToolUseConfirmQueue(queue => queue.map(item => item.toolUseID === toolUseID ? { ...item, ...patch } : item));
        },
    };
}
export { createPermissionContext, createPermissionQueueOps, createResolveOnce };
//# sourceMappingURL=PermissionContext.js.map