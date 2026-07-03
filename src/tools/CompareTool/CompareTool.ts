import { Tool } from '../../Tool';
import { z } from 'zod';

export const CompareTool: Tool = {
  name: 'compare',
  description: '比较文件或内容',
  callOn: 'manual',
  input: z.object({
    left: z.string().describe('左侧内容或文件'),
    right: z.string().describe('右侧内容或文件'),
  }),
  output: z.object({
    diff: z.string().optional().describe('差异输出'),
    changes: z.array(z.string()).describe('发现的变更'),
  }),
  exec: async ({ left, right }) => {
    return {
      diff: '',
      changes: [],
    };
  },
};

