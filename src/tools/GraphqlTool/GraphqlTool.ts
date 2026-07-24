import { z } from 'zod';

export const GraphqlTool = {
  name: 'graphql',
  description: 'Execute GraphQL queries',
  callOn: 'manual',
  input: z.object({
    endpoint: z.string().describe('GraphQL endpoint'),
    query: z.string().describe('GraphQL query'),
    variables: z.record(z.unknown()).optional().describe('Query variables'),
  }),
  output: z.object({
    data: z.record(z.unknown()).describe('Query result'),
    errors: z.array(z.any()).optional().describe('Errors'),
  }),

  exec: async ({ endpoint, query, variables }) => {
    return {
      data: {},
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
  userFacingName: () => 'graphql',

  renderToolUseMessage: (input) => `GraphQL: ${input?.query?.substring(0, 50) ?? '?'}`,
  mapToolResultToToolResultBlockParam: (content, toolUseID) => ({
    tool_use_id: toolUseID,
    type: 'tool_result',
    content: content.data ? 'Query executed successfully' : 'No data returned',
  }),
  prompt: async () => 'Use graphql to execute GraphQL queries.',
  description: async () => 'Execute GraphQL queries',
  call: async (args, context, canUseTool, parentMessage, onProgress) => {
    const result = await this.exec(args);
    return { data: result };
  },
};