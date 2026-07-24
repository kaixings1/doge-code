import { z } from 'zod';

export const VimVisualModeTool = {
  name: 'vim-visual-mode',
  description: '模式 (v/V) for text selection',
  callOn: 'always',
  input: z.object({
    mode: z.enum(['visual', 'line']).describe('Visual mode type'),
    selection: z.string().optional().describe('Text to select'),
  }),
  output: z.object({
    active: z.boolean().describe('Whether visual mode is active'),
    mode: z.string().describe('Current mode'),
    selected: z.string().optional().describe('Selected text'),
  }),

  // 原有执行逻辑保留在 exec 中，call 方法会适配调用
  exec: async ({ mode, selection }) => {
    return {
      active: true,
      mode,
      selected: selection,
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
  userFacingName: () => 'vim-visual-mode',

  renderToolUseMessage: (input) => `Vim Visual Mode: ${input?.mode ?? '?'}`,
  mapToolResultToToolResultBlockParam: (content, toolUseID) => ({
    tool_use_id: toolUseID,
    type: 'tool_result',
    content: `Visual mode ${content.mode} ${content.selected ? `selected "${content.selected}"` : ''}`,
  }),
  prompt: async () => 'Use vim-visual-mode for text selection.',
  description: async () => '模式 (v/V) for text selection',
  call: async (args, context, canUseTool, parentMessage, onProgress) => {
    const result = await this.exec(args);
    return { data: result };
  },
};