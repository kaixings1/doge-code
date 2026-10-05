import { createSystemMessage, createUserMessage } from '../utils/messages.js'
import { logEvent } from '../services/analytics/index.js'

/**
 * 处理模型返回空内容的情况
 * 生成警告消息和用户选择提示
 *
 * 判定范围说明：
 * 流式响应中每个 content_block_stop 都会独立产出一条 assistant 消息（见
 * claude.ts 的 content_block_stop 分支），因此「最后一条消息」只承载分割后的
 * 单个内容块。若只看它，会把「尾块是单个空格/句末残留」的完整回答误判为空。
 * 故判定必须覆盖本轮 allMessages 的全部内容块。
 *
 * @param lastMessage 最后一条 assistant 消息（用于取 stop_reason / usage）
 * @param allMessages 本轮全部 assistant 消息（可选，用于合并判定内容）
 */
export function handleEmptyContentResponse(
  lastMessage: any,
  queryChainId: string,
  queryDepth: number,
  allMessages?: any[],
) {
  const sourceMessages =
    Array.isArray(allMessages) && allMessages.length > 0 ? allMessages : [lastMessage]
  const allBlocks = sourceMessages.flatMap((msg: any) =>
    Array.isArray(msg?.message?.content) ? msg.message.content : [],
  )
  const hasContent = allBlocks.length > 0
  const hasTextContent =
    hasContent &&
    allBlocks.some(
      (block: any) => block.type === 'text' && block.text && block.text.trim().length > 0,
    )
  const hasToolUse = hasContent && allBlocks.some((block: any) => block.type === 'tool_use')

  // 如果既没有文本内容也没有工具调用，说明模型返回了空响应
  if (!hasTextContent && !hasToolUse) {
    const finishReason = lastMessage.message?.stop_reason || 'unknown'
    const usage = lastMessage.message?.usage

    logEvent('tengu_empty_content_detected', {
      has_finish_reason: !!finishReason,
      content_blocks_count: allBlocks.length || 0,
      has_usage: !!usage,
      has_query_chain_id: !!queryChainId,
      query_depth: queryDepth,
    })

    // 向用户显示警告信息
    const emptyContentWarning = createSystemMessage(
      `⚠️ 模型返回了空内容（停止原因: ${finishReason}）。这可能是模型暂时错误、内容被过滤或其他问题。`,
      'warning',
    )

    // 创建用户选择提示
    const choicePrompt = createUserMessage({
      content: [
        '模型返回了空内容。您可以：',
        '',
        '• 输入 "r" 或 "retry" - 重试当前请求',
        '• 输入其他内容 - 取消重试，发送新的请求',
        '• 按 Ctrl+C - 中断对话',
        '',
        '请选择您的操作：',
      ].join('\n'),
      isMeta: true,
    })

    return {
      isEmptyContent: true,
      finishReason,
      warnings: [emptyContentWarning, choicePrompt],
    }
  }

  return {
    isEmptyContent: false,
  }
}
