import { z } from 'zod';

export const ScheduleTool = {
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

  // Tool 接口默认安全实现
  isEnabled: () => true,
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => false,
  checkPermissions: (input, _ctx) =>
    Promise.resolve({ behavior: 'allow', updatedInput: input }),
  toAutoClassifierInput: () => '',
  userFacingName: () => 'schedule',

  renderToolUseMessage: (input) => `Schedule: ${input?.action ?? '?'}${input?.task ? ` (${input.task})` : ''}`,
  mapToolResultToToolResultBlockParam: (content, toolUseID) => ({
    tool_use_id: toolUseID,
    type: 'tool_result',
    content: content.message || 'Schedule operation completed',
  }),
  prompt: async () => 'Use schedule to manage scheduled tasks.',
  description: async () => 'Schedule tasks to run at specific times',
  call: async (args, context, canUseTool, parentMessage, onProgress) => {
    const result = await this.exec(args);
    return { data: result };
  },
};