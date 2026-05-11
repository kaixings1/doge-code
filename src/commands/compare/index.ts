import type { Command } from '../../commands.js'

const compare = {
  type: 'local',
  name: 'compare',
  description: '比较不同文件、分支或会话之间的差异',
  argumentHint: '<路径或引用>',
  load: () => import('./compare.js'),
} satisfies Command

export default compare
