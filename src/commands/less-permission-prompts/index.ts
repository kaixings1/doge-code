import type { Command } from '../../commands.js'

const lessPermissionPrompts = {
  type: 'local' as const,
  name: 'less-permission-prompts',
  description: '扫描会话，生成权限白名单',
  aliases: ['lpp', 'permission-scan'],
  supportsNonInteractive: true,
  load: () => import('./lessPermissionPrompts.js'),
} satisfies Command

export default lessPermissionPrompts
