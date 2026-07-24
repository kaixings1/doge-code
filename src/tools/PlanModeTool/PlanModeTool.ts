import { z } from 'zod';

export const PlanModeTool = {
  name: 'plan-mode',
  description: '模式',
  callOn: 'manual',
  input: z.object({
    action: z.enum(['enter', 'exit', 'status']).describe('Action to perform'),
  }),
  output: z.object({
    active: z.boolean().describe('Whether plan mode is active'),
    action: z.string().describe('Action taken'),
    message: z.string().optional().describe('Status message'),
  }),

  exec: async ({ action }) => {
    return {
      active: action === 'enter',
      action,
      message: `Plan mode ${action} completed`,
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
  userFacingName: () => 'plan-mode',

  renderToolUseMessage: (input) => `PlanMode: ${input?.action ?? '?'}`,
  mapToolResultToToolResultBlockParam: (content, toolUseID) => ({
    tool_use_id: toolUseID,
    type: 'tool_result',
    content: content.message || 'Plan mode operation completed',
  }),
  prompt: async () => 'Use plan-mode to manage planning state.',
  description: async () => '模式',
  call: async (args, context, canUseTool, parentMessage, onProgress) => {
    const result = await this.exec(args);
    return { data: result };
  },
};