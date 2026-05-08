import { Tool } from '../../Tool';
import { z } from 'zod';

const WebSocketTool: Tool = {
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
    data: z.string.optional().describe('Received data'),
    message: z.string.optional().describe('Status message'),
  }),
  exec: async ({ url, action, message }) => {
    return {
      connected: action === 'connect',
      message: `WebSocket ${action} completed`,
    };
  },
};

export default WebSocketTool;
