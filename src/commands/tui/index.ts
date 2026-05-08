import type { Command } from '../types/command.js'

const tui = {
  type: 'local-jsx',
  name: 'tui',
  description: '切换到闪烁免模式 (flicker-free) 的全屏终端界面',
} satisfies Command

export default tui
