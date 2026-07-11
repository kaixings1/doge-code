import { z } from 'zod';
export const AdvisorTool = {
    name: 'advisor',
    description: 'AI 顾问工具，用于代码分析和建议（实验性）',
    callOn: 'manual',
    input: z.object({
        query: z.string().optional().describe('向顾问提出的查询问题'),
        focus: z.enum(['code', 'architecture', 'performance', 'security']).optional().describe('关注领域'),
    }),
    output: z.object({
        advice: z.string().describe('顾问建议'),
        suggestions: z.array(z.string()).describe('建议列表'),
        confidence: z.number().describe('置信度 (0-1)'),
    }),
    exec: async ({ query, focus = 'code' }) => {
        return {
            advice: '顾问分析完成',
            suggestions: [],
            confidence: 0.8,
        };
    },
};
