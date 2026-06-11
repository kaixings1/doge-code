import * as React from 'react'
import type { LocalJSXCommandCall } from '../../types/command.js'

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  const parts = args.trim().split(/\s+/)
  const operation = parts[0]?.toLowerCase() || 'status'
  const cacheType = parts[1]?.toLowerCase() || 'all'

  onDone('正在处理缓存操作: ' + operation + '...')
  // 模拟缓存数据
  const mockCaches = {
    session: {
      name: '会话缓存',
      type: 'session',
      status: 'active',
      size: Math.floor(Math.random() * 100) + 50, // 50-150 MB
      maxSize: 500, // MB
      entries: Math.floor(Math.random() * 500) + 200, // 200-700 entries
      hitRate: (Math.random() * 20 + 75).toFixed(1), // 75-95%
      lastCleared: new Date(Date.now() - Math.random() * 86400000).toISOString()
    },
    model: {
      name: '模型响应缓存',
      type: 'model',
      status: 'active',
      size: Math.floor(Math.random() * 200) + 100, // 100-300 MB
      maxSize: 1000, // MB
      entries: Math.floor(Math.random() * 1000) + 500, // 500-1500 entries
      hitRate: (Math.random() * 15 + 80).toFixed(1), // 80-95%
      lastCleared: new Date(Date.now() - Math.random() * 172800000).toISOString()
    },
    vector: {
      name: '向量缓存',
      type: 'vector',
      status: 'active',
      size: Math.floor(Math.random() * 500) + 200, // 200-700 MB
      maxSize: 2000, // MB
      entries: Math.floor(Math.random() * 2000) + 1000, // 1000-3000 entries
      hitRate: (Math.random() * 10 + 85).toFixed(1), // 85-95%
      lastCleared: new Date(Date.now() - Math.random() * 604800000).toISOString()
    },
    file: {
      name: '文件缓存',
      type: 'file',
      status: Math.random() > 0.2 ? 'active' : 'inactive',
      size: Math.floor(Math.random() * 300) + 100, // 100-400 MB
      maxSize: 1000, // MB
      entries: Math.floor(Math.random() * 800) + 300, // 300-1100 entries
      hitRate: (Math.random() * 25 + 60).toFixed(1), // 60-85%
      lastCleared: new Date(Date.now() - Math.random() * 259200000).toISOString()
    }
  }
  let resultText = ''
  let totalSize = 0
  let totalMaxSize = 0
  let totalEntries = 0
  Object.values(mockCaches).forEach(cache => {
    totalSize += cache.size
    totalMaxSize += cache.maxSize
    totalEntries += cache.entries
  })

  switch (operation) {
    case 'status':
      const targetCaches = cacheType === 'all'
        ? Object.values(mockCaches)
        : Object.values(mockCaches).filter(c => c.type === cacheType)
      resultText = `缓存状态 - ${cacheType.toUpperCase()}\n\n` +
        `总缓存大小: ${totalSize} MB / ${totalMaxSize} MB (${((totalSize/totalMaxSize)*100).toFixed(1)}%)\n` +
        `总缓存条目: ${totalEntries.toLocaleString()}\n\n` +
        `缓存详情:\n\n` +
        targetCaches.map(cache =>
          `  ${cache.name}\n` +
          `    状态: ${cache.status}\n` +
          `    大小: ${cache.size} MB / ${cache.maxSize} MB\n` +
          `    条目: ${cache.entries.toLocaleString()}\n` +
          `    命中率: ${cache.hitRate}%\n` +
          `    上次清理: ${new Date(cache.lastCleared).toLocaleString()}\n`
        ).join('\n') + '\n' +
        `\n命令:\n` +
        `  /cache clear [type]     - 清理缓存\n` +
        `  /cache status [type]    - 查看状态\n` +
        `  /cache stats            - 统计信息`
      break
    case 'clear':
      const cachesToClear = cacheType === 'all'
        ? Object.values(mockCaches)
        : Object.values(mockCaches).filter(c => c.type === cacheType)
      cachesToClear.forEach(cache => {
        cache.size = 0
        cache.entries = 0
        cache.lastCleared = new Date().toISOString()
      })
      resultText = `缓存清理完成\n\n` +
        `已清理: ${cachesToClear.map(c => c.name).join(', ')}\n` +
        `清理时间: ${new Date().toLocaleString()}\n\n` +
        `当前状态:\n` +
        Object.values(mockCaches).map(cache =>
          `  ${cache.name}: ${cache.size} MB / ${cache.entries.toLocaleString()} entries`
        ).join('\n')
      break
    case 'stats':
      const avgHitRate = (Object.values(mockCaches).reduce((sum, c) => sum + parseFloat(c.hitRate), 0) / Object.values(mockCaches).length).toFixed(1)
      resultText = `缓存统计信息\n\n` +
        `总缓存数: ${Object.keys(mockCaches).length}\n` +
        `总大小: ${totalSize} MB / ${totalMaxSize} MB (${((totalSize/totalMaxSize)*100).toFixed(1)}%)\n` +
        `总条目数: ${totalEntries.toLocaleString()}\n` +
        `平均命中率: ${avgHitRate}%\n\n` +
        `各缓存命中率:\n` +
        Object.values(mockCaches).map(cache =>
          `  ${cache.name.padEnd(20)} ${cache.hitRate.padStart(6)}%`
        ).join('\n') + '\n\n' +
        `空间使用:\n` +
        Object.values(mockCaches).map(cache =>
          `  ${cache.name.padEnd(20)} ${String(cache.size).padStart(6)} MB / ${String(cache.maxSize).padStart(6)} MB`
        ).join('\n')
      break
    default:
      resultText = `缓存管理系统\n\n` +
        `总缓存大小: ${totalSize} MB / ${totalMaxSize} MB (${((totalSize/totalMaxSize)*100).toFixed(1)}%)\n` +
        `总缓存条目: ${totalEntries.toLocaleString()}\n\n` +
        `缓存状态:\n\n` +
        Object.values(mockCaches).map(cache =>
          `  ${cache.name.padEnd(20)} | ${cache.status.padEnd(10)} | ${String(cache.size).padStart(6)} MB | ${cache.hitRate.padStart(6)}% 命中率`
        ).join('\n') + '\n\n' +
        `命令:\n` +
        `  /cache status [type]    - 查看缓存状态\n` +
        `  /cache clear [type]     - 清理缓存\n` +
        `  /cache stats            - 查看统计信息\n\n` +
        `缓存类型: all, session, model, vector, file`
  }

  return React.createElement('div', null,
    React.createElement('h2', null, '缓存管理'),
    React.createElement('p', null, '操作: ' + operation),
    React.createElement('div', { style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      gap: '1rem',
      marginBottom: '1rem'
    }},
      Object.values(mockCaches).map(cache =>
        React.createElement('div', { key: cache.type, style: {
          padding: '1rem',
          backgroundColor: cache.status === 'active' ? '#dcfce7' : '#fef3c7',
          borderRadius: '0.5rem',
          border: '1px solid #e5e7eb'
        }},
          React.createElement('h3', { style: { margin: '0 0 0.5rem 0', fontSize: '0.875rem' } }, cache.name),
          React.createElement('p', { style: { margin: '0.25rem 0', fontSize: '0.75rem', color: '#666' } }, `状态: ${cache.status}`),
          React.createElement('p', { style: { margin: '0.25rem 0', fontSize: '0.75rem' } }, `${cache.size} MB / ${cache.maxSize} MB`),
          React.createElement('p', { style: { margin: '0.25rem 0', fontSize: '0.75rem' } }, `命中率: ${cache.hitRate}%`),
          React.createElement('p', { style: { margin: '0.25rem 0', fontSize: '0.75rem' } }, `条目: ${cache.entries.toLocaleString()}`)
        )
      )
    ),
    React.createElement('h3', null, '详细信息'),
    React.createElement('pre', { style: { fontSize: '0.875rem' } },
      React.createElement('code', null, resultText)
    )
  )
}
