import { z } from 'zod';

export const MonitorTool = {
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
    message: z.string().optional().describe('Status message'),
  }),
  exec: async ({ target, action }) => {
    return {
      status: 'ok',
      message: `Monitor ${action} for ${target}`,
    };
  },

  // 以下方法为 Tool 接口必须实现的部分，此处给出默认安全实现
  isEnabled: () => true,
  isConcurrencySafe: () => false,
  isReadOnly: () => false,
  isDestructive: () => false,
  checkPermissions: (input, _ctx) =>
    Promise.resolve({ behavior: 'allow', updatedInput: input }),
  toAutoClassifierInput: () => '',
  userFacingName: () => 'monitor',

  // 以下方法用于 UI 和日志，可按需调整
  renderToolUseMessage: (input) => `Monitor: ${input?.target ?? '?'} ${input?.action ?? '?'}`,
  mapToolResultToToolResultBlockParam: (content, toolUseID) => ({
    tool_use_id: toolUseID,
    type: 'tool_result',
    content: content.message || 'Monitor task completed',
  }),
  prompt: async () => 'Use the monitor tool to check system status.',
  description: async () => 'System monitoring and health checks',
  call: async (args, context, canUseTool, parentMessage, onProgress) => {
    // 实际逻辑已在上面的 exec 中，这里需要适配 call 签名
    const result = await this.exec(args);
    return { data: result };
  },
};