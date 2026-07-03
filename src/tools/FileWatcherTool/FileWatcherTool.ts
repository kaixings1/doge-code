import { Tool } from '../../Tool';
import { z } from 'zod';

export const FileWatcherTool: Tool = {
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
};

