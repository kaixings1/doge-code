import type { Command } from '../../commands.js'

const toolgroup = {
  type: 'local' as const,
  name: 'toolgroup',
  description: '管理工具组（启用哪些工具、组内增删、另存为、动态切换）',
  aliases: ['tg', 'tools-group'],
  load: () => import('./toolgroup.ts'),
}

export default toolgroup
