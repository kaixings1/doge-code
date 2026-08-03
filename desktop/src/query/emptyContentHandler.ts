import { createSystemMessage, createUserMessage } from '../utils/messages.js'
import { logEvent } from '../services/analytics/index.js'

/**
 * 处理模型返回空内容的情况
 * 生成警告消息和用户选择提示
 */
export function handleEmptyContentResponse(
  lastMessage: any,
  queryChainId: string,
  queryDepth: number,
) {
  const contentBlocks = lastMessage.message?.content
  const hasContent = Array.isArray(contentBlocks) && contentBlocks.length > 0
  const hasTextContent = hasContent && contentBlocks.some(
    (block: any) => block.type === 'text' && block.text && block.text.trim().length > 0
  )
  const hasToolUse = hasContent && contentBlocks.some((block: any) => block.type === 'tool_use')

  // 如果既没有文本内容也没有工具调用，说明模型返回了空响应
  if (!hasTextContent && !hasToolUse) {
    const finishReason = lastMessage.message?.stop_reason || 'unknown'
    const usage = lastMessage.message?.usage
    
    logEvent('tengu_empty_content_detected', {
      finish_reason: finishReason,
      content_blocks_count: contentBlocks?.length || 0,
      usage: usage ? JSON.stringify(usage) : 'none',
      queryChainId,
      queryDepth,
    })

    // 向用户显示警告信息
    const emptyContentWarning = createSystemMessage(
      `⚠️ 模型返回了空内容（停止原因: ${finishReason}）。这可能是模型暂时错误、内容被过滤或其他问题。`,
      'warning'
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
        '请选择您的操作：'
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
