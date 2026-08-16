import type { Command } from '../../commands.js'

const pruneSessions = {
  type: 'local',
  name: 'prune-sessions',
  description: '清理超过指定天数的过期会话文件',
  aliases: [],
  argumentHint: '[--older-than N] [--dry-run] [--force]',
  supportsNonInteractive: true,
  load: () => import('./prune-sessions.ts'),
} satisfies Command

export default pruneSessions
