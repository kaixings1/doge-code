import type { Command } from '../../commands.js'

const graphql: Command = {
  name: 'graphql',
  description: '命令描述',
  type: 'local',
  load: () => import('./graphql.js'),
}

export default graphql
