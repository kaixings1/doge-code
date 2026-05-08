import { Tool } from '../../Tool';
import { z } from 'zod';

const McpToolSearchTool: Tool = {
  name: 'mcp-tool-search',
  description: 'Search MCP tools across configured servers',
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
};

export default McpToolSearchTool;
