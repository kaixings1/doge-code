import { z } from 'zod';

export const McpToolSearchTool = {
  name: 'mcp-tool-search',
  description: '工具s across configured servers',
  callOn: 'manual',
  input: z.object({
    query: z.string().describe('Search query'),
    server: z.string().optional().describe('Specific MCP server'),
  }),
  output: z.object({
    results: z.array(z.object({
      name: z.string(),
      server: z.string(),
      description: z.string(),
    })).describe('Search results'),
    count: z.number().describe('Number of results'),
  }),

  exec: async ({ query, server }) => {
    return {
      results: [],
      count: 0,
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
  userFacingName: () => 'mcp-tool-search',

  renderToolUseMessage: (input) => `MCP Tool Search: ${input?.query ?? '?'}`,
  mapToolResultToToolResultBlockParam: (content, toolUseID) => ({
    tool_use_id: toolUseID,
    type: 'tool_result',
    content: `Found ${content.count} MCP tools`,
  }),
  prompt: async () => 'Search for MCP tools across configured servers.',
  description: async () => '工具s across configured servers',
  call: async (args, context, canUseTool, parentMessage, onProgress) => {
    const result = await this.exec(args);
    return { data: result };
  },
};