let wsConnection: WebSocket | null = null
let messageCount = 0

export async function call(args: string, context: any): Promise<string> {
  if (!args || args.trim() === '') {
    return `## websocket

### WebSocket 客户端

### 用法
- /websocket connect <URL> - 连接WebSocket
- /websocket send <消息> - 发送消息
- /websocket disconnect - 断开连接
- /websocket status - 查看状态

### 示例
/websocket connect wss://echo.websocket.org
/websocket send "Hello, WebSocket!"

> WebSocket客户端工具`
  }

  const parts = args.trim().split(/\s+/)
  const command = parts[0]

  if (command === 'connect' && parts.length >= 2) {
    const url = parts[1]
    
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      return `## websocket

⚠ 已连接到 ${wsConnection.url}

> 请先断开现有连接`
    }

    try {
      // Note: WebSocket in browser environment
      if (typeof WebSocket !== 'undefined') {
        wsConnection = new WebSocket(url)
        
        return `## websocket

✓ WebSocket连接已发起
- URL: ${url}
- 状态: 连接中...

> 连接将在后台建立

注意: 在浏览器环境中，WebSocket连接可能需要页面交互权限`
      } else {
        return `## websocket

⚠ WebSocket不可用
- 原因: 当前环境不支持WebSocket API
- 建议: 在浏览器环境中使用

> 连接失败`
      }
    } catch (error) {
      return `## websocket

### WebSocket连接失败

- URL: ${url}
- 错误: ${error.message}

> 连接失败`
    }
  }

  if (command === 'send' && parts.length >= 2) {
    const message = parts.slice(1).join(' ')
    
    if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) {
      return `## websocket

⚠ 未连接到WebSocket服务器

> 请先使用 /websocket connect <URL> 建立连接`
    }

    try {
      wsConnection.send(message)
      messageCount++
      
      return `## websocket

✓ 消息已发送
- 消息: ${message}
- 消息计数: ${messageCount}
- 连接状态: 已连接

> 消息发送成功`
    } catch (error) {
      return `## websocket

### 消息发送失败

- 错误: ${error.message}
- 连接状态: ${wsConnection?.readyState || '未连接'}

> 发送失败`
    }
  }

  if (command === 'disconnect') {
    if (wsConnection) {
      wsConnection.close()
      wsConnection = null
      const count = messageCount
      messageCount = 0
      
      return `## websocket

✓ WebSocket已断开
- 发送消息总数: ${count}

> 连接已关闭`
    }
    
    return `## websocket

⚠ 未连接到任何WebSocket服务器

> 无需断开`
  }

  if (command === 'status') {
    const status = wsConnection ? {
      CONNECTING: '连接中',
      OPEN: '已连接',
      CLOSING: '关闭中',
      CLOSED: '已关闭'
    }[WebSocket.CONNECTING] || '未知' : '未连接'

    return `## websocket

### WebSocket状态
- 连接状态: ${wsConnection ? (wsConnection.readyState === WebSocket.OPEN ? '已连接' : '连接中') : '未连接'}
- 服务器: ${wsConnection?.url || '无'}
- 消息数: ${messageCount}
- ReadyState: ${wsConnection?.readyState || 'N/A'}

> WebSocket客户端状态`
  }

  return `## websocket

### WebSocket客户端
- 操作: ${args}

> WebSocket命令已处理`
}
