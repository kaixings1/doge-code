import { z } from 'zod/v4';
import { buildTool } from '../../Tool.js';
import { lazySchema } from '../../utils/lazySchema.js';
import { exec } from '../../utils/Shell.js';
const inputSchema = lazySchema(() => z.object({
    action: z.enum(['create', 'list', 'cancel', 'run']).describe('计划任务操作'),
    cron: z.string().optional().describe('Cron 表达式'),
    command: z.string().optional().describe('要运行的命令'),
    task: z.string().optional().describe('任务名称'),
}));
const outputSchema = lazySchema(() => z.object({
    success: z.boolean().describe('操作是否成功'),
    tasks: z.array(z.string()).optional().describe('计划任务列表'),
    message: z.string().optional().describe('结果消息'),
}));
const scheduleStore = new Map();
function generateScheduleId() {
    return `sched_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}
export const ScheduleTool = buildTool({
    name: 'schedule',
    description: async () => '管理计划任务（create/list/cancel/run）',
    callOn: 'manual',
    async prompt() {
        return '使用 schedule 工具管理计划任务。';
    },
    get inputSchema() {
        return inputSchema();
    },
    get outputSchema() {
        return outputSchema();
    },
    userFacingName() {
        return 'schedule';
    },
    isEnabled() {
        return true;
    },
    toAutoClassifierInput() {
        return '';
    },
    async checkPermissions(input) {
        return { behavior: 'allow', updatedInput: input };
    },
    renderToolUseMessage(input) {
        const action = input?.action ?? '?';
        const task = input?.task;
        return `Schedule: ${action}${task ? ` (${task})` : ''}`;
    },
    mapToolResultToToolResultBlockParam(content, toolUseID) {
        const msg = content.message || 'Schedule operation completed';
        return {
            tool_use_id: toolUseID,
            type: 'tool_result',
            content: msg,
        };
    },
    async call({ action, cron, command, task }) {
        switch (action) {
            case 'create': {
                if (!cron || !command) {
                    return { data: { success: false, message: 'create 操作需要 cron 和 command 参数' } };
                }
                const taskName = task || `task_${Date.now()}`;
                const id = generateScheduleId();
                scheduleStore.set(id, {
                    id,
                    name: taskName,
                    cron,
                    command,
                    createdAt: new Date().toISOString(),
                });
                return {
                    data: {
                        success: true,
                        message: `已创建计划任务 "${taskName}" (${cron}): ${command}`,
                    },
                };
            }
            case 'list': {
                const tasks = Array.from(scheduleStore.values()).map(t => `${t.name} | ${t.cron} | ${t.command}`);
                return {
                    data: {
                        success: true,
                        tasks,
                        message: `共 ${tasks.length} 个计划任务`,
                    },
                };
            }
            case 'cancel': {
                if (!task) {
                    return { data: { success: false, message: 'cancel 操作需要 task 参数' } };
                }
                let removed = false;
                for (const [id, entry] of scheduleStore) {
                    if (entry.name === task) {
                        scheduleStore.delete(id);
                        removed = true;
                        break;
                    }
                }
                return {
                    data: {
                        success: removed,
                        message: removed ? `计划任务 "${task}" 已取消` : `未找到计划任务 "${task}"`,
                    },
                };
            }
            case 'run': {
                if (!command && !task) {
                    return { data: { success: false, message: 'run 操作需要 task 或 command 参数' } };
                }
                const targetCommand = command || (task ? scheduleStore.get(task)?.command : undefined);
                if (!targetCommand) {
                    return { data: { success: false, message: '未找到要执行的命令' } };
                }
                try {
                    const result = await exec(targetCommand, new AbortController().signal, 'bash', { timeout: 120000 });
                    return {
                        data: {
                            success: result.code === 0,
                            message: result.code === 0 ? '执行成功' : `执行失败: ${result.stderr}`,
                        },
                    };
                }
                catch (err) {
                    return {
                        data: {
                            success: false,
                            message: `执行失败: ${err instanceof Error ? err.message : String(err)}`,
                        },
                    };
                }
            }
        }
    },
});
//# sourceMappingURL=ScheduleTool.js.map