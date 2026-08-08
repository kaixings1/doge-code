import type { Command } from '../../commands.js'

const dogeConfig = {
  type: 'local' as const,
  name: 'doge-config',
  description: '管理 doge 配置（API 地址、密钥、模型等）',
  aliases: ['doge-settings', 'api-config'],
  load: () => import('./dogeConfig.ts'),
}

export default dogeConfig
