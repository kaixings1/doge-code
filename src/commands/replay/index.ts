import type { Command } from '../../commands.js'
import { getClaudeConfigHomeDir } from '../../utils/envUtils.js'

const replay = {
  type: 'local',
  name: 'replay',
  description: '重放历史会话的工具调用链（只展示，不执行）',
  aliases: [],
  argumentHint: '[--session <id>] [--limit N]',
  supportsNonInteractive: true,
  load: () => import('./replay.ts'),
} satisfies Command

export default replay
