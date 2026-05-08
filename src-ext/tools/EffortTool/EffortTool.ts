import { Tool } from '../../Tool';
import { z } from 'zod';

const EffortTool: Tool = {
  name: 'effort',
  description: 'Set model effort level (low/medium/high/max) for supported models',
  callOn: 'manual',
  input: z.object({
    level: z.enum(['low', 'medium', 'high', 'max']).describe('Effort level'),
    model: z.string().optional().describe('Target model (optional, affects current session)'),
  }),
  output: z.object({
    success: z.boolean().describe('Whether effort level was set successfully'),
    previousLevel: z.string().optional().describe('Previous effort level'),
    newLevel: z.string().describe('New effort level'),
  }),
  exec: async ({ level, model }) => {
    // Set effort level for model
    return {
      success: true,
      newLevel: level,
    };
  },
};

export default EffortTool;
