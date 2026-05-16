/**
 * CCR upstreamproxy —— 容器端接线。
 *
 * 当在配置了 upstreamproxy 的 CCR 会话容器内运行时，
 * 此模块：
 *   1. 从 /run/ccr/session_token 读取会话令牌
 *   2. 设置 prctl(PR_SET_DUMPABLE, 0) 以阻止同 UID ptrace 堆内存
 *   3. 下载 upstreamproxy CA 证书并将其与系统
 *      捆绑包连接，以便 curl/gh/python 信任 MITM 代理
 *   4. 启动本地 CONNECT→WebSocket 中继（参见 relay.ts）
 *   5. 取消链接令牌文件（令牌仅保留在堆中；文件在
 *      agent 循环看到它之前消失，但仅在中继确认启动后，
 *      以便 supervisor 重启可以重试）
 *   6. 为所有 agent 子进程暴露 HTTPS_PROXY / SSL_CERT_FILE 环境变量
 *
 * 每个步骤都失败开放：任何错误记录警告并禁用代理。
 * 损坏的代理设置绝不能破坏正常工作的会话。
 *
 * 设计文档：api-go/ccr/docs/plans/CCR_AUTH_DESIGN.md § "Week-1 pilot scope"。
 */

import { mkdir, readFile, unlink, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import { registerCleanup } from '../utils/cleanupRegistry.js'
import { logForDebugging } from '../utils/debug.js'
import { isEnvTruthy } from '../utils/envUtils.js'
import { isENOENT } from '../utils/errors.js'
import { startUpstreamProxyRelay } from './relay.js'

export const SESSION_TOKEN_PATH = '/run/ccr/session_token'
const SYSTEM_CA_BUNDLE = '/etc/ssl/certs/ca-certificates.crt'

// 代理不得拦截的主机。涵盖环回、RFC1918、IMDS
// 范围，以及 CCR 容器已经
// 直接访问的包注册表 + GitHub。镜像 airlock/scripts/sandbox-shell-ccr.sh。
const NO_PROXY_LIST = [
  'localhost',
  '127.0.0.1',
  '::1',
  '169.254.0.0/16',
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  // Anthropic API：没有上游路由会匹配，且 MITM 会破坏
  // 非 Bun 运行时（Python httpx/certifi 不信任伪造的 CA）。
  // 三种形式，因为 NO_PROXY 解析在不同运行时中有所不同：
  //   *.anthropic.com  — Bun, curl, Go（通配符匹配）
  //   .anthropic.com   — Python urllib/httpx（后缀匹配，去除前导点）
  //   anthropic.com    — 顶级域回退
  'anthropic.com',
  '.anthropic.com',
  '*.anthropic.com',
  'github.com',
  'api.github.com',
  '*.github.com',
  '*.githubusercontent.com',
  'registry.npmjs.org',
  'pypi.org',
  'files.pythonhosted.org',
  'index.crates.io',
  'proxy.golang.org',
].join(',')

type UpstreamProxyState = {
  enabled: boolean
  port?: number
  caBundlePath?: string
}

let state: UpstreamProxyState = { enabled: false }

/**
 * 初始化 upstreamproxy。从 init.ts 调用一次。当
 * 功能关闭或令牌文件缺失时调用是安全的 —— 返回 {enabled: false}。
 *
 * 可覆盖的路径用于测试；生产环境使用默认值。
 */
export async function initUpstreamProxy(opts?: {
  tokenPath?: string
  systemCaPath?: string
  caBundlePath?: string
  ccrBaseUrl?: string
}): Promise<UpstreamProxyState> {
  if (!isEnvTruthy(process.env.CLAUDE_CODE_REMOTE)) {
    return state
  }
  // CCR 在服务器端评估 ccr_upstream_proxy_enabled（GrowthBook 已预热）
  // 并通过 StartupContext.EnvironmentVariables 注入此环境变量。
  // 每个 CCR 会话都是没有 GB 缓存的新容器，因此客户端
  // GB 检查总是返回默认值（false）。
  if (!isEnvTruthy(process.env.CCR_UPSTREAM_PROXY_ENABLED)) {
    return state
  }

  const sessionId = process.env.CLAUDE_CODE_REMOTE_SESSION_ID
  if (!sessionId) {
    logForDebugging(
      '[upstreamproxy] CLAUDE_CODE_REMOTE_SESSION_ID 未设置；代理已禁用',
      { level: 'warn' },
    )
    return state
  }

  const tokenPath = opts?.tokenPath ?? SESSION_TOKEN_PATH
  const token = await readToken(tokenPath)
  if (!token) {
    logForDebugging('[upstreamproxy] 无会话令牌文件；代理已禁用')
    return state
  }

  setNonDumpable()

  // CCR 通过 StartupContext（sessionExecutor.ts /
  // sessionHandler.ts）注入 ANTHROPIC_BASE_URL。getOauthConfig() 在此处
  // 不正确：它依赖于 USER_TYPE + USE_{LOCAL,STAGING}_OAUTH，而容器
  // 未设置这些，因此总是返回生产 URL 且 CA 获取 404。
  const baseUrl =
    opts?.ccrBaseUrl ??
    process.env.ANTHROPIC_BASE_URL ??
    'https://api.anthropic.com'
  const caBundlePath =
    opts?.caBundlePath ?? join(homedir(), '.ccr', 'ca-bundle.crt')

  const caOk = await downloadCaBundle(
    baseUrl,
    opts?.systemCaPath ?? SYSTEM_CA_BUNDLE,
    caBundlePath,
  )
  if (!caOk) return state

  try {
    const wsUrl = baseUrl.replace(/^http/, 'ws') + '/v1/code/upstreamproxy/ws'
    const relay = await startUpstreamProxyRelay({ wsUrl, sessionId, token })
    registerCleanup(async () => relay.stop())
    state = { enabled: true, port: relay.port, caBundlePath }
    logForDebugging(`[upstreamproxy] 已启用，监听 127.0.0.1:${relay.port}`)
    // 仅在监听器启动后才取消链接：如果 CA 下载或 listen()
    // 失败，supervisor 重启可以用磁盘上的令牌重试。
    await unlink(tokenPath).catch(() => {
      logForDebugging('[upstreamproxy] 令牌文件取消链接失败', {
        level: 'warn',
      })
    })
  } catch (err) {
    logForDebugging(
      `[upstreamproxy] 中继启动失败：${err instanceof Error ? err.message : String(err)}；代理已禁用`,
      { level: 'warn' },
    )
  }

  return state
}

/**
 * 要合并到每个 agent 子进程的环境变量。代理禁用时为空。
 * 从 subprocessEnv() 调用，以便 Bash/MCP/LSP/hooks 都继承
 * 相同的配置。
 */
export function getUpstreamProxyEnv(): Record<string, string> {
  if (!state.enabled || !state.port || !state.caBundlePath) {
    // 子 CLI 进程无法重新初始化中继（令牌文件已被
    // 父进程取消链接），但父进程的中继仍在运行且
    // 可在 127.0.0.1:<port> 访问。如果我们从父进程继承了代理变量
    // （HTTPS_PROXY + SSL_CERT_FILE 都已设置），则传递它们，以便
    // 我们的子进程也通过父进程的中继路由。
    if (process.env.HTTPS_PROXY && process.env.SSL_CERT_FILE) {
      const inherited: Record<string, string> = {}
      for (const key of [
        'HTTPS_PROXY',
        'https_proxy',
        'NO_PROXY',
        'no_proxy',
        'SSL_CERT_FILE',
        'NODE_EXTRA_CA_CERTS',
        'REQUESTS_CA_BUNDLE',
        'CURL_CA_BUNDLE',
      ]) {
        if (process.env[key]) inherited[key] = process.env[key]
      }
      return inherited
    }
    return {}
  }
  const proxyUrl = `http://127.0.0.1:${state.port}`
  // 仅限 HTTPS：中继处理 CONNECT 且仅此而已。纯 HTTP 没有
  // 要注入的凭据，因此通过中继路由只会
  // 用 405 破坏请求。
  return {
    HTTPS_PROXY: proxyUrl,
    https_proxy: proxyUrl,
    NO_PROXY: NO_PROXY_LIST,
    no_proxy: NO_PROXY_LIST,
    SSL_CERT_FILE: state.caBundlePath,
    NODE_EXTRA_CA_CERTS: state.caBundlePath,
    REQUESTS_CA_BUNDLE: state.caBundlePath,
    CURL_CA_BUNDLE: state.caBundlePath,
  }
}

/** 仅用于测试：在用例之间重置模块状态。 */
export function resetUpstreamProxyForTests(): void {
  state = { enabled: false }
}

async function readToken(path: string): Promise<string | null> {
  try {
    const raw = await readFile(path, 'utf8')
    return raw.trim() || null
  } catch (err) {
    if (isENOENT(err)) return null
    logForDebugging(
      `[upstreamproxy] token read failed: ${err instanceof Error ? err.message : String(err)}`,
      { level: 'warn' },
    )
    return null
  }
}

/**
 * 通过 libc FFI 调用 prctl(PR_SET_DUMPABLE, 0)。阻止同 UID 的 ptrace 操作
 * 此进程，因此通过提示注入的 `gdb -p $PPID` 无法从堆中窃取令牌。
 * 仅限 Linux；其他平台静默无操作。
 */
function setNonDumpable(): void {
  if (process.platform !== 'linux' || typeof Bun === 'undefined') return
  try {
     
    const ffi = require('bun:ffi') as typeof import('bun:ffi')
    const lib = ffi.dlopen('libc.so.6', {
      prctl: {
        args: ['int', 'u64', 'u64', 'u64', 'u64'],
        returns: 'int',
      },
    } as const)
    const PR_SET_DUMPABLE = 4
    const rc = lib.symbols.prctl(PR_SET_DUMPABLE, 0n, 0n, 0n, 0n)
    if (rc !== 0) {
      logForDebugging(
        '[upstreamproxy] prctl(PR_SET_DUMPABLE,0) returned nonzero',
        {
          level: 'warn',
        },
      )
    }
  } catch (err) {
    logForDebugging(
      `[upstreamproxy] prctl unavailable: ${err instanceof Error ? err.message : String(err)}`,
      { level: 'warn' },
    )
  }
}

async function downloadCaBundle(
  baseUrl: string,
  systemCaPath: string,
  outPath: string,
): Promise<boolean> {
  try {
    // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
    const resp = await fetch(`${baseUrl}/v1/code/upstreamproxy/ca-cert`, {
      // Bun 没有默认的 fetch 超时 — 挂起的端点会永远阻塞 CLI
      // 启动。对于小 PEM 文件，5 秒已经足够宽松。
      signal: AbortSignal.timeout(5000),
    })
    if (!resp.ok) {
      logForDebugging(
        `[upstreamproxy] ca-cert fetch ${resp.status}; proxy disabled`,
        { level: 'warn' },
      )
      return false
    }
    const ccrCa = await resp.text()
    const systemCa = await readFile(systemCaPath, 'utf8').catch(() => '')
    await mkdir(join(outPath, '..'), { recursive: true })
    await writeFile(outPath, systemCa + '\n' + ccrCa, 'utf8')
    return true
  } catch (err) {
    logForDebugging(
      `[upstreamproxy] ca-cert download failed: ${err instanceof Error ? err.message : String(err)}; proxy disabled`,
      { level: 'warn' },
    )
    return false
  }
}
