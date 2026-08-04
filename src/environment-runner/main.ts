import { existsSync, readFileSync } from 'fs'
import { execSync } from 'child_process'

interface RunnerConfig {
  serverUrl?: string
  token?: string
  sessionId?: string
  heartbeatMs?: number
}

function parseArgs(args: string[]): { configPath?: string; sessionId?: string } {
  let configPath: string | undefined
  let sessionId: string | undefined
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config' && i + 1 < args.length) configPath = args[i + 1]
    else if (args[i] === '--session' && i + 1 < args.length) sessionId = args[i + 1]
  }
  return { configPath, sessionId }
}

function loadConfig(configPath?: string): RunnerConfig {
  if (configPath && existsSync(configPath)) {
    try {
      return JSON.parse(readFileSync(configPath, 'utf-8')) as RunnerConfig
    } catch {
      /* 配置损坏则使用默认 */
    }
  }
  return {
    serverUrl: process.env.ENVIRONMENT_RUNNER_SERVER_URL,
    token: process.env.ENVIRONMENT_RUNNER_TOKEN,
    heartbeatMs: 15000,
  }
}

/**
 * BYOC 环境运行器入口。
 *
 * 用法：
 *   claude environment-runner --config <config.json> [--session <id>]
 *
 * 流程：读取配置 → 连接服务器（WebSocket）→ 接收任务并执行 → 回传结果。
 */
export async function environmentRunnerMain(args: string[]): Promise<void> {
  const { configPath, sessionId } = parseArgs(args)
  const config = loadConfig(configPath)

  console.log('[environment-runner] BYOC 环境运行器启动')
  console.log(`[environment-runner] 服务器: ${config.serverUrl || '(未配置)'}`)
  if (sessionId) console.log(`[environment-runner] 会话: ${sessionId}`)

  if (!config.serverUrl) {
    console.error('[environment-runner] 缺少 serverUrl（通过 --config 或 ENVIRONMENT_RUNNER_SERVER_URL 设置）')
    process.exitCode = 1
    return
  }

  // 执行环境自检
  try {
    const nodeVersion = process.version
    const cwd = process.cwd()
    console.log(`[environment-runner] 环境: node ${nodeVersion} @ ${cwd}`)
  } catch { /* ignore */ }

  // 简化连接：HTTP 长轮询任务（生产环境为 WebSocket）
  const pollMs = config.heartbeatMs || 15000
  const poll = setInterval(async () => {
    try {
      const headers: Record<string, string> = { accept: 'application/json' }
      if (config.token) headers['authorization'] = `Bearer ${config.token}`
      const resp = await fetch(`${config.serverUrl}/environment-runner/tasks?session=${encodeURIComponent(sessionId || '')}`, { headers })
      if (resp.ok) {
        const data = await resp.json() as { task?: { id: string; command?: string } }
        if (data.task) {
          console.log(`[environment-runner] 收到任务: ${data.task.id}`)
          await executeTask(config, data.task)
        }
      }
    } catch { /* 服务器不可达，重试 */ }
  }, pollMs)
  poll.unref?.()

  console.log('[environment-runner] 等待任务（Ctrl+C 退出）...')
  await new Promise<void>(() => {
    // 由信号/外部终止
  })
}

async function executeTask(config: RunnerConfig, task: { id: string; command?: string }): Promise<void> {
  let output = ''
  let ok = false
  try {
    output = execSync(task.command || 'echo "empty task"', { encoding: 'utf-8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] })
    ok = true
  } catch (e: any) {
    output = e.stderr?.toString() || e.message
  }
  try {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (config.token) headers['authorization'] = `Bearer ${config.token}`
    await fetch(`${config.serverUrl}/environment-runner/tasks/${task.id}/result`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ok, output: output.slice(0, 100_000) }),
    })
    console.log(`[environment-runner] 任务 ${task.id} ${ok ? '完成' : '失败'}`)
  } catch (e: any) {
    console.error(`[environment-runner] 回传结果失败: ${e.message}`)
  }
}
