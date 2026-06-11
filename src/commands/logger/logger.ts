import type { LocalJSXCommandCall } from '../../types/command.js'
import React from 'react'

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  const parts = args.trim().split(/\s+/)
  const level = parts[0]?.toLowerCase() || 'all'
  const limit = parseInt(parts[1]) || 100

  onDone('正在读取日志文件...')

  // 模拟日志数据
  const logLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR']
  const logSources = ['app', 'database', 'network', 'auth', 'cache', 'api']
  const logMessages = [
    'Application started successfully',
    'Database connection established',
    'User authentication successful',
    'Cache miss for key: user_profile_123',
    'API request processed in 45ms',
    'Memory usage above threshold',
    'Failed to connect to external service',
    'Scheduled task completed',
    'Configuration file loaded',
    'Request timeout after 30 seconds'
  ]

  const mockLogs = []
  const now = Date.now()

  for (let i = 0; i < limit; i++) {
    const timestamp = new Date(now - Math.random() * 86400000)
    const logLevel = logLevels[Math.floor(Math.random() * logLevels.length)]
    const source = logSources[Math.floor(Math.random() * logSources.length)]
    const message = logMessages[Math.floor(Math.random() * logMessages.length)]
    const traceId = Math.random().toString(36).substr(2, 9)

    if (level === 'all' || logLevel.toLowerCase() === level) {
      mockLogs.push({
        timestamp: timestamp.toISOString(),
        level: logLevel,
        source: source,
        message: message,
        traceId: traceId,
        pid: Math.floor(Math.random() * 1000) + 1000
      })
    }
  }

  // Sort by timestamp descending
  mockLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  const levelCounts = {
    DEBUG: mockLogs.filter(l => l.level === 'DEBUG').length,
    INFO: mockLogs.filter(l => l.level === 'INFO').length,
    WARN: mockLogs.filter(l => l.level === 'WARN').length,
    ERROR: mockLogs.filter(l => l.level === 'ERROR').length
  }

  let resultText = '日志级别: ' + level.toUpperCase() + '\n' +
    '显示条数: ' + mockLogs.length + '\n\n' +
    '日志统计:\n' +
    `  DEBUG: ${levelCounts.DEBUG}\n` +
    `  INFO:  ${levelCounts.INFO}\n` +
    `  WARN:  ${levelCounts.WARN}\n` +
    `  ERROR: ${levelCounts.ERROR}\n\n` +
    '日志详情:\n\n'

  resultText += mockLogs.map(log =>
    `${log.timestamp} [${log.level.padEnd(5)}] [${log.source.padEnd(10)}] [PID:${log.pid}] [${log.traceId}] ${log.message}`
  ).join('\n')

  onDone('## 日志查看器\n\n级别: ' + level.toUpperCase() + '\n条数: ' + mockLogs.length)

  return React.createElement('div', null,
    React.createElement('h2', null, '日志查看器'),
    React.createElement('p', null, '级别: ' + level.toUpperCase()),
    React.createElement('p', null, '显示条数: ' + mockLogs.length),
    React.createElement('div', { style: {
      display: 'flex',
      gap: '1rem',
      marginBottom: '1rem'
    }},
      React.createElement('span', { style: { color: '#666' } }, `DEBUG: ${levelCounts.DEBUG}`),
      React.createElement('span', { style: { color: '#2196F3' } }, `INFO: ${levelCounts.INFO}`),
      React.createElement('span', { style: { color: '#FF9800' } }, `WARN: ${levelCounts.WARN}`),
      React.createElement('span', { style: { color: '#F44336' } }, `ERROR: ${levelCounts.ERROR}`)
    ),
    React.createElement('h3', null, '日志详情'),
    React.createElement('pre', { style: { fontSize: '0.875rem' } },
      React.createElement('code', null, resultText)
    )
  )
}
