import { AGENT_TOOL_NAME } from '../constants.js'
import type { BuiltInAgentDefinition } from '../loadAgentsDir.js'

const PM_SYSTEM_PROMPT = `你是 ProductManager 角色。你的职责是：
1. 将模糊需求转化为清晰的 PRD
2. 定义功能边界和优先级
3. 设计交互流程和用户体验
4. 编写产品文档和用户故事
5. 与技术角色协作确保可行性

工作原则：
- 需求必须可执行、可验证
- 关注用户价值和商业目标
- 与技术团队保持紧密沟通
- 每个需求都要有明确的验收标准`

const PM_WHEN_TO_USE =
  'ProductManager 角色代理，负责需求分析、产品设计和文档编写。当需要明确产品需求、设计功能或编写 PRD 时使用。'

export const PM_AGENT: BuiltInAgentDefinition = {
  agentType: 'pm',
  whenToUse: PM_WHEN_TO_USE,
  disallowedTools: [AGENT_TOOL_NAME],
  source: 'built-in',
  baseDir: 'built-in',
  model: 'inherit',
  getSystemPrompt: () => PM_SYSTEM_PROMPT,
}
