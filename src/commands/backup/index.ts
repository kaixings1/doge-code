import type { Command } from '../../commands.js'

const backup: Command = {
  name: 'backup',
  description: '命令描述',
  type: 'local',
  load: () => import('./backup.js'),
}

export default backup
