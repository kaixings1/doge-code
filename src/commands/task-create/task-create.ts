import type { LocalCommandCall } from '../../types/command.js'
import { getSessionId } from '../../bootstrap/state.js'
import { createTask, listTasks, updateTaskStatus, deleteTask, clearDoneTasks } from '../../utils/taskManager.js'

export const call: LocalCommandCall = async (args) => {
  const s = (args ?? '').trim()
  const sid = typeof getSessionId === 'function' ? getSessionId() : 'default'
  const words = s.split(/[ ]+/)
  const first = (words[0] ?? '').toLowerCase()

  if (first === 'list' || first === 'ls' || s === '') {
    const tasks = await listTasks(sid)
    if (!tasks.length) {
      return {
        type: 'text',
        value: `📋 **任务管理系统** (/task-create)

当前没有任务。

🚀 **快速开始**
1. 创建任务: /task-create "任务标题"
2. 查看任务: /task-create list
3. 完成任务: /task-create done <任务ID>
4. 删除任务: /task-create delete <任务ID>

✨ **功能列表**
• /task-create <标题> [优先级] - 创建新任务
• /task-create list - 查看所有任务
• /task-create done <任务ID> - 标记任务完成
• /task-create delete <任务ID> - 删除任务
• /task-create clear-done - 清理已完成任务

🎯 **优先级选项**
high - 高优先级 | medium - 中优先级 | low - 低优先级 | urgent - 紧急

📝 **示例**
/task-create "修复登录bug" high
/task-create "编写项目文档" medium
/task-create list
/task-create done task_1234567890

💡 **提示**
• 任务数据会持久化保存
• 使用 /task 命令可快速创建简单任务`
      }
    }
    const icons: Record<string, string> = {
      pending: 'schedule',
      'in-progress': 'hourglass',
      done: 'check_circle',
      cancelled: 'cancel'
    }
    const ls = tasks.map((t) => ' ' + (icons[t.status] || 'description') + ' [' + t.id + '] ' + t.title + ' (' + t.priority + ')')
    return { type: 'text', value: '任务列表 (' + tasks.length + '):\n' + ls.join('\n') }
  }

  if (first === 'done' || first === 'complete') {
    const id = words[1]
    if (!id) {
      return { type: 'text', value: '用法: /task-create done <taskId>' }
    }
    const t = await updateTaskStatus(sid, id, 'done')
    return t ? { type: 'text', value: '任务完成: ' + t.title } : { type: 'text', value: '未找到: ' + id }
  }

  if (first === 'delete' || first === 'rm') {
    const id = words[1]
    if (!id) {
      return { type: 'text', value: '用法: /task-create delete <taskId>' }
    }
    const ok = await deleteTask(sid, id)
    return ok ? { type: 'text', value: '已删除: ' + id } : { type: 'text', value: '未找到: ' + id }
  }

  if (first === 'clear-done') {
    const n = await clearDoneTasks(sid)
    return { type: 'text', value: '已清理 ' + n + ' 个已完成任务' }
  }

  const vp = ['low', 'medium', 'high', 'urgent']
  const titlePart = words.filter((w) => !vp.includes(w)).join(' ') || '未命名任务'
  const priority = words.find((w) => vp.includes(w)) || 'medium'
  const task = await createTask(sid, { title: titlePart, priority, tags: ['cli'] })
  const out = [
    '任务已创建 (已持久化)',
    '标题: ' + task.title,
    'ID: ' + task.id,
    '优先级: ' + task.priority,
    '状态: ' + task.status,
    '创建时间: ' + new Date(task.createdAt).toLocaleString()
  ]
  return { type: 'text', value: out.join('\n') }
}

export default {
  name: 'task-create',
  type: 'local',
  description: '创建/管理持久化任务 list|done|delete|clear-done',
  call: call,
}
