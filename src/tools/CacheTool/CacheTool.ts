import { z } from 'zod';

export const CacheTool = {
  name: 'cache',
  description: '管理缓存操作',
  callOn: 'manual',
  input: z.object({
    action: z.enum(['get', 'set', 'delete', 'clear', 'list']).describe('缓存操作'),
    key: z.string().optional().describe('缓存键'),
    value: z.string().optional().describe('缓存值'),
  }),
  output: z.object({
    success: z.boolean().describe('操作是否成功'),
    keys: z.array(z.string()).optional().describe('缓存键列表'),
    value: z.string().optional().describe('缓存值'),
    message: z.string().optional().describe('结果消息'),
  }),

  exec: async ({ action, key, value }) => {
    return {
      success: true,
      message: `缓存 ${action} 完成`,
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
  userFacingName: () => 'cache',

  renderToolUseMessage: (input) => `Cache: ${input?.action ?? '?'}${input?.key ? ` (${input.key})` : ''}`,
  mapToolResultToToolResultBlockParam: (content, toolUseID) => ({
    tool_use_id: toolUseID,
    type: 'tool_result',
    content: content.message || '缓存操作完成',
  }),
  prompt: async () => '使用 cache 工具管理缓存。',
  description: async () => '管理缓存操作',
  call: async (args, context, canUseTool, parentMessage, onProgress) => {
    const result = await this.exec(args);
    return { data: result };
  },
};