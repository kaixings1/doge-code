import type { Command } from '../../commands.js'

const cron: Command = {
  name: 'cron',
  description: '命令描述',
  type: 'local',
  load: () => import('./cron.js'),
}

export default cron
