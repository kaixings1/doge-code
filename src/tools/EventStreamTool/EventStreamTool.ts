import { z } from 'zod';

export const EventStreamTool = {
  name: 'event-stream',
  description: '从各种源流式传输事件',
  callOn: 'manual',
  input: z.object({
    source: z.string().describe('事件源'),
    action: z.enum(['subscribe', 'unsubscribe', 'list']).describe('操作'),
  }),
  output: z.object({
    active: z.boolean().describe('订阅是否活跃'),
    events: z.array(z.string()).optional().describe('事件列表'),
    message: z.string().optional().describe('状态消息'),
  }),

  exec: async ({ source, action }) => {
    return {
      active: action === 'subscribe',
      message: `事件流 ${action} 完成`,
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
  userFacingName: () => 'event-stream',

  renderToolUseMessage: (input) => `EventStream: ${input?.action ?? '?'} ${input?.source ?? ''}`,
  mapToolResultToToolResultBlockParam: (content, toolUseID) => ({
    tool_use_id: toolUseID,
    type: 'tool_result',
    content: content.message || '事件流操作完成',
  }),
  prompt: async () => '使用 event-stream 工具管理事件流。',
  description: async () => '从各种源流式传输事件',
  call: async (args, context, canUseTool, parentMessage, onProgress) => {
    const result = await this.exec(args);
    return { data: result };
  },
};