import type { Command } from '../../commands.js'

const contextCollapse: Command = {
  name: 'context-collapse',
  description: '命令描述',
  type: 'local',
  load: () => import('./contextCollapse.js'),
}

export default contextCollapse
