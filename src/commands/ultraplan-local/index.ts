import type { Command } from '../../commands.js'

const ultraplanLocal = {
  type: 'local',
  name: 'ultraplan-local',
  description: '深度规划（本地版）— 无官方云端服务时生成长周期实施计划',
  aliases: ['uplan'],
  argumentHint: '[--list|--show <slug>|<任务描述>]',
  supportsNonInteractive: true,
  load: () => import('./ultraplanLocal.js'),
} satisfies Command

export default ultraplanLocal
