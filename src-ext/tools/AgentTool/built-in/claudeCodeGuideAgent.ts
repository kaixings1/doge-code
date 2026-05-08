import { BASH_TOOL_NAME } from '../../../tools/BashTool/toolName.js'
import { FILE_READ_TOOL_NAME } from '../../../tools/FileReadTool/prompt.js'
import { GLOB_TOOL_NAME } from '../../../tools/GlobTool/prompt.js'
import { GREP_TOOL_NAME } from '../../../tools/GrepTool/prompt.js'
import { SEND_MESSAGE_TOOL_NAME } from '../../../tools/SendMessageTool/constants.js'
import { WEB_FETCH_TOOL_NAME } from '../../../tools/WebFetchTool/prompt.js'
import { WEB_SEARCH_TOOL_NAME } from '../../../tools/WebSearchTool/prompt.js'
import { isUsing3PServices } from '../../../utils/auth.js'
import { hasEmbeddedSearchTools } from '../../../utils/embeddedTools.js'
import { getSettings_DEPRECATED } from '../../../utils/settings/settings.js'
import { jsonStringify } from '../../../utils/slowOperations.js'
import type {
  AgentDefinition,
  BuiltInAgentDefinition,
} from '../loadAgentsDir.js'

const CLAUDE_CODE_DOCS_MAP_URL =
  'https://code.claude.com/docs/en/claude_code_docs_map.md'
const CDP_DOCS_MAP_URL = 'https://platform.claude.com/llms.txt'

export const CLAUDE_CODE_GUIDE_AGENT_TYPE = 'claude-code-guide'

function getClaudeCodeGuideBasePrompt(): string {
  // Ant 原生构建将 find/grep 映射到嵌入式 bfs/ugrep，并移除了专用的 Glob/Grep 工具，
  // 因此改用 find/grep 作为替代。
  const localSearchHint = hasEmbeddedSearchTools()
    ? `${FILE_READ_TOOL_NAME}、\`find\` 和 \`grep\``
    : `${FILE_READ_TOOL_NAME}、${GLOB_TOOL_NAME} 和 ${GREP_TOOL_NAME}`

  return `你是 Claude 指南助手。你的主要职责是帮助用户理解并有效使用 Claude Code、Claude Agent SDK 以及 Claude API（原 Anthropic API）。

**你的专业领域涵盖以下三个方面：**

1. **Claude Code**（命令行工具）：安装、配置、钩子（hooks）、技能（skills）、MCP 服务器、快捷键、IDE 集成、设置文件和工作流程。

2. **Claude Agent SDK**：基于 Claude Code 技术构建自定义 AI 助手的框架。提供 Node.js/TypeScript 和 Python 版本。

3. **Claude API**：用于直接与模型交互、工具调用及集成的 Claude API（原 Anthropic API）。

**文档来源：**

- **Claude Code 文档** (${CLAUDE_CODE_DOCS_MAP_URL})：遇到 Claude Code CLI 工具相关问题时请获取此文档，内容包括：
  - 安装、设置与快速入门
  - 钩子（命令执行前后的钩子）
  - 自定义技能
  - MCP 服务器配置
  - IDE 集成（VS Code、JetBrains）
  - 设置文件与配置
  - 快捷键与热键
  - 子代理与插件
  - 沙盒与安全

- **Claude Agent SDK 文档** (${CDP_DOCS_MAP_URL})：遇到使用 SDK 构建助手相关问题时请获取此文档，内容包括：
  - SDK 概览与入门（Python 和 TypeScript）
  - 助手配置与自定义工具
  - 会话管理与权限
  - 助手中的 MCP 集成
  - 托管与部署
  - 成本追踪与上下文管理
  注意：Agent SDK 文档与 Claude API 文档位于同一 URL。

- **Claude API 文档** (${CDP_DOCS_MAP_URL})：遇到 Claude API（原 Anthropic API）相关问题时请获取此文档，内容包括：
  - Messages API 与流式传输
  - 工具调用（函数调用）及 Anthropic 定义的工具（计算机操作、代码执行、网页搜索、文本编辑器、bash、程序化工具调用、工具搜索工具、上下文编辑、Files API、结构化输出）
  - 视觉识别、PDF 支持与引用
  - 扩展思考与结构化输出
  - 用于远程 MCP 服务器的 MCP 连接器
  - 云服务商集成（Bedrock、Vertex AI、Foundry）

**处理方式：**
1. 判断用户的问题属于哪个领域
2. 使用 ${WEB_FETCH_TOOL_NAME} 获取相应的文档地图
3. 从地图中找出最相关的文档 URL
4. 获取具体的文档页面内容
5. 基于官方文档提供清晰、可操作的指导
6. 如果文档未涵盖相关主题，可使用 ${WEB_SEARCH_TOOL_NAME}
7. 在相关时，通过 ${localSearchHint} 查阅本地项目文件（如 CLAUDE.md、.claude/ 目录）

**准则：**
- 始终以官方文档为准，而非主观臆断
- 回复应简洁且具有可操作性
- 适当包含具体的示例或代码片段
- 回复中需引用确切的文档 URL
- 主动建议相关的命令、快捷键或功能，帮助用户发掘特性

请基于准确的文档为用户提供指导，完成其请求。`
}

function getFeedbackGuideline(): string {
  // 对于 3P 服务（Bedrock/Vertex/Foundry），/feedback 命令被禁用
  // 请引导用户前往相应的反馈渠道
  if (isUsing3PServices()) {
    return `- 当你找不到答案或所需功能不存在时，请引导用户前往 ${MACRO.ISSUES_EXPLAINER}`
  }
  return "- 当你找不到答案或所需功能不存在时，请引导用户使用 /feedback 命令提交功能请求或报告问题"
}

export const CLAUDE_CODE_GUIDE_AGENT: BuiltInAgentDefinition = {
  agentType: CLAUDE_CODE_GUIDE_AGENT_TYPE,
  whenToUse: `当用户询问以下内容时使用此助手（例如“Claude 能……吗”、“Claude 支持……吗”、“如何……？”）：(1) Claude Code（命令行工具）—— 功能、钩子、斜杠命令、MCP 服务器、设置、IDE 集成、快捷键；(2) Claude Agent SDK —— 构建自定义助手；(3) Claude API（原 Anthropic API）—— API 用法、工具调用、Anthropic SDK 用法。**重要提示：** 在创建新的助手之前，请先检查是否已有正在运行或最近完成的 claude-code-guide 助手，可以通过 ${SEND_MESSAGE_TOOL_NAME} 继续与其对话。`,
  // Ant 原生构建：Glob/Grep 工具已被移除；使用 Bash（通过 find/grep 别名调用嵌入式 bfs/ugrep）进行本地文件搜索。
  tools: hasEmbeddedSearchTools()
    ? [
        BASH_TOOL_NAME,
        FILE_READ_TOOL_NAME,
        WEB_FETCH_TOOL_NAME,
        WEB_SEARCH_TOOL_NAME,
      ]
    : [
        GLOB_TOOL_NAME,
        GREP_TOOL_NAME,
        FILE_READ_TOOL_NAME,
        WEB_FETCH_TOOL_NAME,
        WEB_SEARCH_TOOL_NAME,
      ],
  source: 'built-in',
  baseDir: 'built-in',
  model: 'haiku',
  permissionMode: 'dontAsk',
  getSystemPrompt({ toolUseContext }) {
    const commands = toolUseContext.options.commands

    // 构建上下文内容块
    const contextSections: string[] = []

    // 1. 自定义技能
    const customCommands = commands.filter(cmd => cmd.type === 'prompt')
    if (customCommands.length > 0) {
      const commandList = customCommands
        .map(cmd => `- /${cmd.name}: ${cmd.description}`)
        .join('\n')
      contextSections.push(
        `**当前项目中可用的自定义技能：**\n${commandList}`,
      )
    }

    // 2. 来自 .claude/agents/ 的自定义助手
    const customAgents =
      toolUseContext.options.agentDefinitions.activeAgents.filter(
        (a: AgentDefinition) => a.source !== 'built-in',
      )
    if (customAgents.length > 0) {
      const agentList = customAgents
        .map((a: AgentDefinition) => `- ${a.agentType}: ${a.whenToUse}`)
        .join('\n')
      contextSections.push(
        `**已配置的自定义助手：**\n${agentList}`,
      )
    }

    // 3. MCP 服务器
    const mcpClients = toolUseContext.options.mcpClients
    if (mcpClients && mcpClients.length > 0) {
      const mcpList = mcpClients
        .map((client: { name: string }) => `- ${client.name}`)
        .join('\n')
      contextSections.push(`**已配置的 MCP 服务器：**\n${mcpList}`)
    }

    // 4. 插件命令
    const pluginCommands = commands.filter(
      cmd => cmd.type === 'prompt' && cmd.source === 'plugin',
    )
    if (pluginCommands.length > 0) {
      const pluginList = pluginCommands
        .map(cmd => `- /${cmd.name}: ${cmd.description}`)
        .join('\n')
      contextSections.push(`**可用的插件技能：**\n${pluginList}`)
    }

    // 5. 用户设置
    const settings = getSettings_DEPRECATED()
    if (Object.keys(settings).length > 0) {
      // 显示用户设置文件内容
      const settingsJson = jsonStringify(settings, null, 2)
      contextSections.push(
        `**用户的 settings.json：**\n\`\`\`json\n${settingsJson}\n\`\`\``,
      )
    }

    // 添加反馈指南（根据用户是否使用 3P 服务有条件地显示）
    const feedbackGuideline = getFeedbackGuideline()
    const basePromptWithFeedback = `${getClaudeCodeGuideBasePrompt()}
${feedbackGuideline}`

    // 如果有额外的上下文信息，则将其附加到系统提示的末尾
    if (contextSections.length > 0) {
      return `${basePromptWithFeedback}

---

# 用户当前配置

用户环境中包含以下自定义设置：

${contextSections.join('\n\n')}

回答问题时，请考虑这些已配置的特性，并在相关时主动推荐。`
    }

    // 若无额外上下文，则返回基础提示
    return basePromptWithFeedback
  },
}