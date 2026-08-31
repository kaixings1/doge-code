import { z } from 'zod/v4';
import { buildTool } from '../../Tool.js';
import { executeTaskCreatedHooks, getTaskCreatedHookMessage, } from '../../utils/hooks.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { createTask, deleteTask, getTaskListId, isTodoV2Enabled, } from '../../utils/tasks.js';
import { getAgentName, getTeamName } from '../../utils/teammate.js';
import { TASK_CREATE_TOOL_NAME } from './constants.js';
import { DESCRIPTION, getPrompt } from './prompt.js';
const inputSchema = lazySchema(() => z.object({
    subject: z.string().optional(),
    name: z.string().optional(),
    description: z.string().describe('需要完成什么'),
    activeForm: z
        .string()
        .optional()
        .describe('进行中时在 spinner 中显示的现在进行时形式（如"运行测试"）'),
    metadata: z
        .record(z.string(), z.unknown())
        .optional()
        .describe('附加到任务的任意元数据'),
})
    .strict()
    .refine(data => data.subject || data.name, {
    message: '缺少必需参数 `subject`',
    path: ['subject'],
})
    .transform(data => ({
    ...data,
    subject: data.subject ?? data.name,
})));
const outputSchema = lazySchema(() => z.object({
    task: z.object({
        id: z.string(),
        subject: z.string(),
    }),
}));
export const TaskCreateTool = buildTool({
    name: TASK_CREATE_TOOL_NAME,
    searchHint: '在任务列表中创建任务',
    maxResultSizeChars: 100000,
    async description() {
        return DESCRIPTION;
    },
    async prompt() {
        return getPrompt();
    },
    get inputSchema() {
        return inputSchema();
    },
    get outputSchema() {
        return outputSchema();
    },
    userFacingName() {
        return '创建任务';
    },
    shouldDefer: true,
    isEnabled() {
        return isTodoV2Enabled();
    },
    isConcurrencySafe() {
        return true;
    },
    toAutoClassifierInput(input) {
        return input.subject;
    },
    renderToolUseMessage() {
        return null;
    },
    async call({ subject, description, activeForm, metadata }, context) {
        const taskId = await createTask(getTaskListId(), {
            subject,
            description,
            activeForm,
            status: 'pending',
            owner: undefined,
            blocks: [],
            blockedBy: [],
            metadata,
        });
        const blockingErrors = [];
        const generator = executeTaskCreatedHooks(taskId, subject, description, getAgentName(), getTeamName(), undefined, context?.abortController?.signal, undefined, context);
        for await (const result of generator) {
            if (result.blockingError) {
                blockingErrors.push(getTaskCreatedHookMessage(result.blockingError));
            }
        }
        if (blockingErrors.length > 0) {
            await deleteTask(getTaskListId(), taskId);
            throw new Error(blockingErrors.join('\n'));
        }
        // Auto-expand task list when creating tasks
        context.setAppState(prev => {
            if (prev.expandedView === 'tasks')
                return prev;
            return { ...prev, expandedView: 'tasks' };
        });
        return {
            data: {
                task: {
                    id: taskId,
                    subject,
                },
            },
        };
    },
    mapToolResultToToolResultBlockParam(content, toolUseID) {
        const { task } = content;
        return {
            tool_use_id: toolUseID,
            type: 'tool_result',
            content: `Task #${task.id} created successfully: ${task.subject}`,
        };
    },
});
