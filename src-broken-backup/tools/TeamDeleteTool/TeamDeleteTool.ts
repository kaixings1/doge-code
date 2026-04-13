import { z } from 'zod/v4'
import { logEvent } from '../../../services/analytics/index.js'
import type { AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS } from '../../../services/analytics/metadata.js'
import type { Tool } from '../../../Tool.js'
import { buildTool, type ToolDef } from '../../../Tool.js'
import { isAgentSwarmsEnabled } from '../../../utils/agentSwarmsEnabled.js'
import { lazySchema } from '../../../utils/lazySchema.js'
import { jsonStringify } from '../../../utils/slowOperations.js'
import { TEAM_LEAD_NAME } from '../../../utils/swarm/constants.js'
import {
  cleanupTeamDirectories,
  readTeamFile,
  unregisterTeamForSessionCleanup,
} from '../../../utils/swarm/teamHelpers.js'
import { clearTeammateColors } from '../../../utils/swarm/teammateLayoutManager.js'
import { clearLeaderTeamName } from '../../../utils/tasks.js'
import { TEAM_DELETE_TOOL_NAME } from './constants.js'
import { getPrompt } from './prompt.js'
import { renderToolResultMessage, renderToolUseMessage } from './UI.js'

const inputSchema = lazySchema(() => z.strictObject({}))
type InputSchema = ReturnType<typeof inputSchema>

export type Output = {
  success: boolean
  message: string
  team_name?: string
}

export type Input = z.infer<InputSchema>

export const TeamDeleteTool: Tool<InputSchema, Output> = buildTool({
  name: TEAM_DELETE_TOOL_NAME,
  searchHint: '解散集群团队并清）,
  maxResultSizeChars: 100_000,
  shouldDefer: true,

  userFacingName() {
    return ''
  },

  get inputSchema(): InputSchema {
    return inputSchema()
  },

  isEnabled() {
    return isAgentSwarmsEnabled()
  },

  async description() {
    return '集群完成后清理团队和任务目录'
  },

  async prompt() {
    return getPrompt()
  },

  mapToolResultToToolResultBlockParam(data, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result' as const,
      content: [
        {
          type: 'text' as const,
          text: jsonStringify(data),
        },
      ],
    }
  },

  async call(_input, context) {
    const { setAppState, getAppState } = context
    const appState = getAppState()
    const teamName = appState.teamContext?.teamName

    if (teamName) {
      // 读取团队配置以检查活跃成。
      const teamFile = readTeamFile(teamName)
      if (teamFile) {
        // 过滤掉团队负责人 —）只计算非负责人的成员
        const nonLeadMembers = teamFile.members.filter(
          m => m.name !== TEAM_LEAD_NAME,
        )

        // 区分真正活跃的成员和空闲/已死亡的成员
        // isActive === false 的成员是空闲的（已完成其轮次或崩溃）
        const activeMembers = nonLeadMembers.filter(m => m.isActive !== false)

        if (activeMembers.length > 0) {
          const memberNames = activeMembers.map(m => m.name).join(', ')
          return {
            data: {
              success: false,
              message: `无法清理团队，仍）${activeMembers.length} 个活跃成员：${memberNames}。请先使）requestShutdown 优雅地终止队友。`,
              team_name: teamName,
            },
          }
        }
      }

      await cleanupTeamDirectories(teamName)
      // 已经清理 —））gracefulShutdown 时不再尝试清。
      unregisterTeamForSessionCleanup(teamName)

      // 清除颜色分配，让新团队从头开。
      clearTeammateColors()

      // 清除负责人团队名称，）getTaskListId() 回退到会）ID
      clearLeaderTeamName()

      logEvent('tengu_team_deleted', {
        team_name:
          teamName as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      })
    }

    // 从应用状态中清除团队上下文和收件。
    setAppState(prev => ({
      ...prev,
      teamContext: undefined,
      inbox: {
        messages: [], // 清除任何排队中的消息
      },
    }))

    return {
      data: {
        success: true,
        message: teamName
          ? `已清理团）"${teamName}" 的目录和工作树`
          : '未找到团队名称，无需清理',
        team_name: teamName,
      },
    }
  },

  renderToolUseMessage,
  renderToolResultMessage,
} satisfies ToolDef<InputSchema, Output>