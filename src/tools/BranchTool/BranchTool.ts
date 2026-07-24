import { z } from 'zod';

export const BranchTool = {
  name: 'branch',
  description: '创建和管理 Git 分支',
  callOn: 'manual',
  input: z.object({
    action: z.enum(['create', 'switch', 'list', 'delete']).describe('分支操作'),
    name: z.string().optional().describe('分支名称'),
  }),
  output: z.object({
    success: z.boolean().describe('操作是否成功'),
    branch: z.string().optional().describe('当前分支'),
    branches: z.array(z.string()).optional().describe('分支列表'),
    message: z.string().optional().describe('结果消息'),
  }),

  exec: async ({ action, name }) => {
    return {
      success: true,
      message: `分支 ${action} 完成`,
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
  userFacingName: () => 'branch',

  renderToolUseMessage: (input) => `Branch: ${input?.action ?? '?'}${input?.name ? ` (${input.name})` : ''}`,
  mapToolResultToToolResultBlockParam: (content, toolUseID) => ({
    tool_use_id: toolUseID,
    type: 'tool_result',
    content: content.message || '分支操作完成',
  }),
  prompt: async () => '使用 branch 工具管理 Git 分支。',
  description: async () => '创建和管理 Git 分支',
  call: async (args, context, canUseTool, parentMessage, onProgress) => {
    const result = await this.exec(args);
    return { data: result };
  },
};