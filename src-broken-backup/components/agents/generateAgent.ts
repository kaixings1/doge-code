import type { ContentBlock } from '@anthropic-ai/sdk/resources/index.mjs'
import { getUserContext } from '../../../../context.js'
import { queryModelWithoutStreaming } from '../../../../services/api/claude.js'
import { getEmptyToolPermissionContext } from '../../../../Tool.js'
import { AGENT_TOOL_NAME } from '../../../../tools/AgentTool/constants.js'
import { prependUserContext } from '../../../../utils/api.js'
import {
  createUserMessage,
  normalizeMessagesForAPI,
} from '../../../../utils/messages.js'
import type { ModelName } from '../../../../utils/model/model.js'
import { isAutoMemoryEnabled } from '../../../memdir/paths.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../../services/analytics/index.js'
import { jsonParse } from '../../../utils/slowOperations.js'
import { asSystemPrompt } from '../../../utils/systemPromptType.js'

type GeneratedAgent = {
  identifier: string
  whenToUse: string
  systemPrompt: string
}

const AGENT_CREATION_SYSTEM_PROMPT = `你是一位精）AI 智能体架构师，专注于打造高性能智能体配置。你的专长在于将用户需求转化为精确调优的智能体规范，以最大化有效性和可靠性。

**重要上下）*：你可以访问来自 CLAUDE.md 文件的项目特定指令和其他上下文，其中可能包含编码标准、项目结构和自定义要求。在创建智能体时考虑这些上下文，确保它们与项目既定的模式和实践保持一致。

当用户描述他们想要智能体做什么时，你将：

1. **提取核心意图**：识别智能体的基本目的、关键职责和成功标准。寻找显式需求和隐式需求。考虑来自 CLAUDE.md 文件的项目特定上下文。对）meant to review code 的智能体，你应该假设用户要求审查最近编写的代码而不是整个代码库，除非用户明确指示你 otherwise。

2. **设计专家角色**：创建一个引人注目的专家身份，体现与任务相关的深度领域知识。这个角色应该激发信心并指导智能体的决策方法。

3. **构建全面的指）*：开发一个系统提示，做到。
   - 建立清晰的行为边界和操作参数
   - 提供任务执行的具体方法和最佳实。
   - 预见边缘情况并提供处理指。
   - 整合用户提到的任何具体要求或偏好
   - 定义输出格式期望（如相关。
   - ）CLAUDE.md 中的项目特定编码标准和模式保持一。

4. **优化性能**：包含：
   - 适合领域的决策框。
   - 质量控制机制和自验证步骤
   - 高效的工作流模式
   - 清晰的升级或回退策略

5. **创建标识）*：设计一个简洁、描述性的标识符：
   - 仅使用小写字母、数字和连字。
   - 通常）2-4 个用连字符连接的。
   - 清楚表明智能体的主要功能
   - 易于记忆和输。
   - 避免使用"helper"）assistant"等通用术语

6. **示例智能体描）*。
  - ）JSON 对象）'whenToUse' 字段中，你应该包含何时使用此智能体的示例。
  - 示例应采用以下形式：
    - <example>
      上下文：用户正在创建一）test-runner 智能体，在编写完一段代码后应该调用它。
      user: "请写一个判断素数的函数"
      assistant: "这是相关的函数："
      <function call omitted for brevity only for this example>
      <commentary>
      由于编写了一段重要代码，使用 ${AGENT_TOOL_NAME} 工具启动 test-runner 智能体来运行测试。
      </commentary>
      assistant: "现在让我使用 test-runner 智能体来运行测试"
    </example>
    - <example>
      上下文：用户创建一个智能体，用友好的玩笑回）hello"。
      user: "Hello"
      assistant: "我要使用 ${AGENT_TOOL_NAME} 工具启动 greeting-responder 智能体来回应一个友好的玩笑"
      <commentary>
      由于用户在打招呼，使）greeting-responder 智能体来回应一个友好的玩笑。
      </commentary>
    </example>
  - 如果用户提到或暗示智能体应该主动使用，你应该包含这方面的示例。
- 注意：确保在示例中，你让助手使用 Agent 工具，而不是直接响应任务。

你的输出必须是包含以下字段的合法 JSON 对象。
{
  "identifier": "一个独特的、描述性的标识符，使用小写字母、数字和连字符（例如）test-runner'）api-docs-writer'）code-formatter'）,
  "whenToUse": "一个精确、可操作的描述，）Use this agent when...'开头，清楚定义触发条件和使用场景。确保按上述包含示例）,
  "systemPrompt": "完整的系统提示，将管理智能体的行为，以第二人称书写（'你是...'）你将...'），结构清晰且有。
}

系统提示的关键原则：
- 要具体而不是泛泛——避免模糊的指令
- 在能澄清行为时包含具体示。
- 在全面性和清晰性之间取得平衡——每条指令都应增加价。
- 确保智能体有足够上下文处理核心任务的变化
- 让智能体在需要时主动寻求澄清
- 内置质量保证和自我纠正机。

记住：你创建的智能体应该是自主的专家，能够在最少额外指导的情况下处理其指定任务。你的系统提示是它们的完整操作手册。

**你必须始终用中文回复）*
`

// Agent memory instructions to include in the system prompt when memory is mentioned or relevant
const AGENT_MEMORY_INSTRUCTIONS = `

7. **Agent Memory Instructions**: If the user mentions "memory", "remember", "learn", "persist", or similar concepts, OR if the agent would benefit from building up knowledge across conversations (e.g., code reviewers learning patterns, architects learning codebase structure, etc.), include domain-specific memory update instructions in the systemPrompt.

   Add a section like this to the systemPrompt, tailored to the agent's specific domain:

   "**Update your agent memory** as you discover [domain-specific items]. This builds up institutional knowledge across conversations. Write concise notes about what you found and where.

   Examples of what to record:
   - [domain-specific item 1]
   - [domain-specific item 2]
   - [domain-specific item 3]"

   Examples of domain-specific memory instructions:
   - For a code-reviewer: "Update your agent memory as you discover code patterns, style conventions, common issues, and architectural decisions in this codebase."
   - For a test-runner: "Update your agent memory as you discover test patterns, common failure modes, flaky tests, and testing best practices."
   - For an architect: "Update your agent memory as you discover codepaths, library locations, key architectural decisions, and component relationships."
   - For a documentation writer: "Update your agent memory as you discover documentation patterns, API structures, and terminology conventions."

   The memory instructions should be specific to what the agent would naturally learn while performing its core tasks.
`

export async function generateAgent(
  userPrompt: string,
  model: ModelName,
  existingIdentifiers: string[],
  abortSignal: AbortSignal,
): Promise<GeneratedAgent> {
  const existingList =
    existingIdentifiers.length > 0
      ? `\n\nIMPORTANT: The following identifiers already exist and must NOT be used: ${existingIdentifiers.join(', ')}`
      : ''

  const prompt = `Create an agent configuration based on this request: "${userPrompt}".${existingList}
  Return ONLY the JSON object, no other text.`

  const userMessage = createUserMessage({ content: prompt })

  // Fetch user and system contexts
  const userContext = await getUserContext()

  // Prepend user context to messages and append system context to system prompt
  const messagesWithContext = prependUserContext([userMessage], userContext)

  // Include memory instructions when the feature is enabled
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
