import { z } from 'zod';
export const BackupTool = {
    name: 'backup',
    description: '创建和管理备份',
    callOn: 'manual',
    input: z.object({
        action: z.enum(['create', 'restore', 'list', 'delete']).describe('备份操作'),
        path: z.string().optional().describe('备份路径'),
        name: z.string().optional().describe('备份名称'),
    }),
    output: z.object({
        success: z.boolean().describe('操作是否成功'),
        backups: z.array(z.string()).optional().describe('备份列表'),
        message: z.string().optional().describe('结果消息'),
    }),
    exec: async ({ action, path, name }) => {
        return {
            success: true,
            message: `备份 ${action} 完成`,
        };
    },
};
