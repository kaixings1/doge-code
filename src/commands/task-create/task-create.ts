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
 if (!tasks.length) return { type: 'text', value: '暂无任务。使用 /task-create <标题> 创建第一个任务。' }
 const icons: Record<string, string> = { pending: '⏳', 'in-progress': '🔄', done: '✅', cancelled: '❌' }
 const ls = tasks.map((t) => ' ' + (icons[t.status] || '📋') + ' [' + t.id + '] ' + t.title + ' (' + t.priority + ')')
 return { type: 'text', value: '任务列表 (' + tasks.length + '):' + NL + ls.join(NL) }
 }

 if (first === 'done' || first === 'complete') {
 const id = words[1]
 if (!id) return { type: 'text', value: '用法: /task-create done <taskId>' }
 const t = await updateTaskStatus(sid, id, 'done')
 return t ? { type: 'text', value: '✅ 任务完成: ' + t.title } : { type: 'text', value: '未找到: ' + id }
 }

 if (first === 'delete' || first === 'rm') {
 const id = words[1]
 if (!id) return { type: 'text', value: '用法: /task-create delete <taskId>' }
 const ok = await deleteTask(sid, id)
 return ok ? { type: 'text', value: '🗑 已删除: ' + id } : { type: 'text', value: '未找到: ' + id }
 }

 if (first === 'clear-done') {
 const n = await clearDoneTasks(sid)
 return { type: 'text', value: '🧹 已清理 ' + n + ' 个已完成任务' }
 }

 const vp = ['low','medium','high','urgent']
 const titlePart = words.filter((w) => !vp.includes(w) && !/(//[0-9]{4}-//[0-9]{2}-//[0-9]{2})/.test(w)).join(' ') || '未命名任务'
 const dm = s.match(/(//[0-9]{4}-//[0-9]{2}-//[0-9]{2})/)
 const dueAt = dm ? dm[1] : undefined
 const priority = words.find((w) => vp.includes(w)) || 'medium'
 const task = await createTask(sid, { title: titlePart, priority, dueAt: dueAt || undefined, tags: ['cli'] })
 const out = ['✅ 任务已创建 (已持久化到 .doge/tasks/)', '标题: ' + task.title, 'ID: ' + task.id, '优先级: ' + task.priority, '状态: ' + task.status, '创建时间: ' + new Date(task.createdAt).toLocaleString()]
 if (dueAt) out.push('截止日期: ' + dueAt)
 return { type: 'text', value: out.join(NL) }
}

export default {
 name: 'task-create',
 type: 'local',
 description: '创建/管理持久化任务 list|done|delete|clear-done',
 call: call,
}
