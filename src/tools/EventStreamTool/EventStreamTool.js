import { z } from 'zod';
export const EventStreamTool = {
    name: 'event-stream',
    description: '从各种源流式传输事件',
    callOn: 'manual',
    input: z.object({
        source: z.string().describe('事件源'),
        action: z.enum(['subscribe', 'unsubscribe', 'list']).describe('操作'),
    }),
    output: z.object({
        active: z.boolean().describe('订阅是否活跃'),
        events: z.array(z.string()).optional().describe('事件列表'),
        message: z.string().optional().describe('状态消息'),
    }),
    exec: async ({ source, action }) => {
        return {
            active: action === 'subscribe',
            message: `事件流 ${action} 完成`,
        };
    },
};
