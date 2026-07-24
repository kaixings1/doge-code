import { z } from 'zod';

export const LessPermissionPromptsTool = {
  name: 'less-permission-prompts',
  description: 'Tool calls, propose permission whitelist',
  callOn: 'manual',
  input: z.object({
    scope: z.enum(['session', 'project', 'global']).optional().describe('Scope for the permission whitelist'),
  }),
  output: z.object({
    whitelist: z.array(z.string()).describe('Proposed allowlist rules'),
    recommendations: z.string().describe('Recommendation summary'),
  }),

  // 原有执行逻辑（可保留在 exec 中，call 方法会调用它）
  exec: async ({ scope = 'session' }) => {
    // Scan transcripts and generate permission whitelist
    return {
      whitelist: [],
      recommendations: 'No common patterns found',
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
  userFacingName: () => 'less-permission-prompts',

  renderToolUseMessage: (input) => `Less Permission Prompts: scope=${input?.scope ?? 'session'}`,
  mapToolResultToToolResultBlockParam: (content, toolUseID) => ({
    tool_use_id: toolUseID,
    type: 'tool_result',
    content: content.recommendations || 'No suggestions',
  }),
  prompt: async () => 'Use less-permission-prompts to generate a whitelist of permissions.',
  description: async () => 'Propose permission whitelist based on transcript patterns',
  call: async (args, context, canUseTool, parentMessage, onProgress) => {
    const result = await this.exec(args);
    return { data: result };
  },
};