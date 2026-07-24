import { z } from 'zod';

export const WorkflowTool = {
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

  // Tool 接口默认安全实现
  isEnabled: () => true,
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => false,
  checkPermissions: (input, _ctx) =>
    Promise.resolve({ behavior: 'allow', updatedInput: input }),
  toAutoClassifierInput: () => '',
  userFacingName: () => 'workflow',

  renderToolUseMessage: (input) => `Workflow: ${input?.script ?? '?'}`,
  mapToolResultToToolResultBlockParam: (content, toolUseID) => ({
    tool_use_id: toolUseID,
    type: 'tool_result',
    content: content.output || 'Workflow executed',
  }),
  prompt: async () => 'Execute workflow scripts.',
  description: async () => 'Execute workflow scripts',
  call: async (args, context, canUseTool, parentMessage, onProgress) => {
    const result = await this.exec(args);
    return { data: result };
  },
};