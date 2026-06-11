import type { LocalCommandCall } from '../../types/command.js'
import React from 'react'
export const call: LocalCommandCall = async (args, _context) => {
  const parts = args.trim().split(/\s+/)
  const operation = parts[0]?.toLowerCase() || 'status'
  const path = parts[1] || '.'
  // 模拟文件监视器状态
  const mockWatchers = [
    { id: 'watcher_001', path: '/home/user/documents', recursive: true, events: ['create', 'modify', 'delete'], status: 'active', createdAt: new Date(Date.now() - 3600000).toISOString() },
    { id: 'watcher_002', path: '/home/user/downloads', recursive: false, events: ['create'], status: 'active', createdAt: new Date(Date.now() - 1800000).toISOString() },
    { id: 'watcher_003', path: '/home/user/projects', recursive: true, events: ['create', 'modify'], status: 'inactive', createdAt: new Date(Date.now() - 7200000).toISOString() },
    { id: 'watcher_004', path: '/home/user/logs', recursive: true, events: ['modify', 'delete'], status: 'active', createdAt: new Date(Date.now() - 900000).toISOString() },
    { id: 'watcher_005', path: '/home/user/temp', recursive: false, events: ['create', 'modify', 'delete'], status: 'active', createdAt: new Date(Date.now() - 450000).toISOString() }
  ]
  // 模拟最近的事件
  const mockEvents = [
    { id: 'event_001', watcherId: 'watcher_001', type: 'modify', path: '/home/user/documents/report.txt', timestamp: new Date(Date.now() - 300000).toISOString() },
    { id: 'event_002', watcherId: 'watcher_002', type: 'create', path: '/home/user/downloads/file.zip', timestamp: new Date(Date.now() - 600000).toISOString() },
    { id: 'event_003', watcherId: 'watcher_004', type: 'delete', path: '/home/user/logs/old.log', timestamp: new Date(Date.now() - 900000).toISOString() },
    { id: 'event_004', watcherId: 'watcher_001', type: 'create', path: '/home/user/documents/new_file.txt', timestamp: new Date(Date.now() - 1200000).toISOString() },
    { id: 'event_005', watcherId: 'watcher_005', type: 'modify', path: '/home/user/temp/cache.tmp', timestamp: new Date(Date.now() - 1500000).toISOString() }
  ]
  let resultText = ''
  switch (operation) {
    case 'status':
      resultText = '文件监视器状态:\n\n' +
        `活动监视器: ${mockWatchers.filter(w => w.status === 'active').length}\n` +
        `非活动监视器: ${mockWatchers.filter(w => w.status === 'inactive').length}\n` +
        `总监视器: ${mockWatchers.length}\n\n` +
        '监视器列表:\n' +
        mockWatchers.map(watcher =>
          `  ${watcher.id} | ${watcher.path.padEnd(30)} | ${watcher.status.padEnd(10)} | ${watcher.events.join(', ')}`
        ).join('\n') + '\n\n' +
        '最近事件:\n' +
        mockEvents.slice(0, 5).map(event =>
          `  ${event.type.padEnd(8)} | ${new Date(event.timestamp).toLocaleString()} | ${event.path}`
        ).join('\n')
      break
    case 'start':
      if (!path) {
        return {
          type: 'text',
          value: '用法: /file-watcher start <路径> [recursive]'
        }
      }
      const newWatcher = {
        id: 'watcher_' + Math.random().toString(36).substr(2, 6),
        path: path,
        recursive: parts.includes('recursive'),
        events: ['create', 'modify', 'delete'],
        status: 'active',
        createdAt: new Date().toISOString()
      }
      mockWatchers.unshift(newWatcher)
      resultText = '已启动文件监视器:\n' + JSON.stringify(newWatcher, null, 2)
      break
    case 'stop':
      resultText = '已停止文件监视器: ' + (path || 'N/A')
      break
    case 'list':
      resultText = '文件监视器列表:\n\n' +
        mockWatchers.map(watcher =>
          `  ${watcher.id} | ${watcher.path.padEnd(30)} | ${watcher.status.padEnd(10)} | ${watcher.events.join(', ')} | ${new Date(watcher.createdAt).toLocaleString()}`
        ).join('\n')
      break
    case 'events':
      resultText = '最近文件事件:\n\n' +
        mockEvents.map(event =>
          `  ${event.type.padEnd(8)} | ${new Date(event.timestamp).toLocaleString()} | ${event.path.padEnd(40)} | ${event.watcherId}`
        ).join('\n')
      break
    case 'clear':
      resultText = '已清空所有文件监视器'
      break
    default:
      resultText = '文件监视器状态:\n\n' +
        `活动监视器: ${mockWatchers.filter(w => w.status === 'active').length}\n` +
        `非活动监视器: ${mockWatchers.filter(w => w.status === 'inactive').length}\n` +
        `总监视器: ${mockWatchers.length}\n\n` +
        '监视器列表:\n' +
        mockWatchers.map(watcher =>
          `  ${watcher.id} | ${watcher.path.padEnd(30)} | ${watcher.status.padEnd(10)} | ${watcher.events.join(', ')}`
        ).join('\n')
  }
  return {
    type: 'text',
    value: '## 文件监视器\n\n操作: ' + operation + '\n\n' + resultText
  }
}
export default {
  name: 'file-watcher',
  type: 'local',
  description: '文件系统监视器管理',
  call: call
}
