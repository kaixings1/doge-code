import { createUserMessage, REJECT_MESSAGE, withMemoryCorrectionHint, } from '../../utils/messages.js';
import { findToolByName } from '../../Tool.js';
import { BASH_TOOL_NAME } from '../../tools/BashTool/toolName.js';
import { createChildAbortController } from '../../utils/abortController.js';
import { runToolUse } from './toolExecution.js';
/**
 * Executes tools as they stream in with concurrency control.
 * - Concurrent-safe tools can execute in parallel with other concurrent-safe tools
 * - Non-concurrent tools must execute alone (exclusive access)
 * - Results are buffered and emitted in the order tools were received
 */
export class StreamingToolExecutor {
    constructor(toolDefinitions, canUseTool, toolUseContext) {
        this.toolDefinitions = toolDefinitions;
        this.canUseTool = canUseTool;
        this.tools = [];
        this.hasErrored = false;
        this.erroredToolDescription = '';
        this.discarded = false;
        this.toolUseContext = toolUseContext;
        this.siblingAbortController = createChildAbortController(toolUseContext.abortController);
    }
    /**
     * Discards all pending and in-progress tools. Called when streaming fallback
     * occurs and results from the failed attempt should be abandoned.
     * Queued tools won't start, and in-progress tools will receive synthetic errors.
     */
    discard() {
        this.discarded = true;
    }
    /**
     * Add a tool to the execution queue. Will start executing immediately if conditions allow.
     */
    addTool(block, assistantMessage) {
        const toolDefinition = findToolByName(this.toolDefinitions, block.name);
        if (!toolDefinition) {
            this.tools.push({
                id: block.id,
                block,
                assistantMessage,
                status: 'completed',
                isConcurrencySafe: true,
                pendingProgress: [],
                results: [
                    createUserMessage({
                        content: [
                            {
                                type: 'tool_result',
                                content: `<tool_use_error>错误：没有可用的工具：${block.name}</tool_use_error>`,
                                is_error: true,
                                tool_use_id: block.id,
                            },
                        ],
                        toolUseResult: `错误：没有可用的工具：${block.name}`,
                        sourceToolAssistantUUID: assistantMessage.uuid,
                    }),
                ],
            });
            return;
        }
        const parsedInput = toolDefinition.inputSchema.safeParse(block.input);
        const isConcurrencySafe = parsedInput?.success
            ? (() => {
                try {
                    return Boolean(toolDefinition.isConcurrencySafe(parsedInput.data));
                }
                catch {
                    return false;
                }
            })()
            : false;
        this.tools.push({
            id: block.id,
            block,
            assistantMessage,
            status: 'queued',
            isConcurrencySafe,
            pendingProgress: [],
        });
        void this.processQueue();
    }
    /**
     * Check if a tool can execute based on current concurrency state
     */
    canExecuteTool(isConcurrencySafe) {
        const executingTools = this.tools.filter(t => t.status === 'executing');
        return (executingTools.length === 0 ||
            (isConcurrencySafe && executingTools.every(t => t.isConcurrencySafe)));
    }
    /**
     * Process the queue, starting tools when concurrency conditions allow
     */
    async processQueue() {
        for (const tool of this.tools) {
            if (tool.status !== 'queued')
                continue;
            if (this.canExecuteTool(tool.isConcurrencySafe)) {
                await this.executeTool(tool);
            }
            else {
                // Can't execute this tool yet, and since we need to maintain order for non-concurrent tools, stop here
                if (!tool.isConcurrencySafe)
                    break;
            }
        }
    }
    createSyntheticErrorMessage(toolUseId, reason, assistantMessage) {
        // For user interruptions (ESC to reject), use REJECT_MESSAGE so the UI shows
        // "User rejected edit" instead of "Error editing file"
        if (reason === 'user_interrupted') {
            return createUserMessage({
                content: [
                    {
                        type: 'tool_result',
                        content: withMemoryCorrectionHint(REJECT_MESSAGE),
                        is_error: true,
                        tool_use_id: toolUseId,
                    },
                ],
                toolUseResult: 'User rejected tool use',
                sourceToolAssistantUUID: assistantMessage.uuid,
            });
        }
        if (reason === 'streaming_fallback') {
            return createUserMessage({
                content: [
                    {
                        type: 'tool_result',
                        content: '<tool_use_error>Error: Streaming fallback - tool execution discarded</tool_use_error>',
                        is_error: true,
                        tool_use_id: toolUseId,
                    },
                ],
                toolUseResult: 'Streaming fallback - tool execution discarded',
                sourceToolAssistantUUID: assistantMessage.uuid,
            });
        }
        const desc = this.erroredToolDescription;
        const msg = desc
            ? `Cancelled: parallel tool call ${desc} errored`
            : 'Cancelled: parallel tool call errored';
        return createUserMessage({
            content: [
                {
                    type: 'tool_result',
                    content: `<tool_use_error>${msg}</tool_use_error>`,
                    is_error: true,
                    tool_use_id: toolUseId,
                },
            ],
            toolUseResult: msg,
            sourceToolAssistantUUID: assistantMessage.uuid,
        });
    }
    /**
     * Determine why a tool should be cancelled.
     */
    getAbortReason(tool) {
        if (this.discarded) {
            return 'streaming_fallback';
        }
        if (this.hasErrored) {
            return 'sibling_error';
        }
        if (this.toolUseContext.abortController.signal.aborted) {
            // 'interrupt' means the user typed a new message while tools were
            // running. Only cancel tools whose interruptBehavior is 'cancel';
            // 'block' tools shouldn't reach here (abort isn't fired).
            if (this.toolUseContext.abortController.signal.reason === 'interrupt') {
                return this.getToolInterruptBehavior(tool) === 'cancel'
                    ? 'user_interrupted'
                    : null;
            }
            return 'user_interrupted';
        }
        return null;
    }
    getToolInterruptBehavior(tool) {
        const definition = findToolByName(this.toolDefinitions, tool.block.name);
        if (!definition?.interruptBehavior)
            return 'block';
        try {
            return definition.interruptBehavior();
        }
        catch {
            return 'block';
        }
    }
    getToolDescription(tool) {
        const input = tool.block.input;
        const summary = input?.command ?? input?.file_path ?? input?.pattern ?? '';
        if (typeof summary === 'string' && summary.length > 0) {
            const truncated = summary.length > 40 ? summary.slice(0, 40) + '\u2026' : summary;
            return `${tool.block.name}(${truncated})`;
        }
        return tool.block.name;
    }
    updateInterruptibleState() {
        const executing = this.tools.filter(t => t.status === 'executing');
        this.toolUseContext.setHasInterruptibleToolInProgress?.(executing.length > 0 &&
            executing.every(t => this.getToolInterruptBehavior(t) === 'cancel'));
    }
    /**
     * Execute a tool and collect its results
     */
    async executeTool(tool) {
        tool.status = 'executing';
        this.toolUseContext.setInProgressToolUseIDs(prev => new Set(prev).add(tool.id));
        this.updateInterruptibleState();
        const messages = [];
        const contextModifiers = [];
        const collectResults = async () => {
            // If already aborted (by error or user), generate synthetic error block instead of running the tool
            const initialAbortReason = this.getAbortReason(tool);
            if (initialAbortReason) {
                messages.push(this.createSyntheticErrorMessage(tool.id, initialAbortReason, tool.assistantMessage));
                tool.results = messages;
                tool.contextModifiers = contextModifiers;
                tool.status = 'completed';
                this.updateInterruptibleState();
                return;
            }
            // Per-tool child controller. Lets siblingAbortController kill running
            // subprocesses (Bash spawns listen to this signal) when a Bash error
            // cascades. Permission-dialog rejection also aborts this controller
            // (PermissionContext.ts cancelAndAbort) — that abort must bubble up to
            // the query controller so the query loop's post-tool abort check ends
            // the turn. Without bubble-up, ExitPlanMode "clear context + auto"
            // sends REJECT_MESSAGE to the model instead of aborting (#21056 regression).
            const toolAbortController = createChildAbortController(this.siblingAbortController);
            toolAbortController.signal.addEventListener('abort', () => {
                if (toolAbortController.signal.reason !== 'sibling_error' &&
                    !this.toolUseContext.abortController.signal.aborted &&
                    !this.discarded) {
                    this.toolUseContext.abortController.abort(toolAbortController.signal.reason);
                }
            }, { once: true });
            const generator = runToolUse(tool.block, tool.assistantMessage, this.canUseTool, { ...this.toolUseContext, abortController: toolAbortController });
            // Track if this specific tool has produced an error result.
            // This prevents the tool from receiving a duplicate "sibling error"
            // message when it is the one that caused the error.
            let thisToolErrored = false;
            for await (const update of generator) {
                // Check if we were aborted by a sibling tool error or user interruption.
                // Only add the synthetic error if THIS tool didn't produce the error.
                const abortReason = this.getAbortReason(tool);
                if (abortReason && !thisToolErrored) {
                    messages.push(this.createSyntheticErrorMessage(tool.id, abortReason, tool.assistantMessage));
                    break;
                }
                const isErrorResult = update.message.type === 'user' &&
                    Array.isArray(update.message.message.content) &&
                    update.message.message.content.some(_ => _.type === 'tool_result' && _.is_error === true);
                if (isErrorResult) {
                    thisToolErrored = true;
                    // Only Bash errors cancel siblings. Bash commands often have implicit
                    // dependency chains (e.g. mkdir fails → subsequent commands pointless).
                    // Read/WebFetch/etc are independent — one failure shouldn't nuke the rest.
                    if (tool.block.name === BASH_TOOL_NAME) {
                        this.hasErrored = true;
                        this.erroredToolDescription = this.getToolDescription(tool);
                        this.siblingAbortController.abort('sibling_error');
                    }
                }
                if (update.message) {
                    // Progress messages go to pendingProgress for immediate yielding
                    if (update.message.type === 'progress') {
                        tool.pendingProgress.push(update.message);
                        // Signal that progress is available
                        if (this.progressAvailableResolve) {
                            this.progressAvailableResolve();
                            this.progressAvailableResolve = undefined;
                        }
                    }
                    else {
                        messages.push(update.message);
                    }
                }
                if (update.contextModifier) {
                    contextModifiers.push(update.contextModifier.modifyContext);
                }
            }
            tool.results = messages;
            tool.contextModifiers = contextModifiers;
            tool.status = 'completed';
            this.updateInterruptibleState();
            // NOTE: we currently don't support context modifiers for concurrent
            //       tools. None are actively being used, but if we want to use
            //       them in concurrent tools, we need to support that here.
            if (!tool.isConcurrencySafe && contextModifiers.length > 0) {
                for (const modifier of contextModifiers) {
                    this.toolUseContext = modifier(this.toolUseContext);
                }
            }
        };
        const promise = collectResults();
        tool.promise = promise;
        // Process more queue when done
        void promise.finally(() => {
            void this.processQueue();
        });
    }
    /**
     * Get any completed results that haven't been yielded yet (non-blocking)
     * Maintains order where necessary
     * Also yields any pending progress messages immediately
     */
    *getCompletedResults() {
        if (this.discarded) {
            return;
        }
        for (const tool of this.tools) {
            // Always yield pending progress messages immediately, regardless of tool status
            while (tool.pendingProgress.length > 0) {
                const progressMessage = tool.pendingProgress.shift();
                yield { message: progressMessage, newContext: this.toolUseContext };
            }
            if (tool.status === 'yielded') {
                continue;
            }
            if (tool.status === 'completed' && tool.results) {
                tool.status = 'yielded';
                for (const message of tool.results) {
                    yield { message, newContext: this.toolUseContext };
                }
                markToolUseAsComplete(this.toolUseContext, tool.id);
            }
            else if (tool.status === 'executing' && !tool.isConcurrencySafe) {
                break;
            }
        }
    }
    /**
     * Check if any tool has pending progress messages
     */
    hasPendingProgress() {
        return this.tools.some(t => t.pendingProgress.length > 0);
    }
    /**
     * Wait for remaining tools and yield their results as they complete.
     * Also yields progress messages as they become available.
     */
    async *getRemainingResults() {
        if (this.discarded) {
            return;
        }
        while (this.hasUnfinishedTools()) {
            await this.processQueue();
            for (const result of this.getCompletedResults()) {
                yield result;
            }
            // If we still have executing tools but nothing completed, wait for any to complete
            // OR for progress to become available.
            // Use a timeout to prevent infinite blocking if a tool hangs forever
            // without reporting progress and without completing.
            if (this.hasExecutingTools() &&
                !this.hasCompletedResults() &&
                !this.hasPendingProgress()) {
                const executingPromises = this.tools
                    .filter(t => t.status === 'executing' && t.promise)
                    .map(t => t.promise);
                // Also wait for progress to become available
                const progressPromise = new Promise(resolve => {
                    this.progressAvailableResolve = resolve;
                });
                if (executingPromises.length > 0) {
                    // Timeout after 30 seconds to prevent infinite blocking.
                    // Without this, if a tool hangs forever (e.g., stuck ripgrep process)
                    // and never reports progress, Promise.race blocks forever.
                    const raceTimeout = new Promise((resolve) => {
                        setTimeout(() => {
                            this.progressAvailableResolve = undefined;
                            resolve();
                        }, 30000);
                    });
                    await Promise.race([
                        ...executingPromises,
                        progressPromise,
                        raceTimeout,
                    ]);
                }
            }
        }
        for (const result of this.getCompletedResults()) {
            yield result;
        }
    }
    /**
     * Check if there are any completed results ready to yield
     */
    hasCompletedResults() {
        return this.tools.some(t => t.status === 'completed');
    }
    /**
     * Check if there are any tools still executing
     */
    hasExecutingTools() {
        return this.tools.some(t => t.status === 'executing');
    }
    /**
     * Check if there are any unfinished tools
     */
    hasUnfinishedTools() {
        return this.tools.some(t => t.status !== 'yielded');
    }
    /**
     * Get the current tool use context (may have been modified by context modifiers)
     */
    getUpdatedContext() {
        return this.toolUseContext;
    }
}
function markToolUseAsComplete(toolUseContext, toolUseID) {
    toolUseContext.setInProgressToolUseIDs(prev => {
        const next = new Set(prev);
        next.delete(toolUseID);
        return next;
    });
}
