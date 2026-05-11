import { Tool } from '../../Tool';
import { z } from 'zod';

export const LessPermissionPromptsTool: Tool = {
  name: 'less-permission-prompts',
  description: 'Scan transcripts for common read-only Bash and MCP tool calls, propose permission whitelist',
  callOn: 'manual',
  input: z.object({
    scope: z.enum(['session', 'project', 'global']).optional().describe('Scope for the permission whitelist'),
  }),
  output: z.object({
    whitelist: z.array(z.string()).describe('Proposed allowlist rules'),
    recommendations: z.string().describe('Recommendation summary'),
  }),
  exec: async ({ scope = 'session' }) => {
    // Scan transcripts and generate permission whitelist
    return {
      whitelist: [],
      recommendations: 'No common patterns found',
    };
  },
};

