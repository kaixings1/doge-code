import type { Command } from '../../commands.js'

const gettingStarted = {
  type: 'local-jsx',
  name: 'getting-started',
  description: '快速入门 Claude Code 的交互式指南',
  load: () => import('./getting-started.js'),
} satisfies Command

export default gettingStarted
