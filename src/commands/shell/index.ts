import type { Command } from '../../commands.js'

const shell: Command = {
  name: 'shell',
  description: '命令描述',
  type: 'local',
  load: () => import('./shell.js'),
}

export default shell
