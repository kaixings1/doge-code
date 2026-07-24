import { z } from 'zod';

export const ThemeTool = {
  name: 'theme',
  description: 'Create, switch, or manage named custom themes',
  callOn: 'manual',
  input: z.object({
    action: z.enum(['create', 'switch', 'list', 'delete']).describe('Action to perform'),
    name: z.string().optional().describe('Theme name'),
    accent: z.string().optional().describe('Accent color (hex or color name)'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether operation succeeded'),
    themes: z.array(z.string()).optional().describe('List of available themes'),
    currentTheme: z.string().optional().describe('Current theme name'),
    message: z.string().optional().describe('Result message'),
  }),

  // 原有执行逻辑保留在 exec 中，call 方法会适配调用
  exec: async ({ action, name, accent }) => {
    // Theme management
    return {
      success: true,
      message: `Theme ${action} completed`,
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
  userFacingName: () => 'theme',

  renderToolUseMessage: (input) => `Theme: ${input?.action ?? '?'}${input?.name ? ` (${input.name})` : ''}`,
  mapToolResultToToolResultBlockParam: (content, toolUseID) => ({
    tool_use_id: toolUseID,
    type: 'tool_result',
    content: content.message || 'Theme operation completed',
  }),
  prompt: async () => 'Use the theme tool to manage custom themes.',
  description: async () => 'Create, switch, or manage named custom themes',
  call: async (args, context, canUseTool, parentMessage, onProgress) => {
    const result = await this.exec(args);
    return { data: result };
  },
};