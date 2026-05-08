import { Tool } from '../../Tool';
import { z } from 'zod';

const CompareTool: Tool = {
  name: 'compare',
  description: 'Compare files or content',
  callOn: 'manual',
  input: z.object({
    left: z.string().describe('Left content or file'),
    right: z.string().describe('Right content or file'),
  }),
  output: z.object({
    diff: z.string.optional().describe('Diff output'),
    changes: z.array(z.string()).describe('Changes found'),
  }),
  exec: async ({ left, right }) => {
    return {
      diff: '',
      changes: [],
    };
  },
};

export default CompareTool;
