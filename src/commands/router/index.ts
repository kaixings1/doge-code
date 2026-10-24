import type { Command } from '../../commands.js'

const router = {
  type: 'local',
  name: 'router',
  description: '分层模型路由建议与成本估算（本地策略，无网络）',
  argumentHint: '[<任务描述>|--json [<任务描述>]]',
  supportsNonInteractive: true,
  load: () => import('./router.js'),
} satisfies Command

export default router
