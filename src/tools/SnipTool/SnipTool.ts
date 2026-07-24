import { z } from 'zod';

export const SnipTool = {
  name: 'snip',
  description: 'Snip history to reduce context size',
  callOn: 'manual',
  input: z.object({
    lines: z.number().optional().describe('Number of lines to snip'),
    keepRecent: z.number().optional().describe('Keep recent lines'),
  }),
  output: z.object({
    sniped: z.boolean().describe('Whether snip succeeded'),
    linesRemoved: z.number().describe('Lines removed'),
    message: z.string().describe('Result message'),
  }),

  exec: async ({ lines = 100, keepRecent = 50 }) => {
    return {
      sniped: true,
      linesRemoved: lines,
      message: `Snipped ${lines} lines, kept ${keepRecent}`,
    };
  },

  // Tool 接口默认实现
  isEnabled: () => true,
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => false,
  checkPermissions: (input, _ctx) =>
    Promise.resolve({ behavior: 'allow', updatedInput: input }),
  toAutoClassifierInput: () => '',
  userFacingName: () => 'snip',

  renderToolUseMessage: (input) => `Snip: ${input?.lines ?? '?'} lines`,
  mapToolResultToToolResultBlockParam: (content, toolUseID) => ({
    tool_use_id: toolUseID,
    type: 'tool_result',
    content: content.message || 'Snip completed',
  }),
  prompt: async () => 'Use snip to reduce context size.',
  description: async () => 'Snip history to reduce context size',
  call: async (args, context, canUseTool, parentMessage, onProgress) => {
    const result = await this.exec(args);
    return { data: result };
  },
};