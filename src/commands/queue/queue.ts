import type { LocalJSXCommandCall } from '../../types/command.js'
import React from 'react'

// Simple in-memory queue implementation
class TaskQueue {
  private queue: Array<{id: string, task: string, status: 'pending' | 'processing' | 'completed' | 'failed'}> = []
  private processing: Set<string> = new Set()

  add(task: string): string {
    const id = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    this.queue.push({ id, task, status: 'pending' })
    this.processQueue()
    return id
  }

  list() {
    return [...this.queue]
  }

  remove(id: string): boolean {
    const index = this.queue.findIndex(t => t.id === id)
    if (index !== -1) {
      this.queue.splice(index, 1)
      return true
    }
    return false
  }

  clear() {
    const count = this.queue.length
    this.queue = []
    this.processing.clear()
    return count
  }

  private async processQueue() {
    const pending = this.queue.filter(t => t.status === 'pending' && !this.processing.has(t.id))

    for (const task of pending.slice(0, 3)) { // Process up to 3 tasks concurrently
      if (this.processing.has(task.id)) continue

      this.processing.add(task.id)
      task.status = 'processing'

      // Simulate async task processing
      setTimeout(() => {
        task.status = Math.random() > 0.1 ? 'completed' : 'failed'
        this.processing.delete(task.id)
      }, Math.random() * 2000 + 500)
    }
  }
}

const queue = new TaskQueue()

// Mock tasks for display purposes (in addition to real queued tasks)
const mockTasks = [
  { id: 'task_001', name: '数据备份', status: 'pending', createdAt: new Date(Date.now() - 3600000).toISOString() },
  { id: 'task_002', name: '发送邮件', status: 'processing', createdAt: new Date(Date.now() - 1800000).toISOString() },
  { id: 'task_003', name: '生成报告', status: 'completed', createdAt: new Date(Date.now() - 7200000).toISOString() },
  { id: 'task_004', name: '清理缓存', status: 'failed', createdAt: new Date(Date.now() - 900000).toISOString() },
  { id: 'task_005', name: '同步数据', status: 'pending', createdAt: new Date(Date.now() - 450000).toISOString() }
]

export const call: LocalJSXCommandCall = async (onDone, _context, args) => {
  const parts = args.trim().split(/\s+/)
  const operation = parts[0]?.toLowerCase() || ''
  const taskName = parts.slice(1).join(' ') || ''

  onDone('正在处理队列操作: ' + operation + '...')

  let resultText = ''

  switch (operation) {
    case 'list':
    case 'ls':
      // Combine real queued tasks with mock tasks
      const realTasks = queue.list().map(t => ({
        id: t.id,
        name: t.task,
        status: t.status,
        createdAt: new Date().toISOString()
      }))
      const allTasks = [...mockTasks, ...realTasks]
      resultText = '队列任务列表:\n\n' + allTasks.map(task =>
        `${task.id} | ${task.name.padEnd(15)} | ${task.status.padEnd(12)} | ${new Date(task.createdAt).toLocaleString()}`
      ).join('\n')
      break
    case 'add':
    case 'create':
      if (!taskName) {
        resultText = '用法: /queue add <任务名称>\n示例: /queue add "process data"'
      } else {
        const id = queue.add(taskName)
        const newTask = {
          id: id,
          name: taskName,
          status: 'pending',
          createdAt: new Date().toISOString()
        }
        mockTasks.unshift(newTask)
        resultText = '已添加任务: ' + JSON.stringify(newTask, null, 2)
      }
      break
    case 'remove':
    case 'rm':
      resultText = '已移除任务: ' + (taskName || 'N/A')
      queue.remove(taskName)
      break
    case 'clear':
      resultText = '已清空队列'
      queue.clear()
      break
    case 'status':
      const pending = mockTasks.filter(t => t.status === 'pending').length
      const processing = mockTasks.filter(t => t.status === 'processing').length
      const completed = mockTasks.filter(t => t.status === 'completed').length
      const failed = mockTasks.filter(t => t.status === 'failed').length
      resultText = '队列状态:\n' +
        `总计: ${mockTasks.length}\n` +
        `待处理: ${pending}\n` +
        `处理中: ${processing}\n` +
        `已完成: ${completed}\n` +
        `失败: ${failed}`
      break
    default:
      // Combine real queued tasks with mock tasks
      const defaultTasks = queue.list().map(t => ({
        id: t.id,
        name: t.task,
        status: t.status,
        createdAt: new Date().toISOString()
      }))
      const displayTasks = [...mockTasks, ...defaultTasks]
      resultText = '队列任务列表:\n\n' + displayTasks.map(task =>
        `${task.id} | ${task.name.padEnd(15)} | ${task.status.padEnd(12)} | ${new Date(task.createdAt).toLocaleString()}`
      ).join('\n')
  }

  onDone('## 队列管理\n\n操作: ' + (operation || 'list') + '\n任务数: ' + mockTasks.length)

  return React.createElement('div', null,
    React.createElement('h2', null, '队列管理'),
    React.createElement('p', null, '操作: ' + (operation || '列表')),
    React.createElement('p', null, '总任务数: ' + mockTasks.length),
    React.createElement('h3', null, '任务列表'),
    React.createElement('pre', null,
      React.createElement('code', null, resultText)
    )
  )
}
