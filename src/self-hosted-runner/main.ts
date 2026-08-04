import { execSync } from 'child_process'

interface SelfHostedOptions {
  serverUrl?: string
  token?: string
  workerName?: string
  pollMs: number
}

function parseArgs(args: string[]): SelfHostedOptions {
  const opts: SelfHostedOptions = { pollMs: 10000 }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--server-url' && i + 1 < args.length) opts.serverUrl = args[i + 1]
    else if (args[i] === '--token' && i + 1 < args.length) opts.token = args[i + 1]
    else if (args[i] === '--name' && i + 1 < args.length) opts.workerName = args[i + 1]
    else if (args[i] === '--poll-interval' && i + 1 < args.length) {
      const n = parseInt(args[i + 1], 10)
      if (!Number.isNaN(n) && n > 0) opts.pollMs = n
    }
  }
  if (!opts.serverUrl) opts.serverUrl = process.env.SELF_HOSTED_RUNNER_URL
  if (!opts.token) opts.token = process.env.SELF_HOSTED_RUNNER_TOKEN
  return opts
}

function authHeaders(opts: SelfHostedOptions): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (opts.token) headers['authorization'] = `Bearer ${opts.token}`
  return headers
}

interface RunnerTask {
  id: string
  command?: string
  cwd?: string
}

/**
 * 自托管运行器入口。
 *
 * 用法：
 *   claude self-hosted-runner --server-url <url> [--token <token>] [--name <name>]
 *
 * 流程：注册到服务器 → 轮询待处理任务 → 本地执行 → 回传结果。
 */
export async function selfHostedRunnerMain(args: string[]): Promise<void> {
  const opts = parseArgs(args)
  const workerName = opts.workerName || `runner-${process.pid}`

  console.log('[self-hosted-runner] 自托管运行器启动')
  if (!opts.serverUrl) {
    console.error('[self-hosted-runner] 缺少 server-url（通过 --server-url 或 SELF_HOSTED_RUNNER_URL 设置）')
    process.exitCode = 1
    return
  }
  console.log(`[self-hosted-runner] 服务器: ${opts.serverUrl}`)
  console.log(`[self-hosted-runner] Worker: ${workerName}`)

  // 注册
  try {
    const resp = await fetch(`${opts.serverUrl}/runners/register`, {
      method: 'POST',
      headers: authHeaders(opts),
      body: JSON.stringify({ name: workerName, capabilities: ['bash'], platform: process.platform }),
    })
    if (resp.ok) {
      console.log(`[self-hosted-runner] 注册成功`)
    } else {
      console.warn(`[self-hosted-runner] 注册失败: ${resp.status} ${resp.statusText}（继续尝试轮询）`)
    }
  } catch (e: any) {
    console.warn(`[self-hosted-runner] 注册异常: ${e.message}`)
  }

  // 轮询任务
  const poll = setInterval(async () => {
    try {
      const resp = await fetch(`${opts.serverUrl}/runners/tasks/pending?worker=${encodeURIComponent(workerName)}`, {
        headers: authHeaders(opts),
      })
      if (!resp.ok) return
      const data = await resp.json() as { task?: RunnerTask }
      if (data.task) {
        await executeAndReport(opts, data.task)
      }
    } catch { /* 服务器不可达，重试 */ }
  }, opts.pollMs)
  poll.unref?.()

  console.log('[self-hosted-runner] 轮询任务中（Ctrl+C 退出）...')
  await new Promise<void>(() => {
    // 由信号/外部终止
  })
}

async function executeAndReport(opts: SelfHostedOptions, task: RunnerTask): Promise<void> {
  console.log(`[self-hosted-runner] 执行任务 ${task.id}: ${task.command || '(空)'}`)
  let ok = false
  let output = ''
  try {
    output = execSync(task.command || 'echo "empty task"', {
      encoding: 'utf-8',
      timeout: 120000,
      cwd: task.cwd || process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    ok = true
  } catch (e: any) {
    output = e.stderr?.toString() || e.message
  }
  try {
    const resp = await fetch(`${opts.serverUrl}/runners/tasks/${task.id}/result`, {
      method: 'POST',
      headers: authHeaders(opts),
      body: JSON.stringify({ worker: opts.workerName || `runner-${process.pid}`, ok, output: output.slice(0, 100_000) }),
    })
    console.log(`[self-hosted-runner] 任务 ${task.id} ${ok ? '完成' : '失败'}（${resp.status}）`)
  } catch (e: any) {
    console.error(`[self-hosted-runner] 回传失败: ${e.message}`)
  }
}
