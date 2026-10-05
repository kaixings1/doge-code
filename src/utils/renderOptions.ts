import { openSync } from 'fs'
import { ReadStream } from 'tty'
import type { RenderOptions } from '../ink.js'
import { isEnvTruthy } from './envUtils.js'
import { logError } from './log.js'

// Cached stdin override - computed once per process
let cachedStdinOverride: ReadStream | undefined | null = null

/**
 * Gets a ReadStream for the controlling terminal when stdin is piped.
 * This allows interactive Ink rendering even when stdin is a pipe.
 * Result is cached for the lifetime of the process.
 */
function getStdinOverride(): ReadStream | undefined {
  // Return cached result if already computed
  if (cachedStdinOverride !== null) {
    return cachedStdinOverride
  }

  // No override needed if stdin is already a TTY
  if (process.stdin.isTTY) {
    cachedStdinOverride = undefined
    return undefined
  }

  // Skip in CI environments
  if (isEnvTruthy(process.env.CI)) {
    cachedStdinOverride = undefined
    return undefined
  }

  // Skip if running MCP (input hijacking breaks MCP)
  if (process.argv.includes('mcp')) {
    cachedStdinOverride = undefined
    return undefined
  }

  // Windows 上没有 /dev/tty，但有等价的控制台输入设备 CONIN$。
  // 必须带设备命名空间前缀 "\\.\"：node 下裸 "CONIN$" 会被当相对路径而 ENOENT；
  // bun 下两种写法都能打开，统一用带前缀的写法以兼容两种运行时。
  // 缺少该 override 时，bun run（d.bat 的启动方式）下 stdin.isTTY 为 undefined、
  // 无 setRawMode 方法，ink 的 isRawModeSupported() 恒为 false —— 表现为
  // 「输入进得来（earlyInput 已消费）、API 照发、回复照生成，但界面无任何显示」。
  const ttyPath = process.platform === 'win32' ? '\\\\.\\CONIN$' : '/dev/tty'

  // Try to open the controlling terminal as an alternative input source
  try {
    const ttyFd = openSync(ttyPath, 'r')
    const ttyStream = new ReadStream(ttyFd)
    // Explicitly set isTTY to true since we know the console device is a TTY.
    // This is needed because some runtimes (like Bun's compiled binaries)
    // may not correctly detect isTTY on ReadStream created from a file descriptor.
    ttyStream.isTTY = true
    cachedStdinOverride = ttyStream
    return cachedStdinOverride
  } catch (err) {
    logError(err as Error)
    cachedStdinOverride = undefined
    return undefined
  }
}

/**
 * Returns base render options for Ink, including stdin override when needed.
 * Use this for all render() calls to ensure piped input works correctly.
 *
 * @param exitOnCtrlC - Whether to exit on Ctrl+C (usually false for dialogs)
 */
export function getBaseRenderOptions(
  exitOnCtrlC: boolean = false,
): RenderOptions {
  const stdin = getStdinOverride()
  const options: RenderOptions = { exitOnCtrlC }
  if (stdin) {
    options.stdin = stdin
  }
  return options
}
