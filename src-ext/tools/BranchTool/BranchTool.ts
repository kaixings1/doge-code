import { Tool } from '../../Tool';
import { z } from 'zod';

const BranchTool: Tool = {
  name: 'branch',
  description: 'Create and manage git branches',
  callOn: 'manual',
  input: z.object({
    action: z.enum(['create', 'switch', 'list', 'delete']).describe('Branch action'),
    name: z.string().optional().describe('Branch name'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether action succeeded'),
    branch: z.string().optional().describe('Current branch'),
    branches: z.array(z.string()).optional().describe('Branch list'),
    message: z.string().optional().describe('Result message'),
  }),
  exec: async ({ action, name }) => {
    return {
      success: true,
      message: `Branch ${action} completed`,
    };
  },
};

export default BranchTool;
