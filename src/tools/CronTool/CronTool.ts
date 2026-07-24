import { z } from 'zod';

export const CronTool = {
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

  // Tool 接口默认安全实现
  isEnabled: () => true,
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => false,
  checkPermissions: (input, _ctx) =>
    Promise.resolve({ behavior: 'allow', updatedInput: input }),
  toAutoClassifierInput: () => '',
  userFacingName: () => 'cron',

  renderToolUseMessage: (input) => `Cron: ${input?.action ?? '?'}${input?.command ? ` (${input.command})` : ''}`,
  mapToolResultToToolResultBlockParam: (content, toolUseID) => ({
    tool_use_id: toolUseID,
    type: 'tool_result',
    content: content.message || 'Cron 操作完成',
  }),
  prompt: async () => '使用 cron 工具管理定时任务。',
  description: async () => '管理 cron 任务',
  call: async (args, context, canUseTool, parentMessage, onProgress) => {
    const result = await this.exec(args);
    return { data: result };
  },
};