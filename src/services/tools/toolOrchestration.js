import { findToolByName } from '../../Tool.js';
import { all } from '../../utils/generators.js';
import { runToolUse } from './toolExecution.js';
function getMaxToolUseConcurrency() {
    return (parseInt(process.env.CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY || '', 10) || 1);
}
export async function* runTools(toolUseMessages, assistantMessages, canUseTool, toolUseContext) {
    let currentContext = toolUseContext;
    for (const { isConcurrencySafe, blocks } of partitionToolCalls(toolUseMessages, currentContext)) {
        if (isConcurrencySafe) {
            const queuedContextModifiers = {};
            // Run read-only batch with limited concurrency (max 1 by default)
            for await (const update of runToolsConcurrently(blocks, assistantMessages, canUseTool, currentContext)) {
                if (update.contextModifier) {
                    const { toolUseID, modifyContext } = update.contextModifier;
                    if (!queuedContextModifiers[toolUseID]) {
                        queuedContextModifiers[toolUseID] = [];
                    }
                    queuedContextModifiers[toolUseID].push(modifyContext);
                }
                yield {
                    message: update.message,
                    newContext: currentContext,
                };
            }
            for (const block of blocks) {
                const modifiers = queuedContextModifiers[block.id];
                if (!modifiers) {
                    continue;
                }
                for (const modifier of modifiers) {
                    currentContext = modifier(currentContext);
                }
            }
            yield { newContext: currentContext };
        }
        else {
            // Run non-read-only batch serially
            for await (const update of runToolsSerially(blocks, assistantMessages, canUseTool, currentContext)) {
                if (update.newContext) {
                    currentContext = update.newContext;
                }
                yield {
                    message: update.message,
                    newContext: currentContext,
                };
            }
        }
    }
}
/**
 * Partition tool calls into batches where each batch is either:
 * 1. A single non-read-only tool, or
 * 2. Multiple consecutive read-only tools
 */
function partitionToolCalls(toolUseMessages, toolUseContext) {
    return toolUseMessages.reduce((acc, toolUse) => {
        const tool = findToolByName(toolUseContext.options.tools, toolUse.name);
        const parsedInput = tool?.inputSchema.safeParse(toolUse.input);
        const isConcurrencySafe = parsedInput?.success
            ? (() => {
                try {
                    return Boolean(tool?.isConcurrencySafe(parsedInput.data));
                }
                catch {
                    // If isConcurrencySafe throws (e.g., due to shell-quote parse failure),
                    // treat as not concurrency-safe to be conservative
                    return false;
                }
            })()
            : false;
        if (isConcurrencySafe && acc[acc.length - 1]?.isConcurrencySafe) {
            acc[acc.length - 1].blocks.push(toolUse);
        }
        else {
            acc.push({ isConcurrencySafe, blocks: [toolUse] });
        }
        return acc;
    }, []);
}
async function* runToolsSerially(toolUseMessages, assistantMessages, canUseTool, toolUseContext) {
    let currentContext = toolUseContext;
    for (const toolUse of toolUseMessages) {
        toolUseContext.setInProgressToolUseIDs(prev => new Set(prev).add(toolUse.id));
        for await (const update of runToolUse(toolUse, assistantMessages.find(_ => _.message.content.some(_ => _.type === 'tool_use' && _.id === toolUse.id)), canUseTool, currentContext)) {
            if (update.contextModifier) {
                currentContext = update.contextModifier.modifyContext(currentContext);
            }
            yield {
                message: update.message,
                newContext: currentContext,
            };
        }
        markToolUseAsComplete(toolUseContext, toolUse.id);
    }
}
async function* runToolsConcurrently(toolUseMessages, assistantMessages, canUseTool, toolUseContext) {
    yield* all(toolUseMessages.map(async function* (toolUse) {
        toolUseContext.setInProgressToolUseIDs(prev => new Set(prev).add(toolUse.id));
        yield* runToolUse(toolUse, assistantMessages.find(_ => _.message.content.some(_ => _.type === 'tool_use' && _.id === toolUse.id)), canUseTool, toolUseContext);
        markToolUseAsComplete(toolUseContext, toolUse.id);
    }), getMaxToolUseConcurrency());
}
function markToolUseAsComplete(toolUseContext, toolUseID) {
    toolUseContext.setInProgressToolUseIDs(prev => {
        const next = new Set(prev);
        next.delete(toolUseID);
        return next;
    });
}
