import { Tool } from '../../Tool';
import { z } from 'zod';

const GraphqlTool: Tool = {
  name: 'graphql',
  description: 'Execute GraphQL queries',
  callOn: 'manual',
  input: z.object({
    endpoint: z.string().describe('GraphQL endpoint'),
    query: z.string().describe('GraphQL query'),
    variables: z.record(z.unknown).optional().describe('Query variables'),
  }),
  output: z.object({
    data: z.record(z.unknown).describe('Query result'),
    errors: z.array(z.any()).optional().describe('Errors'),
  }),
  exec: async ({ endpoint, query, variables }) => {
    return {
      data: {},
    };
  },
};

export default GraphqlTool;
