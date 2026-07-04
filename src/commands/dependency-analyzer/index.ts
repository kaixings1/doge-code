import type { Command } from '../../commands.js';

const dependency_analyzer = {
  type: 'local',
  name: 'dependency-analyzer',
  description: '开发者工具 - dependency-analyzer',
  load: () => import('./dependency_analyzer.js'),
} satisfies Command;

export default dependency_analyzer;
