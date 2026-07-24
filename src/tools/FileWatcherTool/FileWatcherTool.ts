import { z } from 'zod';

export const FileWatcherTool = {
  name: 'file-watcher',
  description: '监视文件变化',
  callOn: 'manual',
  input: z.object({
    path: z.string().describe('监视路径'),
    pattern: z.string().optional().describe('文件模式'),
    action: z.enum(['start', 'stop', 'list']).describe('操作'),
  }),
  output: z.object({
    active: z.boolean().describe('监视器是否活跃'),
    watching: z.array(z.string()).describe('监视路径列表'),
    message: z.string().optional().describe('状态消息'),
  }),

  exec: async ({ path, pattern, action }) => {
    return {
      active: action === 'start',
      watching: path ? [path] : [],
      message: `文件监视器 ${action} 完成`,
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
  userFacingName: () => 'file-watcher',

  renderToolUseMessage: (input) => `FileWatcher: ${input?.action ?? '?'} ${input?.path ?? ''}`,
  mapToolResultToToolResultBlockParam: (content, toolUseID) => ({
    tool_use_id: toolUseID,
    type: 'tool_result',
    content: content.message || '文件监视器操作完成',
  }),
  prompt: async () => '使用 file-watcher 工具监视文件变化。',
  description: async () => '监视文件变化',
  call: async (args, context, canUseTool, parentMessage, onProgress) => {
    const result = await this.exec(args);
    return { data: result };
  },
};