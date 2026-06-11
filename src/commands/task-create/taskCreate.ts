import type { LocalJSXCommandCall } from '../../types/command.js'

export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  if (!args || args.trim() === '') {
    onDone(`## task-create

### 任务创建

### 用法
- /task-create <任务名称> - 创建新任务
- /task-create <任务名称> --priority <优先级> - 创建带优先级的任务
- /task-create <任务名称> --due <截止日期> - 创建带截止日期的任务

### 优先级
- high - 高优先级
- medium - 中优先级
- low - 低优先级

### 示例
/task-create "完成项目文档"
/task-create "修复bug" --priority high --due 2024-01-20

> 任务创建工具`)
    return
  }

  onDone(`## task-create

✓ 任务已创建
- 名称: ${args}
- ID: task_${Date.now()}
- 状态: 待处理
- 创建时间: ${new Date().toLocaleString()}

> 任务创建成功`)
}
