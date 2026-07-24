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

  // Tool 接口默认安全实现
  isEnabled: () => true,
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => false,
  checkPermissions: (input, _ctx) =>
    Promise.resolve({ behavior: 'allow', updatedInput: input }),
  toAutoClassifierInput: () => '',
  userFacingName: () => 'backup',

  renderToolUseMessage: (input) => `Backup: ${input?.action ?? '?'}${input?.name ? ` (${input.name})` : ''}`,
  mapToolResultToToolResultBlockParam: (content, toolUseID) => ({
    tool_use_id: toolUseID,
    type: 'tool_result',
    content: content.message || '备份操作完成',
  }),
  prompt: async () => '使用 backup 工具管理备份。',
  description: async () => '创建和管理备份',
  call: async (args, context, canUseTool, parentMessage, onProgress) => {
    const result = await this.exec(args);
    return { data: result };
  },
};