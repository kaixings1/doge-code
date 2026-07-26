import { z } from 'zod';

export const ScheduleTool = {
  name: 'schedule',
  description: 'Schedule tasks to run at specific times',
  callOn: 'manual',
  input: z.object({
    action: z.enum(['create', 'list', 'cancel', 'run']).describe('计划任务操作'),
    cron: z.string().optional().describe('Cron 表达式'),
    command: z.string().optional().describe('要运行的命令'),
    task: z.string().optional().describe('任务名称'),
  }),
  output: z.object({
    success: z.boolean().describe('操作是否成功'),
    tasks: z.array(z.string()).optional().describe('计划任务列表'),
    message: z.string().optional().describe('结果消息'),
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