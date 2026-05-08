import type { Command } from '../../commands.js'

const backup = {
  type: 'local',
  name: 'backup',
  description: '命令描述',
  load: () => import('./backup.js'),
} satisfies Command

export default backup
