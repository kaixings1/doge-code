import type { Command } from '../../commands.js';

const memory_monitor = {
  type: 'local',
  name: 'memory-monitor',
  description: '内存监控工具，实时监控应用内存使用情况',
  load: () => import('./memoryMonitor.js'),
} satisfies Command;

export default memory_monitor;
