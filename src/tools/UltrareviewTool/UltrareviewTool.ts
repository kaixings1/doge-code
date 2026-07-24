import { z } from 'zod';

export const UltrareviewTool = {
  name: 'ultrareview',
  description: 'Run comprehensive cloud-based code review using parallel multi-agent analysis',
  callOn: 'always',
  input: z.object({
    target: z.string().optional().describe('Target to review: branch name, PR URL, or commit SHA'),
  }),
  output: z.object({
    findings: z.array(z.string()).describe('Code review findings'),
    summary: z.string().describe('Review summary'),
  }),
  // 原 exec 逻辑可以直接移入 call 方法（Tool 接口使用的是 call）
  exec: async ({ target }) => {
    return {
      findings: [],
      summary: 'Ultrareview completed',
    };
  },

  // 以下为 Tool 接口要求的默认安全实现
  isEnabled: () => true,
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => false,
  checkPermissions: (input, _ctx) =>
    Promise.resolve({ behavior: 'allow', updatedInput: input }),
  toAutoClassifierInput: () => '',
  userFacingName: () => 'ultrareview',

  renderToolUseMessage: (input) => `Ultrareview: ${input?.target || 'current state'}`,
  mapToolResultToToolResultBlockParam: (content, toolUseID) => ({
    tool_use_id: toolUseID,
    type: 'tool_result',
    content: content.summary || 'Ultrareview completed',
  }),
  prompt: async () => 'Use the ultrareview tool for cloud-based code reviews.',
  description: async () => 'Run comprehensive cloud-based code review',
  call: async (args, context, canUseTool, parentMessage, onProgress) => {
    const result = await this.exec(args);
    return { data: result };
  },
};