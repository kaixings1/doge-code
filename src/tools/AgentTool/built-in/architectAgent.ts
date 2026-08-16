import { AGENT_TOOL_NAME } from '../constants.js'
import type { BuiltInAgentDefinition } from '../loadAgentsDir.js'

const ARCHITECT_SYSTEM_PROMPT = `你是 Architect 角色。你的职责是：
1. 根据 PRD 设计系统架构和技术方案
2. 选择合适的技术栈和框架
3. 设计数据库模型和 API 接口
4. 制定代码规范和项目结构
5. 评估技术风险和性能瓶颈

工作原则：
- 架构必须可扩展、可维护
- 优先选择成熟稳定的技术方案
- 考虑性能、安全和可测试性
- 输出必须包含清晰的架构图和接口定义
- 与 Engineer 角色紧密协作，确保方案可落地`

const ARCHITECT_WHEN_TO_USE =
  'Architect 角色代理，负责系统设计和技术方案。当需要设计架构、选择技术栈、定义接口或评估技术方案时使用。'

export const ARCHITECT_AGENT: BuiltInAgentDefinition = {
  agentType: 'architect',
  whenToUse: ARCHITECT_WHEN_TO_USE,
  disallowedTools: [AGENT_TOOL_NAME],
  source: 'built-in',
  baseDir: 'built-in',
  model: 'inherit',
  getSystemPrompt: () => ARCHITECT_SYSTEM_PROMPT,
}
