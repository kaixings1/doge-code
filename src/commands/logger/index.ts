import type { Command } from '../../commands.js'

const logger = {
  type: 'local',
  name: 'logger',
  description: '命令描述',
  load: () => import('./logger.js'),
} satisfies Command

export default logger
