import { z } from 'zod';

export const MetricsTool = {
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

  // Tool 接口默认安全实现
  isEnabled: () => true,
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => false,
  checkPermissions: (input, _ctx) =>
    Promise.resolve({ behavior: 'allow', updatedInput: input }),
  toAutoClassifierInput: () => '',
  userFacingName: () => 'metrics',

  renderToolUseMessage: (input) => `Metrics: ${input?.metric ?? '?'}`,
  mapToolResultToToolResultBlockParam: (content, toolUseID) => ({
    tool_use_id: toolUseID,
    type: 'tool_result',
    content: `Metric ${content.metric} recorded`,
  }),
  prompt: async () => 'Use the metrics tool to collect and report metrics.',
  description: async () => 'Collect and report metrics',
  call: async (args, context, canUseTool, parentMessage, onProgress) => {
    const result = await this.exec(args);
    return { data: result };
  },
};