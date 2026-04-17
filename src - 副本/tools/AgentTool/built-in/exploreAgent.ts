import { BASH_TOOL_NAME } from '../../../tools/BashTool/toolName.js'
import { EXIT_PLAN_MODE_TOOL_NAME } from '../../../tools/ExitPlanModeTool/constants.js'
import { FILE_EDIT_TOOL_NAME } from '../../../tools/FileEditTool/constants.js'
import { FILE_READ_TOOL_NAME } from '../../../tools/FileReadTool/prompt.js'
import { FILE_WRITE_TOOL_NAME } from '../../../tools/FileWriteTool/prompt.js'
import { GLOB_TOOL_NAME } from '../../../tools/GlobTool/prompt.js'
import { GREP_TOOL_NAME } from '../../../tools/GrepTool/prompt.js'
import { NOTEBOOK_EDIT_TOOL_NAME } from '../../../tools/NotebookEditTool/constants.js'
import { hasEmbeddedSearchTools } from '../../../utils/embeddedTools.js'
import { AGENT_TOOL_NAME } from '../constants.js'
import type { BuiltInAgentDefinition } from '../loadAgentsDir.js'

function getExploreSystemPrompt(): string {
  // Ant-native builds alias find/grep to embedded bfs/ugrep and remove the
  // dedicated Glob/Grep tools, so point at find/grep via Bash instead.
  const embedded = hasEmbeddedSearchTools()
  const globGuidance = embedded
    ? `- 通过 ${BASH_TOOL_NAME} 使用 \`find\` 命令进行广泛的文件模式匹配`
    : `- 使用 ${GLOB_TOOL_NAME} 进行广泛的文件模式匹配`
  const grepGuidance = embedded
    ? `- 通过 ${BASH_TOOL_NAME} 使用 \`grep\` 命令通过正则表达式搜索文件内容`
    : `- 使用 ${GREP_TOOL_NAME} 通过正则表达式搜索文件内容`

  return `你是 Claude Code 的文件搜索专家，Claude Code 是 Anthropic 官方的 Claude CLI 命令行工具。你擅长彻底导航和探索代码库。

=== 关键：只读模式 - 禁止文件修改 ===
这是一个只读的探索任务。你被严格禁止：
- 创建新文件（禁止 Write、touch 或任何类型的文件创建）
- 修改现有文件（禁止 Edit 操作）
- 删除文件（禁止 rm 或删除操作）
- 移动或复制文件（禁止 mv 或 cp 操作）
- 在任何地方创建临时文件，包括 /tmp
- 使用重定向操作符（>、>>、|）或 heredocs 写入文件
- 运行任何改变系统状态的命令

你的角色仅限于搜索和分析现有代码。你没有文件编辑工具的访问权限 - 尝试编辑文件将会失败。

你的优势：
- 使用 glob 模式快速查找文件
- 使用强大的正则表达式模式搜索代码和文本
- 读取和分析文件内容

指南：
${globGuidance}
${grepGuidance}
- 当你知道需要读取的特定文件路径时，使用 ${FILE_READ_TOOL_NAME}
- 仅将 ${BASH_TOOL_NAME} 用于只读操作（ls、git status、git log、git diff、find${embedded ? ', grep' : ''}、cat、head、tail）
- 切勿将 ${BASH_TOOL_NAME} 用于：mkdir、touch、rm、cp、mv、git add、git commit、npm install、pip install 或任何文件创建/修改操作
- 根据调用者指定的详细程度调整搜索方法
- 将最终报告直接作为常规消息传达 - 不要尝试创建文件

注意：你是一个快速代理，应尽可能快地返回输出。为了实现这一点，你必须：
- 有效利用你手头的工具：在搜索文件和实现时要有策略
- 尽可能尝试并行发起多个 grep 和文件读取工具调用

高效完成用户的搜索请求并清晰地报告你的发现。`
}

export const EXPLORE_AGENT_MIN_QUERIES = 3

const EXPLORE_WHEN_TO_USE =
  '用于探索代码库的快速代理。当你需要快速按模式查找文件（例如 "src/components/**/*.tsx"）、按关键词搜索代码（例如 "API endpoints"）或回答有关代码库的问题（例如 "API endpoints 如何工作？"）时使用此代理。调用此代理时，请指定所需的详细程度："quick" 用于基本搜索，"medium" 用于适度探索，或 "very thorough" 用于跨多个位置和命名约定的全面分析。'

export const EXPLORE_AGENT: BuiltInAgentDefinition = {
  agentType: 'Explore',
  whenToUse: EXPLORE_WHEN_TO_USE,
  disallowedTools: [
    AGENT_TOOL_NAME,
    EXIT_PLAN_MODE_TOOL_NAME,
    FILE_EDIT_TOOL_NAME,
    FILE_WRITE_TOOL_NAME,
    NOTEBOOK_EDIT_TOOL_NAME,
  ],
  source: 'built-in',
  baseDir: 'built-in',
  // Ants get inherit to use the main agent's model; external users get haiku for speed
  // Note: For ants, getAgentModel() checks tengu_explore_agent GrowthBook flag at runtime
  model: process.env.USER_TYPE === 'ant' ? 'inherit' : 'haiku',
  // Explore is a fast read-only search agent — it doesn't need commit/PR/lint
  // rules from CLAUDE.md. The main agent has full context and interprets results.
  omitClaudeMd: true,
  getSystemPrompt: () => getExploreSystemPrompt(),
}
