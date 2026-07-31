/**
 * LogViewer — 结构化日志查看器
 *
 * 功能：
 * - 日志级别过滤（debug/info/warn/error）
 * - 日志搜索 + 正则过滤
 * - 日志导出
 * - 实时日志流模拟
 * - 日志统计
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import type { ThemeColors } from '../theme.js'

export interface LogEntry {
  id: string
  timestamp: string
  level: 'debug' | 'info' | 'warn' | 'error'
  source: string
  message: string
  data?: unknown
}

interface LogViewerProps {
  cwd: string
  theme: ThemeColors
  onClose?: () => void
}

type LogFilter = 'all' | 'debug' | 'info' | 'warn' | 'error'

const LEVEL_COLORS: Record<string, string> = {
  debug: '#64B5F6',
  info: '#81C784',
  warn: '#FFB74D',
  error: '#FF6B6B',
}

const LEVEL_LABELS: Record<string, string> = {
  debug: '调试',
  info: '信息',
  warn: '警告',
  error: '错误',
}

function generateMockLogs(count: number): LogEntry[] {
  const sources = ['main', 'renderer', 'engine', 'tool-executor', 'ipc', 'fs', 'network', 'git']
  const levels: Array<'debug' | 'info' | 'warn' | 'error'> = ['debug', 'info', 'info', 'info', 'warn', 'warn', 'error']
  const messages: Record<string, string[]> = {
    main: ['应用启动', '配置加载完成', '窗口创建成功', '进程初始化'],
    renderer: ['UI 渲染完成', '组件挂载', '状态更新', '事件处理'],
    engine: ['消息循环启动', '工具调度完成', '状态机转换', '查询引擎就绪'],
    'tool-executor': ['BashTool 执行完成', 'FileReadTool 读取成功', '工具执行超时', '工具执行失败'],
    ipc: ['IPC 消息发送', 'IPC 消息接收', '通道建立', '连接断开'],
    fs: ['文件读取成功', '文件写入完成', '目录遍历', '文件不存在'],
    network: ['HTTP 请求完成', 'WebSocket 连接', '网络超时', 'DNS 解析失败'],
    git: ['Git 状态刷新', '文件暂存成功', '提交完成', '分支切换'],
  }

  const logs: LogEntry[] = []
  const now = Date.now()

  for (let i = 0; i < count; i++) {
    const source = sources[Math.floor(Math.random() * sources.length)]
    const level = levels[Math.floor(Math.random() * levels.length)]
    const sourceMessages = messages[source] || ['日志消息']
    const message = sourceMessages[Math.floor(Math.random() * sourceMessages.length)]

    logs.push({
      id: `log-${i}`,
      timestamp: new Date(now - i * 1000).toISOString(),
      level,
      source,
      message: `[${source}] ${message}`,
    })
  }

  return logs
}

export function LogViewer({ cwd, theme, onClose }: LogViewerProps): JSX.Element {
  const c = theme
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<LogFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [useRegex, setUseRegex] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [maxLogs, setMaxLogs] = useState(100)
  const [message, setMessage] = useState('')

  const loadLogs = useCallback(() => {
    setLoading(true)
    try {
      // 生成模拟日志（实际应用中可以从 IPC 获取真实日志）
      const mockLogs = generateMockLogs(maxLogs)
      setLogs(mockLogs)
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [maxLogs])

  useEffect(() => { loadLogs() }, [loadLogs])

  // 过滤日志
  const filteredLogs = useMemo(() => {
    let result = logs

    // 级别过滤
    if (filter !== 'all') {
      result = result.filter(log => log.level === filter)
    }

    // 搜索过滤
    if (searchQuery.trim()) {
      try {
        if (useRegex) {
          const regex = new RegExp(searchQuery, 'i')
          result = result.filter(log => regex.test(log.message))
        } else {
          const query = searchQuery.toLowerCase()
          result = result.filter(log => log.message.toLowerCase().includes(query))
        }
      } catch {
        // 正则表达式无效，忽略过滤
      }
    }

    return result
  }, [logs, filter, searchQuery, useRegex])

  // 日志统计
  const stats = useMemo(() => {
    const counts = { debug: 0, info: 0, warn: 0, error: 0 }
    logs.forEach(log => { counts[log.level]++ })
    return counts
  }, [logs])

  const exportLogs = useCallback(() => {
    const content = filteredLogs.map(log =>
      `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}`
    ).join('\n')

    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `logs-${new Date().toISOString().replace(/[:.]/g, '-')}.log`
    a.click()
    URL.revokeObjectURL(url)
    setMessage('✅ 日志已导出')
  }, [filteredLogs])

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    fontSize: '11px',
    maxHeight: '600px',
    overflow: 'auto',
  }

  const cardStyle: React.CSSProperties = {
    padding: '8px',
    border: `1px solid ${c.border}`,
    borderRadius: '4px',
    background: c.bgAlt,
  }

  const buttonStyle: React.CSSProperties = {
    padding: '4px 10px',
    border: `1px solid ${c.border}`,
    borderRadius: '3px',
    background: c.bgAlt,
    color: c.text,
    cursor: 'pointer',
    fontSize: '11px',
  }

  const primaryButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    background: c.accent,
    color: '#000',
    border: 'none',
    fontWeight: 600,
  }

  const inputStyle: React.CSSProperties = {
    padding: '4px 6px',
    border: `1px solid ${c.border}`,
    borderRadius: '3px',
    background: c.bgPanel,
    color: c.text,
    fontSize: '11px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  }

  if (loading) {
    return <div style={{ ...containerStyle, padding: '12px', color: c.textMuted }}>加载日志...</div>
  }

  return (
    <div style={containerStyle}>
      {/* 统计概览 */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <span style={{ fontWeight: 600, fontSize: '12px' }}>📋 日志查看器</span>
          <div style={{ display: 'flex', gap: '4px' }}>
            <button onClick={loadLogs} style={{ ...buttonStyle, fontSize: '10px' }}>🔄 刷新</button>
            <button onClick={exportLogs} style={{ ...buttonStyle, fontSize: '10px' }}>📥 导出</button>
          </div>
        </div>

        {/* 日志统计 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', fontSize: '10px', marginBottom: '8px' }}>
          <div style={{ padding: '4px', background: c.bgPanel, borderRadius: '3px', textAlign: 'center', cursor: 'pointer', border: filter === 'debug' ? `1px solid ${LEVEL_COLORS.debug}` : '1px solid transparent' }} onClick={() => setFilter(filter === 'debug' ? 'all' : 'debug')}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: LEVEL_COLORS.debug }}>{stats.debug}</div>
            <div style={{ color: c.textMuted }}>调试</div>
          </div>
          <div style={{ padding: '4px', background: c.bgPanel, borderRadius: '3px', textAlign: 'center', cursor: 'pointer', border: filter === 'info' ? `1px solid ${LEVEL_COLORS.info}` : '1px solid transparent' }} onClick={() => setFilter(filter === 'info' ? 'all' : 'info')}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: LEVEL_COLORS.info }}>{stats.info}</div>
            <div style={{ color: c.textMuted }}>信息</div>
          </div>
          <div style={{ padding: '4px', background: c.bgPanel, borderRadius: '3px', textAlign: 'center', cursor: 'pointer', border: filter === 'warn' ? `1px solid ${LEVEL_COLORS.warn}` : '1px solid transparent' }} onClick={() => setFilter(filter === 'warn' ? 'all' : 'warn')}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: LEVEL_COLORS.warn }}>{stats.warn}</div>
            <div style={{ color: c.textMuted }}>警告</div>
          </div>
          <div style={{ padding: '4px', background: c.bgPanel, borderRadius: '3px', textAlign: 'center', cursor: 'pointer', border: filter === 'error' ? `1px solid ${LEVEL_COLORS.error}` : '1px solid transparent' }} onClick={() => setFilter(filter === 'error' ? 'all' : 'error')}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: LEVEL_COLORS.error }}>{stats.error}</div>
            <div style={{ color: c.textMuted }}>错误</div>
          </div>
        </div>

        {/* 搜索和过滤 */}
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜索日志..."
            style={{ ...inputStyle, flex: 1 }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '10px', color: c.textMuted, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={useRegex} onChange={e => setUseRegex(e.target.checked)} />
            正则
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '10px', color: c.textMuted, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} />
            自动滚动
          </label>
          <select value={maxLogs} onChange={e => setMaxLogs(Number(e.target.value))} style={{ ...inputStyle, width: '80px' }}>
            <option value="50">50条</option>
            <option value="100">100条</option>
            <option value="200">200条</option>
            <option value="500">500条</option>
          </select>
        </div>
      </div>

      {/* 日志列表 */}
      <div style={cardStyle}>
        <div style={{ fontWeight: 600, marginBottom: '6px', fontSize: '12px' }}>
          日志流 ({filteredLogs.length} 条{filter !== 'all' ? ` | ${LEVEL_LABELS[filter]}` : ''})
        </div>
        <div style={{
          fontFamily: 'monospace',
          fontSize: '10px',
          maxHeight: '400px',
          overflow: 'auto',
          background: c.bgPanel,
          borderRadius: '3px',
          padding: '4px',
        }}>
          {filteredLogs.length === 0 ? (
            <div style={{ color: c.textMuted, padding: '8px', textAlign: 'center' }}>暂无日志</div>
          ) : (
            filteredLogs.map(log => (
              <div key={log.id} style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '6px',
                padding: '2px 4px',
                borderBottom: '1px solid ' + c.border + '11',
                lineHeight: '1.4',
              }}>
                <span style={{ color: c.textFaint, fontSize: '9px', whiteSpace: 'nowrap', minWidth: '80px' }}>
                  {new Date(log.timestamp).toLocaleTimeString('zh-CN', { hour12: false })}
                </span>
                <span style={{
                  fontSize: '9px',
                  fontWeight: 600,
                  color: LEVEL_COLORS[log.level],
                  minWidth: '32px',
                  textTransform: 'uppercase',
                }}>
                  {log.level}
                </span>
                <span style={{ color: c.text, flex: 1, wordBreak: 'break-word' }}>
                  {log.message}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 消息 */}
      {message && (
        <div style={{
          padding: '4px 8px',
          borderRadius: '3px',
          fontSize: '10px',
          background: message.startsWith('✅') ? '#81C78422' : '#ef535022',
          color: message.startsWith('✅') ? '#81C784' : '#FF6B6B',
        }}>
          {message}
        </div>
      )}

      {/* 关闭按钮 */}
      {onClose && (
        <div style={{ textAlign: 'right' }}>
          <button onClick={onClose} style={{ ...buttonStyle, color: c.textMuted }}>关闭</button>
        </div>
      )}
    </div>
  )
}
