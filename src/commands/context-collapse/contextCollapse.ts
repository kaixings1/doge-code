import { getMessagesAfterCompactBoundary } from '../../utils/messages.js'

export async function call(args: string, context: any): Promise<string> {
  const threshold = args ? parseInt(args.trim()) : 100
  const messages = context?.getAppState?.()?.messages || []
  const collapsedCount = messages.length - getMessagesAfterCompactBoundary(messages, threshold).length

  return `## context-collapse

### 上下文折叠设置
- 折叠阈值: ${threshold} 条消息
- 当前消息数: ${messages.length}
- 可折叠数: ${collapsedCount}

### 操作
- /context-collapse [阈值] - 设置折叠阈值
- /context-collapse - 显示当前设置

### 说明
上下文折叠功能可以减少token消耗，通过折叠较早的消息来压缩上下文窗口。
当消息数量超过阈值时，较早的消息会被自动折叠。

> 上下文折叠已配置。阈值: ${threshold} 条消息`
}
