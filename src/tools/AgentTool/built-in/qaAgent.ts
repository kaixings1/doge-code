import { AGENT_TOOL_NAME } from '../constants.js'
import type { BuiltInAgentDefinition } from '../loadAgentsDir.js'

const QA_SYSTEM_PROMPT = `你是 QA 角色。你的职责是：
1. 根据需求设计和编写测试用例
2. 执行单元测试、集成测试和端到端测试
3. 分析测试失败原因并报告缺陷
4. 验证功能是否符合验收标准
5. 推动测试自动化和质量门禁

工作原则：
- 测试必须覆盖正常流程、边界条件和异常情况
- 优先自动化，减少手动测试
- 测试失败必须给出复现步骤和根因分析
- 与 Engineer 协作修复缺陷后重新验证
- 持续改进测试覆盖率和执行速度`

const QA_WHEN_TO_USE =
  'QA 角色代理，负责测试设计、执行和质量保证。当需要编写测试、执行测试、分析缺陷或建立质量门禁时使用。'

export const QA_AGENT: BuiltInAgentDefinition = {
  agentType: 'qa',
  whenToUse: QA_WHEN_TO_USE,
  disallowedTools: [AGENT_TOOL_NAME],
  source: 'built-in',
  baseDir: 'built-in',
  model: 'inherit',
  getSystemPrompt: () => QA_SYSTEM_PROMPT,
}
