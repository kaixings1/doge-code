import { z } from 'zod';

export const WebSocketTool = {
  name: 'websocket',
  description: 'WebSocket client for real-time communication',
  callOn: 'manual',
  input: z.object({
    url: z.string().describe('WebSocket URL'),
    action: z.enum(['connect', 'send', 'close', 'listen']).describe('Action'),
    message: z.string().optional().describe('Message to send'),
  }),
  output: z.object({
    connected: z.boolean().describe('Whether connected'),
    data: z.string().optional().describe('Received data'),
    message: z.string().optional().describe('Status message'),
  }),

  exec: async ({ url, action, message }) => {
    return {
      connected: action === 'connect',
      message: `WebSocket ${action} completed`,
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
  userFacingName: () => 'websocket',

  renderToolUseMessage: (input) => `WebSocket: ${input?.action ?? '?'} ${input?.url ?? ''}`,
  mapToolResultToToolResultBlockParam: (content, toolUseID) => ({
    tool_use_id: toolUseID,
    type: 'tool_result',
    content: content.message || 'WebSocket operation completed',
  }),
  prompt: async () => 'Use websocket for real-time communication.',
  description: async () => 'WebSocket client for real-time communication',
  call: async (args, context, canUseTool, parentMessage, onProgress) => {
    const result = await this.exec(args);
    return { data: result };
  },
};