import type { Command, LocalJSXCommandContext, LocalCommandResult } from '../../commands.js'
import { isAgentSwarmsEnabled } from '../../utils/agentSwarmsEnabled.js'
import { getTeamName, getAgentName, isTeammate, isTeamLead } from '../../utils/teammate.js'
import { readTeamFileAsync } from '../../utils/swarm/teamHelpers.js'
import { getAgentId } from '../../utils/teammate.js'

const peers = {
  type: 'local',
  name: 'peers',
  description: '查看同伴会话 — 列出团队成员和会话状态',
  argumentHint: '[list|status]',
  isEnabled: () => isAgentSwarmsEnabled(),
  supportsNonInteractive: false,
  load: () => Promise.resolve({
    call: async (args: string, _context: LocalJSXCommandContext): Promise<LocalCommandResult> => {
      const subcommand = (args ?? '').trim().toLowerCase() || 'list'

      const appState = _context.getAppState()
      const teamName = getTeamName(appState.teamContext)
      const myName = getAgentName() || (isTeammate() ? 'teammate' : 'lead')

      if (!teamName) {
        return {
          type: 'text',
          value: '未在团队上下文中。\n\n使用 /team 创建团队，或设置 CLAUDE_CODE_TEAM_NAME 环境变量。'
        }
      }

      const teamFile = await readTeamFileAsync(teamName)
      if (!teamFile) {
        return {
          type: 'text',
          value: `团队 "${teamName}" 不存在。`
        }
      }

      if (subcommand === 'status') {
        const myId = getAgentId()
        const myMember = myId ? teamFile.members.find(m => m.agentId === myId) : null
        const lines: string[] = [
          `团队: ${teamName}`,
          `我的身份: ${myName}${isTeamLead(appState.teamContext) ? ' (团队负责人)' : ''}`,
          `成员数: ${teamFile.members.length}`,
          '',
        ]
        if (myMember) {
          lines.push(`我的会话: ${myMember.tmuxSessionName || 'N/A'}`)
          lines.push(`我的窗口: ${myMember.tmuxWindowName || 'N/A'}`)
          lines.push(`我的面板: ${myMember.tmuxPaneId || 'N/A'}`)
          lines.push(`后端类型: ${myMember.backendType || 'N/A'}`)
        }
        return { type: 'text', value: lines.join('\n') }
      }

      // list (default)
      const lines: string[] = [
        `团队成员 (${teamFile.members.length}):`,
        '',
      ]
      for (const member of teamFile.members) {
        const isMe = member.name === myName
        const marker = isMe ? ' ← 你' : ''
        const role = member.name === 'team-lead' ? ' [负责人]' : ''
        lines.push(`  ${member.name}${role}${marker}`)
        lines.push(`    会话: ${member.tmuxSessionName || 'N/A'} | 面板: ${member.tmuxPaneId || 'N/A'} | 后端: ${member.backendType || 'N/A'}`)
      }
      lines.push('')
      lines.push('使用 /send-message <队友名> <消息> 向队友发送消息')
      lines.push('使用 /peers status 查看自己的会话详情')

      return { type: 'text', value: lines.join('\n') }
    }
  })
} satisfies Command

export default peers
