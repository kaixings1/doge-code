import type { Command } from '../../commands.js'

const undoClear: Command = {
  type: 'local-jsx',
  name: 'undo-clear',
  description: '撤销最近一次 /clear，恢复 clear 前的对话（对齐官方 W26 /rewind 跨 clear）',
  argumentHint: '',
  load: () => import('./undo-clear.tsx'),
}

export default undoClear
