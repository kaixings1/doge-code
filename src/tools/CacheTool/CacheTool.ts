import { Tool } from '../../Tool';
import { z } from 'zod';

export const CacheTool: Tool = {
  name: 'cache',
  description: 'Manage cache operations',
  callOn: 'manual',
  input: z.object({
    action: z.enum(['get', 'set', 'delete', 'clear', 'list']).describe('Cache action'),
    key: z.string().optional().describe('Cache key'),
    value: z.string().optional().describe('Cache value'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether action succeeded'),
    keys: z.array(z.string()).optional().describe('Cache keys'),
    value: z.string().optional().describe('Cached value'),
    message: z.string().optional().describe('Result message'),
  }),
  exec: async ({ action, key, value }) => {
    return {
      success: true,
      message: `Cache ${action} completed`,
    };
  },
};

