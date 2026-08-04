/**
 * Daemon Worker 注册表。
 *
 * 由 `claude --daemon-worker <type>` 启动的轻量工作进程入口。
 * 工作进程保持精简：不加载配置、不初始化分析 sinks，
 * 仅在需要时由具体 worker 自行加载依赖。
 */

function installSignalHandlers(type: string): void {
  const shutdown = (signal: string) => {
    console.log(`[daemon-worker] ${type} 收到 ${signal}，正在退出`)
    process.exit(0)
  }
  process.once('SIGINT', () => shutdown('SIGINT'))
  process.once('SIGTERM', () => shutdown('SIGTERM'))
}

/** 主 worker：保持进程存活（心跳循环），等待 IPC/信号 */
async function runMainWorker(): Promise<void> {
  console.log('[daemon-worker] 主 worker 运行中（心跳间隔 30s）')
  const heartbeat = setInterval(() => {
    // 心跳：仅用于确认进程存活
  }, 30000)
  heartbeat.unref?.()

  await new Promise<void>(() => {
    // 永不 resolve —— 由信号处理器终止
  })
}

/** 空闲 worker：短生命周期占位 */
async function runIdleWorker(): Promise<void> {
  console.log('[daemon-worker] 空闲 worker 无任务，退出')
  await new Promise(resolve => setTimeout(resolve, 100))
}

/** 通用 worker：按类型加载对应的处理器 */
async function runGenericWorker(type: string): Promise<void> {
  console.log(`[daemon-worker] 通用 worker: ${type}`)
  // 未来的 worker 类型（assistant/agent 等）在此注册分发逻辑
  await new Promise<void>(() => {
    // 保持运行，等待信号
  })
}

/**
 * 运行 daemon worker。
 *
 * @param workerId worker 类型（main / idle / 自定义）；默认 main
 */
export async function runDaemonWorker(workerId?: string): Promise<void> {
  const type = workerId || 'main'
  console.log(`[daemon-worker] 启动 worker: ${type}（pid=${process.pid}）`)
  installSignalHandlers(type)

  switch (type) {
    case 'main':
      await runMainWorker()
      break
    case 'idle':
      await runIdleWorker()
      break
    default:
      await runGenericWorker(type)
  }
}
