import type { Command, LocalCommandCall } from '../types/command.js'
import { getIsNonInteractiveSession } from '../bootstrap/state.js'

const call: LocalCommandCall = async (_args, context) => {
  const { messages, config } = context
  const userMsgs = messages.filter(m => m.type === 'user')
  const assistantMsgs = messages.filter(m => m.type === 'assistant')
  const toolCalls = messages.flatMap(m =>
    m.type === 'assistant' && m.tool_calls ? m.tool_calls : []
  )

  return {
    type: 'text',
    value: [
      '🔥 Torch 模式已激活',
      '',
      '━━━ 会话统计 ━━━',
      `消息总数: ${messages.length}`,
      `用户消息: ${userMsgs.length}`,
      `助手回复: ${assistantMsgs.length}`,
      `工具调用: ${toolCalls.length}`,
      '',
      'Torch 模式特点:',
      '• 最大化 AI 推理深度与创造性',
      '• 自动启用高级思维链分析',
      '• 更激进的代码优化建议',
      '• 深度架构分析与设计评审',
      '',
      '提示：Torch 模式适用于复杂架构设计、深度代码审查和创新性问题解决。',
    ].join('\n'),
  }
}

const torch: Command = {
  type: 'local',
  name: 'torch',
  description: 'Torch 模式 — 最大化 AI 推理深度与创造性',
  isEnabled: () => !getIsNonInteractiveSession(),
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
}

export default torch
