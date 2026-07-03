import { Tool } from '../../Tool';
import { z } from 'zod';

export const PlanModeTool: Tool = {
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
};

