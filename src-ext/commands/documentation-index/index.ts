import type { Command } from '../../commands.js'

const documentationIndex = {
  type: 'local-jsx',
  name: 'documentation-index',
  description: '获取 Claude Code 文档索引，发现所有可用页面',
  load: () => import('./documentation-index.js'),
} satisfies Command

export default documentationIndex
