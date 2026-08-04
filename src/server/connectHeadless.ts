import {
  DirectConnectSessionManager,
  type DirectConnectConfig,
} from './directConnectManager.js'

/** 从 assistant 消息 content 中提取文本 */
function extractText(content: any): string {
  if (!content) return ''
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((b: any) => (b && b.type === 'text' ? b.text : ''))
      .filter(Boolean)
      .join('')
  }
  return ''
}

function handleMessage(msg: any, outputFormat: string): void {
  if (outputFormat === 'stream-json') {
    process.stdout.write(JSON.stringify(msg) + '\n')
    return
  }
  if (outputFormat === 'json') {
    process.stdout.write(JSON.stringify(msg, null, 2) + '\n')
    return
  }
  // text 模式：输出 assistant 消息文本
  if (msg.type === 'assistant') {
    const text = extractText(msg.message?.content)
    if (text) process.stdout.write(text + '\n')
  }
}

/**
 * 无头连接到远程 Claude Code 服务器并执行 prompt。
 *
 * @param config 直连配置（createDirectConnectSession 返回的 config）
 * @param prompt 要发送的提示文本
 * @param outputFormat 输出格式：text / json / stream-json
 * @param interactive 是否交互模式（从 stdin 持续读取输入）
 */
export async function runConnectHeadless(
  config: DirectConnectConfig,
  prompt: string,
  outputFormat: string,
  interactive: boolean,
): Promise<void> {
  let resolveDone: (() => void) | null = null
  const done = new Promise<void>(resolve => {
    resolveDone = resolve
  })

  const manager = new DirectConnectSessionManager(config, {
    onMessage: (msg: any) => {
      handleMessage(msg, outputFormat)
      // 收到最终结果或错误后完成
      if (msg.type === 'result' || (msg.type === 'system' && msg.subtype === 'error')) {
        resolveDone?.()
      }
    },
    onPermissionRequest: (_req, requestId) => {
      // 无头模式自动允许（与 --dangerously-skip-permissions 语义一致）
      manager.respondToPermissionRequest(requestId, { behavior: 'allow', updatedInput: {} })
    },
    onConnected: () => {
      if (prompt) {
        manager.sendMessage([{ type: 'text', text: prompt }])
      }
    },
    onDisconnected: () => {
      resolveDone?.()
    },
    onError: (err: Error) => {
      process.stderr.write(`连接错误: ${err.message}\n`)
      resolveDone?.()
    },
  })

  manager.connect()

  // 交互模式：从 stdin 持续读取输入
  if (interactive) {
    process.stdin.setEncoding('utf-8')
    process.stdin.on('data', (chunk: string) => {
      const line = chunk.trim()
      if (line) manager.sendMessage([{ type: 'text', text: line }])
    })
  }

  // 等待完成（超时保护：60 秒无响应则退出）
  const timeout = setTimeout(() => {
    process.stderr.write('连接超时（60 秒无响应）\n')
    resolveDone?.()
  }, 60000)

  await done
  clearTimeout(timeout)
  manager.disconnect()
}
