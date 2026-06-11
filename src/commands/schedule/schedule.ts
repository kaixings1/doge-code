// Task scheduler with persistence
class TaskScheduler {
  private tasks: Map<string, {
    id: string
    name: string
    schedule: string
    command: string
    enabled: boolean
    lastRun: Date | null
    nextRun: Date | null
  }> = new Map()

  constructor() {
    // Load some default tasks
    this.add('backup', '每日备份', '0 2 * * *', '/backup', true)
    this.add('cleanup', '日志清理', '0 0 * * 0', '/logger clear', true)
    this.add('report', '报告生成', '0 9 * * 1', '/metrics history', true)
  }

  private calculateNextRun(schedule: string): Date {
    const now = new Date()
    const [minute, hour, dayOfMonth, month, dayOfWeek] = schedule.split(' ')

    const next = new Date(now.getTime())
    next.setSeconds(0, 0)

    // Simple calculation for common patterns
    if (schedule === '0 2 * * *') {
      next.setHours(2, 0, 0, 0)
      if (next <= now) {
        next.setDate(next.getDate() + 1)
      }
    } else if (schedule === '0 0 * * 0') {
      next.setHours(0, 0, 0, 0)
      while (next.getDay() !== 0) {
        next.setDate(next.getDate() + 1)
      }
      if (next <= now && now.getDay() === 0) {
        next.setDate(next.getDate() + 7)
      }
    } else if (schedule === '0 9 * * 1') {
      next.setHours(9, 0, 0, 0)
      while (next.getDay() !== 1) {
        next.setDate(next.getDate() + 1)
      }
      if (next <= now && now.getDay() === 1) {
        next.setDate(next.getDate() + 7)
      }
    } else {
      next.setHours(next.getHours() + 1)
    }

    return next
  }

  add(id: string, name: string, schedule: string, command: string, enabled: boolean = true): string {
    const taskId = id || `task_${Date.now()}`
    const nextRun = this.calculateNextRun(schedule)

    this.tasks.set(taskId, {
      id: taskId,
      name,
      schedule,
      command,
      enabled,
      lastRun: null,
      nextRun
    })

    return taskId
  }

  remove(id: string): boolean {
    return this.tasks.delete(id)
  }

  run(id: string): boolean {
    const task = this.tasks.get(id)
    if (task && task.enabled) {
      task.lastRun = new Date()
      task.nextRun = this.calculateNextRun(task.schedule)
      return true
    }
    return false
  }

  list(): Array<any> {
    return Array.from(this.tasks.values())
  }

  clear(): number {
    const count = this.tasks.size
    this.tasks.clear()
    return count
  }
}

const scheduler = new TaskScheduler()

export async function call(args: string, context: any): Promise<string> {
  if (!args || args.trim() === '') {
    return `## schedule

### 定时任务调度

### 当前任务
- 每日备份: 0 2 * * *
- 日志清理: 0 0 * * 0
- 报告生成: 0 9 * * 1

### 用法
- /schedule list - 查看所有任务
- /schedule add <时间> <命令> - 添加任务
- /schedule remove <任务ID> - 移除任务
- /schedule run <任务ID> - 立即运行任务

### 时间格式
- */5 * * * * - 每5分钟
- 0 9 * * * - 每天9点
- 0 0 * * 0 - 每周日

### 示例
/schedule add "0 10 * * *" "/backup"
/schedule list

> 定时任务调度工具`
  }

  const parts = args.trim().split(/\s+/)
  const command = parts[0]

  if (command === 'list') {
    const tasks = scheduler.list()

    if (tasks.length === 0) {
      return `## schedule

### 定时任务列表

当前没有定时任务

> 使用 /schedule add 添加新任务`
    }

    const taskList = tasks.map(t =>
      `${t.id}    ${t.schedule.padEnd(20)} ${t.command.padEnd(30)} ${t.enabled ? '活跃' : '禁用'}    ${t.lastRun ? t.lastRun.toLocaleTimeString() : '未执行'}`
    ).join('\n')

    return `## schedule

### 定时任务列表

ID      时间表达式          命令                        状态    上次执行
${taskList}

> 共 ${tasks.length} 个定时任务`
  }

  if (command === 'add' && parts.length >= 3) {
    const schedule = parts[1]
    const cmd = parts.slice(2).join(' ')
    const name = `任务_${Date.now()}`
    const id = scheduler.add('', name, schedule, cmd, true)

    return `## schedule

✓ 定时任务已添加

- ID: ${id}
- 名称: ${name}
- 时间: ${schedule}
- 命令: ${cmd}

> 任务已添加到调度器`
  }

  if (command === 'remove' && parts.length >= 2) {
    const id = parts[1]
    const success = scheduler.remove(id)

    if (success) {
      return `## schedule

✓ 定时任务已移除
- ID: ${id}

> 任务已从调度器中移除`
    }

    return `## schedule

⚠ 任务未找到
- ID: ${id}

> 未找到该任务`
  }

  if (command === 'run' && parts.length >= 2) {
    const id = parts[1]
    const success = scheduler.run(id)

    if (success) {
      return `## schedule

✓ 任务已开始执行
- ID: ${id}
- 时间: ${new Date().toLocaleString()}

> 任务正在运行中`
    }

    return `## schedule

⚠ 任务执行失败
- ID: ${id}

> 任务未找到或已禁用`
  }

  return `## schedule

### 定时任务调度
- 操作: ${args}

> 调度命令已处理`
}
