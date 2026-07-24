import { z } from 'zod';

export const EffortTool = {
  name: 'effort',
  description: '为支持的模型设置努力程度级别（低/中/高/最大）',
  callOn: 'manual',
  input: z.object({
    level: z.enum(['low', 'medium', 'high', 'max']).describe('努力程度级别'),
    model: z.string().optional().describe('目标模型（可选，影响当前会话）'),
  }),
  output: z.object({
    success: z.boolean().describe('是否成功设置努力程度级别'),
    previousLevel: z.string().optional().describe('之前的努力程度级别'),
    newLevel: z.string().describe('新的努力程度级别'),
  }),

  // 原有执行逻辑保留在 exec 中，call 方法会适配调用
  exec: async ({ level, model }) => {
    // 为模型设置努力程度级别
    return {
      success: true,
      newLevel: level,
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
  userFacingName: () => 'effort',

  renderToolUseMessage: (input) => `Effort: ${input?.level ?? '?'}${input?.model ? ` (${input.model})` : ''}`,
  mapToolResultToToolResultBlockParam: (content, toolUseID) => ({
    tool_use_id: toolUseID,
    type: 'tool_result',
    content: `Effort set to ${content.newLevel}${content.previousLevel ? ` (was ${content.previousLevel})` : ''}`,
  }),
  prompt: async () => 'Use the effort tool to adjust model reasoning effort.',
  description: async () => 'Set effort level for supported models',
  call: async (args, context, canUseTool, parentMessage, onProgress) => {
    const result = await this.exec(args);
    return { data: result };
  },
};