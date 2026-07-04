import type { Command } from '../../commands.js';

const performance_profiler = {
  type: 'local',
  name: 'performance-profiler',
  description: '性能分析工具，检测应用性能瓶颈',
  load: () => import('./performance_profiler.js'),
} satisfies Command;

export default performance_profiler;
