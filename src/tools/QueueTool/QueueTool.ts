import { Tool } from '../../Tool';
import { z } from 'zod';

export const QueueTool: Tool = {
  name: 'queue',
  description: 'Manage task queues and job processing',
  callOn: 'manual',
  input: z.object({
    action: z.enum(['push', 'pop', 'list', 'clear', 'stats']).describe('Queue action'),
    queue: z.string().describe('Queue name'),
    job: z.string().optional().describe('Job to push'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether action succeeded'),
    jobs: z.array(z.string()).optional().describe('Job list'),
    stats: z.record(z.number()).optional().describe('Queue stats'),
    message: z.string().optional().describe('Result message'),
  }),
  exec: async ({ action, queue, job }) => {
    return {
      success: true,
      message: `Queue ${action} completed`,
    };
  },
};

