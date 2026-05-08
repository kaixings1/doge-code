import { Tool } from '../../Tool';
import { z } from 'zod';

const MonitorTool: Tool = {
  name: 'monitor',
  description: 'System monitoring and health checks',
  callOn: 'always',
  input: z.object({
    target: z.enum(['cpu', 'memory', 'disk', 'network', 'health']).describe('Monitor target'),
    action: z.enum(['status', 'start', 'stop']).describe('Action'),
  }),
  output: z.object({
    status: z.string().describe('System status'),
    metrics: z.record(z.number()).optional().describe('Metrics'),
    message: z.string.optional().describe('Status message'),
  }),
  exec: async ({ target, action }) => {
    return {
      status: 'ok',
      message: `Monitor ${action} for ${target}`,
    };
  },
};

export default MonitorTool;
