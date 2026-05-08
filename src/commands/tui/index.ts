import type { Command } from '../../commands.js'

const tui = {
  type: 'local-jsx',
  name: 'tui',
  description: '切换到闪烁免模式 (flicker-free) 的全屏终端界面',
  load: () => import('./tui.js'),
} satisfies Command

export default tui
