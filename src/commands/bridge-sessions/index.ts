import type { Command } from '../../commands.js'
import { loadSessions } from '../../services/bridgeSessions/sessionManager.js'

const bridgeSessions = {
  type: 'local-jsx' as const,
  name: 'bridge',
  description: '本地终端会话管理系统（类似 tmux/screen，支持多会话持久化、多窗口面板、SSH 远程访问）',
  aliases: ['bridge-sessions', 'bs', 'tmux', 'screen'],
  supportsNonInteractive: false,
  load: () => import('./bridge.tsx').then(m => ({ call: m.call })),
  isEnabled: () => true,
} satisfies Command

export default bridgeSessions

// Preload sessions on module load
loadSessions().catch(err => {
  console.error('Failed to preload bridge sessions:', err)
})
