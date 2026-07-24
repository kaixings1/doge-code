import { z } from 'zod';

export const CompareTool = {
  name: 'compare',
  description: '比较文件或内容',
  callOn: 'manual',
  input: z.object({
    left: z.string().describe('左侧内容或文件'),
    right: z.string().describe('右侧内容或文件'),
  }),
  output: z.object({
    diff: z.string().optional().describe('差异输出'),
    changes: z.array(z.string()).describe('发现的变更'),
  }),

  exec: async ({ left, right }) => {
    return {
      diff: '',
      changes: [],
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
  userFacingName: () => 'compare',

  renderToolUseMessage: (input) => `Compare: ${input?.left ?? '?'} ↔ ${input?.right ?? '?'}`,
  mapToolResultToToolResultBlockParam: (content, toolUseID) => ({
    tool_use_id: toolUseID,
    type: 'tool_result',
    content: content.diff || (content.changes?.length ? `Found ${content.changes.length} changes` : 'No differences'),
  }),
  prompt: async () => '使用 compare 工具比较文件或内容。',
  description: async () => '比较文件或内容',
  call: async (args, context, canUseTool, parentMessage, onProgress) => {
    const result = await this.exec(args);
    return { data: result };
  },
};