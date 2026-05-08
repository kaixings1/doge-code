import chalk from 'chalk'
import { toString as qrToString } from 'qrcode'
import {
  BRIDGE_FAILED_INDICATOR,
  BRIDGE_READY_INDICATOR,
  BRIDGE_SPINNER_FRAMES,
} from '../constants/figures.js'
import { stringWidth } from '../ink/stringWidth.js'
import { logForDebugging } from '../utils/debug.js'
import {
  buildActiveFooterText,
  buildBridgeConnectUrl,
  buildBridgeSessionUrl,
  buildIdleFooterText,
  FAILED_FOOTER_TEXT,
  formatDuration,
  type StatusState,
  TOOL_DISPLAY_EXPIRY_MS,
  timestamp,
  truncatePrompt,
  wrapWithOsc8Link,
} from './bridgeStatusUtil.js'
import type {
  BridgeConfig,
  BridgeLogger,
  SessionActivity,
  SpawnMode,
} from './types.js'

const QR_OPTIONS = {
  type: 'utf8' as const,
  errorCorrectionLevel: 'L' as const,
  small: true,
}

/** Generate a QR code and return its lines. */
async function generateQr(url: string): Promise<string[]> {
  const qr = await qrToString(url, QR_OPTIONS)
  return qr.split('\n').filter((line: string) => line.length > 0)
}

export function createBridgeLogger(options: {
  verbose: boolean
  write?: (s: string) => void
}): BridgeLogger {
  const write = options.write ?? ((s: string) => process.stdout.write(s))
  const verbose = options.verbose

  // 跟踪当前在底部显示的状态行数
  let statusLineCount = 0

  // 状态机
  let currentState: StatusState = 'idle'
  let currentStateText = '就绪'
  let repoName = ''
  let branch = ''
  let debugLogPath = ''

  // 连接 URL（在 printBanner 中构建，带 staging/prod 的正确 base）
  let connectUrl = ''
  let cachedIngressUrl = ''
  let cachedEnvironmentId = ''
  let activeSessionUrl: string | null = null

  // 当前 URL 的二维码行
  let qrLines: string[] = []
  let qrVisible = false

  // 第二个状态行的工具活动
  let lastToolSummary: string | null = null
  let lastToolTime = 0

  // 会话计数指示器（启用多会话模式时显示）
  let sessionActive = 0
  let sessionMax = 1
  // session-count 行中显示的启动模式 + 控制 `w` 提示
  let spawnModeDisplay: 'same-dir' | 'worktree' | null = null
  let spawnMode: SpawnMode = 'single-session'

  // 多会话项目符号列表的每会话显示信息（键为 compat sessionId）
  const sessionDisplayInfo = new Map<
    string,
    { title?: string; url: string; activity?: SessionActivity }
  >()

  // 连接旋转器状态
  let connectingTimer: ReturnType<typeof setInterval> | null = null
  let connectingTick = 0

  /**
   * Count how many visual terminal rows a string occupies, accounting for
   * line wrapping. Each `\n` is one row, and content wider than the terminal
   * wraps to additional rows.
   */
  function countVisualLines(text: string): number {
    // eslint-disable-next-line custom-rules/prefer-use-terminal-size
    const cols = process.stdout.columns || 80 // non-React CLI context
    let count = 0
    // 按换行符分割以获取逻辑行
    for (const logical of text.split('\n')) {
      if (logical.length === 0) {
        // 连续 \n 之间的空段 — 计为 1 行
        count++
        continue
      }
      const width = stringWidth(logical)
      count += Math.max(1, Math.ceil(width / cols))
    }
    // "line\n" 中的尾部 \n 会产生空最后一个元素 — 不计入
    // 因为光标位于下一行的开头，而不是新的视觉行。
    if (text.endsWith('\n')) {
      count--
    }
    return count
  }

  /** Write a status line and track its visual line count. */
  function writeStatus(text: string): void {
    write(text)
    statusLineCount += countVisualLines(text)
  }

  /** Clear any currently displayed status lines. */
  function clearStatusLines(): void {
    if (statusLineCount <= 0) return
    logForDebugging(`[bridge:ui] clearStatusLines count=${statusLineCount}`)
    // 将光标移到状态块开头，然后删除下方所有内容
    write(`\x1b[${statusLineCount}A`) // cursor up N lines
    write('\x1b[J') // erase from cursor to end of screen
    statusLineCount = 0
  }

  /** Print a permanent log line, clearing status first and restoring after. */
  function printLog(line: string): void {
    clearStatusLines()
    write(line)
  }

  /** Regenerate the QR code with the given URL. */
  function regenerateQr(url: string): void {
    generateQr(url)
      .then(lines => {
        qrLines = lines
        renderStatusLine()
      })
      .catch(e => {
        logForDebugging(`二维码生成失败: ${e}`, { level: 'error' })
      })
  }

  /** Render the connecting spinner line (shown before first updateIdleStatus). */
  function renderConnectingLine(): void {
    clearStatusLines()

    const frame =
      BRIDGE_SPINNER_FRAMES[connectingTick % BRIDGE_SPINNER_FRAMES.length]!
    let suffix = ''
    if (repoName) {
      suffix += chalk.dim(' \u00b7 ') + chalk.dim(repoName)
    }
    if (branch) {
      suffix += chalk.dim(' \u00b7 ') + chalk.dim(branch)
    }
    writeStatus(
      `${chalk.yellow(frame)} ${chalk.yellow('正在连接')}${suffix}\n`,
    )
  }

  /** Start the connecting spinner. Stopped by first updateIdleStatus(). */
  function startConnecting(): void {
    stopConnecting()
    renderConnectingLine()
    connectingTimer = setInterval(() => {
      connectingTick++
      renderConnectingLine()
    }, 150)
  }

  /** Stop the connecting spinner. */
  function stopConnecting(): void {
    if (connectingTimer) {
      clearInterval(connectingTimer)
      connectingTimer = null
    }
  }

  /** Render and write the current status lines based on state. */
  function renderStatusLine(): void {
    if (currentState === 'reconnecting' || currentState === 'failed') {
      // 这些状态单独处理（updateReconnectingStatus /
      // updateFailedStatus）。在清除之前返回，这样像 toggleQr
      // 和 setSpawnModeDisplay 这样的调用者不会在这些状态下清空显示。
      return
    }

    clearStatusLines()

    const isIdle = currentState === 'idle'

    // 状态线上方的二维码
    if (qrVisible) {
      for (const line of qrLines) {
        writeStatus(`${chalk.dim(line)}\n`)
      }
    }

    // 根据状态确定指示器和颜色
    const indicator = BRIDGE_READY_INDICATOR
    const indicatorColor = isIdle ? chalk.green : chalk.cyan
    const baseColor = isIdle ? chalk.green : chalk.cyan
    const stateText = baseColor(currentStateText)

    // 用 repo 和 branch 构建后缀
    let suffix = ''
    if (repoName) {
      suffix += chalk.dim(' \u00b7 ') + chalk.dim(repoName)
    }
    // 在 worktree 模式下每个会话都有自己的分支，因此显示
    // 桥的分支会误导。
    if (branch && spawnMode !== 'worktree') {
      suffix += chalk.dim(' \u00b7 ') + chalk.dim(branch)
    }

    if (process.env.USER_TYPE === 'ant' && debugLogPath) {
      writeStatus(
        `${chalk.yellow('[ANT-ONLY] 日志:')} ${chalk.dim(debugLogPath)}\n`,
      )
    }
    writeStatus(`${indicatorColor(indicator)} ${stateText}${suffix}\n`)

    // 会话计数和每会话列表（仅多会话模式）
    if (sessionMax > 1) {
      const modeHint =
        spawnMode === 'worktree'
          ? '新会话将在隔离的工作树中创建'
          : '新会话将在当前目录中创建'
      writeStatus(
        `    ${chalk.dim(`容量: ${sessionActive}/${sessionMax} \u00b7 ${modeHint}`)}\n`,
      )
      for (const [, info] of sessionDisplayInfo) {
        const titleText = info.title
          ? truncatePrompt(info.title, 35)
          : chalk.dim('已附加')
        const titleLinked = wrapWithOsc8Link(titleText, info.url)
        const act = info.activity
        const showAct = act && act.type !== 'result' && act.type !== 'error'
        const actText = showAct
          ? chalk.dim(` ${truncatePrompt(act.summary, 40)}`)
          : ''
        writeStatus(`    ${titleLinked}${actText}
`)
      }
    }

    // 单槽启动模式的模式行（或真正的单会话模式）
    if (sessionMax === 1) {
      const modeText =
        spawnMode === 'single-session'
          ? '单会话 \u00b7 完成后退出'
          : spawnMode === 'worktree'
            ? `容量: ${sessionActive}/1 \u00b7 新会话将在隔离的工作树中创建`
            : `容量: ${sessionActive}/1 \u00b7 新会话将在当前目录中创建`
      writeStatus(`    ${chalk.dim(modeText)}\n`)
    }

    // 单会话模式的工具活动行
    if (
      sessionMax === 1 &&
      !isIdle &&
      lastToolSummary &&
      Date.now() - lastToolTime < TOOL_DISPLAY_EXPIRY_MS
    ) {
      writeStatus(`  ${chalk.dim(truncatePrompt(lastToolSummary, 60))}\n`)
    }

    // 页脚前的空行分隔符
    const url = activeSessionUrl ?? connectUrl
    if (url) {
      writeStatus('\n')
      const footerText = isIdle
        ? buildIdleFooterText(url)
        : buildActiveFooterText(url)
      const qrHint = qrVisible
        ? chalk.dim.italic('按空格键隐藏二维码')
        : chalk.dim.italic('按空格键显示二维码')
      const toggleHint = spawnModeDisplay
        ? chalk.dim.italic(' \u00b7 按 w 切换生成模式')
        : ''
      writeStatus(`${chalk.dim(footerText)}\n`)
      writeStatus(`${qrHint}${toggleHint}\n`)
    }
  }

  return {
    printBanner(config: BridgeConfig, environmentId: string): void {
      cachedIngressUrl = config.sessionIngressUrl
      cachedEnvironmentId = environmentId
      connectUrl = buildBridgeConnectUrl(environmentId, cachedIngressUrl)
      regenerateQr(connectUrl)

      if (verbose) {
        write(chalk.dim(`远程控制`) + ` v${MACRO.VERSION}\n`)
      }
      if (verbose) {
        if (config.spawnMode !== 'single-session') {
          write(chalk.dim(`生成模式: `) + `${config.spawnMode}\n`)
          write(
            chalk.dim(`最大并发会话数: `) + `${config.maxSessions}\n`,
          )
        }
        write(chalk.dim(`环境 ID: `) + `${environmentId}\n`)
      }
      if (config.sandbox) {
        write(chalk.dim(`沙盒: `) + `${chalk.green('已启用')}\n`)
      }
      write('\n')

      // 启动连接旋转器 — 首先 updateIdleStatus() 会停止它
      startConnecting()
    },

    logSessionStart(sessionId: string, prompt: string): void {
      if (verbose) {
        const short = truncatePrompt(prompt, 80)
        printLog(
          chalk.dim(`[${timestamp()}]`) +
            ` 会话已启动: ${chalk.white(`"${short}"`)} (${chalk.dim(sessionId)})\n`,
        )
      }
    },

    logSessionComplete(sessionId: string, durationMs: number): void {
      printLog(
        chalk.dim(`[${timestamp()}]`) +
          ` 会话${chalk.green('已完成')} (${formatDuration(durationMs)}) ${chalk.dim(sessionId)}\n`,
      )
    },

    logSessionFailed(sessionId: string, error: string): void {
      printLog(
        chalk.dim(`[${timestamp()}]`) +
          ` 会话${chalk.red('失败')}: ${error} ${chalk.dim(sessionId)}\n`,
      )
    },

    logStatus(message: string): void {
      printLog(chalk.dim(`[${timestamp()}]`) + ` ${message}\n`)
    },

    logVerbose(message: string): void {
      if (verbose) {
        printLog(chalk.dim(`[${timestamp()}] ${message}`) + '\n')
      }
    },

    logError(message: string): void {
      printLog(chalk.red(`[${timestamp()}] 错误: ${message}`) + '\n')
    },

    logReconnected(disconnectedMs: number): void {
      printLog(
        chalk.dim(`[${timestamp()}]`) +
          ` ${chalk.green('已重新连接')}，耗时 ${formatDuration(disconnectedMs)}\n`,
      )
    },

    setRepoInfo(repo: string, branchName: string): void {
      repoName = repo
      branch = branchName
    },

    setDebugLogPath(path: string): void {
      debugLogPath = path
    },

    updateIdleStatus(): void {
      stopConnecting()

      currentState = 'idle'
      currentStateText = '就绪'
      lastToolSummary = null
      lastToolTime = 0
      activeSessionUrl = null
      regenerateQr(connectUrl)
      renderStatusLine()
    },

    setAttached(sessionId: string): void {
      stopConnecting()
      currentState = 'attached'
      currentStateText = '已连接'
      lastToolSummary = null
      lastToolTime = 0
      // 多会话：保持页脚/QR 在环境连接 URL 上，这样用户
      // 可以启动更多会话。每个会话链接在项目符号列表中。
      if (sessionMax <= 1) {
        activeSessionUrl = buildBridgeSessionUrl(
          sessionId,
          cachedEnvironmentId,
          cachedIngressUrl,
        )
        regenerateQr(activeSessionUrl)
      }
      renderStatusLine()
    },

    updateReconnectingStatus(delayStr: string, elapsedStr: string): void {
      stopConnecting()
      clearStatusLines()
      currentState = 'reconnecting'

      // 状态线上方的二维码
      if (qrVisible) {
        for (const line of qrLines) {
          writeStatus(`${chalk.dim(line)}\n`)
        }
      }

      const frame =
        BRIDGE_SPINNER_FRAMES[connectingTick % BRIDGE_SPINNER_FRAMES.length]!
      connectingTick++
      writeStatus(
        `${chalk.yellow(frame)} ${chalk.yellow('正在重新连接')} ${chalk.dim('\u00b7')} ${chalk.dim(`${delayStr}后重试`)} ${chalk.dim('\u00b7')} ${chalk.dim(`已断开 ${elapsedStr}`)}\n`,
      )
    },

    updateFailedStatus(error: string): void {
      stopConnecting()
      clearStatusLines()
      currentState = 'failed'

      let suffix = ''
      if (repoName) {
        suffix += chalk.dim(' \u00b7 ') + chalk.dim(repoName)
      }
      if (branch) {
        suffix += chalk.dim(' \u00b7 ') + chalk.dim(branch)
      }

      writeStatus(
        `${chalk.red(BRIDGE_FAILED_INDICATOR)} ${chalk.red('远程控制失败')}${suffix}\n`,
      )
      writeStatus(`${chalk.dim(FAILED_FOOTER_TEXT)}\n`)

      if (error) {
        writeStatus(`${chalk.red(error)}\n`)
      }
    },

    updateSessionStatus(
      _sessionId: string,
      _elapsed: string,
      activity: SessionActivity,
      _trail: string[],
    ): void {
      // 缓存第二个状态行的工具活动
      if (activity.type === 'tool_start') {
        lastToolSummary = activity.summary
        lastToolTime = Date.now()
      }
      renderStatusLine()
    },

    clearStatus(): void {
      stopConnecting()
      clearStatusLines()
    },

    toggleQr(): void {
      qrVisible = !qrVisible
      renderStatusLine()
    },

    updateSessionCount(active: number, max: number, mode: SpawnMode): void {
      if (sessionActive === active && sessionMax === max && spawnMode === mode)
        return
      sessionActive = active
      sessionMax = max
      spawnMode = mode
      // 不要在这里重新渲染 — 状态轮播调用 renderStatusLine
      // 在它的自己的节奏上，下一次滴答将获取新值。
    },

    setSpawnModeDisplay(mode: 'same-dir' | 'worktree' | null): void {
      if (spawnModeDisplay === mode) return
      spawnModeDisplay = mode
      // 还要同步 #21118 添加的 spawnMode，以便下一次渲染显示正确
      // 模式提示 + 分支可见性。不要在此处渲染 — 匹配
      // updateSessionCount：在 printBanner 之前调用（初始设置）并
      // 从 `w` 处理程序再次调用（随后进行 refreshDisplay）。
      if (mode) spawnMode = mode
    },

    addSession(sessionId: string, url: string): void {
      sessionDisplayInfo.set(sessionId, { url })
    },

    updateSessionActivity(sessionId: string, activity: SessionActivity): void {
      const info = sessionDisplayInfo.get(sessionId)
      if (!info) return
      info.activity = activity
    },

    setSessionTitle(sessionId: string, title: string): void {
      const info = sessionDisplayInfo.get(sessionId)
      if (!info) return
      info.title = title
      // 防止 reconnecting/failed — renderStatusLine 清除然后返回
      // 针对这些状态，这将擦除旋转器/错误。
      if (currentState === 'reconnecting' || currentState === 'failed') return
      if (sessionMax === 1) {
        // 单会话：在主状态行中也显示标题。
        currentState = 'titled'
        currentStateText = truncatePrompt(title, 40)
      }
      renderStatusLine()
    },

    removeSession(sessionId: string): void {
      sessionDisplayInfo.delete(sessionId)
    },

    refreshDisplay(): void {
      // 在 reconnecting/failed 期间跳过 — renderStatusLine 清除然后返回
      // 针对这些状态提前，这将擦除旋转器/错误。
      if (currentState === 'reconnecting' || currentState === 'failed') return
      renderStatusLine()
    },
  }
}
