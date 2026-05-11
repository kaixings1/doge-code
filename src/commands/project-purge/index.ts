import type { Command } from '../../commands.js'

const projectPurge = {
  type: 'local-jsx',
  name: 'project-purge',
  description: '删除项目的所有 Claude Code 状态',
  load: () => import('./project-purge.js'),
} satisfies Command

export default projectPurge
