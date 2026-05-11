import { Tool } from '../../Tool';
import { z } from 'zod';

export const CronTool: Tool = {
  name: 'cron',
  description: 'Manage cron jobs',
  callOn: 'manual',
  input: z.object({
    action: z.enum(['add', 'list', 'remove', 'run']).describe('Cron action'),
    schedule: z.string().optional().describe('Cron schedule'),
    command: z.string().optional().describe('Command to run'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether action succeeded'),
    jobs: z.array(z.string()).optional().describe('Cron jobs'),
    message: z.string().optional().describe('Result message'),
  }),
  exec: async ({ action, schedule, command }) => {
    return {
      success: true,
      message: `Cron ${action} completed`,
    };
  },
};

