import type { Command } from '../../commands.js';

const dependency_analyzer = {
  type: 'local',
  name: 'dependency-analyzer',
  description: '依赖分析工具',
  load: () => import('./dependency_analyzer.js'),
} satisfies Command;

export default dependency_analyzer;
