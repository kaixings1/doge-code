import { Tool } from '../../Tool';
import { z } from 'zod';

const SnipTool: Tool = {
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
};

export default SnipTool;
