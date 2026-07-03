import { Tool } from '../../Tool';
import { z } from 'zod';

export const CronTool: Tool = {
  name: 'cron',
  description: '管理 cron 任务',
  callOn: 'manual',
  input: z.object({
    action: z.enum(['add', 'list', 'remove', 'run']).describe('cron 操作'),
    schedule: z.string().optional().describe('cron 时间表'),
    command: z.string().optional().describe('要运行的命令'),
  }),
  output: z.object({
    success: z.boolean().describe('操作是否成功'),
    jobs: z.array(z.string()).optional().describe('cron 任务列表'),
    message: z.string().optional().describe('结果消息'),
  }),
  exec: async ({ action, schedule, command }) => {
    return {
      success: true,
      message: `cron ${action} 完成`,
    };
  },
};

