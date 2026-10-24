import type { Command } from '../../commands.js'

const feishu = {
  type: 'local',
  name: 'feishu',
  description: '查看/刷新飞书配对码与已绑定会话',
  supportsNonInteractive: false,
  load: () => import('./feishu.ts'),
} satisfies Command

export default feishu
