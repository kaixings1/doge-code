import { Tool } from '../../Tool';
import { z } from 'zod';

export const EventStreamTool: Tool = {
  name: 'event-stream',
  description: 'Stream events from various sources',
  callOn: 'manual',
  input: z.object({
    source: z.string().describe('Event source'),
    action: z.enum(['subscribe', 'unsubscribe', 'list']).describe('Action'),
  }),
  output: z.object({
    active: z.boolean().describe('Whether subscription is active'),
    events: z.array(z.string()).optional().describe('Event list'),
    message: z.string().optional().describe('Status message'),
  }),
  exec: async ({ source, action }) => {
    return {
      active: action === 'subscribe',
      message: `Event stream ${action} completed`,
    };
  },
};

