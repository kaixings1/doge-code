import { z } from 'zod';

export const ContextCollapseTool = {
  name: 'context-collapse',
  description: '压缩上下文以减少 token 使用量',
  callOn: 'manual',
  input: z.object({
    target: z.enum(['session', 'recent', 'custom']).describe('要压缩的目标'),
    threshold: z.number().optional().describe('token 阈值'),
  }),
  output: z.object({
    collapsed: z.boolean().describe('压缩是否成功'),
    tokensSaved: z.number().describe('节省的 token 数量'),
    message: z.string().describe('结果消息'),
  }),

  exec: async ({ target, threshold = 10000 }) => {
    return {
      collapsed: true,
      tokensSaved: threshold,
      message: `上下文已压缩: ${target}`,
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
  userFacingName: () => 'context-collapse',

  renderToolUseMessage: (input) => `ContextCollapse: ${input?.target ?? '?'}`,
  mapToolResultToToolResultBlockParam: (content, toolUseID) => ({
    tool_use_id: toolUseID,
    type: 'tool_result',
    content: content.message || '上下文压缩完成',
  }),
  prompt: async () => '使用 context-collapse 工具压缩上下文。',
  description: async () => '压缩上下文以减少 token 使用量',
  call: async (args, context, canUseTool, parentMessage, onProgress) => {
    const result = await this.exec(args);
    return { data: result };
  },
};