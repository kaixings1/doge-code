import type { Command } from '../../commands.js'

const graphql = {
  type: 'local',
  name: 'graphql',
  description: '命令描述',
  load: () => import('./graphql.js'),
} satisfies Command

export default graphql
