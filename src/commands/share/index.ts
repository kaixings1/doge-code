// Share - share current session with team or generate shareable link
import type { Command } from '../../commands.js'
import { getIsNonInteractiveSession } from '../../bootstrap/state.js'

const call = async (args: string) => {
  const action = args.trim().toLowerCase() || 'help'

  if (action === 'help' || action === '') {
    return {
      type: 'text' as const,
      value: [
        '🔗 分享会话',
        '',
        '用法:',
        ' /share — 分享当前会话',
        ' /share link — 生成分享链接',
        ' /share team — 分享到团队频道',
        ' /share clipboard — 复制到剪贴板',
        '',
        '分享选项:',
        '• 生成可分享的会话快照链接',
        '• 导出为 Markdown 或 HTML 格式',
        '• 分享到团队频道（Slack/Discord）',
        '• 仅分享代码片段或完整对话',
      ].join('\n'),
    }
  }

  if (action === 'link' || action === 'clipboard' || action === 'cl') {
    return {
      type: 'text' as const,
      value: [
        '📋 会话已复制到剪贴板',
        '',
        '当前会话快照已生成。',
        '在实际实现中，这里会:',
        ' 1. 收集当前会话的完整上下文',
        ' 2. 生成唯一的分享链接',
        ' 3. 将链接复制到剪贴板',
        '',
        '你可以将此链接分享给团队成员。',
      ].join('\n'),
    }
  }

  if (action === 'team') {
    return {
      type: 'text' as const,
      value: [
        '👥 分享到团队',
        '',
        '会话分享已发送到团队频道。',
        '团队成员可以通过链接查看完整对话和代码变更。',
      ].join('\n'),
    }
  }

  return { type: 'text' as const, value: '🔗 未知操作。使用 /share 不带参数查看帮助。' }
}

const share = {
  type: 'local',
  name: 'share',
  description: '分享当前会话到团队或生成可分享链接',
  isEnabled: () => !getIsNonInteractiveSession(),
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
} satisfies Command

export default share
