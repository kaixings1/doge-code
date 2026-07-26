import { z } from 'zod';

export const HttpTool = {
  name: 'http',
  description: 'Make HTTP requests',
  callOn: 'manual',
  input: z.object({
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).describe('HTTP 方法'),
    url: z.string().describe('请求 URL'),
    headers: z.record(z.string()).optional().describe('请求标头'),
    body: z.string().optional().describe('请求体'),
  }),
  output: z.object({
    status: z.number().describe('响应状态码'),
    headers: z.record(z.string()).describe('响应标头'),
    body: z.string().describe('响应体'),
  }),

  exec: async ({ method, url, headers, body }) => {
    return {
      status: 200,
      headers: {},
      body: '',
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
  userFacingName: () => 'http',

  renderToolUseMessage: (input) => `HTTP ${input?.method ?? '?'} ${input?.url ?? '?'}`,
  mapToolResultToToolResultBlockParam: (content, toolUseID) => ({
    tool_use_id: toolUseID,
    type: 'tool_result',
    content: `HTTP ${content.status}`,
  }),
  prompt: async () => 'Use http to make HTTP requests.',
  description: async () => 'Make HTTP requests',
  call: async (args, context, canUseTool, parentMessage, onProgress) => {
    const result = await this.exec(args);
    return { data: result };
  },
};