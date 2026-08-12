import type { LocalCommandCall } from '../../types/command.js'
import { getSessionId } from '../../bootstrap/state.js'
import {
  createTask,
  listTasks,
  updateTaskStatus,
  deleteTask,
  clearDoneTasks,
  pauseTask,
  resumeTask,
  cancelTask,
  addSubTask,
} from '../../utils/taskManager.js'

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
/task-create "任务标题"        - 创建新任务
/task-create list             - 查看所有任务
/task-create done <ID>        - 标记完成
/task-create delete <ID>      - 删除任务

 **全部命令**
┌─────────────────────┬──────────────────────────────────┐
│ 命令                │ 说明                             │
├─────────────────────┼──────────────────────────────────┤
│ <标题> [优先级]     │ 创建任务，优先级: high/medium/low │
│ list / ls           │ 查看所有任务                     │
│ done <ID>           │ 标记任务完成                     │
│ delete / rm <ID>    │ 删除任务                         │
│ pause <ID>          │ 暂停执行中的任务                 │
│ resume <ID>         │ 恢复暂停的任务                   │
│ cancel <ID>         │ 取消任务                         │
│ subtask <父ID> <标题>│ 添加子任务                      │
│ clear-done          │ 清理已完成任务                   │
│ info <ID>           │ 查看任务详情及子任务              │
│ start <ID>          │ 开始执行任务                     │
└─────────────────────┴──────────────────────────────────┘

💡 提示
• 任务数据会持久化保存
• 使用 /task 命令可快速创建并自动执行任务`
      }
    }
    // 状态图标映射
    const statusIcons = {
      pending: '',
      'in-progress': '🚧',
      done: '',
      cancelled: ''
    }

    // 优先级图标映射
    const priorityIcons = {
      urgent: '🚨',
      high: '🔥',
      medium: '📝',
      low: '📌'
    }

    const taskList = tasks.map((t) => {
      const statusIcon = statusIcons[t.status] || ''
      const priorityIcon = priorityIcons[t.priority] || '📝'
      const createdAt = new Date(t.createdAt).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })

      return `• ${statusIcon} **${t.title}**
   ├─ ID: \`${t.id}\`
   ├─ 优先级: ${t.priority} ${priorityIcon}
   ├─ 状态: ${t.status}
   └─ 创建: ${createdAt}`
    }).join('\n\n')

    return {
      type: 'text',
      value: `📋 **任务列表** (共 ${tasks.length} 个任务)

${taskList}

 **全部命令**
┌─────────────────────┬──────────────────────────────────┐
│ 命令                │ 说明                             │
├─────────────────────┼──────────────────────────────────┤
│ <标题> [优先级]     │ 创建任务                         │
│ done <ID>           │ 标记完成                         │
│ delete / rm <ID>    │ 删除任务                         │
│ pause <ID>          │ 暂停执行中的任务                 │
│ resume <ID>         │ 恢复暂停的任务                   │
│ cancel <ID>         │ 取消任务                         │
│ subtask <父ID> <标题>│ 添加子任务                      │
│ clear-done          │ 清理已完成                       │
│ info <ID>           │ 查看任务详情                     │
│ start <ID>          │ 开始执行任务                     │
└─────────────────────┴──────────────────────────────────┘`
    }
  }

  if (first === 'done' || first === 'complete') {
    const id = words[1]
    if (!id) {
      return {
        type: 'text',
        value: ` **参数错误**

🔧 **正确用法**
\`/task-create done <任务ID>\`

📋 **示例**
\`/task-create done task_1234567890\`

💡 **提示**: 使用 \`/task-create list\` 查看所有任务及其ID`
      }
    }
    const t = await updateTaskStatus(sid, id, 'done')
    if (t) {
      return {
        type: 'text',
        value: ` **任务完成**

🎉 **${t.title}** 已标记为完成！

📊 **任务信息**
• ID: \`${t.id}\`
• 原优先级: ${t.priority}
• 完成时间: ${new Date().toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })}

🔗 **后续操作**
• 查看剩余任务: \`/task-create list\`
• 清理已完成任务: \`/task-create clear-done\``
      }
    } else {
      return {
        type: 'text',
        value: ` **任务未找到**

找不到ID为 \`${id}\` 的任务。

💡 **建议**
1. 使用 \`/task-create list\` 查看所有可用任务
2. 确认任务ID是否正确
3. 任务ID区分大小写`
      }
    }
  }

  if (first === 'delete' || first === 'rm') {
    const id = words[1]
    if (!id) {
      return {
        type: 'text',
        value: ` **参数错误**

🔧 **正确用法**
\`/task-create delete <任务ID>\`
\`/task-create rm <任务ID>\`

📋 **示例**
\`/task-create delete task_1234567890\`
\`/task-create rm task_1234567890\`

 **警告**: 删除操作不可撤销！`
      }
    }
    const ok = await deleteTask(sid, id)
    if (ok) {
      return {
        type: 'text',
        value: `🗑 **任务已删除**

 任务 \`${id}\` 已成功删除。

🔗 **后续操作**
• 查看剩余任务: \`/task-create list\`
• 创建新任务: \`/task-create "新任务标题"\`

💡 **提示**: 删除的任务无法恢复，请谨慎操作。`
      }
    } else {
      return {
        type: 'text',
        value: ` **任务未找到**

找不到ID为 \`${id}\` 的任务。

💡 **建议**
1. 使用 \`/task-create list\` 查看所有可用任务
2. 确认任务ID是否正确
3. 任务可能已被删除或从未创建`
      }
    }
  }

  if (first === 'pause') {
    const id = words[1]
    if (!id) {
      return {
        type: 'text',
        value: ` **参数错误**
🔧 **正确用法**: \`/task-create pause <任务ID>\`
📋 **示例**: \`/task-create pause task_1234567890\``
      }
    }
    const t = await pauseTask(sid, id)
    if (!t) {
      return { type: 'text', value: ` 找不到ID为 \`${id}\` 的任务。` }
    }
    if (t.error) {
      return { type: 'text', value: ` ${t.error}` }
    }
    return {
      type: 'text',
      value: `⏸ **任务已暂停**
• **标题**: ${t.title}
• **ID**: \`${t.id}\`
• 使用 \`/task-create resume ${t.id}\` 恢复执行`
    }
  }

  if (first === 'resume') {
    const id = words[1]
    if (!id) {
      return {
        type: 'text',
        value: ` **参数错误**
🔧 **正确用法**: \`/task-create resume <任务ID>\`
📋 **示例**: \`/task-create resume task_1234567890\``
      }
    }
    const t = await resumeTask(sid, id)
    if (!t) {
      return { type: 'text', value: ` 找不到ID为 \`${id}\` 的任务。` }
    }
    if (t.error) {
      return { type: 'text', value: ` ${t.error}` }
    }
    return {
      type: 'text',
      value: `▶ **任务已恢复执行**
• **标题**: ${t.title}
• **ID**: \`${t.id}\`
• 使用 \`/task-create list\` 查看最新状态`
    }
  }

  if (first === 'cancel') {
    const id = words[1]
    if (!id) {
      return {
        type: 'text',
        value: ` **参数错误**
🔧 **正确用法**: \`/task-create cancel <任务ID>\`
📋 **示例**: \`/task-create cancel task_1234567890\``
      }
    }
    const t = await cancelTask(sid, id)
    if (!t) {
      return { type: 'text', value: ` 找不到ID为 \`${id}\` 的任务。` }
    }
    if (t.error) {
      return { type: 'text', value: ` ${t.error}` }
    }
    return {
      type: 'text',
      value: ` **任务已取消**
• **标题**: ${t.title}
• **ID**: \`${t.id}\``
    }
  }

  if (first === 'subtask' || first === 'sub') {
    const parentId = words[1]
    const subTitle = words.slice(2).join(' ')
    if (!parentId || !subTitle) {
      return {
        type: 'text',
        value: ` **参数错误**
🔧 **正确用法**: \`/task-create subtask <父任务ID> <子任务标题>\`
📋 **示例**: \`/task-create subtask task_1234567890 "前端页面"\``
      }
    }
    const child = await addSubTask(sid, parentId, { title: subTitle })
    if (!child) {
      return { type: 'text', value: ` 找不到父任务 \`${parentId}\`` }
    }
    return {
      type: 'text',
      value: `➕ **子任务已创建**
• **标题**: ${child.title}
• **ID**: \`${child.id}\`
• **父任务**: \`${parentId}\`
• 使用 \`/task-create list\` 查看`
    }
  }

  if (first === 'info' || first === 'status') {
    const id = words[1]
    if (!id) {
      return {
        type: 'text',
        value: ` **参数错误**
🔧 **正确用法**: \`/task-create info <任务ID>\`
📋 **示例**: \`/task-create info task_1234567890\``
      }
    }
    const tasks = await listTasks(sid)
    const t = tasks.find((x: any) => x.id === id)
    if (!t) {
      return { type: 'text', value: ` 找不到ID为 \`${id}\` 的任务。` }
    }

    const createdAt = new Date(t.createdAt).toLocaleString('zh-CN')
    const updatedAt = new Date(t.updatedAt).toLocaleString('zh-CN')

    let detail = `📋 **任务详情**
• **标题**: ${t.title}
• **ID**: \`${t.id}\`
• **优先级**: ${t.priority}
• **状态**: ${t.status}
• **执行状态**: ${t.executionStatus || 'not_started'}
• **创建时间**: ${createdAt}
• **更新时间**: ${updatedAt}`

    if (t.startedAt) {
      detail += `\n• **开始执行**: ${new Date(t.startedAt).toLocaleString('zh-CN')}`
    }
    if (t.completedAt) {
      detail += `\n• **完成时间**: ${new Date(t.completedAt).toLocaleString('zh-CN')}`
    }
    if (t.executionSteps?.length) {
      detail += `\n• **进度**: ${t.currentStep || 0}/${t.executionSteps.length}`
    }
    if (t.executionPlan) {
      detail += `\n• **执行计划**: ${typeof t.executionPlan === 'string' ? t.executionPlan : JSON.stringify(t.executionPlan)}`
    }
    if (t.subTasks?.length) {
      detail += `\n\n📂 **子任务** (${t.subTasks.length}个)`
      for (const st of t.subTasks) {
        detail += `\n  • ${st.status === 'done' ? '' : ''} **${st.title}** (\`${st.id}\`)`
      }
    }

    return { type: 'text', value: detail }
  }

  if (first === 'start') {
    const id = words[1]
    if (!id) {
      return {
        type: 'text',
        value: ` **参数错误**
🔧 **正确用法**: \`/task-create start <任务ID>\`
📋 **示例**: \`/task-create start task_1234567890\``
      }
    }
    const t = await startTaskExecution(sid, id)
    if (!t) {
      return { type: 'text', value: ` 找不到ID为 \`${id}\` 的任务。` }
    }
    return {
      type: 'text',
      value: `🚧 **任务已开始执行**
• **标题**: ${t.title}
• **ID**: \`${t.id}\`
• 可使用 \`/task-create pause ${t.id}\` 暂停
• 可使用 \`/task-create info ${t.id}\` 查看进度`
    }
  }

  if (first === 'clear-done') {
    const n = await clearDoneTasks(sid)
    if (n > 0) {
      return {
        type: 'text',
        value: `🧹 **清理已完成任务**

 已成功清理 **${n}** 个已完成的任务。

📊 **清理统计**
• 清理任务数: ${n}
• 清理时间: ${new Date().toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })}

🔗 **后续操作**
• 查看剩余任务: \`/task-create list\`
• 创建新任务: \`/task-create "新任务标题"\`

💡 **提示**: 定期清理已完成任务可以保持任务列表整洁。`
      }
    } else {
      return {
        type: 'text',
        value: `📭 **无需清理**

当前没有需要清理的已完成任务。

📋 **任务状态**
• 所有任务都处于活动状态
• 没有标记为"完成"的任务

🔗 **建议操作**
• 查看所有任务: \`/task-create list\`
• 标记任务完成: \`/task-create done <任务ID>\``
      }
    }
  }

  const vp = ['low', 'medium', 'high', 'urgent']
  const titlePart = words.filter((w) => !vp.includes(w)).join(' ') || '未命名任务'
  const priority = words.find((w) => vp.includes(w)) || 'medium'
  const task = await createTask(sid, { title: titlePart, priority, tags: ['cli'] })

  // 优先级图标映射
  const priorityIcons = {
    urgent: '🚨',
    high: '🔥',
    medium: '📝',
    low: '📌'
  }

  // 状态图标映射
  const statusIcons = {
    pending: '',
    'in-progress': '🚧',
    done: '',
    cancelled: ''
  }

  const icon = priorityIcons[priority] || '📝'
  const statusIcon = statusIcons[task.status] || ''
  const createdAt = new Date(task.createdAt).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })

  return {
    type: 'text',
    value: `🎉 **任务创建成功** ${icon}

📋 **任务详情**
• **标题**: ${task.title}
• **ID**: \`${task.id}\`
• **优先级**: ${priority} ${icon}
• **状态**: ${task.status} ${statusIcon}
• **创建时间**: ${createdAt}

🔗 **后续操作**
• 查看所有任务: \`/task-create list\`
• 标记完成: \`/task-create done ${task.id}\`
• 删除任务: \`/task-create delete ${task.id}\`

💡 **提示**: 任务已持久化保存，重启应用后仍然存在。`
  }
}

export default {
  name: 'task-create',
  type: 'local',
  description: '创建/管理持久化任务 list|done|delete|clear-done',
  call: call,
}
