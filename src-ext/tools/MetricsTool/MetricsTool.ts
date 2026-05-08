import { Tool } from '../../Tool';
import { z } from 'zod';

const MetricsTool: Tool = {
  name: 'metrics',
  description: 'Collect and report metrics',
  callOn: 'always',
  input: z.object({
    metric: z.string().describe('Metric name'),
    value: z.number().optional().describe('Metric value'),
    tags: z.record(z.string()).optional().describe('Metric tags'),
  }),
  output: z.object({
    recorded: z.boolean().describe('Whether metric was recorded'),
    metric: z.string().describe('Metric name'),
  }),
  exec: async ({ metric, value, tags }) => {
    return {
      recorded: true,
      metric,
    };
  },
};

export default MetricsTool;
