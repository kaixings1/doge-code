import { z } from 'zod/v4';
import { buildTool } from '../../Tool.js';
import { lazySchema } from '../../utils/lazySchema.js';
const inputSchema = lazySchema(() => z.object({
    action: z.enum(['push', 'pop', 'list', 'clear', 'stats']).describe('队列操作'),
    queue: z.string().describe('队列名称'),
    job: z.string().optional().describe('要推送的任务'),
}));
const outputSchema = lazySchema(() => z.object({
    success: z.boolean().describe('操作是否成功'),
    jobs: z.array(z.string()).optional().describe('任务列表'),
    stats: z.record(z.number()).optional().describe('队列统计'),
    message: z.string().optional().describe('结果消息'),
}));
const queueStore = new Map();
function getQueue(name) {
    const queue = queueStore.get(name);
    if (!queue) {
        queueStore.set(name, []);
        return queueStore.get(name);
    }
    return queue;
}
function generateJobId() {
    return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
export const QueueTool = buildTool({
    name: 'queue',
    description: async () => '管理任务队列和作业处理（push/pop/list/clear/stats）',
    callOn: 'manual',
    async prompt() {
        return '使用 queue 工具管理任务队列。';
    },
    get inputSchema() {
        return inputSchema();
    },
    get outputSchema() {
        return outputSchema();
    },
    userFacingName() {
        return 'queue';
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
        const queue = input?.queue ?? '';
        return `Queue: ${action} ${queue}`;
    },
    mapToolResultToToolResultBlockParam(content, toolUseID) {
        return {
            tool_use_id: toolUseID,
            type: 'tool_result',
            content: content.message || 'Queue operation completed',
        };
    },
    async call({ action, queue, job }) {
        const q = getQueue(queue);
        switch (action) {
            case 'push': {
                if (!job) {
                    return { data: { success: false, message: 'push 操作需要 job 参数' } };
                }
                const entry = { id: generateJobId(), payload: job, enqueuedAt: Date.now() };
                q.push(entry);
                return { data: { success: true, message: `已入队: ${entry.id}` } };
            }
            case 'pop': {
                const entry = q.shift();
                if (!entry) {
                    return { data: { success: true, message: `队列 "${queue}" 为空` } };
                }
                return { data: { success: true, jobs: [entry.payload], message: `已出队: ${entry.id}` } };
            }
            case 'list': {
                return {
                    data: {
                        success: true,
                        jobs: q.map(e => e.payload),
                    },
                };
            }
            case 'clear': {
                q.length = 0;
                return { data: { success: true, message: `队列 "${queue}" 已清空` } };
            }
            case 'stats': {
                const allQueues = {};
                for (const [name, entries] of queueStore) {
                    allQueues[name] = entries;
                }
                const stats = {};
                for (const [name, entries] of allQueues) {
                    stats[name] = entries.length;
                }
                return {
                    data: {
                        success: true,
                        stats: {
                            queueCount: Object.keys(allQueues).length,
                            totalJobs: q.length,
                            ...stats,
                        },
                    },
                };
            }
        }
    },
});
