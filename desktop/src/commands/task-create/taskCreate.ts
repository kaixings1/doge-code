import type { LocalCommandCall } from '../../types/command.js'

export const call: LocalCommandCall = async (args) => {
  if (!args || args.trim() === '') {
    return {
      type: 'text',
      value: `## 简单任务创建工具

### 功能
快速创建简单的任务记录，适合临时任务管理

### 用法
/task <任务描述>

### 示例
/task "编写一个记事本软件"
/task "完成项目文档"

### 注意
此命令创建简单的任务记录，如需完整任务管理功能，请使用 /task-create 命令`
    }
  }

  const taskId = 'task_' + Date.now()
  const now = new Date().toLocaleString()

  return {
    type: 'text',
    value: `## 任务已创建 ✓

**任务名称**: ${args}
**任务ID**: ${taskId}
**状态**: 待处理
**创建时间**: ${now}

> 使用 /task-create list 查看所有任务`
  }
}
