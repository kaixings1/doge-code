import type { Command } from '../../commands.js'

const installFeishuApp = {
  type: 'local',
  name: 'install-feishu-app',
  description: '安装飞书应用以启用远程控制',
  availability: ['claude-ai'],
  supportsNonInteractive: false,
  load: () => import('./install-feishu-app.tsx'),
} satisfies Command

export default installFeishuApp
