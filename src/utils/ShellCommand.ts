import type { ChildProcess } from 'child_process'
import { stat } from 'fs/promises'
import type { Readable } from 'stream'
import treeKill from 'tree-kill'
import { generateTaskId } from '../Task.js'
import { formatDuration } from './format.js'
import {
  MAX_TASK_OUTPUT_BYTES,
  MAX_TASK_OUTPUT_BYTES_DISPLAY,
} from './task/diskOutput.js'
import { TaskOutput } from './task/TaskOutput.js'

export type ExecResult = {
  stdout: string
  stderr: string
  code: number
  interrupted: boolean
  backgroundTaskId?: string
  backgroundedByUser?: boolean
  /** Set when assistant-mode auto-backgrounded a long-running blocking command. */
  assistantAutoBackgrounded?: boolean
  /** Set when stdout was too large to fit inline — points to the output file on disk. */
  outputFilePath?: string
  /** Total size of the output file in bytes (set when outputFilePath is set). */
  outputFileSize?: number
  /** The task ID for the output file (set when outputFilePath is set). */
  outputTaskId?: string
  /** Error message when the command failed before spawning (e.g., deleted cwd). */
  preSpawnError?: string
}

export type ShellCommand = {
  /** 子进程 PID（可能尚未 spawn 完成，读作 void）。 */
  readonly pid?: number | void
  background: (backgroundTaskId: string) => boolean
  result: Promise<ExecResult>
  kill: () => void
  status: 'running' | 'backgrounded' | 'completed' | 'killed'
  /**
   * Cleans up stream resources (event listeners).
   * Should be called after the command completes or is killed to prevent memory leaks.
   */
  cleanup: () => void
  onTimeout?: (
    callback: (backgroundFn: (taskId: string) => boolean) => void,
  ) => void
  /** The TaskOutput instance that owns all stdout/stderr data and progress. */
  taskOutput: TaskOutput
}

const SIGKILL = 137
const SIGTERM = 143

// Background tasks write stdout/stderr directly to a file fd (no JS involvement),
// so a stuck append loop can fill the disk. Poll file size and kill when exceeded.
const SIZE_WATCHDOG_INTERVAL_MS = 5_000

// [2026-10-20] 转后台后的停滞判定。后台任务允许跑很久，但连续 10 分钟输出文件
// 一个字节都没长，几乎只能是卡在阻塞调用上（MSYS2 管道写、等 stdin）。超过即杀。
// 可通过环境变量覆盖，便于长静默但合法的命令（大数据导入等）放宽。
const BACKGROUND_STALL_MS = (() => {
  const raw = Number(process.env.CLAUDE_CODE_BACKGROUND_STALL_MS)
  return Number.isFinite(raw) && raw > 0 ? raw : 600_000
})()

// 轮询间隔取 min(10s, 阈值/2)：否则把阈值调到 10 秒以内时，轮询比阈值还慢，
// 实际触发会被推迟一整拍，"调小阈值"就失去了意义。
const BACKGROUND_STALL_POLL_MS = (() => {
  const raw = Number(process.env.CLAUDE_CODE_BACKGROUND_STALL_POLL_MS)
  const hard = Number.isFinite(raw) && raw > 0 ? raw : 10_000
  return Math.max(100, Math.min(hard, Math.floor(BACKGROUND_STALL_MS / 2)))
})()

function prependStderr(prefix: string, stderr: string): string {
  return stderr ? `${prefix} ${stderr}` : prefix
}

type CpuSample = { user: number; system: number }

/**
 * [2026-10-20] 采样单个 PID 已累计消耗的 CPU 时间（单位：本平台 ticks/毫秒，
 * 只用于"是否增长"的单调比较，不要求换算成绝对秒）。
 *
 * 进程不存在或采样命令不可用时返回 null —— 调用方按"无活动"处理。
 * 仅在后台上看门狗判定"输出已静默"后才调用，频率极低。
 */
async function sampleProcessCpu(pid: number): Promise<CpuSample | null> {
  const { execFile } = await import('child_process')
  // PowerShell 冷启动通常 300~800ms，首次可能更久；给足 8s。
  // 该函数只在"输出已静默超过阈值"时被调用（每阈值周期一次），开销可接受。
  const run = (cmd: string, args: string[], timeoutMs = 8000): Promise<string> =>
    new Promise(resolve => {
      execFile(cmd, args, { timeout: timeoutMs, windowsHide: true }, (err, stdout) => {
        resolve(err ? '' : String(stdout))
      })
    })

  try {
    if (process.platform === 'win32') {
      // [2026-10-20 修复-CPU 采样在 Win11 上完全失效]
      //   原实现用 `wmic process ... get UserModeTime`，但 wmic 在新版 Windows
      //   已被移除 —— 实测 Win11 26300 上直接 ENOENT。于是 sampleProcessCpu
      //   恒返回 null → CPU 判据恒为"无活动" → 看门狗退化成"只要静默就杀"，
      //   CPU 采样形同虚设（实测：静默但满载 CPU 的进程仍被误杀）。
      //   改用内置的 PowerShell CIM 查询（wmic 的官方替代品）。
      // 仍保留 wmic 兜底：较老系统上 PowerShell+CIM 可能不可用，反之亦然。
      // 用 -EncodedCommand 而非 -Command：参数经 execFile 传递时不含引号
      // 转义层，UTF-16LE base64 能完全绕开 cmd/PowerShell 的引号解析差异。
      const script =
        `$p = Get-CimInstance Win32_Process -Filter "ProcessId=${pid}"; ` +
        'if ($p) { "$($p.UserModeTime),$($p.KernelModeTime)" }'
      const encoded = Buffer.from(script, 'utf16le').toString('base64')
      const psArgs = ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded]
      // PowerShell 冷启动抖动大，偶发返回空输出。失败重试一次：
      // 该函数仅在"输出静默"时被调用，多花一次启动时间的代价可接受，
      // 而误判的代价是杀掉正在干活的进程。
      for (let attempt = 0; attempt < 2; attempt++) {
        const cim = await run('powershell', psArgs)
        const m = /^\s*(\d+)\s*,\s*(\d+)\s*$/m.exec(cim)
        if (m) return { user: Number(m[1]), system: Number(m[2]) }
      }

      // 兜底：老系统上的 wmic（UserModeTime/KernelModeTime 单位 100ns）
      const out = await run('wmic', [
        'process',
        'where',
        `ProcessId=${pid}`,
        'get',
        'UserModeTime,KernelModeTime',
        '/value',
      ])
      const user = /UserModeTime=(\d+)/.exec(out)?.[1]
      const kernel = /KernelModeTime=(\d+)/.exec(out)?.[1]
      if (!user && !kernel) return null
      return { user: Number(user ?? 0), system: Number(kernel ?? 0) }
    }
    // POSIX：ps 的 TIME 列（[[dd-]hh:]mm:ss），转成秒
    const out = await run('ps', ['-o', 'time=', '-p', String(pid)])
    const t = out.trim()
    if (!t) return null
    const parts = t.split(':').map(Number)
    if (parts.some(n => !Number.isFinite(n))) return null
    const secs = parts.reduce((acc, n) => acc * 60 + n, 0)
    return { user: secs, system: 0 }
  } catch {
    return null
  }
}

/**
 * Thin pipe from a child process stream into TaskOutput.
 * Used in pipe mode (hooks) for stdout and stderr.
 * In file mode (bash commands), both fds go to the output file —
 * the child process streams are null and no wrappers are created.
 */
class StreamWrapper {
  #stream: Readable | null
  #isCleanedUp = false
  #taskOutput: TaskOutput | null
  #isStderr: boolean
  #onData = this.#dataHandler.bind(this)

  constructor(stream: Readable, taskOutput: TaskOutput, isStderr: boolean) {
    this.#stream = stream
    this.#taskOutput = taskOutput
    this.#isStderr = isStderr
    // Emit strings instead of Buffers - avoids repeated .toString() calls
    stream.setEncoding('utf-8')
    stream.on('data', this.#onData)
  }

  #dataHandler(data: Buffer | string): void {
    const str = typeof data === 'string' ? data : data.toString()

    if (this.#isStderr) {
      this.#taskOutput!.writeStderr(str)
    } else {
      this.#taskOutput!.writeStdout(str)
    }
  }

  cleanup(): void {
    if (this.#isCleanedUp) {
      return
    }
    this.#isCleanedUp = true
    this.#stream!.removeListener('data', this.#onData)
    // Release references so the stream, its StringDecoder, and
    // the TaskOutput can be GC'd independently of this wrapper.
    this.#stream = null
    this.#taskOutput = null
    this.#onData = () => {}
  }
}

/**
 * Implementation of ShellCommand that wraps a child process.
 *
 * For bash commands: both stdout and stderr go to a file fd via
 * stdio[1] and stdio[2] — no JS involvement. Progress is extracted
 * by polling the file tail.
 * For hooks: pipe mode with StreamWrappers for real-time detection.
 */
class ShellCommandImpl implements ShellCommand {
  #status: 'running' | 'backgrounded' | 'completed' | 'killed' = 'running'
  #backgroundTaskId: string | undefined
  #stdoutWrapper: StreamWrapper | null
  #stderrWrapper: StreamWrapper | null
  #childProcess: ChildProcess
  #timeoutId: NodeJS.Timeout | null = null
  #sizeWatchdog: NodeJS.Timeout | null = null
  #backgroundWatchdog: NodeJS.Timeout | null = null
  #killedForBackgroundStall = false
  #killedForSize = false
  #maxOutputBytes: number
  #abortSignal: AbortSignal
  #onTimeoutCallback:
    | ((backgroundFn: (taskId: string, opts?: { fromTimeout?: boolean }) => boolean) => void)
    | undefined
  #timeout: number
  #shouldAutoBackground: boolean
  #resultResolver: ((result: ExecResult) => void) | null = null
  #exitCodeResolver: ((code: number) => void) | null = null
  #boundAbortHandler: (() => void) | null = null
  readonly taskOutput: TaskOutput

  static #handleTimeout(self: ShellCommandImpl): void {
    if (self.#shouldAutoBackground && self.#onTimeoutCallback) {
      // 标记 fromTimeout：自动转后台后由停滞看门狗接管（见 background()）
      self.#onTimeoutCallback((taskId, opts) =>
        self.background(taskId, { fromTimeout: true, ...opts }),
      )
    } else {
      self.#doKill(SIGTERM)
    }
  }

  /** [2026-10-20] 子进程 PID，供后台任务持久化（崩溃后仍能定位孤儿进程）。 */
  get pid(): number | void {
    return this.#childProcess?.pid
  }

  readonly result: Promise<ExecResult>
  readonly onTimeout?: (
    callback: (
      backgroundFn: (taskId: string, opts?: { fromTimeout?: boolean }) => boolean,
    ) => void,
  ) => void

  constructor(
    childProcess: ChildProcess,
    abortSignal: AbortSignal,
    timeout: number,
    taskOutput: TaskOutput,
    shouldAutoBackground = false,
    maxOutputBytes = MAX_TASK_OUTPUT_BYTES,
  ) {
    this.#childProcess = childProcess
    this.#abortSignal = abortSignal
    this.#timeout = timeout
    this.#shouldAutoBackground = shouldAutoBackground
    this.#maxOutputBytes = maxOutputBytes
    this.taskOutput = taskOutput

    // In file mode (bash commands), both stdout and stderr go to the
    // output file fd — childProcess.stdout/.stderr are both null.
    // In pipe mode (hooks), wrap streams to funnel data into TaskOutput.
    this.#stderrWrapper = childProcess.stderr
      ? new StreamWrapper(childProcess.stderr, taskOutput, true)
      : null
    this.#stdoutWrapper = childProcess.stdout
      ? new StreamWrapper(childProcess.stdout, taskOutput, false)
      : null

    if (shouldAutoBackground) {
      this.onTimeout = (callback): void => {
        this.#onTimeoutCallback = callback
      }
    }

    this.result = this.#createResultPromise()
  }

  get status(): 'running' | 'backgrounded' | 'completed' | 'killed' {
    return this.#status
  }

  #abortHandler(): void {
    // On 'interrupt' (user submitted a new message), don't kill — let the
    // caller background the process so the model can see partial output.
    if (this.#abortSignal.reason === 'interrupt') {
      return
    }
    this.kill()
  }

  #exitHandler(code: number | null, signal: NodeJS.Signals | null): void {
    const exitCode =
      code !== null && code !== undefined
        ? code
        : signal === 'SIGTERM'
          ? 144
          : 1
    this.#resolveExitCode(exitCode)
  }

  #errorHandler(): void {
    this.#resolveExitCode(1)
  }

  #resolveExitCode(code: number): void {
    if (this.#exitCodeResolver) {
      this.#exitCodeResolver(code)
      this.#exitCodeResolver = null
    }
  }

  // Note: exit/error listeners are NOT removed here — they're needed for
  // the result promise to resolve. They clean up when the child process exits.
  #cleanupListeners(): void {
    this.#clearSizeWatchdog()
    this.#clearBackgroundWatchdog()
    const timeoutId = this.#timeoutId
    if (timeoutId) {
      clearTimeout(timeoutId)
      this.#timeoutId = null
    }
    const boundAbortHandler = this.#boundAbortHandler
    if (boundAbortHandler) {
      this.#abortSignal.removeEventListener('abort', boundAbortHandler)
      this.#boundAbortHandler = null
    }
  }

  #clearSizeWatchdog(): void {
    if (this.#sizeWatchdog) {
      clearInterval(this.#sizeWatchdog)
      this.#sizeWatchdog = null
    }
  }

  /**
   * [2026-10-20] 转后台后的停滞看门狗。
   *
   * 前台超时定时器在 background() 里被清掉，导致卡死的命令永久失控。这里按
   * "输出停滞"而非"总耗时"判定：后台任务可以合理地跑很久，但**连续
   * BACKGROUND_STALL_MS 没有任何新输出**就意味着它大概率卡在阻塞调用上
   * （MSYS2 管道写、等待永不到来的 stdin 等）。此时杀掉整棵进程树，
   * 让调用方拿到明确的失败结果，而不是无限悬挂。
   *
   * 上限：不看 CPU、不区分命令类型，纯按静默时长判定 —— 长时间静默但仍在
   * 运算的命令（如大模型训练）会被误杀。升级路径：改为同时采样子进程的
   * CPU 时间（uv_times / GetProcessTimes），CPU 增长则视为活跃。
   */
  #startBackgroundWatchdog(): void {
    this.#clearBackgroundWatchdog()
    // 初始基准：文件当前大小 + 当前时间。之后每次轮询比较大小是否变化。
    let lastSize = -1
    let lastChangeAt = Date.now()
    // [2026-10-20] CPU 采样：区分"静默但在算"与"静默且僵死"。
    // 卡在管道写上的进程 CPU 恒为 0；大文件排序/无输出计算 CPU 持续增长。
    // 只有"输出停滞 **且** CPU 也停滞"才判为僵死，避免误杀合法长跑任务。
    let lastCpu: { user: number; system: number } | null = null
    // [2026-10-20 修复-采样并发导致判定错乱]
    //   轮询间隔可能远小于一次 stat + PowerShell 采样的耗时（PowerShell 冷启动
    //   1~2s）。原实现每轮都无条件下发异步任务，于是多轮采样并发执行，且各自
    //   捕获的 lastCpu 都是发起时的旧值 —— 结果互相覆盖：后发起的比较了旧基准、
    //   先返回的又把基准改掉，"是否增长"的结论完全取决于返回顺序。
    //   实测表现：CPU 从 27M 持续涨到 91M 的任务仍被判为僵死并杀掉。
    //   修复：同一时刻只允许一轮在跑，其余轮次直接跳过。
    let busy = false
    this.#backgroundWatchdog = setInterval(() => {
      if (this.#status !== 'backgrounded') {
        this.#clearBackgroundWatchdog()
        return
      }
      if (busy) return
      busy = true
      const done = () => {
        busy = false
      }
      // 必须用**文件大小**而非内存写入时间戳：bash 命令是 file 模式，
      // 子进程直接写 fd，JS 层完全看不到写入（见本文件开头 StreamWrapper 注释）。
      void stat(this.taskOutput.path).then(
        s => {
          if (this.#status !== 'backgrounded' || this.#backgroundWatchdog === null) {
            done()
            return
          }
          if (s.size !== lastSize) {
            lastSize = s.size
            lastChangeAt = Date.now()
            // 有输出即视为活跃，CPU 基准同步刷新
            lastCpu = null
            done()
            return
          }
          if (Date.now() - lastChangeAt < BACKGROUND_STALL_MS) {
            done()
            return
          }
          // 输出已停滞足够久 —— 再看 CPU 是否也停滞
          this.#cpuGrewSince(lastCpu).then(({ grew, sample, unknown }) => {
            if (this.#status !== 'backgrounded' || this.#backgroundWatchdog === null) {
              done()
              return
            }
            // 采样不可用 → 判据缺失。**不要重置 lastChangeAt**：
            // 重置会让"静默时长"永远重新计时，一旦采样持续失败就永远等不到
            // 下一次有效比较（实测：PowerShell 冷启动 ~1s、偶发返回空 → 死循环）。
            // 保持计时继续累积，下一轮直接重试采样。
            if (unknown) {
              done()
              return
            }
            // [2026-10-20 修复-首次采样被判成"无增长"导致误杀]
            //   首次进入此处时 lastCpu 为 null，"是否有增长"无从谈起。
            //   原实现直接把 null 当"没增长"，于是**满载 CPU 的任务也会在
            //   阈值到期的第一时间被杀**（实测：for 循环空转 CPU 从 23M 涨到
            //   115M，仍在 5.9s 被杀）。正确做法：首次只建立基准、重置静默计时，
            //   下一次采样再比较。
            if (lastCpu === null) {
              lastCpu = sample
              lastChangeAt = Date.now()
              done()
              return
            }
            if (grew) {
              // 仍在消耗 CPU：合法长跑任务，重置静默计时，继续观察
              lastCpu = sample
              lastChangeAt = Date.now()
              done()
              return
            }
            this.#killedForBackgroundStall = true
            this.#clearBackgroundWatchdog()
            done()
            this.#doKill(SIGKILL)
          })
        },
        () => {
          // 文件尚未创建（子进程还没输出）不算活跃，也不报错，交给静默计时。
          if (Date.now() - lastChangeAt >= BACKGROUND_STALL_MS) {
            this.#killedForBackgroundStall = true
            this.#clearBackgroundWatchdog()
            done()
            this.#doKill(SIGKILL)
            return
          }
          done()
        },
      )
    }, BACKGROUND_STALL_POLL_MS)
    this.#backgroundWatchdog.unref()
  }

  #clearBackgroundWatchdog(): void {
    if (this.#backgroundWatchdog) {
      clearInterval(this.#backgroundWatchdog)
      this.#backgroundWatchdog = null
    }
  }

  /**
   * [2026-10-20] 采样子进程已经消耗的 CPU 时间，判断距上次采样是否有增长。
   *
   * 用 /proc 读不了 Windows，这里走 `wmic`/`tasklist` 都太重；改用 Node 的
   * `process.cpuUsage()` 会统计**当前进程**（doge-code 自己），不是子进程，
   * 因此不可用。能跨平台且明确指到单个 PID 的只有：
   *   · POSIX：`ps -o time= -p <pid>`（精度 1s，够用）
   *   · Windows：`wmic process where ProcessId=<pid> get UserModeTime,KernelModeTime`
   * 两者都只在"输出已静默 ≥ 阈值"时才执行，频率极低（10 分钟一次级别）。
   *
   * 上限：只看**直接子进程**的 CPU。shell 会拉起孙进程（rg/grep/head），
   * 若卡住的是孙进程而 shell 自身空闲，会判为"无 CPU 活动"从而被杀 ——
   * 对卡死场景这正是想要的结果；对"shell 空闲但在等孙进程干活"的合法场景
   * 存在误判风险。升级路径：Windows 用 GetProcessTimes 遍历子进程树求和。
   */
  async #cpuGrewSince(
    last: { user: number; system: number } | null,
  ): Promise<{ grew: boolean; sample: CpuSample | null; unknown: boolean }> {
    const pid = this.#childProcess?.pid
    if (!pid) return { grew: false, sample: null, unknown: true }
    const sample = await sampleProcessCpu(pid)
    if (!sample) {
      // [2026-10-20] 采样失败（进程已退出 / 系统工具不可用）时**不能**当作
      // "无 CPU 活动" —— 那会直接导致误杀，而这正是本次线上事故的形态：
      // wmic 在 Win11 被移除 → 采样恒失败 → 满载 CPU 的任务照样被杀。
      // 改为标记 unknown，由调用方跳过本轮判定（下一轮再试）。
      return { grew: false, sample: null, unknown: true }
    }
    const grew = !!last && (sample.user > last.user || sample.system > last.system)
    return { grew, sample, unknown: false }
  }

  #startSizeWatchdog(): void {
    this.#sizeWatchdog = setInterval(() => {
      void stat(this.taskOutput.path).then(
        s => {
          // Bail if the watchdog was cleared while this stat was in flight
          // (process exited on its own) — otherwise we'd mislabel stderr.
          if (
            s.size > this.#maxOutputBytes &&
            this.#status === 'backgrounded' &&
            this.#sizeWatchdog !== null
          ) {
            this.#killedForSize = true
            this.#clearSizeWatchdog()
            this.#doKill(SIGKILL)
          }
        },
        () => {
          // ENOENT before first write, or unlinked mid-run — skip this tick
        },
      )
    }, SIZE_WATCHDOG_INTERVAL_MS)
    this.#sizeWatchdog.unref()
  }

  #createResultPromise(): Promise<ExecResult> {
    this.#boundAbortHandler = this.#abortHandler.bind(this)
    this.#abortSignal.addEventListener('abort', this.#boundAbortHandler, {
      once: true,
    })

    // Use 'exit' not 'close': 'close' waits for stdio to close, which includes
    // grandchild processes that inherit file descriptors (e.g. `sleep 30 &`).
    // 'exit' fires when the shell itself exits, returning control immediately.
    this.#childProcess.once('exit', this.#exitHandler.bind(this))
    this.#childProcess.once('error', this.#errorHandler.bind(this))

    this.#timeoutId = setTimeout(
      ShellCommandImpl.#handleTimeout,
      this.#timeout,
      this,
    ) as NodeJS.Timeout

    const exitPromise = new Promise<number>(resolve => {
      this.#exitCodeResolver = resolve
    })

    return new Promise<ExecResult>(resolve => {
      this.#resultResolver = resolve
      void exitPromise.then(this.#handleExit.bind(this))
    })
  }

  async #handleExit(code: number): Promise<void> {
    this.#cleanupListeners()
    if (this.#status === 'running' || this.#status === 'backgrounded') {
      this.#status = 'completed'
    }

    const stdout = await this.taskOutput.getStdout()
    const result: ExecResult = {
      code,
      stdout,
      stderr: this.taskOutput.getStderr(),
      interrupted: code === SIGKILL,
      backgroundTaskId: this.#backgroundTaskId,
    }

    if (this.taskOutput.stdoutToFile && !this.#backgroundTaskId) {
      if (this.taskOutput.outputFileRedundant) {
        // Small file — full content is in result.stdout, delete the file
        void this.taskOutput.deleteOutputFile()
      } else {
        // Large file — tell the caller where the full output lives
        result.outputFilePath = this.taskOutput.path
        result.outputFileSize = this.taskOutput.outputFileSize
        result.outputTaskId = this.taskOutput.taskId
      }
    }

    if (this.#killedForSize) {
      result.stderr = prependStderr(
        `Background command killed: output file exceeded ${MAX_TASK_OUTPUT_BYTES_DISPLAY}`,
        result.stderr,
      )
    } else if (this.#killedForBackgroundStall) {
      result.stderr = prependStderr(
        `Background command killed: no output for ${formatDuration(BACKGROUND_STALL_MS)} ` +
          `(likely blocked on a pipe/stdin; on MSYS2 a \`| head\` consumer exiting can ` +
          `leave the upstream process spinning forever). Set ` +
          `CLAUDE_CODE_BACKGROUND_STALL_MS to raise the limit.`,
        result.stderr,
      )
    } else if (code === SIGTERM) {
      result.stderr = prependStderr(
        `命令超时（已执行 ${formatDuration(this.#timeout)}）`,
        result.stderr,
      )
    }

    const resultResolver = this.#resultResolver
    if (resultResolver) {
      this.#resultResolver = null
      resultResolver(result)
    }
  }

  #doKill(code?: number): void {
    this.#status = 'killed'
    const pid = this.#childProcess.pid
    if (pid) {
      const isWindows = process.platform === 'win32'
      treeKill(pid, 'SIGKILL', err => {
        // [2026-10-20] Windows 上 tree-kill 走 `taskkill /pid <pid> /T /F`，
        // 信号名被忽略 —— 它是"尽力而为"：以下情况会失败而**不报错给调用方**：
        //   · 目标已被回收/复用（ESRCH / "not found"）
        //   · 子进程已脱离进程树（detached 前的旧进程、MSYS2 辅助进程）
        // 失败时退回直接对子进程 kill()，至少保证我们自己 spawn 的那个句柄死掉，
        // 否则 result promise 可能永远不 resolve。
        if (err && this.#childProcess) {
          try {
            this.#childProcess.kill('SIGKILL')
          } catch {
            // 进程已不存在 —— 无需处理
          }
        }
      })
      // 兜底：Windows 上 detached 子进程可能被 taskkill 漏掉，
      // 直接对根句柄补一刀（POSIX 下 tree-kill 已足够，重复 kill 幂等）。
      if (isWindows) {
        try {
          this.#childProcess.kill('SIGKILL')
        } catch {
          // ignore
        }
      }
    }
    this.#resolveExitCode(code ?? SIGKILL)
  }

  kill(): void {
    this.#doKill()
  }

  background(taskId: string, opts?: { fromTimeout?: boolean }): boolean {
    if (this.#status === 'running') {
      this.#backgroundTaskId = taskId
      this.#status = 'backgrounded'
      this.#cleanupListeners()
      // [2026-10-20 修复-MSYS2 管道卡死后永久失控]
      //   原实现在转后台时清掉前台超时定时器，此后该进程再没有任何看门狗。
      //   一旦命令卡死在不可中断的管道写（MSYS2 下 `... | head` 让上游收到
      //   SIGPIPE 却不退出的典型症状），它会一直挂到会话结束，UI 上表现为
      //   "子代理卡死"。转后台只表示"不再让前台等待"，不是放弃终止权。
      //   仅对"前台超时自动转后台"启动停滞看门狗：用户显式后台（Ctrl+B /
      //   run_in_background）是有意的长跑任务，静默期可能远超 10 分钟，
      //   不应被误杀。
      if (opts?.fromTimeout) {
        this.#startBackgroundWatchdog()
      }
      if (this.taskOutput.stdoutToFile) {
        // File mode: child writes directly to the fd with no JS involvement.
        // The foreground timeout is gone, so watch file size to prevent
        // a stuck append loop from filling the disk (768GB incident).
        this.#startSizeWatchdog()
      } else {
        // Pipe mode: spill the in-memory buffer so readers can find it on disk.
        this.taskOutput.spillToDisk()
      }
      return true
    }
    return false
  }

  cleanup(): void {
    this.#stdoutWrapper?.cleanup()
    this.#stderrWrapper?.cleanup()
    this.taskOutput.clear()
    // Must run before nulling #abortSignal — #cleanupListeners() calls
    // removeEventListener on it. Without this, a kill()+cleanup() sequence
    // crashes: kill() queues #handleExit as a microtask, cleanup() nulls
    // #abortSignal, then #handleExit runs #cleanupListeners() on the null ref.
    this.#cleanupListeners()
    // Release references to allow GC of ChildProcess internals and AbortController chain
    this.#childProcess = null!
    this.#abortSignal = null!
    this.#onTimeoutCallback = undefined
  }
}

/**
 * Wraps a child process to enable flexible handling of shell command execution.
 */
export function wrapSpawn(
  childProcess: ChildProcess,
  abortSignal: AbortSignal,
  timeout: number,
  taskOutput: TaskOutput,
  shouldAutoBackground = false,
  maxOutputBytes = MAX_TASK_OUTPUT_BYTES,
): ShellCommand {
  return new ShellCommandImpl(
    childProcess,
    abortSignal,
    timeout,
    taskOutput,
    shouldAutoBackground,
    maxOutputBytes,
  )
}

/**
 * Static ShellCommand implementation for commands that were aborted before execution.
 */
class AbortedShellCommand implements ShellCommand {
  readonly status = 'killed' as const
  readonly result: Promise<ExecResult>
  readonly taskOutput: TaskOutput

  constructor(opts?: {
    backgroundTaskId?: string
    stderr?: string
    code?: number
  }) {
    this.taskOutput = new TaskOutput(generateTaskId('local_bash'), null)
    this.result = Promise.resolve({
      code: opts?.code ?? 145,
      stdout: '',
      stderr: opts?.stderr ?? 'Command aborted before execution',
      interrupted: true,
      backgroundTaskId: opts?.backgroundTaskId,
    })
  }

  background(): boolean {
    return false
  }

  kill(): void {}

  cleanup(): void {}
}

export function createAbortedCommand(
  backgroundTaskId?: string,
  opts?: { stderr?: string; code?: number },
): ShellCommand {
  return new AbortedShellCommand({
    backgroundTaskId,
    ...opts,
  })
}

export function createFailedCommand(preSpawnError: string): ShellCommand {
  const taskOutput = new TaskOutput(generateTaskId('local_bash'), null)
  return {
    status: 'completed' as const,
    result: Promise.resolve({
      code: 1,
      stdout: '',
      stderr: preSpawnError,
      interrupted: false,
      preSpawnError,
    }),
    taskOutput,
    background(): boolean {
      return false
    },
    kill(): void {},
    cleanup(): void {},
  }
}
