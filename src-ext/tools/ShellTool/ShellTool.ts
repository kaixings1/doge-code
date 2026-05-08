import { Tool } from '../../Tool';
import { z } from 'zod';

const ShellTool: Tool = {
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
    stderr: z.string.optional().describe('Standard error'),
  }),
  exec: async ({ command, cwd, env }) => {
    return {
      exitCode: 0,
      stdout: '',
    };
  },
};

export default ShellTool;
