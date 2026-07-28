import { feature } from 'bun:bundle';
import { z } from 'zod/v4';
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../services/analytics/growthbook.js';
import { buildTool } from '../../Tool.js';
import { isAgentSwarmsEnabled } from '../../utils/agentSwarmsEnabled.js';
import { executeTaskCompletedHooks, getTaskCompletedHookMessage, } from '../../utils/hooks.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { blockTask, deleteTask, getTask, getTaskListId, isTodoV2Enabled, listTasks, TaskStatusSchema, updateTask, } from '../../utils/tasks.js';
import { getAgentId, getAgentName, getTeammateColor, getTeamName, } from '../../utils/teammate.js';
import { writeToMailbox } from '../../utils/teammateMailbox.js';
import { VERIFICATION_AGENT_TYPE } from '../AgentTool/constants.js';
import { TASK_UPDATE_TOOL_NAME } from './constants.js';
import { DESCRIPTION, PROMPT } from './prompt.js';
const inputSchema = lazySchema(() => {
    // Extended status schema that includes 'deleted' as a special action
    const TaskUpdateStatusSchema = TaskStatusSchema().or(z.literal('deleted'));
    return z.strictObject({
        taskId: z.string().describe('要更新的任务 ID'),
        subject: z.string().optional().describe('任务的新标题'),
        description: z.string().optional().describe('任务的新描述'),
        activeForm: z
            .string()
            .optional()
            .describe('进行中时在 spinner 中显示的现在进行时形式（如"运行测试"）'),
        status: TaskUpdateStatusSchema.optional().describe('任务的新状态'),
        addBlocks: z
            .array(z.string())
            .optional()
            .describe('此任务阻塞的任务 ID'),
        addBlockedBy: z
            .array(z.string())
            .optional()
            .describe('阻塞此任务的任务 ID'),
        owner: z.string().optional().describe('任务的新负责人'),
        metadata: z
            .record(z.string(), z.unknown())
            .optional()
            .describe('要合并到任务中的元数据键。设为 null 以删除。'),
    });
});
const outputSchema = lazySchema(() => z.object({
    success: z.boolean(),
    taskId: z.string(),
    updatedFields: z.array(z.string()),
    error: z.string().optional(),
    statusChange: z
        .object({
        from: z.string(),
        to: z.string(),
    })
        .optional(),
    verificationNudgeNeeded: z.boolean().optional(),
}));
export const TaskUpdateTool = buildTool({
    name: TASK_UPDATE_TOOL_NAME,
    searchHint: '更新任务',
    maxResultSizeChars: 100_000,
    async description() {
        return DESCRIPTION;
    },
    async prompt() {
        return PROMPT;
    },
    get inputSchema() {
        return inputSchema();
    },
    get outputSchema() {
        return outputSchema();
    },
    userFacingName() {
        return 'TaskUpdate';
    },
    shouldDefer: true,
    isEnabled() {
        return isTodoV2Enabled();
    },
    isConcurrencySafe() {
        return true;
    },
    toAutoClassifierInput(input) {
        const parts = [input.taskId];
        if (input.status)
            parts.push(input.status);
        if (input.subject)
            parts.push(input.subject);
        return parts.join(' ');
    },
    renderToolUseMessage() {
        return null;
    },
    async call({ taskId, subject, description, activeForm, status, owner, addBlocks, addBlockedBy, metadata, }, context) {
        const taskListId = getTaskListId();
        // Auto-expand task list when updating tasks
        context.setAppState(prev => {
            if (prev.expandedView === 'tasks')
                return prev;
            return { ...prev, expandedView: 'tasks' };
        });
        // Check if task exists
        const existingTask = await getTask(taskListId, taskId);
        if (!existingTask) {
            return {
                data: {
                    success: false,
                    taskId,
                    updatedFields: [],
                    error: '任务未找到',
                },
            };
        }
        const updatedFields = [];
        // Update basic fields if provided and different from current value
        const updates = {};
        if (subject !== undefined && subject !== existingTask.subject) {
            updates.subject = subject;
            updatedFields.push('subject');
        }
        if (description !== undefined && description !== existingTask.description) {
            updates.description = description;
            updatedFields.push('description');
        }
        if (activeForm !== undefined && activeForm !== existingTask.activeForm) {
            updates.activeForm = activeForm;
            updatedFields.push('activeForm');
        }
        if (owner !== undefined && owner !== existingTask.owner) {
            updates.owner = owner;
            updatedFields.push('owner');
        }
        // Auto-set owner when a teammate marks a task as in_progress without
        // explicitly providing an owner. This ensures the task list can match
        // todo items to teammates for showing activity status.
        if (isAgentSwarmsEnabled() &&
            status === 'in_progress' &&
            owner === undefined &&
            !existingTask.owner) {
            const agentName = getAgentName();
            if (agentName) {
                updates.owner = agentName;
                updatedFields.push('owner');
            }
        }
        if (metadata !== undefined) {
            const merged = { ...(existingTask.metadata ?? {}) };
            for (const [key, value] of Object.entries(metadata)) {
                if (value === null) {
                    delete merged[key];
                }
                else {
                    merged[key] = value;
                }
            }
            updates.metadata = merged;
            updatedFields.push('metadata');
        }
        if (status !== undefined) {
            // Handle deletion - delete the task file and return early
            if (status === 'deleted') {
                const deleted = await deleteTask(taskListId, taskId);
                return {
                    data: {
                        success: deleted,
                        taskId,
                        updatedFields: deleted ? ['deleted'] : [],
                        error: deleted ? undefined : '删除任务失败',
                        statusChange: deleted
                            ? { from: existingTask.status, to: 'deleted' }
                            : undefined,
                    },
                };
            }
            // For regular status updates, validate and apply if different
            if (status !== existingTask.status) {
                // Run TaskCompleted hooks when marking a task as completed
                if (status === 'completed') {
                    const blockingErrors = [];
                    const generator = executeTaskCompletedHooks(taskId, existingTask.subject, existingTask.description, getAgentName(), getTeamName(), undefined, context?.abortController?.signal, undefined, context);
                    for await (const result of generator) {
                        if (result.blockingError) {
                            blockingErrors.push(getTaskCompletedHookMessage(result.blockingError));
                        }
                    }
                    if (blockingErrors.length > 0) {
                        return {
                            data: {
                                success: false,
                                taskId,
                                updatedFields: [],
                                error: blockingErrors.join('\n'),
                            },
                        };
                    }
                }
                updates.status = status;
                updatedFields.push('status');
            }
        }
        if (Object.keys(updates).length > 0) {
            await updateTask(taskListId, taskId, updates);
        }
        // Notify new owner via mailbox when ownership changes
        if (updates.owner && isAgentSwarmsEnabled()) {
            const senderName = getAgentName() || 'team-lead';
            const senderColor = getTeammateColor();
            const assignmentMessage = JSON.stringify({
                type: 'task_assignment',
                taskId,
                subject: existingTask.subject,
                description: existingTask.description,
                assignedBy: senderName,
                timestamp: new Date().toISOString(),
            });
            await writeToMailbox(updates.owner, {
                from: senderName,
                text: assignmentMessage,
                timestamp: new Date().toISOString(),
                color: senderColor,
            }, taskListId);
        }
        // Add blocks if provided and not already present
        if (addBlocks && addBlocks.length > 0) {
            const newBlocks = addBlocks.filter(id => !existingTask.blocks.includes(id));
            for (const blockId of newBlocks) {
                await blockTask(taskListId, taskId, blockId);
            }
            if (newBlocks.length > 0) {
                updatedFields.push('blocks');
            }
        }
        // Add blockedBy if provided and not already present (reverse: the blocker blocks this task)
        if (addBlockedBy && addBlockedBy.length > 0) {
            const newBlockedBy = addBlockedBy.filter(id => !existingTask.blockedBy.includes(id));
            for (const blockerId of newBlockedBy) {
                await blockTask(taskListId, blockerId, taskId);
            }
            if (newBlockedBy.length > 0) {
                updatedFields.push('blockedBy');
            }
        }
        // Structural verification nudge: if the main-thread agent just closed
        // out a 3+ task list and none of those tasks was a verification step,
        // append a reminder to the tool result. Fires at the loop-exit moment
        // where skips happen ("when the last task closed, the loop exited").
        // Mirrors the TodoWriteTool nudge for V1 sessions; this covers V2
        // (interactive CLI). TaskUpdateToolOutput is @internal so this field
        // does not touch the public SDK surface.
        let verificationNudgeNeeded = false;
        if (feature('VERIFICATION_AGENT') &&
            getFeatureValue_CACHED_MAY_BE_STALE('tengu_hive_evidence', false) &&
            !context.agentId &&
            updates.status === 'completed') {
            const allTasks = await listTasks(taskListId);
            const allDone = allTasks.every(t => t.status === 'completed');
            if (allDone &&
                allTasks.length >= 3 &&
                !allTasks.some(t => /verif/i.test(t.subject))) {
                verificationNudgeNeeded = true;
            }
        }
        return {
            data: {
                success: true,
                taskId,
                updatedFields,
                statusChange: updates.status !== undefined
                    ? { from: existingTask.status, to: updates.status }
                    : undefined,
                verificationNudgeNeeded,
            },
        };
    },
    mapToolResultToToolResultBlockParam(content, toolUseID) {
        const { success, taskId, updatedFields, error, statusChange, verificationNudgeNeeded, } = content;
        if (!success) {
            // Return as non-error so it doesn't trigger sibling tool cancellation
            // in StreamingToolExecutor. "Task not found" is a benign condition
            // (e.g., task list already cleaned up) that the model can handle.
            return {
                tool_use_id: toolUseID,
                type: 'tool_result',
                content: error || `未找到任务 #${taskId}`,
            };
        }
        let resultContent = `已更新任务 #${taskId}：${updatedFields.join(', ')}`;
        // Add reminder for teammates when they complete a task (supports in-process teammates)
        if (statusChange?.to === 'completed' &&
            getAgentId() &&
            isAgentSwarmsEnabled()) {
            resultContent +=
                '\n\n任务完成。请调用TaskList以查找下一个可用任务或查看您的工作是否解除了其他任务的阻塞。';
        }
        if (verificationNudgeNeeded) {
            resultContent += `\n\n注意：您刚刚关闭了3个以上的任务，但其中没有一个是验证步骤。在编写最终摘要之前，请生成验证代理(subagent_type="${VERIFICATION_AGENT_TYPE}")。您不能通过在摘要中列出注意事项来自行分配PARTIAL — 只有验证器才能发布裁决。`;
        }
        return {
            tool_use_id: toolUseID,
            type: 'tool_result',
            content: resultContent,
        };
    },
});
//# sourceMappingURL=TaskUpdateTool.js.map