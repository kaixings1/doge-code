import { z } from 'zod';

export const TerminalPanelTool = {
  name: 'terminal-panel',
  description: 'Manage terminal panel for output display',
  callOn: 'manual',
  input: z.object({
    action: z.enum(['show', 'hide', 'focus', 'blur']).describe('Action to perform'),
    content: z.string().optional().describe('Content to display'),
  }),
  output: z.object({
    visible: z.boolean().describe('Whether panel is visible'),
    focused: z.boolean().describe('Whether panel is focused'),
    message: z.string().optional().describe('Status message'),
  }),

  // 原有执行逻辑保留在 exec 中，call 方法会适配调用
  exec: async ({ action, content }) => {
    return {
      visible: action !== 'hide',
      focused: action === 'focus',
      message: `Terminal panel ${action} completed`,
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
  userFacingName: () => 'terminal-panel',

  renderToolUseMessage: (input) => `Terminal Panel: ${input?.action ?? '?'}`,
  mapToolResultToToolResultBlockParam: (content, toolUseID) => ({
    tool_use_id: toolUseID,
    type: 'tool_result',
    content: content.message || 'Terminal panel action completed',
  }),
  prompt: async () => 'Use terminal-panel to manage the terminal panel.',
  description: async () => 'Manage terminal panel for output display',
  call: async (args, context, canUseTool, parentMessage, onProgress) => {
    const result = await this.exec(args);
    return { data: result };
  },
};