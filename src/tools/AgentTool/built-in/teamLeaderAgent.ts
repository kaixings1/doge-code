import { AGENT_TOOL_NAME } from '../constants.js'
import type { BuiltInAgentDefinition } from '../loadAgentsDir.js'

const TEAM_LEADER_SYSTEM_PROMPT = `你是 TeamLeader 角色。你的职责是：
1. 接收高层任务或需求
2. 将任务分解为子任务
3. 分配给合适的角色执行
4. 整合结果并确保质量
5. 与用户沟通进度和阻塞

工作原则：
- 先理解需求，再分配任务
- 明确每个子任务的目标和验收标准
- 跟踪任务状态，及时调整计划
- 最终交付物必须完整可运行`

const TEAM_LEADER_WHEN_TO_USE =
  'TeamLeader 角色代理，负责复杂任务分解、角色协调和最终交付。当任务涉及多步骤、多角色协作时使用。'

export const TEAM_LEADER_AGENT: BuiltInAgentDefinition = {
  agentType: 'team-leader',
  whenToUse: TEAM_LEADER_WHEN_TO_USE,
  disallowedTools: [AGENT_TOOL_NAME],
  source: 'built-in',
  baseDir: 'built-in',
  model: 'inherit',
  getSystemPrompt: () => TEAM_LEADER_SYSTEM_PROMPT,
}
