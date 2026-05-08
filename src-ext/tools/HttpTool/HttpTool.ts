import { Tool } from '../../Tool';
import { z } from 'zod';

const HttpTool: Tool = {
  name: 'http',
  description: 'Make HTTP requests',
  callOn: 'manual',
  input: z.object({
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).describe('HTTP method'),
    url: z.string().describe('Request URL'),
    headers: z.record(z.string()).optional().describe('Request headers'),
    body: z.string().optional().describe('Request body'),
  }),
  output: z.object({
    status: z.number().describe('Response status'),
    headers: z.record(z.string()).describe('Response headers'),
    body: z.string().describe('Response body'),
  }),
  exec: async ({ method, url, headers, body }) => {
    return {
      status: 200,
      headers: {},
      body: '',
    };
  },
};

export default HttpTool;
