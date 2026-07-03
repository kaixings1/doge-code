import type { LocalJSXCommandCall } from '../../types/command.js'
import React from 'react'
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'

interface QueueTask { id: string; task: string; status: 'pending' | 'processing' | 'completed' | 'failed'; createdAt: string; priority: number; }

class PersistentQueue {
  private queue: QueueTask[] = []
  private storageFile: string
  constructor() { this.storageFile = join(process.cwd(), '.doge', 'queue.json'); this.load(); }
  private load(): void {
    if (existsSync(this.storageFile)) {
      try { const data = JSON.parse(readFileSync(this.storageFile, 'utf-8')); this.queue = data.queue || []; }
      catch (e) { console.error('Failed to load queue:', e); }
    }
  }
  private save(): void { /* minimal */ }
  add(task: string, priority: number = 0): string {
    const id = 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10)
    const newTask: QueueTask = { id, task, status: 'pending', createdAt: new Date().toISOString(), priority }
    this.queue.push(newTask)
    this.queue.sort((a, b) => b.priority - a.priority)
    return id
  }
  list(status?: string): QueueTask[] { return status ? this.queue.filter(t => t.status === status) : [...this.queue] }
  remove(id: string): boolean { const idx = this.queue.findIndex(t => t.id === id); if (idx !== -1) { this.queue.splice(idx, 1); return true; } return false; }
  clear(): number { const n = this.queue.length; this.queue = []; return n; }
  stats() { return { total: this.queue.length, pending: 0, processing: 0, completed: 0, failed: 0, storageFile: this.storageFile }; }
}

const queue = new PersistentQueue()

export const call: LocalJSXCommandCall = async (onDone, context, args) => {
    const parts = args.trim().split(/\s+/)
    const operation = parts[0]?.toLowerCase() || ''
    const taskName = parts.slice(1).join(' ') || ''

    onDone('处理队列操作: ' + operation)

    let resultText = ''

    switch (operation) {
        case 'list': {
            const tasks = queue.list()
            resultText = tasks.map(t => `${t.id} | ${t.task.slice(0, 30)} | ${t.status} | ${new Date(t.createdAt).toLocaleString()}`).join('\n')
            break
        }
        case 'add': {
            if (!taskName) {
                resultText = '用法: /queue add <任务描述>'
            } else {
                const id = queue.add(taskName)
                resultText = `已添加任务: ${id}\n描述: ${taskName}`
            }
            break
        }
        case 'remove': {
            const success = queue.remove(taskName)
            resultText = success ? `已移除: ${taskName}` : `未找到: ${taskName}`
            break
        }
        case 'clear': {
            const count = queue.clear()
            resultText = `已清空: ${count} 个任务`
            break
        }
        case 'status': {
            const stats = queue.stats()
            resultText = `总计: ${stats.total}\n待处理: ${stats.pending}\n处理中: ${stats.processing}\n已完成: ${stats.completed}\n失败: ${stats.failed}\n存储: ${stats.storageFile}`
            break
        }
        default: {
            const allTasks = queue.list()
            resultText = allTasks.map(t => `${t.id} | ${t.task.slice(0, 20)} | ${t.status}`).join('\n')
        }
    }

    onDone('队列操作完成')
    return React.createElement('div', null,
        React.createElement('h2', null, '持久化队列'),
        React.createElement('pre', null, resultText)
    )
}

export default {
 type: 'local-jsx',
 name: 'queue',
 description: '持久化任务队列管理',
 supportsNonInteractive: true,
 load: () => Promise.resolve({ call }),
}