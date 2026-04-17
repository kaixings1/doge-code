import type { Command } from '../../commands.js'

const fuck = {
  type: 'local',
  name: 'fuck',
  description: '清除本地 Claude Code 认证、自定义 API 配置和会话历史',
  aliases: ['nuke', 'factory-reset'],
  supportsNonInteractive: false,
  load: () => import('./fuck'),
} satisfies Command

export default fuck
