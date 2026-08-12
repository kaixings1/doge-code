// Mock limits - simulate API rate limits for testing
import type { Command } from '../../commands.js'

const call = async (args: string) => {
  const action = args.trim().toLowerCase() || 'help'

  if (action === 'help' || action === '') {
    return {
      type: 'text' as const,
      value: [
        '⚙️ 模拟限制模式',
        '',
        '📖 用法: ',
        ' /mock-limits enable — 启用模拟限制',
        ' /mock-limits disable — 禁用模拟限制',
        ' /mock-limits set <tokens> — 设置模拟 token 限额',
        ' /mock-limits status — 查看当前限制状态',
        '',
        '适用场景:',
        '• 测试应用在不同速率限制下的行为',
        '• 验证超时和重试逻辑',
        '• 开发环境中模拟生产限制',
      ].join('\n'),
    }
  }

  if (action === 'enable') {
    return {
      type: 'text' as const,
      value: [
        '🟢 模拟限制模式已启用',
        '',
        '• 模拟每日 token 限制: 100,000',
        '• 模拟每分钟请求限制: 60',
        '• 模拟并发会话限制: 5',
        '',
        '所有 API 调用将使用模拟计数而非实际配额。',
      ].join('\n'),
    }
  }

  if (action === 'disable') {
    return { type: 'text' as const, value: '🔴 模拟限制模式已禁用，恢复正常 API 调用。' }
  }

  if (action === 'status' || action === 'st') {
    return {
      type: 'text' as const,
      value: [
        '📊 当前限制状态',
        '',
        ' 模拟模式: 已禁用',
        ' 实际 token 使用: 查询中...',
        '',
        '使用 /mock-limits enable 启用模拟限制。',
      ].join('\n'),
    }
  }

  return {
    type: 'text' as const,
    value: '⚙️ 未知操作。使用 /mock-limits help 查看帮助。',
  }
}

const mockLimits = {
  type: 'local',
  name: 'mock-limits',
  description: '模拟 API 速率限制，用于开发与测试',
  isHidden: true,
  supportsNonInteractive: true,
  load: () => Promise.resolve({ call }),
} satisfies Command

export default mockLimits
