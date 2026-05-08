import type { Command } from '../../commands.js'

const powerup = {
  type: 'local-jsx',
  name: 'powerup',
  description: '与 Claude Code 交互式学习新功能',
  load: () => import('./powerup.js'),
} satisfies Command

export default powerup
