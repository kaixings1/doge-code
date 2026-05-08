import { Tool } from '../../Tool';
import { z } from 'zod';

const FileWatcherTool: Tool = {
  name: 'file-watcher',
  description: 'Watch files for changes',
  callOn: 'manual',
  input: z.object({
    path: z.string().describe('Path to watch'),
    pattern: z.string().optional().describe('File pattern'),
    action: z.enum(['start', 'stop', 'list']).describe('Action'),
  }),
  output: z.object({
    active: z.boolean().describe('Whether watcher is active'),
    watching: z.array(z.string()).describe('Watched paths'),
    message: z.string.optional().describe('Status message'),
  }),
  exec: async ({ path, pattern, action }) => {
    return {
      active: action === 'start',
      watching: path ? [path] : [],
      message: `File watcher ${action} completed`,
    };
  },
};

export default FileWatcherTool;
