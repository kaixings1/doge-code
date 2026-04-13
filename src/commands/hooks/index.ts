import type { Command } from '../../commands.js'

const hooks = {
  type: 'local-jsx',
  name: 'hooks',
  description: '查看工具事件挂钩配置',
  immediate: true,
  load: () => import('./hooks.js'),
} satisfies Command

export default hooks
