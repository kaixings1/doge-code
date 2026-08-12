import type { Command } from '../../commands.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { Box, Text, useInput } from '../../ink.js'
import * as React from 'react'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

// ============================================================================
// 类型定义：追踪条目（完全真实）
// ============================================================================
interface TraceEntry {
  timestamp: string
  sessionId: string
  userType: string
  cwd: string
  nodeVersion: string
  platform: string
  memoryUsage: { rss: number }
}
// 日志文件配置（真实路径）
const TRACE_DIR = path.join(os.homedir(), '.doge')
const TRACE_FILE = path.join(TRACE_DIR, 'trace.log')
const MAX_LINES = 10000
// ============================================================================
// 真实数据获取函数（直接从文件系统读取，无虚拟）
// ============================================================================
async function getTraceStats() {
  try {
    await fs.mkdir(TRACE_DIR, { recursive: true })
    const content = await fs.readFile(TRACE_FILE, 'utf-8').catch(() => '')
    const lines = content.split('\n').filter(l => l.trim())
    const entries: TraceEntry[] = lines.map(line => {
      try {
        return JSON.parse(line) as TraceEntry
      } catch {
        return null
      }
    }).filter((e): e is TraceEntry => e !== null)
    // 统计信息
    const totalEntries = entries.length
    const fileSize = content.length // 字节
    const lastEntry = entries[entries.length - 1]
    const uniqueSessions = new Set(entries.map(e => e.sessionId)).size
    const uniqueUserTypes = new Set(entries.map(e => e.userType)).size
    // 最近 5 条记录（用于展示）
    const recentEntries = entries.slice(-5).reverse()
    return {
      totalEntries,
      fileSize,
      lastEntry,
      uniqueSessions,
      uniqueUserTypes,
      recentEntries,
      hasData: totalEntries > 0,
    }
  } catch (err) {
    console.error('读取追踪日志失败:', err)
    return {
      totalEntries: 0,
      fileSize: 0,
      lastEntry: null,
      uniqueSessions: 0,
      uniqueUserTypes: 0,
      recentEntries: [],
      hasData: false,
    }
  }
}
// ============================================================================
// 写入当前追踪记录（保留原功能）
// ============================================================================
async function writeCurrentTrace() {
  const now = new Date()
  const sessionId = process.env.CLAUDE_CODE_SESSION_ID || 'unknown'
  const userType = process.env.USER_TYPE || 'ant'
  const traceEntry: TraceEntry = {
    timestamp: now.toISOString(),
    sessionId,
    userType,
    cwd: process.cwd(),
    nodeVersion: process.version,
    platform: process.platform,
    memoryUsage: process.memoryUsage(),
  }

  try {
    await fs.mkdir(TRACE_DIR, { recursive: true })
    const logLine = JSON.stringify(traceEntry) + '\n'
    await fs.appendFile(TRACE_FILE, logLine, 'utf-8')
    // 保留最近 MAX_LINES 行
    const content = await fs.readFile(TRACE_FILE, 'utf-8')
    const lines = content.split('\n').filter(l => l.trim())
    if (lines.length > MAX_LINES) {
      const keepLines = lines.slice(-MAX_LINES)
      await fs.writeFile(TRACE_FILE, keepLines.join('\n') + '\n', 'utf-8')
    }
    return { success: true, entry: traceEntry }
  } catch (err) {
    console.error('写入追踪日志失败:', err)
    return { success: false, entry: traceEntry }
  }
}
// ============================================================================
// React 组件（支持自动刷新、手动刷新、展示历史统计）
// ============================================================================
export const call: LocalJSXCommandCall = async () => {
  // 首先写入当前追踪记录
  const writeResult = await writeCurrentTrace()
  const [refreshKey, setRefreshKey] = React.useState(0)
  // 自动刷新（每 5 秒重新读取日志文件）
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
  // 每次刷新时重新读取统计信息
  const [stats, setStats] = React.useState<Awaited<ReturnType<typeof getTraceStats>>>({
    totalEntries: 0,
    fileSize: 0,
    lastEntry: null,
    uniqueSessions: 0,
    uniqueUserTypes: 0,
    recentEntries: [],
    hasData: false,
  })
  React.useEffect(() => {
    getTraceStats().then(setStats)
  }, [refreshKey])
  // 格式化文件大小
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }
  // 当前写入的追踪信息（如果有）
  const currentEntry = writeResult.success ? writeResult.entry : null
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold> ANT 追踪面板</Text>
      {/* 当前会话追踪记录 */}
      <Box marginTop={1} flexDirection="column">
        <Text bold>📌 本次追踪记录</Text>
        {currentEntry ? (
          <>
            <Text>时间: {currentEntry.timestamp}</Text>
            <Text>会话: {currentEntry.sessionId.slice(0, 16)}...</Text>
            <Text>类型: {currentEntry.userType}</Text>
            <Text>工作目录: {currentEntry.cwd}</Text>
            <Text>内存 (RSS): {Math.round(currentEntry.memoryUsage.rss / 1024 / 1024)} MB</Text>
          </>
        ) : (
          <Text color="red">写入失败，请检查权限</Text>
        )}
      </Box>
      {/* 历史统计摘要 */}
      <Box marginTop={1} flexDirection="column">
        <Text bold>📊 历史统计（来自 ~/.doge/trace.log）</Text>
        {stats.hasData ? (
          <>
            <Text>总记录数: {stats.totalEntries.toLocaleString()}</Text>
            <Text>日志文件大小: {formatFileSize(stats.fileSize)}</Text>
            <Text>独立会话数: {stats.uniqueSessions}</Text>
            <Text>用户类型种类: {stats.uniqueUserTypes}</Text>
            {stats.lastEntry && (
              <Text>最后记录时间: {stats.lastEntry.timestamp}</Text>
            )}
          </>
        ) : (
          <Text dimColor>暂无历史追踪数据</Text>
        )}
      </Box>
      {/* 最近 5 条追踪记录（如果存在） */}
      {stats.recentEntries.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text bold>⏱ 最近追踪记录（最新5条）</Text>
          {stats.recentEntries.map((entry, idx) => (
            <Box key={idx} marginTop={0} flexDirection="column">
              <Text dimColor>
                {entry.timestamp} | {entry.userType} | {entry.cwd.split('/').pop() || entry.cwd}
              </Text>
            </Box>
          ))}
        </Box>
      )}
      {/* 写入状态 */}
      <Box marginTop={1}>
        <Text color={writeResult.success ? 'green' : 'red'}>
          {writeResult.success ? '✓ 追踪记录已写入日志文件' : '✗ 写入失败，请检查日志目录权限'}
        </Text>
      </Box>
      {/* 刷新提示 */}
      <Box marginTop={1}>
        <Text dimColor>(每 5 秒自动刷新统计 | 按任意键手动刷新)</Text>
      </Box>
    </Box>
  )
}

// ============================================================================
// 命令定义
// ============================================================================
const antTrace = {
  type: 'local-jsx',
  name: 'ant-trace',
  description: 'ANT 调试追踪面板：记录当前会话并展示历史统计',
  aliases: ['trace', 'ant'],
  load: () => Promise.resolve({ call }),
} satisfies Command

export default antTrace
