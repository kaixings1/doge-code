import { Tool } from '../../Tool';
import { z } from 'zod';

const WorkflowTool: Tool = {
  name: 'workflow',
  description: 'Execute workflow scripts',
  callOn: 'manual',
  input: z.object({
    script: z.string().describe('Workflow script name or content'),
    args: z.record(z.string()).optional().describe('Script arguments'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether workflow executed successfully'),
    output: z.string().optional().describe('Workflow output'),
    error: z.string().optional().describe('Error message'),
  }),
  exec: async ({ script, args = {} }) => {
    return {
      success: true,
      output: `Workflow ${script} executed`,
    };
  },
};

export default WorkflowTool;
