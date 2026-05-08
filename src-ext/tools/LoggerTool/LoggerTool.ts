import { Tool } from '../../Tool';
import { z } from 'zod';

const LoggerTool: Tool = {
  name: 'logger',
  description: 'Logging and debugging tool',
  callOn: 'always',
  input: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).describe('Log level'),
    message: z.string().describe('Log message'),
    context: z.record(z.unknown).optional().describe('Log context'),
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
};

export default LoggerTool;
