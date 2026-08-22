import type { Command } from '../../commands.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { Box, Text, useInput } from '../../ink.js'
import * as React from 'react'

// ============================================================================
// 1. 定义真实数据的结构（所有字段必须由外部注入，无任何估算）
// ============================================================================
export interface ContextStats {
  tokensUsed: number         // 已用 token 数（真实值）
  maxTokens: number          // 最大 token 限制（真实值）
  messageCount: number       // 消息总数（真实值）
  toolCalls: number          // 工具调用次数（真实值）
  sessionStart?: number      // 会话开始时间戳（毫秒），若没有则显示“未知”
}
// 默认数据提供者（当真实数据未注入时，返回占位值，不进行任何估算/随机）
function defaultStatsProvider(): ContextStats {
  const g = (global as { [key: string]: unknown }).__CLAUDE_CONTEXT__ || {}
  return {
    tokensUsed: typeof g.tokensUsed === 'number' ? g.tokensUsed : 0,
    maxTokens: typeof g.maxTokens === 'number' ? g.maxTokens : (parseInt(process.env.CLAUDE_CODE_MAX_TOKENS || '0', 10) || 0),
    messageCount: typeof g.messageCount === 'number' ? g.messageCount : (g.messages?.length ?? 0),
    toolCalls: typeof g.toolCalls === 'number' ? g.toolCalls : (g.toolCallCount ?? 0),
    sessionStart: typeof g.sessionStart === 'number' ? g.sessionStart : undefined,
  }
}
// 可替换的外部统计提供者（用于接入真实数据）
let statsProvider: () => ContextStats = defaultStatsProvider
// 允许外部代码注入真实数据获取逻辑
export function setContextStatsProvider(provider: () => ContextStats) {
  statsProvider = provider
}
// ============================================================================
// 2. 获取并处理真实数据（仅依赖注入的真实值，无任何虚拟生成）
// ============================================================================
function getRealContextInfo() {
  const stats = statsProvider()
  const { tokensUsed, maxTokens, messageCount, toolCalls, sessionStart } = stats
  // 只有 maxTokens > 0 时才计算百分比，否则显示 0
  const usagePercent = maxTokens > 0 ? (tokensUsed / maxTokens) * 100 : 0
  // 进度条（基于真实使用率）
  const barLength = 30
  const filledLength = Math.min(Math.floor((usagePercent / 100) * barLength), barLength)
  const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength)
  // 状态判断（基于真实使用率）
  const status = usagePercent > 80 ? 'critical' : usagePercent > 60 ? 'warning' : 'good'
  // 会话时长（仅当有真实 sessionStart 时计算，否则返回 undefined）
  let sessionDurationMinutes: number | undefined
  if (sessionStart && sessionStart > 0) {
    sessionDurationMinutes = Math.floor((Date.now() - sessionStart) / 1000 / 60)
  }
  return {
    tokensUsed,
    maxTokens,
    usagePercent,
    messageCount,
    toolCalls,
    bar,
    status,
    sessionDurationMinutes,
    hasSessionStart: !!sessionStart,
  }
}
// ============================================================================
// 3. React 组件（包含所有原有 UI 元素，无虚拟数据，缺失字段显示“未知”）
// ============================================================================
export const call: LocalJSXCommandCall = async () => {
  if ((args || '').trim() === 'help' || (args || '').trim() === '--help' || (args || '').trim() === '-h') {
    return { output: `ctx_viz — 显示上下文使用情况（Token、消息数、工具调用、会话时长）\n用法: /ctx_viz`.trim(), truncated: false }
  }
  const [refreshKey, setRefreshKey] = React.useState(0)
  // 自动刷新（每 5 秒）
  React.useEffect(() => {
    const interval = setInterval(() => {
      setRefreshKey(k => k + 1)
    }, 5000)
    return () => clearInterval(interval)
  }, [])
  // 手动刷新：按任意键
  useInput(() => {
    setRefreshKey(k => k + 1)
  })
  // 每次 refreshKey 变化时重新读取最新真实数据
  const ctx = getRealContextInfo()

  const statusColor = ctx.status === 'critical' ? 'red' : ctx.status === 'warning' ? 'yellow' : 'green'
  const statusText = ctx.status === 'critical' ? '⚠️ 接近限制' : ctx.status === 'warning' ? '⚡ 使用较高' : '✓ 正常'
  // 辅助函数：格式化数值，若为 0 且对应的配置/来源可能缺失则显示“未知”
  const formatTokenUsed = () => {
    if (ctx.tokensUsed === 0 && ctx.maxTokens === 0) return '未知'
    return ctx.tokensUsed.toLocaleString()
  }
  const formatMaxTokens = () => {
    if (ctx.maxTokens === 0) return '未知'
    return ctx.maxTokens.toLocaleString()
  }
  const formatMessageCount = () => {
    // 如果 messageCount 为 0 且没有真实消息来源（可通过外部判断），可显示“未知”
    // 这里简单处理：若为 0 且 maxTokens 也为 0（表示未接入数据），则显示“未知”
    if (ctx.messageCount === 0 && ctx.maxTokens === 0) return '未知'
    return ctx.messageCount.toLocaleString()
  }
  const formatToolCalls = () => {
    if (ctx.toolCalls === 0 && ctx.maxTokens === 0) return '未知'
    return ctx.toolCalls.toLocaleString()
  }
  const formatSessionDuration = () => {
    if (!ctx.hasSessionStart || ctx.sessionDurationMinutes === undefined) return '未知'
    return `${ctx.sessionDurationMinutes} 分钟`
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>📊 上下文可视化</Text>
      {/* Token 使用 + 进度条 */}
      <Box marginTop={1} flexDirection="column">
        <Text>Token 使用: </Text>
        <Text color={statusColor}>
          {formatTokenUsed()} / {formatMaxTokens()}
        </Text>
        {ctx.maxTokens > 0 ? (
          <Box marginTop={0}>
            <Text color={statusColor}>{ctx.bar}</Text>
            <Text> {Math.round(ctx.usagePercent)}%</Text>
          </Box>
        ) : (
          <Box marginTop={0}>
            <Text dimColor>（未配置 token 限制，无法显示进度条）</Text>
          </Box>
        )}
      </Box>
      {/* 消息数量 */}
      <Box marginTop={1}>
        <Text>消息数量: {formatMessageCount()}</Text>
      </Box>
      {/* 工具调用 */}
      <Box marginTop={0}>
        <Text>工具调用: {formatToolCalls()}</Text>
      </Box>
      {/* 会话时长（保留原有 UI，无数据则显示“未知”） */}
      <Box marginTop={0}>
        <Text>会话时长: {formatSessionDuration()}</Text>
      </Box>
      {/* 状态及建议 */}
        <Box marginTop={1}>
        <Text color={statusColor}>状态: {statusText}</Text>
      </Box>
      {ctx.usagePercent > 80 && (
        <Box marginTop={1}>
          <Text color="yellow">💡 提示: Token 使用较高，可考虑 /compact 压缩上下文</Text>
        </Box>
      )}
      {/* 刷新提示 */}
      <Box marginTop={1}>
        <Text dimColor>(每 5 秒自动刷新 | 按任意键手动刷新)</Text>
      </Box>
    </Box>
  )
}

// ============================================================================
// 4. 命令定义
// ============================================================================
const ctxViz = {
  type: 'local-jsx',
  name: 'ctx_viz',
  description: '显示上下文使用情况（Token、消息数、工具调用、会话时长）',
  aliases: ['context-viz', 'ctx'],
  load: () => Promise.resolve({ call }),
} satisfies Command

export default ctxViz