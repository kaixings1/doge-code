import { Tool } from '../../Tool';
import { z } from 'zod';

export const ScheduleTool: Tool = {
  name: 'schedule',
  description: 'Schedule tasks to run at specific times',
  callOn: 'manual',
  input: z.object({
    action: z.enum(['create', 'list', 'cancel', 'run']).describe('Schedule action'),
    cron: z.string().optional().describe('Cron expression'),
    command: z.string().optional().describe('Command to run'),
    task: z.string().optional().describe('Task name'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether action succeeded'),
    tasks: z.array(z.string()).optional().describe('Scheduled tasks'),
    message: z.string().optional().describe('Result message'),
  }),
  exec: async ({ action, cron, command, task }) => {
    return {
      success: true,
      message: `Schedule ${action} completed`,
    };
  },
};

