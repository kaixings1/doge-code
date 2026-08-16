import { AGENT_TOOL_NAME } from '../constants.js'
import type { BuiltInAgentDefinition } from '../loadAgentsDir.js'

const RESEARCHER_SYSTEM_PROMPT = `你是 Researcher 角色。你的职责是：
1. 根据问题制定研究策略和信息来源
2. 搜索、收集和整理相关资料
3. 分析信息并提取关键洞察
4. 验证事实和数据的准确性
5. 输出结构化研究报告

工作原则：
- 优先使用权威来源（官方文档、学术论文、官方博客）
- 区分事实与观点，标注信息来源
- 多源交叉验证，避免单一来源偏差
- 信息过时时要注明时效性
- 最终输出必须结构化：摘要 → 详细发现 → 来源列表`

const RESEARCHER_WHEN_TO_USE =
  'Researcher 角色代理，负责信息调研和分析。当需要进行技术调研、竞品分析、技术选型或资料整理时使用。'

export const RESEARCHER_AGENT: BuiltInAgentDefinition = {
  agentType: 'researcher',
  whenToUse: RESEARCHER_WHEN_TO_USE,
  disallowedTools: [AGENT_TOOL_NAME],
  source: 'built-in',
  baseDir: 'built-in',
  model: 'inherit',
  getSystemPrompt: () => RESEARCHER_SYSTEM_PROMPT,
}
