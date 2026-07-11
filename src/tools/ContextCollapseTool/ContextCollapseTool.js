import { z } from 'zod';
export const ContextCollapseTool = {
    name: 'context-collapse',
    description: '压缩上下文以减少 token 使用量',
    callOn: 'manual',
    input: z.object({
        target: z.enum(['session', 'recent', 'custom']).describe('要压缩的目标'),
        threshold: z.number().optional().describe('token 阈值'),
    }),
    output: z.object({
        collapsed: z.boolean().describe('压缩是否成功'),
        tokensSaved: z.number().describe('节省的 token 数量'),
        message: z.string().describe('结果消息'),
    }),
    exec: async ({ target, threshold = 10000 }) => {
        return {
            collapsed: true,
            tokensSaved: threshold,
            message: `上下文已压缩: ${target}`,
        };
    },
};
