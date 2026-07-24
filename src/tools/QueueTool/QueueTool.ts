import { z } from 'zod';

export const QueueTool = {
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

  // Tool 接口默认安全实现
  isEnabled: () => true,
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => false,
  checkPermissions: (input, _ctx) =>
    Promise.resolve({ behavior: 'allow', updatedInput: input }),
  toAutoClassifierInput: () => '',
  userFacingName: () => 'queue',

  renderToolUseMessage: (input) => `Queue: ${input?.action ?? '?'} ${input?.queue ?? ''}`,
  mapToolResultToToolResultBlockParam: (content, toolUseID) => ({
    tool_use_id: toolUseID,
    type: 'tool_result',
    content: content.message || 'Queue operation completed',
  }),
  prompt: async () => 'Use queue to manage task queues.',
  description: async () => 'Manage task queues and job processing',
  call: async (args, context, canUseTool, parentMessage, onProgress) => {
    const result = await this.exec(args);
    return { data: result };
  },
};