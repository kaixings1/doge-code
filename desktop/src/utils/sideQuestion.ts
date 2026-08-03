/**
 * 附加问题（"/btw"）功能 - 允许提出快速问题而不中断主代理上下文。
 *
 * 使用 runForkedAgent 利用父上下文的提示缓存，同时保持附加问题
 * 响应与主对话分离。
 */

import { formatAPIError } from '../services/api/errorUtils.js'
import type { NonNullableUsage } from '../services/api/logging.js'
import type { Message, SystemAPIErrorMessage } from '../types/message.js'
import { type CacheSafeParams, runForkedAgent } from './forkedAgent.js'
import { createUserMessage, extractTextContent } from './messages.js'

// 检测输入开头处 "/btw" 的模式（不区分大小写，单词边界）
const BTW_PATTERN = /^\/btw\b/gi

/**
 * 查找文本开头处 "/btw" 关键词的位置以进行高亮显示。
 * 类似于 thinking.ts 中的 findThinkingTriggerPositions。
 */
export function findBtwTriggerPositions(text: string): Array<{
  word: string
  start: number
  end: number
}> {
  const positions: Array<{ word: string; start: number; end: number }> = []
  const matches = text.matchAll(BTW_PATTERN)

  for (const match of matches) {
    if (match.index !== undefined) {
      positions.push({
        word: match[0],
        start: match.index,
        end: match.index + match[0].length,
      })
    }
  }

  return positions
}

export type SideQuestionResult = {
  response: string | null
  usage: NonNullableUsage
}

/**
 * 使用分叉代理运行附加问题。
 * 共享父级的提示缓存——不覆盖思考、不写入缓存。
 * 所有工具都被阻止，我们限制为 1 轮。
 */
export async function runSideQuestion({
  question,
  cacheSafeParams,
}: {
  question: string
  cacheSafeParams: CacheSafeParams
}): Promise<SideQuestionResult> {
  // 用指令包装问题，指示不使用工具回答
  const wrappedQuestion = `<system-reminder>这是用户提出的一个附加问题。你必须直接在一个响应中回答这个问题。

重要上下文：
- 你是一个独立的轻量级代理，被派来回答这一个问题
- 主代理不会被中断——它继续在后台独立工作
- 你共享对话上下文，但是一个完全独立的实例
- 不要提及被打断或你"之前在做什么"——这种框架是不正确的

关键约束：
- 你没有可用工具——不能读取文件、运行命令、搜索或采取任何行动
- 这是一次性的响应——不会有后续轮次
- 你只能根据你已从对话上下文中知道的信息提供答案
- 绝不要说"让我试试..."、"我现在..."、"让我检查一下..."，或承诺采取任何行动
- 如果你不知道答案，就说出来——不要提出要去查找或调查

仅用你掌握的信息回答问题。</system-reminder>

${question}`

  const agentResult = await runForkedAgent({
    promptMessages: [createUserMessage({ content: wrappedQuestion })],
    // 不要覆盖 thinkingConfig——思考是 API 缓存键的一部分，
    // 与主线程的配置不同会破坏提示缓存。
    // 快速问答的自适应思考开销可以忽略不计。
    cacheSafeParams,
    canUseTool: async () => ({
      behavior: 'deny' as const,
      message: '附加问题不能使用工具',
      decisionReason: { type: 'other' as const, reason: 'side_question' },
    }),
    querySource: 'side_question',
    forkLabel: 'side_question',
    maxTurns: 1, // 仅限单轮——无工具使用循环
    // 没有未来请求共享此后缀；跳过写入缓存条目。
    skipCacheWrite: true,
  })

  return {
    response: extractSideQuestionResponse(agentResult.messages),
    usage: agentResult.totalUsage,
  }
}

/**
 * 从分叉代理消息中提取显示字符串。
 *
 * 重要：claude.ts 每个内容块生成一个 AssistantMessage，而不是每个 API 响应一个。
 * 启用自适应思考后（从主线程继承以保留缓存键），思考响应到达方式为：
 *   messages[0] = assistant { content: [thinking_block] }
 *   messages[1] = assistant { content: [text_block] }
 *
 * 旧代码使用 `.find(m => m.type === 'assistant')` 获取第一个（仅思考）消息，
 * 未找到文本块，返回 null → "未收到响应"。具有大上下文的仓库（许多技能、大型 CLAUDE.md）
 * 更常触发思考，这就是为什么在 monorepo 中重现而这里没有。
 *
 * 次要失败模式也表现为"未收到响应"：
 *   - 模型尝试 tool_use → content = [thinking, tool_use]，无文本。
 *     罕见——系统提醒通常会阻止这种情况，但这里已处理。
 *   - API 错误耗尽重试 → 查询产生系统 api_error + 用户中断，完全没有助手消息。
 */
function extractSideQuestionResponse(messages: Message[]): string | null {
  // 跨每个块的消息扁平化所有助手内容块。
  const assistantBlocks = messages.flatMap(m =>
    m.type === 'assistant' ? m.message.content : [],
  )

  if (assistantBlocks.length > 0) {
    // 连接所有文本块（通常最多一个，但为了安全）。
    const text = extractTextContent(assistantBlocks, '\n\n').trim()
    if (text) return text

    // 无文本——检查模型是否无视指令尝试调用工具。
    const toolUse = assistantBlocks.find(b => b.type === 'tool_use')
    if (toolUse) {
      const toolName = 'name' in toolUse ? toolUse.name : '一个工具'
      return `(模型尝试调用 ${toolName} 而不是直接回答。请尝试重新表述或在主对话中提问。)`
    }
  }

  // 无助手内容——可能是 API 错误耗尽重试。显示第一个系统 api_error 消息，以便用户看到发生了什么。
  const apiErr = messages.find(
    (m): m is SystemAPIErrorMessage =>
      m.type === 'system' && 'subtype' in m && m.subtype === 'api_error',
  )
  if (apiErr) {
    return `(API 错误：${formatAPIError(apiErr.error)})`
  }

  return null
}
