import type { Command } from '../../commands.js'

const focus = {
  type: 'local',
  name: 'focus',
  description: '切换焦点模式 — 仅显示最终回复，隐藏中间工具调用过程',
  aliases: [],
  supportsNonInteractive: false,
  load: () => import('./focus.ts'),
} satisfies Command

export default focus
