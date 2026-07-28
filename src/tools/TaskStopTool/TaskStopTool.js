import { z } from 'zod/v4';
import { buildTool } from '../../Tool.js';
import { stopTask } from '../../tasks/stopTask.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { jsonStringify } from '../../utils/slowOperations.js';
import { DESCRIPTION, TASK_STOP_TOOL_NAME } from './prompt.js';
import { renderToolResultMessage, renderToolUseMessage } from './UI.js';
const inputSchema = lazySchema(() => z.strictObject({
    task_id: z
        .string()
        .optional()
        .describe('要停止的后台任务 ID'),
    shell_id: z.string().optional().describe('已弃用：请使用 task_id'),
}));
const outputSchema = lazySchema(() => z.object({
    message: z.string().describe('操作的状态消息'),
    task_id: z.string().describe('已停止的任务 ID'),
    task_type: z.string().describe('已停止的任务类型'),
    // Optional: tool outputs are persisted to transcripts and replayed on --resume
    // without re-validation, so sessions from before this field was added lack it.
    command: z
        .string()
        .optional()
        .describe('已停止任务的命令或描述'),
}));
export const TaskStopTool = buildTool({
    name: TASK_STOP_TOOL_NAME,
    searchHint: '终止运行的后台任务',
    // KillShell is the deprecated name - kept as alias for backward compatibility
    // with existing transcripts and SDK users
    aliases: ['KillShell'],
    maxResultSizeChars: 100_000,
    userFacingName: () => (process.env.USER_TYPE === 'ant' ? '' : 'Stop Task'),
    get inputSchema() {
        return inputSchema();
    },
    get outputSchema() {
        return outputSchema();
    },
    shouldDefer: true,
    isConcurrencySafe() {
        return true;
    },
    toAutoClassifierInput(input) {
        return input.task_id ?? input.shell_id ?? '';
    },
    async validateInput({ task_id, shell_id }, { getAppState }) {
        // Support both task_id and shell_id (deprecated KillShell compat)
        const id = task_id ?? shell_id;
        if (!id) {
            return {
                result: false,
                message: '缺少必需参数：task_id',
                errorCode: 1,
            };
        }
        const appState = getAppState();
        const task = appState.tasks?.[id];
        if (!task) {
            return {
                result: false,
                message: `找不到 ID 为 ${id} 的任务`,
                errorCode: 1,
            };
        }
        if (task.status !== 'running') {
            return {
                result: false,
                message: `任务 ${id} 未运行（状态：${task.status}）`,
                errorCode: 3,
            };
        }
        return { result: true };
    },
    async description() {
        return `按 ID 停止正在运行的后台任务`;
    },
    async prompt() {
        return DESCRIPTION;
    },
    mapToolResultToToolResultBlockParam(output, toolUseID) {
        return {
            tool_use_id: toolUseID,
            type: 'tool_result',
            content: jsonStringify(output),
        };
    },
    renderToolUseMessage,
    renderToolResultMessage,
    async call({ task_id, shell_id }, { getAppState, setAppState, abortController }) {
        // Support both task_id and shell_id (deprecated KillShell compat)
        const id = task_id ?? shell_id;
        if (!id) {
            throw new Error('缺少必需参数：task_id');
        }
        const result = await stopTask(id, {
            getAppState,
            setAppState,
        });
        return {
            data: {
                message: `Successfully stopped task: ${result.taskId} (${result.command})`,
                task_id: result.taskId,
                task_type: result.taskType,
                command: result.command,
            },
        };
    },
});
//# sourceMappingURL=TaskStopTool.js.map