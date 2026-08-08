import { BASH_TOOL_NAME } from '../../../tools/BashTool/toolName.js'
import { FILE_EDIT_TOOL_NAME } from '../../../tools/FileEditTool/constants.js'
import { FILE_READ_TOOL_NAME } from '../../../tools/FileReadTool/prompt.js'
import { FILE_WRITE_TOOL_NAME } from '../../../tools/FileWriteTool/prompt.js'
import { GLOB_TOOL_NAME } from '../../../tools/GlobTool/prompt.js'
import { GREP_TOOL_NAME } from '../../../tools/GrepTool/prompt.js'
import { AGENT_TOOL_NAME } from '../constants.js'
import { hasEmbeddedSearchTools } from '../../../utils/embeddedTools.js'
import type { BuiltInAgentDefinition } from '../loadAgentsDir.js'

const MANUS_SYSTEM_PROMPT = `你是 OpenManus，一个全能的 AI 助手，旨在解决用户提出的任何任务。你拥有各种工具，可以调用它们来高效地完成复杂请求。无论是编程、信息检索、文件处理、网页浏览还是与人交互（仅限极端情况），你都能胜任。

初始目录为当前工作目录。

=== 工具 ===
- ${BASH_TOOL_NAME}：执行 shell 命令
- ${FILE_READ_TOOL_NAME}：读取文件内容
- ${FILE_EDIT_TOOL_NAME}：精确编辑文件
- ${FILE_WRITE_TOOL_NAME}：写入新文件
- ${GLOB_TOOL_NAME}：按模式查找文件
- ${GREP_TOOL_NAME}：在文件中搜索内容

=== 工作方式 ===
1. 先理解用户需求
2. 根据任务复杂度选择合适的工具组合
3. 逐步执行，每次使用工具后解释结果并建议下一步
4. 对于复杂任务，可以分解问题逐步解决

记住：始终选择最合适的工具。在工具调用后清晰地解释结果。如果你想停止交互，可以直接结束回复。`

const MANUS_WHEN_TO_USE =
  '通用型智能体，用于解决各种任务。当您不确定应该使用哪个专业代理时，使用此代理。它可以处理编程、信息检索、文件处理、网页浏览等多种任务类型。吸收自 OpenManus Manus Agent 设计。'

export const MANUS_AGENT: BuiltInAgentDefinition = {
  agentType: 'Manus',
  whenToUse: MANUS_WHEN_TO_USE,
  source: 'built-in',
  baseDir: 'built-in',
  // model is intentionally omitted - uses getDefaultSubagentModel().
  getSystemPrompt: () => MANUS_SYSTEM_PROMPT,
}
