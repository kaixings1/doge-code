import { z } from 'zod';

export const LoggerTool = {
  name: 'logger',
  description: '工具',
  callOn: 'always',
  input: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).describe('Log level'),
    message: z.string().describe('Log message'),
    context: z.record(z.unknown()).optional().describe('Log context'),
  }),
  output: z.object({
    logged: z.boolean().describe('Whether log was written'),
    level: z.string().describe('Log level'),
  }),

  exec: async ({ level, message, context }) => {
    return {
      logged: true,
      level,
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
  userFacingName: () => 'logger',

  renderToolUseMessage: (input) => `Logger: ${input?.level ?? '?'} ${input?.message ?? ''}`,
  mapToolResultToToolResultBlockParam: (content, toolUseID) => ({
    tool_use_id: toolUseID,
    type: 'tool_result',
    content: `Logged at level ${content.level}`,
  }),
  prompt: async () => 'Use the logger tool to write logs.',
  description: async () => '工具',
  call: async (args, context, canUseTool, parentMessage, onProgress) => {
    const result = await this.exec(args);
    return { data: result };
  },
};