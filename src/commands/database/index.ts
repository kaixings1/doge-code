import type { Command } from '../../commands.js'

const database: Command = {
  name: 'database',
  description: '命令描述',
  type: 'local',
  load: () => import('./database.js'),
}

export default database
