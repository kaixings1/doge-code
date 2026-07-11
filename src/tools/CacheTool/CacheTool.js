import { z } from 'zod';
export const CacheTool = {
    name: 'cache',
    description: '管理缓存操作',
    callOn: 'manual',
    input: z.object({
        action: z.enum(['get', 'set', 'delete', 'clear', 'list']).describe('缓存操作'),
        key: z.string().optional().describe('缓存键'),
        value: z.string().optional().describe('缓存值'),
    }),
    output: z.object({
        success: z.boolean().describe('操作是否成功'),
        keys: z.array(z.string()).optional().describe('缓存键列表'),
        value: z.string().optional().describe('缓存值'),
        message: z.string().optional().describe('结果消息'),
    }),
    exec: async ({ action, key, value }) => {
        return {
            success: true,
            message: `缓存 ${action} 完成`,
        };
    },
};
