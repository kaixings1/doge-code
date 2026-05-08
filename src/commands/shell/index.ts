import type { Command } from '../../commands.js'

const shell = {
  type: 'local',
  name: 'shell',
  description: '命令描述',
  load: () => import('./shell.js'),
} satisfies Command

export default shell
