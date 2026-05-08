import type { Command } from '../../commands.js'

const logger: Command = {
  name: 'logger',
  description: '命令描述',
  type: 'local',
  load: () => import('./logger.js'),
}

export default logger
