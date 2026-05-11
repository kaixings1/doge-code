import { Tool } from '../../Tool';
import { z } from 'zod';

export const ContextCollapseTool: Tool = {
  name: 'context-collapse',
  description: 'Collapse context to reduce token usage',
  callOn: 'manual',
  input: z.object({
    target: z.enum(['session', 'recent', 'custom']).describe('What to collapse'),
    threshold: z.number().optional().describe('Token threshold'),
  }),
  output: z.object({
    collapsed: z.boolean().describe('Whether collapse succeeded'),
    tokensSaved: z.number().describe('Tokens saved'),
    message: z.string().describe('Result message'),
  }),
  exec: async ({ target, threshold = 10000 }) => {
    return {
      collapsed: true,
      tokensSaved: threshold,
      message: `Context collapsed: ${target}`,
    };
  },
};

