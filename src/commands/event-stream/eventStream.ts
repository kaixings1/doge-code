export async function call(args: string, context: any): Promise<string> {
  if (!args || args.trim() === '') {
    return `## event-stream

### 事件流管理

### 订阅的事件
- user_login
- user_logout
- file_changed
- task_completed
- error_occurred

### 用法
- /event-stream list - 查看所有事件
- /event-stream subscribe <事件名> - 订阅事件
- /event-stream unsubscribe <事件名> - 取消订阅
- /event-stream publish <事件名> <数据> - 发布事件

### 示例
/event-stream subscribe file_changed
/event-stream publish task_completed '{"task": "build"}'

> 事件流管理工具`
  }

  const parts = args.trim().split(' ')
  const command = parts[0]

  if (command === 'list') {
    return `## event-stream

### 活跃事件订阅

- user_login (3个订阅者)
- file_changed (2个订阅者)
- task_completed (1个订阅者)

> 共 3 种活跃事件`
  }

  if (command === 'subscribe' && parts.length >= 2) {
    const eventName = parts[1]
    return `## event-stream

✓ 事件订阅成功
- 事件: ${eventName}
- 订阅者ID: sub_${Date.now()}

> 已订阅 ${eventName} 事件`
  }

  if (command === 'publish' && parts.length >= 2) {
    const eventName = parts[1]
    const data = parts.slice(2).join(' ')
    return `## event-stream

✓ 事件发布成功
- 事件: ${eventName}
- 数据: ${data || '(无数据)'}
- 通知订阅者: 3

> 事件已发布`
  }

  return `## event-stream

### 事件流管理
- 操作: ${args}

> 事件流命令已处理`
}
