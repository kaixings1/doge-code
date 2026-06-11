import type { LocalCommandCall } from '../../types/command.js'
import React from 'react'
export const call: LocalCommandCall = async (args, _context) => {
  const parts = args.trim().split(/\s+/)
  const operation = parts[0]?.toLowerCase() || 'status'
  const channel = parts[1] || 'default'
  // 模拟事件流数据
  const mockChannels = [
    { name: 'default', type: 'pubsub', subscribers: 5, messagesPerSecond: 120, status: 'active' },
    { name: 'notifications', type: 'websocket', subscribers: 23, messagesPerSecond: 45, status: 'active' },
    { name: 'logs', type: 'pubsub', subscribers: 8, messagesPerSecond: 250, status: 'active' },
    { name: 'metrics', type: 'websocket', subscribers: 3, messagesPerSecond: 10, status: 'active' },
    { name: 'alerts', type: 'pubsub', subscribers: 15, messagesPerSecond: 8, status: 'inactive' }
  ]
  // 模拟事件消息
  const mockEvents = [
    { id: 'evt_001', channel: 'default', type: 'message', data: 'User login successful', timestamp: new Date(Date.now() - 30000).toISOString() },
    { id: 'evt_002', channel: 'notifications', type: 'notification', data: 'New message from admin', timestamp: new Date(Date.now() - 60000).toISOString() },
    { id: 'evt_003', channel: 'logs', type: 'log', data: 'ERROR: Database connection failed', timestamp: new Date(Date.now() - 90000).toISOString() },
    { id: 'evt_004', channel: 'metrics', type: 'metric', data: 'CPU usage: 45%', timestamp: new Date(Date.now() - 120000).toISOString() },
    { id: 'evt_005', channel: 'default', type: 'message', data: 'Task completed: data_backup', timestamp: new Date(Date.now() - 150000).toISOString() },
    { id: 'evt_006', channel: 'alerts', type: 'alert', data: 'High memory usage detected', timestamp: new Date(Date.now() - 180000).toISOString() },
    { id: 'evt_007', channel: 'notifications', type: 'notification', data: 'Weekly report generated', timestamp: new Date(Date.now() - 210000).toISOString() },
    { id: 'evt_008', channel: 'logs', type: 'log', data: 'INFO: Cache cleared successfully', timestamp: new Date(Date.now() - 240000).toISOString() }
  ]
  let resultText = ''
  switch (operation) {
    case 'status':
      const channelInfo = mockChannels.find(c => c.name === channel) || mockChannels[0]
      resultText = `事件流状态\n\n` +
        `频道: ${channel}\n` +
        `类型: ${channelInfo.type}\n` +
        `状态: ${channelInfo.status}\n` +
        `订阅者: ${channelInfo.subscribers}\n` +
        `消息频率: ${channelInfo.messagesPerSecond} msg/s\n\n` +
        `所有频道:\n` +
        mockChannels.map(c =>
          `  ${c.name.padEnd(20)} | ${c.type.padEnd(10)} | ${c.status.padEnd(10)} | ${c.subscribers} subscribers | ${c.messagesPerSecond} msg/s`
        ).join('\n') + '\n\n' +
        `最近事件:\n` +
        mockEvents.slice(0, 5).map(event =>
          `  [${new Date(event.timestamp).toLocaleTimeString()}] ${event.channel.padEnd(15)} | ${event.type.padEnd(12)} | ${event.data}`
        ).join('\n')
      break
    case 'publish':
      const message = parts.slice(2).join(' ') || 'test message'
      const newEvent = {
        id: 'evt_' + Math.random().toString(36).substr(2, 6),
        channel: channel,
        type: 'message',
        data: message,
        timestamp: new Date().toISOString()
      }
      mockEvents.unshift(newEvent)
      resultText = `消息发布成功\n\n` +
        `频道: ${channel}\n` +
        `消息: ${message}\n` +
        `时间: ${new Date().toLocaleString()}`
      break
    case 'subscribe':
      resultText = `已订阅频道: ${channel}\n\n` +
        `频道信息:\n` +
        mockChannels.map(c =>
          `  ${c.name}: ${c.type} (${c.status}) - ${c.subscribers} subscribers`
        ).join('\n')
      break
    case 'unsubscribe':
      resultText = `已取消订阅频道: ${channel}`
      break
    case 'list':
      resultText = `事件流频道列表:\n\n` +
        mockChannels.map(c =>
          `  ${c.name.padEnd(20)} | ${c.type.padEnd(10)} | ${c.status.padEnd(10)} | ${String(c.subscribers).padEnd(3)} 订阅者 | ${String(c.messagesPerSecond).padEnd(4)} 消息/秒`
        ).join('\n')
      break
    case 'events':
      const filterChannel = parts[1] || 'all'
      const filteredEvents = filterChannel === 'all'
        ? mockEvents
        : mockEvents.filter(e => e.channel === filterChannel)
      resultText = `事件列表${filterChannel !== 'all' ? ` (频道: ${filterChannel})` : ''}:\n\n` +
        filteredEvents.map(event =>
          `  [${new Date(event.timestamp).toLocaleTimeString()}] ${event.channel.padEnd(15)} | ${event.type.padEnd(12)} | ${event.data}`
        ).join('\n')
      break
    case 'clear':
      resultText = '已清空所有事件'
      break
    default:
      resultText = `事件流状态\n\n` +
        `活跃频道: ${mockChannels.filter(c => c.status === 'active').length}\n` +
        `总频道数: ${mockChannels.length}\n` +
        `最近事件: ${mockEvents.length}\n\n` +
        `频道列表:\n` +
        mockChannels.map(c =>
          `  ${c.name.padEnd(20)} | ${c.type.padEnd(10)} | ${c.status.padEnd(10)} | ${c.subscribers} subscribers`
        ).join('\n')
  }
  return {
    type: 'text',
    value: '## 事件流管理器\n\n操作: ' + operation + '\n\n' + resultText
  }
}
export default {
  name: 'event-stream',
  type: 'local',
  description: '事件流管理',
  call: call
}
