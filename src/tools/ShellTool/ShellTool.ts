import { z } from 'zod';

export const ShellTool = {
  name: 'shell',
  description: 'Execute shell commands with advanced features',
  callOn: 'manual',
  input: z.object({
    command: z.string().describe('Shell command'),
    cwd: z.string().optional().describe('Working directory'),
    env: z.record(z.string()).optional().describe('Environment variables'),
  }),
  output: z.object({
    exitCode: z.number().describe('Exit code'),
    stdout: z.string().describe('Standard output'),
    stderr: z.string().optional().describe('Standard error'),
  }),

  exec: async ({ command, cwd, env }) => {
    return {
      exitCode: 0,
      stdout: '',
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
  userFacingName: () => 'shell',

  renderToolUseMessage: (input) => `Shell: ${input?.command ?? '?'}`,
  mapToolResultToToolResultBlockParam: (content, toolUseID) => ({
    tool_use_id: toolUseID,
    type: 'tool_result',
    content: `Exit code: ${content.exitCode}`,
  }),
  prompt: async () => 'Use shell to execute shell commands.',
  description: async () => 'Execute shell commands with advanced features',
  call: async (args, context, canUseTool, parentMessage, onProgress) => {
    const result = await this.exec(args);
    return { data: result };
  },
};