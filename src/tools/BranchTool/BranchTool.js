import { z } from 'zod';
export const BranchTool = {
    name: 'branch',
    description: '创建和管理 Git 分支',
    callOn: 'manual',
    input: z.object({
        action: z.enum(['create', 'switch', 'list', 'delete']).describe('分支操作'),
        name: z.string().optional().describe('分支名称'),
    }),
    output: z.object({
        success: z.boolean().describe('操作是否成功'),
        branch: z.string().optional().describe('当前分支'),
        branches: z.array(z.string()).optional().describe('分支列表'),
        message: z.string().optional().describe('结果消息'),
    }),
    exec: async ({ action, name }) => {
        return {
            success: true,
            message: `分支 ${action} 完成`,
        };
    },
};
