<think></think>    statusLineCount = 0
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
        logForDebugging(`QR code generation failed: ${e}`, { level: 'error' })
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
      `${chalk.yellow(frame)} ${chalk.yellow('Connecting')}${suffix}\n`,
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
      // These states are handled separately (updateReconnectingStatus /
      // updateFailedStatus). Return before clearing so callers like toggleQr
      // and setSpawnModeDisplay don't blank the display during these states.
      return
    }

    clearStatusLines()

    const isIdle = currentState === 'idle'

    // QR code above the status line
    if (qrVisible) {
      for (const line of qrLines) {
        writeStatus(`${chalk.dim(line)}\n`)
      }
    }

    // Determine indicator and colors based on state
    const indicator = BRIDGE_READY_INDICATOR
    const indicatorColor = isIdle ? chalk.green : chalk.cyan
    const baseColor = isIdle ? chalk.green : chalk.cyan
    const stateText = baseColor(currentStateText)

    // Build the suffix with repo and branch
    let suffix = ''
    if (repoName) {
      suffix += chalk.dim(' \u00b7 ') + chalk.dim(repoName)
    }
    // In worktree mode each session gets its own branch, so showing the
    // bridge's branch would be misleading.
    if (branch && spawnMode !== 'worktree') {
      suffix += chalk.dim(' \u00b7 ') + chalk.dim(branch)
    }

    if (process.env.USER_TYPE === 'ant' && debugLogPath) {
      writeStatus(
        `${chalk.yellow('[ANT-ONLY] Logs:')} ${chalk.dim(debugLogPath)}\n`,
      )
    }
    writeStatus(`${indicatorColor(indicator)} ${stateText}${suffix}\n`)

    // Session count and per-session list (multi-session mode only)
    if (sessionMax > 1) {
      const modeHint =
        spawnMode === 'worktree'
          ? 'New sessions will be created in an isolated worktree'
          : 'New sessions will be created in the current directory'
      writeStatus(
        `    ${chalk.dim(`Capacity: ${sessionActive}/${sessionMax} \u00b7 ${modeHint}`)}\n`,
      )
      for (const [, info] of sessionDisplayInfo) {
        const titleText = info.title
          ? truncatePrompt(info.title, 35)
          : chalk.dim('Attached')
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

    // Mode line for spawn modes with a single slot (or true single-session mode)
    if (sessionMax === 1) {
      const modeText =
spawnMode === 'single-session'
          ? '单会话模式 \u00b7 完成后退出'
          : spawnMode === 'worktree'
            ? `容量: ${sessionActive}/1 \u00b7 新会话将在隔离的工作目录中创建`
            : `容量: ${sessionActive}/1 \u00b7 新会话将在当前目录中创建`
      writeStatus(`    ${chalk.dim(模式文本)}\n`)
    }

    // 单会话模式下的工具状态行
    if (
      sessionMax === 1 &&
      !idle &&
      lastToolSummary &&
      Date.now() - lastToolTime < TOOL_DISPLAY_EXPIRY_MS
    ) {
      writeStatus(`  ${chalk.dim(截断提示(lastToolSummary, 60))}\n`)
    }

    // 脚注前的空行分隔符
    const url = activeSessionUrl ?? connectUrl
    if (url) {
      writeStatus('\n')
      const footerText = idle
        ? 构建闲置脚注文本(url)
        : 构建活跃脚注文本(url)
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
      connectUrl = 构建桥接连接URL(environmentId, cachedIngressUrl)
      重新生成二维码(connectUrl)

      if (verbose) {
        write(chalk.dim(`远程控制`) + ` v${MACRO.VERSION}\n`)
      }
      if (verbose) {
        if (config.spawnMode !== 'single-session') {
          write(chalk.dim(`生成模式: `) + `${config.spawnMode}\n`)
          write(chalk.dim(`最大并发会话数: `) + `${config.maxSessions}\n`)
        }
        write(chalk.dim(`环境ID: `) + `${environmentId}\n`)
      }
      if (config.sandbox) {
        write(chalk.dim(`沙盒: `) + `${chalk.green('启用')}\n`)
      }
      write('\n')

      // 启动连接中的动画——首次updateIdleStatus()调用将停止它
      开始连接中()
    },

    logSessionStart(sessionId: string, prompt: string): void {
      if (verbose) {
        const short = 截断提示(prompt, 80)
        打印日志(
          chalk.dim(`[${获取时间戳()}]`) +
            ` 会话开始: ${chalk.white(`"${short}"`)} (${chalk.dim(sessionId)})\n`,
        )
      }
    },

    logSessionComplete(sessionId: string, durationMs: number): void {
      打印日志(
        chalk.dim(`[${获取时间戳()}]`) +
          ` 会话 ${chalk.green('完成')} (${格式化持续时间(durationMs)}) ${chalk.dim(sessionId)}\n`,
      )
    },

    logSessionFailed(sessionId: string, error: string): void {
      打印日志(
        chalk.dim(`[${获取时间戳()}]`) +
          ` 会话 ${chalk.red('失败')}: ${error} ${chalk.dim(sessionId)}\n`,
      )
    },

    logStatus(message: string): void {
      打印日志(chalk.dim(`[${获取时间戳()}]`) + ` ${message}\n`)
    },

    logVerbose(message: string): void {
      if (verbose) {
        打印日志(chalk.dim(`[${获取时间戳()}] ${message}`) + '\n')
      }
    },

    logError(message: string): void {
      打印日志(chalk.red(`[${获取时间戳()}] 错误: ${message}`) + '\n')
    },

    logReconnected(disconnectedMs: number): void {
      打印日志(
        chalk.dim(`[${获取时间戳()}]`) +
          ` ${chalk.green('重新连接成功')} (${formatDuration(disconnectedMs)})\n`,
      )
    ),

    setRepoInfo(repo: string, branchName: string): void {
      repoName = repo
      branch = branchName
    },

    setDebugLogPath(path: string): void {
      debugLogPath = path
    },

    updateIdleStatus(): void {
      停止连接中()

      currentState = 'idle'
      currentStateText = 'Ready'
      lastToolSummary = null
      lastToolTime = 0
      activeSessionUrl = null
      重新生成二维码(connectUrl)
      渲染状态行()
    },

    setAttached(sessionId: string): void {
      停止连接中()<｜end▁of▁sentence｜>      currentState = 'attached'
      currentStateText = '已连接'
      lastToolSummary = null
      lastToolTime = 0
      // Multi-session: keep footer/QR on the environment connect URL so users
      // can spawn more sessions. Per-session links are in the bullet list.
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

      // QR code above the status line
      if (qrVisible) {
        for (const line of qrLines) {
          writeStatus(`${chalk.dim(line)}\n`)
        }
      }

      const frame =
        BRIDGE_SPINNER_FRAMES[connectingTick % BRIDGE_SPINNER_FRAMES.length]!
      connectingTick++
      writeStatus(
        `${chalk.yellow(frame)} ${chalk.yellow('Reconnecting')} ${chalk.dim('\u00b7')} ${chalk.dim(`retrying in ${delayStr}`)} ${chalk.dim('\u00b7')} ${chalk.dim(`disconnected ${elapsedStr}`)}\n`,
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
        `${chalk.red(BRIDGE_FAILED_INDICATOR)} ${chalk.red('Remote Control Failed')}${suffix}\n`,
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
      // Cache tool activity for the second status line
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
      // Don't re-render here — the status ticker calls renderStatusLine
      // on its own cadence, and the next tick will pick up the new values.
    },

    setSpawnModeDisplay(mode: 'same-dir' | 'worktree' | null): void {
      if (spawnModeDisplay === mode) return
      spawnModeDisplay = mode
      // Also sync the #21118-added spawnMode so the next render shows correct
      // mode hint + branch visibility. Don't render here — matches
      // updateSessionCount: called before printBanner (initial setup) and
      // again from the `w` handler (which follows with refreshDisplay).
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
      // Guard against reconnecting/failed — renderStatusLine clears then returns
      // early for those states, which would erase the spinner/error.
      if (currentState === 'reconnecting' || currentState === 'failed') return
      if (sessionMax === 1) {
        // Single-session: show title in the main status line too.
        currentState = 'titled'
        currentStateText = truncatePrompt(title, 40)
      }
渲染状态行
},

根据会话ID删除会话：void {
  sessionDisplayInfo.delete(sessionId)
},

刷新显示：void {
  // 在重新连接中/失败时跳过 — 渲染状态行会清除然后提前返回这些状态，
  // 这将擦除旋转器/错误。
  if (currentState === 'reconnecting' || currentState === 'failed') return
  renderStatusLine()
},
}
}<｜end▁of▁sentence｜>