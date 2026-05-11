import type { Command } from '../../commands.js'

const shell = {
  type: 'local',
  name: 'shell',
  description: '在一个新的 shell 中执行命令',
  argumentHint: '<命令>',
  load: () => import('./shell.js'),
} satisfies Command

export default shell
