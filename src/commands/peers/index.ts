import type { Command, LocalJSXCommandContext, LocalCommandResult } from '../../commands.js'
import { isAgentSwarmsEnabled } from '../../utils/agentSwarmsEnabled.js'
import {
  getTeamName,
  getAgentName,
  isTeammate,
  isTeamLead,
  getAgentId,
} from '../../utils/teammate.js'
import { readTeamFileAsync } from '../../utils/swarm/teamHelpers.js'
import { writeToMailbox } from '../../utils/teammateMailbox.js'
import { generateRequestId } from '../../utils/agentId.js'
import { TEAM_LEAD_NAME } from '../../utils/swarm/constants.js'

const HELP = `用法: /peers <子命令> [参数]

子命令:
  list              列出团队成员
  status            查看自己的会话详情
  send <队友名> <消息>  向队友发送消息

示例:
  /peers list
  /peers status
  /peers send teammate1 "请检查这个 PR"`

const peers = {
  type: 'local',
  name: 'peers',
  description: '查看同伴会话 — 列出团队成员、会话状态，或向队友发送消息',
  argumentHint: '[list|status|send]',
  isEnabled: () => isAgentSwarmsEnabled(),
  supportsNonInteractive: false,
  load: () =>
    Promise.resolve({
      call: async (
        args: string,
        context: LocalJSXCommandContext,
      ): Promise<LocalCommandResult> => {
        const trimmed = (args ?? '').trim()
        if (!trimmed) {
          return { type: 'text', value: HELP }
        }

        const parts = trimmed.split(/\s+/)
        const subcommand = parts[0].toLowerCase()
        const rest = parts.slice(1)

        const appState = context.getAppState()
        const teamName = getTeamName(appState.teamContext)
        const myName = getAgentName() || (isTeammate() ? 'teammate' : 'lead')

        if (!teamName) {
          return {
            type: 'text',
            value: '未在团队上下文中。\n\n使用 /team 创建团队，或设置 CLAUDE_CODE_TEAM_NAME 环境变量。',
          }
        }

        const teamFile = await readTeamFileAsync(teamName)
        if (!teamFile) {
          return { type: 'text', value: `团队 "${teamName}" 不存在。` }
        }

        switch (subcommand) {
          case 'status': {
            const myId = getAgentId()
            const myMember = myId
              ? teamFile.members.find(m => m.agentId === myId)
              : null
            const lines: string[] = [
              `团队: ${teamName}`,
              `我的身份: ${myName}${isTeamLead(appState.teamContext) ? ' (团队负责人)' : ''}`,
              `成员数: ${teamFile.members.length}`,
              '',
            ]
            if (myMember) {
              lines.push(`我的面板: ${myMember.tmuxPaneId || 'N/A'}`)
              lines.push(`后端类型: ${myMember.backendType || 'N/A'}`)
            }
            return { type: 'text', value: lines.join('\n') }
          }

          case 'send': {
            if (rest.length < 2) {
              return {
                type: 'text',
                value: '用法: /peers send <队友名> <消息>\n\n向指定队友发送消息。',
              }
            }
            const recipientName = rest[0]
            const message = rest.slice(1).join(' ')

            if (!teamFile.members.some(m => m.name === recipientName)) {
              return {
                type: 'text',
                value: `队友 "${recipientName}" 不在团队 "${teamName}" 中。\n\n使用 /peers list 查看可用队友。`,
              }
            }

            try {
              await writeToMailbox(recipientName, {
                from: myName,
                text: message,
                summary: message.slice(0, 50),
                timestamp: new Date().toISOString(),
              }, teamName)

              return {
                type: 'text',
                value: `消息已发送到 @${recipientName}:\n  "${message.slice(0, 100)}${message.length > 100 ? '…' : ''}"`,
              }
            } catch (e) {
              return {
                type: 'text',
                value: `发送失败: ${e instanceof Error ? e.message : String(e)}`,
              }
            }
          }

          case 'list':
          default: {
            const lines: string[] = [
              `团队成员 (${teamFile.members.length}):`,
              '',
            ]
            for (const member of teamFile.members) {
              const isMe = member.name === myName
              const marker = isMe ? ' ← 你' : ''
              const role = member.name === 'team-lead' ? ' [负责人]' : ''
              lines.push(`  ${member.name}${role}${marker}`)
              lines.push(
                `    面板: ${member.tmuxPaneId || 'N/A'} | 后端: ${member.backendType || 'N/A'}`,
              )
            }
            lines.push('')
            lines.push('使用 /peers send <队友名> <消息> 向队友发送消息')
            lines.push('使用 /peers status 查看自己的会话详情')

            return { type: 'text', value: lines.join('\n') }
          }
        }
      },
    }),
} satisfies Command

export default peers
