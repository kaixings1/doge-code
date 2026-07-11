import { z } from 'zod';
export const EffortTool = {
    name: 'effort',
    description: '为支持的模型设置努力程度级别（低/中/高/最大）',
    callOn: 'manual',
    input: z.object({
        level: z.enum(['low', 'medium', 'high', 'max']).describe('努力程度级别'),
        model: z.string().optional().describe('目标模型（可选，影响当前会话）'),
    }),
    output: z.object({
        success: z.boolean().describe('是否成功设置努力程度级别'),
        previousLevel: z.string().optional().describe('之前的努力程度级别'),
        newLevel: z.string().describe('新的努力程度级别'),
    }),
    exec: async ({ level, model }) => {
        // 为模型设置努力程度级别
        return {
            success: true,
            newLevel: level,
        };
    },
};
