import type { LocalCommandCall } from '../../types/command.js'
import React from 'react'
export const call: LocalCommandCall = async (args, _context) => {
  const parts = args.trim().split(/\s+/)
  const taskName = parts[0] || '未命名任务'
  const priority = parts[1]?.toLowerCase() || 'medium'
  const dueDate = parts[2] || null
  // 验证优先级
  const validPriorities = ['low', 'medium', 'high', 'urgent']
  if (!validPriorities.includes(priority)) {
    return {
      type: 'text',
      value: `错误: 无效的优先级 '${priority}'。有效值: ${validPriorities.join(', ')}`
    }
  }
  // 验证截止日期
  let parsedDueDate = null
  if (dueDate) {
    parsedDueDate = new Date(dueDate)
    if (isNaN(parsedDueDate.getTime())) {
      return {
        type: 'text',
        value: `错误: 无效的日期格式 '${dueDate}'。请使用 YYYY-MM-DD 格式`
      }
    }
  }
  // 生成任务ID
  const taskId = 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6)
  // 创建任务对象
  const task = {
    id: taskId,
    name: taskName,
    description: parts.slice(3).join(' ') || '无描述',
    priority: priority,
    status: 'pending',
    createdAt: new Date().toISOString(),
    dueDate: parsedDueDate ? parsedDueDate.toISOString() : null,
    estimatedTime: Math.floor(Math.random() * 240) + 30, // 30-270分钟
    tags: ['auto-generated']
  }
  // 模拟保存到数据库
  console.log('Task created:', task)
  const resultText = `任务创建成功!\n\n` +
    `任务ID: ${task.id}\n` +
    `名称: ${task.name}\n` +
    `描述: ${task.description}\n` +
    `优先级: ${task.priority}\n` +
    `状态: ${task.status}\n` +
    `创建时间: ${new Date(task.createdAt).toLocaleString()}\n` +
    `截止日期: ${task.dueDate ? new Date(task.dueDate).toLocaleString() : '无'}\n` +
    `预计耗时: ${task.estimatedTime} 分钟\n` +
    `标签: ${task.tags.join(', ')}`
  return {
    type: 'text',
    value: resultText
  }
}
export default {
  name: 'task-create',
  type: 'local',
  description: '创建新任务',
  call: call
}
