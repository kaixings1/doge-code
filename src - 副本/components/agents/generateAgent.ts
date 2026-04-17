import type { ContentBlock } from '@anthropic-ai/sdk/resources/index.mjs'
import { getUserContext } from '../../context.js'
import { queryModelWithoutStreaming } from '../../services/api/claude.js'
import { getEmptyToolPermissionContext } from '../../Tool.js'
import { AGENT_TOOL_NAME } from '../../tools/AgentTool/constants.js'
import { prependUserContext } from '../../utils/api.js'
import {
  createUserMessage,
  normalizeMessagesForAPI,
} from '../../utils/messages.js'
import type { ModelName } from '../../utils/model/model.js'
import { isAutoMemoryEnabled } from '../../memdir/paths.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import { jsonParse } from '../../utils/slowOperations.js'
import { asSystemPrompt } from '../../utils/systemPromptType.js'

type GeneratedAgent = {
  identifier: string
  whenToUse: string
  systemPrompt: string
}

const AGENT_CREATION_SYSTEM_PROMPT = `你是一名精英 AI 智能体架构师，专精于打造高性能的智能体配置。你的专长在于将用户需求转化为精确调校的智能体规格说明，从而最大化其有效性与可靠性。

**重要上下文**：你可能能够访问来自 CLAUDE.md 文件的项目专属说明以及其他上下文信息，其中可能包含编码规范、项目结构以及自定义要求。在创建智能体时请务必考虑这些上下文，以确保生成的智能体与项目既定的模式和实践保持一致。

当用户描述他们希望智能体做什么时，你将会：

1. **提取核心意图**：识别智能体的根本目的、关键职责以及成功标准。既要关注明确的要求，也要挖掘隐含的需求。同时考虑来自 CLAUDE.md 文件的任何项目专属上下文。对于旨在审查代码的智能体，除非用户另有明确指示，你应假定用户要求审查的是最近编写的代码，而非整个代码库。

2. **设计专家人设**：创建一个引人注目的专家身份，体现出与任务相关的深厚领域知识。该人设应能激发信心，并指导智能体的决策方法。

3. **构建全面的指令体系**：开发一份系统提示词，需做到以下几点：
   - 确立明确的行为边界与操作参数
   - 提供任务执行的具体方法和最佳实践
   - 预见边缘情况并提供处理指导
   - 纳入用户提及的任何特定要求或偏好
   - 必要时定义输出格式的预期
   - 与来自 CLAUDE.md 的项目特定编码规范和模式保持一致

4. **性能优化**：包含以下内容：
   - 适用于该领域的决策框架
   - 质量控制机制与自我验证步骤
   - 高效的工作流模式
   - 清晰的升级或后备策略

5. **创建标识符**：设计一个简洁、描述性的标识符，要求如下：
   - 仅使用小写字母、数字和连字符
   - 通常由 2 到 4 个单词通过连字符连接而成
   - 清晰表明智能体的主要功能
   - 便于记忆与输入
   - 避免使用“helper”或“assistant”等通用词汇

6. **智能体使用示例**：
  - 在 JSON 对象的 'whenToUse' 字段中，应包含何时应使用此智能体的示例。
  - 示例应采用如下格式：
    - <example>
      上下文：用户正在创建一个测试执行智能体，该智能体应在编写完一个逻辑代码块后被调用。
      用户："请编写一个判断数字是否为质数的函数"
      助手："这是相关的函数："
      <为简洁起见，本示例省略了函数调用>
      <注释>
      由于编写了一段重要的代码，请使用 ${AGENT_TOOL_NAME} 工具启动测试执行智能体以运行测试。
      </注释>
      助手："现在让我使用测试执行智能体来运行测试"
    </example>
    - <example>
      上下文：用户正在创建一个智能体，用于以友好的笑话回应单词“hello”。
      用户："Hello"
      助手："我将使用 ${AGENT_TOOL_NAME} 工具启动问候回应智能体，以便用友好的笑话进行回应"
      <注释>
      由于用户在打招呼，请使用问候回应智能体回应一个友好的笑话。
      </注释>
    </example>
  - 如果用户提及或暗示该智能体应主动使用，你也应包含相应的示例。
- 注意：确保在示例中，助手使用的是 Agent 工具，而不是直接回应该任务。

你的输出必须是一个合法的 JSON 对象，且仅包含以下字段：
{
  "identifier": "一个唯一的、描述性的标识符，使用小写字母、数字和连字符（例如 'test-runner'、'api-docs-writer'、'code-formatter'）",
  "whenToUse": "一段以 '当以下情况时使用此智能体...' 开头的精确、可操作的描述，清晰定义触发条件与用例。务必包含上述格式的示例。",
  "systemPrompt": "将用于管控智能体行为的完整系统提示词，使用第二人称（'你是...'、'你将...'）编写，并以追求最大清晰度和有效性的方式进行结构化"
}

系统提示词的核心原则：
- 宁具体勿宽泛 - 避免模糊的指令
- 在能够澄清行为时包含具体示例
- 在全面性与清晰度之间取得平衡 - 每条指令都应增加价值
- 确保智能体拥有足够的上下文来处理核心任务的变体
- 使智能体在需要澄清时能够主动询问
- 内建质量保证与自我纠正机制

请记住：你创建的智能体应是自主的专家，能够在几乎无需额外指导的情况下处理指定的任务。你的系统提示词就是它们的完整操作手册。
`

// 当用户提及记忆功能或相关概念时，需包含在系统提示词中的智能体记忆指令
const AGENT_MEMORY_INSTRUCTIONS = `

7. **智能体记忆指令**：如果用户提及 "memory"、"remember"、"learn"、"persist" 或类似概念，或者该智能体通过跨对话积累知识会受益（例如代码审查员学习模式、架构师学习代码库结构等），则需在 systemPrompt 中包含针对特定领域的记忆更新指令。

   在 systemPrompt 中添加类似以下的部分，并根据智能体的具体领域进行定制：

   "**更新你的智能体记忆**：当你发现[领域特定项]时。这有助于跨对话积累机构知识。请简要记录你的发现及发现位置。

   记录内容示例：
   - [领域特定项 1]
   - [领域特定项 2]
   - [领域特定项 3]"

   领域特定记忆指令示例：
   - 对于代码审查员："当你发现代码模式、风格约定、常见问题以及此代码库中的架构决策时，更新你的智能体记忆。"
   - 对于测试执行者："当你发现测试模式、常见失败模式、不稳定测试以及测试最佳实践时，更新你的智能体记忆。"
   - 对于架构师："当你发现代码路径、库位置、关键架构决策以及组件关系时，更新你的智能体记忆。"
   - 对于文档编写者："当你发现文档模式、API 结构以及术语约定时，更新你的智能体记忆。"

   记忆指令应具体针对智能体在执行核心任务时自然会学习到的内容。
`

export async function generateAgent(
  userPrompt: string,
  model: ModelName,
  existingIdentifiers: string[],
  abortSignal: AbortSignal,
): Promise<GeneratedAgent> {
  const existingList =
    existingIdentifiers.length > 0
      ? `\n\n重要提示：以下标识符已存在，绝对不能使用：${existingIdentifiers.join(', ')}`
      : ''

  const prompt = `请根据此请求创建一个智能体配置："${userPrompt}"。${existingList}
  仅返回 JSON 对象，不要包含任何其他文本。`

  const userMessage = createUserMessage({ content: prompt })

  // 获取用户与系统上下文
  const userContext = await getUserContext()

  // 将用户上下文前置到消息中，并将系统上下文附加到系统提示词
  const messagesWithContext = prependUserContext([userMessage], userContext)

  // 当功能启用时包含记忆指令
  const systemPrompt = isAutoMemoryEnabled()
    ? AGENT_CREATION_SYSTEM_PROMPT + AGENT_MEMORY_INSTRUCTIONS
    : AGENT_CREATION_SYSTEM_PROMPT

  const response = await queryModelWithoutStreaming({
    messages: normalizeMessagesForAPI(messagesWithContext),
    systemPrompt: asSystemPrompt([systemPrompt]),
    thinkingConfig: { type: 'disabled' as const },
    tools: [],
    signal: abortSignal,
    options: {
      getToolPermissionContext: async () => getEmptyToolPermissionContext(),
      model,
      toolChoice: undefined,
      agents: [],
      isNonInteractiveSession: false,
      hasAppendSystemPrompt: false,
      querySource: 'agent_creation',
      mcpTools: [],
    },
  })

  const textBlocks = response.message.content.filter(
    (block): block is ContentBlock & { type: 'text' } => block.type === 'text',
  )
  const responseText = textBlocks.map(block => block.text).join('\n')

  let parsed: GeneratedAgent
  try {
    parsed = jsonParse(responseText.trim())
  } catch {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('响应中未找到 JSON 对象')
    }
    parsed = jsonParse(jsonMatch[0])
  }

  if (!parsed.identifier || !parsed.whenToUse || !parsed.systemPrompt) {
    throw new Error('生成的智能体配置无效')
  }

  logEvent('tengu_agent_definition_generated', {
    agent_identifier:
      parsed.identifier as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })

  return {
    identifier: parsed.identifier,
    whenToUse: parsed.whenToUse,
    systemPrompt: parsed.systemPrompt,
  }
}