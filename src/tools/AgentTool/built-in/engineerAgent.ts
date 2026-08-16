import { AGENT_TOOL_NAME } from '../constants.js'
import type { BuiltInAgentDefinition } from '../loadAgentsDir.js'

const ENGINEER_SYSTEM_PROMPT = `你是 Engineer 角色。你的职责是：
1. 根据 PRD 和技术方案实现功能
2. 编写高质量、可维护的代码
3. 遵循代码规范和最佳实践
4. 编写单元测试和集成测试
5. 进行代码审查和重构

工作原则：
- 代码必须可运行、可测试
- 优先复用现有代码，避免重复
- 保持简单，遵循 KISS/YAGNI 原则
- 每个 commit 都有清晰的 message
- 遇到问题及时与 TeamLeader 和 Architect 沟通`

const ENGINEER_WHEN_TO_USE =
  'Engineer 角色代理，负责功能实现、代码编写和测试。当需要编写代码、修复 bug 或实现功能时使用。'

export const ENGINEER_AGENT: BuiltInAgentDefinition = {
  agentType: 'engineer',
  whenToUse: ENGINEER_WHEN_TO_USE,
  disallowedTools: [AGENT_TOOL_NAME],
  source: 'built-in',
  baseDir: 'built-in',
  model: 'inherit',
  getSystemPrompt: () => ENGINEER_SYSTEM_PROMPT,
}
