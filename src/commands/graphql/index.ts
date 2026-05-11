import type { Command } from '../../commands.js'

const graphql = {
  type: 'local',
  name: 'graphql',
  description: '执行 GraphQL 查询',
  argumentHint: '<查询语句>',
  load: () => import('./graphql.js'),
} satisfies Command

export default graphql
