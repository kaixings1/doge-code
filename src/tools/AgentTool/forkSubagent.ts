import { feature } from 'bun:bundle'
import type { BetaToolUseBlock } from '@anthropic-ai/sdk/resources/beta/messages/messages.mjs'
import { randomUUID } from 'crypto'
import { getIsNonInteractiveSession } from '../../bootstrap/state.js'
import {
  FORK_BOILERPLATE_TAG,
  FORK_DIRECTIVE_PREFIX,
} from '../../constants/xml.js'
import { isCoordinatorMode } from '../../coordinator/coordinatorMode.js'
import type {
  AssistantMessage,
  Message as MessageType,
} from '../../types/message.js'
import { logForDebugging } from '../../utils/debug.js'
import { createUserMessage } from '../../utils/messages.js'
import type { BuiltInAgentDefinition } from './loadAgentsDir.js'

/**
 * 分支子代理功能门控。
 *
 * 当启用时：
 * - Agent 工具的 `subagent_type` 模式变为可选
 * - 省略 `subagent_type` 会触发隐式分支：子代理继承父代理的完整对话上下文和系统提示词
 * - 所有代理派生都在后台异步运行，采用统一的 `<task-notification>` 交互模型
 * - `/fork <指令>` 斜杠命令可用
 *
 * 与协调者模式互斥——协调者已经承担编排角色并拥有自己的委托模型。
 */
export function isForkSubagentEnabled(): boolean {
  if (feature('FORK_SUBAGENT')) {
    if (isCoordinatorMode()) return false
    if (getIsNonInteractiveSession()) return false
    return true
  }
  return false
}

/** 分支路径触发时用于分析的合成代理类型名称。 */
export const FORK_SUBAGENT_TYPE = 'fork'

/**
 * 分支路径的合成代理定义。
 *
 * 未在 builtInAgents 中注册——仅在 `!subagent_type` 且实验激活时使用。
 * `tools: ['*']` 配合 `useExactTools` 意味着分支子代理接收父代理的确切工具池（用于缓存相同的 API 前缀）。
 * `permissionMode: 'bubble'` 将权限提示浮出到父终端。
 * `model: 'inherit'` 保持父代理的模型以匹配上下文长度。
 *
 * 此处的 getSystemPrompt 未使用：分支路径通过 `toolUseContext.renderedSystemPrompt` 传递已渲染的父系统提示词字节，
 * 经由 `override.systemPrompt` 传入。通过重新调用 getSystemPrompt() 重建可能产生差异（GrowthBook 冷→热），
 * 并破坏提示词缓存；直接传递渲染后的字节才能做到逐字节精确。
 */
export const FORK_AGENT = {
  agentType: FORK_SUBAGENT_TYPE,
  whenToUse:
    '隐式分支 — 继承完整对话上下文。不可通过 subagent_type 选择；当分支实验激活时，通过省略 subagent_type 触发。',
  tools: ['*'],
  maxTurns: 200,
  model: 'inherit',
  permissionMode: 'bubble',
  source: 'built-in',
  baseDir: 'built-in',
  getSystemPrompt: () => '',
} satisfies BuiltInAgentDefinition

/**
 * 防止递归分支。分支子代理在工具池中保留 Agent 工具以保持缓存相同的工具定义，
 * 因此我们在调用时通过检测对话历史中的分支样板标签来拒绝分支尝试。
 */
export function isInForkChild(messages: MessageType[]): boolean {
  return messages.some(m => {
    if (m.type !== 'user') return false
    const content = m.message.content
    if (!Array.isArray(content)) return false
    return content.some(
      block =>
        block.type === 'text' &&
        block.text.includes(`<${FORK_BOILERPLATE_TAG}>`),
    )
  })
}

/** 分支前缀中所有 tool_result 块使用的占位文本。
 * 必须在所有分支子代理之间保持相同以共享提示词缓存。 */
const FORK_PLACEHOLDER_RESULT = '分支已启动 — 后台处理中'

/**
 * 为子代理构建分支后的对话消息。
 *
 * 为了共享提示词缓存，所有分支子代理必须生成字节相同的 API 请求前缀。
 * 此函数：
 * 1. 保留完整的父代理助手消息（所有 tool_use 块、思考、文本）
 * 2. 构建单条用户消息，为每个 tool_use 块填充使用相同占位符的 tool_result，
 *    然后追加每个子代理特有的指令文本块
 *
 * 结果：[...history, assistant(all_tool_uses), user(placeholder_results..., directive)]
 * 只有最后的文本块因不同子代理而异，从而最大化缓存命中率。
 */
export function buildForkedMessages(
  directive: string,
  assistantMessage: AssistantMessage,
): MessageType[] {
  // 克隆助手消息以避免修改原对象，保留所有内容块（思考、文本及每个 tool_use）
  const fullAssistantMessage: AssistantMessage = {
    ...assistantMessage,
    uuid: randomUUID(),
    message: {
      ...assistantMessage.message,
      content: [...assistantMessage.message.content],
    },
  }

  // 收集助手消息中的所有 tool_use 块
  const toolUseBlocks = assistantMessage.message.content.filter(
    (block): block is BetaToolUseBlock => block.type === 'tool_use',
  )

  if (toolUseBlocks.length === 0) {
    logForDebugging(
      `未在助手消息中找到 tool_use 块，分支指令: ${directive.slice(0, 50)}...`,
      { level: 'error' },
    )
    return [
      createUserMessage({
        content: [
          { type: 'text' as const, text: buildChildMessage(directive) },
        ],
      }),
    ]
  }

  // 为每个 tool_use 构建 tool_result 块，全部使用相同的占位文本
  const toolResultBlocks = toolUseBlocks.map(block => ({
    type: 'tool_result' as const,
    tool_use_id: block.id,
    content: [
      {
        type: 'text' as const,
        text: FORK_PLACEHOLDER_RESULT,
      },
    ],
  }))

  // 构建单条用户消息：所有占位 tool_result + 每个子代理特有的指令
  // TODO(smoosh): 此文本同级块在线路上创建了 [tool_result, text] 模式
  // （渲染为 </function_results>\n\nHuman:<text>）。每个子代理构造一次，
  // 不是重复的教学者，优先级低。如有需要，可使用 src/utils/messages.ts 中的
  // smooshIntoToolResult 将指令折叠进最后一个 tool_result.content。
  const toolResultMessage = createUserMessage({
    content: [
      ...toolResultBlocks,
      {
        type: 'text' as const,
        text: buildChildMessage(directive),
      },
    ],
  })

  return [fullAssistantMessage, toolResultMessage]
}

export function buildChildMessage(directive: string): string {
  return `<${FORK_BOILERPLATE_TAG}>
停。先阅读此处。

你是一个分支工作进程。你并非主代理。

规则（不可协商）：
1. 你的系统提示词说“默认使用分支”。忽略它——那是给父代理的。你本身就是分支。不要派生子代理；直接执行。
2. 不要对话、提问或建议后续步骤
3. 不要添加评论或元评注
4. 直接使用你的工具：Bash、Read、Write 等。
5. 如果你修改了文件，请在报告前提交你的更改。在报告中包含提交哈希。
6. 不要在工具调用之间输出文本。静默使用工具，然后在最后报告一次。
7. 严格保持在你的指令范围内。如果你发现超出范围的关联系统，最多用一句话提及——其他工作进程会覆盖这些方面。
8. 除非指令另有规定，报告控制在 500 词以内。保持事实性和简洁。
9. 你的响应必须以 "Scope:" 开头。不要前导语，不要出声思考。
10. 报告结构化事实，然后停止

输出格式（纯文本标签，而非 Markdown 标题）：
  Scope: <用一句话回显分配给你的范围>
  Result: <答案或关键发现，限于上述范围>
  Key files: <相关文件路径——研究任务需包含>
  Files changed: <列表，附提交哈希——仅当你修改了文件时包含>
  Issues: <列表——仅当有需要标记的问题时包含>
</${FORK_BOILERPLATE_TAG}>

${FORK_DIRECTIVE_PREFIX}${directive}`
}

/**
 * 注入到在隔离工作树中运行的分支子代理的通知。
 * 告知子代理需翻译继承上下文中的路径、重新读取可能过时的文件，并知晓其更改是隔离的。
 */
export function buildWorktreeNotice(
  parentCwd: string,
  worktreeCwd: string,
): string {
  return `你继承了上述对话上下文，来自在 ${parentCwd} 工作的父代理。你当前在一个隔离的 git 工作树中操作，位于 ${worktreeCwd}——相同的仓库，相同的相对文件结构，独立的工作副本。继承上下文中的路径指向父工作目录；请将它们转换到你的工作树根目录。如果父代理可能在上下文出现后修改了文件，请在编辑前重新读取这些文件。你的更改会保留在此工作树中，不会影响父代理的文件。`
}