import type { Command } from '../../commands.js'

const promptDiff = {
  type: 'local-jsx',
  name: 'prompt-diff',
  description: '显示系统提示词变更差异（设置修改前后的对比）',
  load: () => import('./prompt-diff.js'),
} satisfies Command

export default promptDiff
