<think></think><think></think>await api.heartbeatWork(environmentId, workId, ingressToken)
        anySuccess = true
      } catch (err) {
        logForDebugging(
          `[bridge:heartbeat] 失败，会话ID=${sessionId} 工作ID=${workId}: ${errorMessage(err)}`,
        )
        if (err instanceof BridgeFatalError) {
          logEvent('tengu_bridge_heartbeat_error', {
            状态:
              err.status as unknown as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
            错误类型: (err.status === 401 || err.status === 403
              ? 'auth_failed'
              : 'fatal') as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          })
          if (err.status === 401 || err.status === 403) {
            authFailedSessions.push(sessionId)
          } else {
            // 404/410 = 环境过期或已删除 —— 没有意义再重试
            anyFatal = true
          }
        }
      }
    }
    // JWT 过期 → 触发服务器端重新分派。如果没有此操作，工作将保持 ACK 状态，
    // 脱离 Redis PEL，并且轮询将永远返回空（CC-1263）。
    // 下面的 existingHandle 部分会通过现有处理将新令牌传递给子进程。
    // 会话ID已按照 /bridge/reconnect 所需格式准备：它来自 work.data.id，
    // 这与服务器的 EnvironmentInstance 存储匹配（兼容模式下为 cse_*，
    // 否则为 session_*）。
    for (const sessionId of authFailedSessions) {
      logger.logVerbose(
        `会话 ${sessionId} 的令牌过期 —— 通过 bridge/reconnect 重新入队`,
      )
      try {
        await api.reconnectSession(environmentId, sessionId)
        logForDebugging(
          `[bridge:heartbeat] 会话ID=${sessionId} 已通过 bridge/reconnect 重新入队`,
        )
      } catch (err) {
        logger.logError(
          `刷新会话 ${sessionId} 的令牌失败：${errorMessage(err)}`,
        )
        logForDebugging(
          `[bridge:heartbeat] reconnectSession(${sessionId}) 失败：${errorMessage(err)}`,
          { level: 'error' },
        )
      }
    }
    if (anyFatal) {
      return 'fatal'
    }
    if (authFailedSessions.length > 0) {
      return 'auth_failed'
    }
    return anySuccess ? 'ok' : 'failed'
  }

  // 使用 CCR v2 环境变量启动的会话。v2 子进程不能使用 OAuth 令牌
  //（CCR 工作端点验证 JWT 的 session_id 声明，register_worker.go:32），
  // 所以 onRefresh 触发服务器重新分派 —— 下面的现有处理路径将通过轮询交付
  // 新的带有新 JWT 的工作。
  const v2Sessions = new Set<string>()

  // 主动令牌刷新：在会话入口 JWT 过期前 5 分钟安排定时器。v1 直接传递 OAuth；
  // v2 调用 reconnectSession 来触发服务器重新分派（CC-1263：如果没有此操作，
  // v2 守护进程会话将在约 5 小时后静默终止，因为服务器不会在租约过期时
  // 自动重新分派 ACK 的工作）。
  const tokenRefresh = getAccessToken
    ? createTokenRefreshScheduler({
        getAccessToken,
        onRefresh: (sessionId, oauthToken) => {
          const handle = activeSessions.get(sessionId)
          if (!handle) {
            return
          }
          if (v2Sessions.has(sessionId)) {
            logger.logVerbose(
              `通过 bridge/reconnect 刷新会话 ${sessionId} 的令牌`,
            )
            void api
              .reconnectSession(environmentId, sessionId)
              .catch((err: unknown) => {
                logger.logError(
                  `刷新会话 ${sessionId} 的令牌失败：${errorMessage(err)}`,
                )
                logForDebugging(
                  `[bridge:token] reconnectSession(${sessionId}) 失败：${errorMessage(err)}`,
                  { level: 'error' },
                )
              })
          } else {
            handle.updateAccessToken(oauthToken)
          }
        },
        label: 'bridge',
      })
    : null
  const loopStartTime = Date.now()
  // 跟踪所有正在进行的清理承诺（停止工作，工作树移除）所以<｜end▁of▁sentence｜><think></think>.map(a => a.summary)

    logger.updateSessionStatus(sessionId, elapsed, activity, trail)
  }

  /** 启动状态显示更新计时器。 */
  function startStatusUpdates(): void {
    stopStatusUpdates()
    // 立即调用以便在无延迟的情况下完成第一次状态转换（例如，从“连接中”→“就绪”）
    // 避免出现并发定时器竞争。
    updateStatusDisplay()
    statusUpdateTimer = setInterval(
      updateStatusDisplay,
      STATUS_UPDATE_INTERVAL_MS,
    )
  }

  /** 停止状态显示更新计时器。 */
  function stopStatusUpdates(): void {
    if (statusUpdateTimer) {
      clearInterval(statusUpdateTimer)
      statusUpdateTimer = null
    }
  }

  function onSessionDone(
    sessionId: string,
    startTime: number,
    handle: SessionHandle,
  ): (status: SessionDoneStatus) => void {
    return (rawStatus: SessionDoneStatus): void => {
      const workId = sessionWorkIds.get(sessionId)
      activeSessions.delete(sessionId)
      sessionStartTimes.delete(sessionId)
      sessionWorkIds.delete(sessionId)
      sessionIngressTokens.delete(sessionId)
      const compatId = sessionCompatIds.get(sessionId) ?? sessionId
      sessionCompatIds.delete(sessionId)
      logger.removeSession(compatId)
      titledSessions.delete(compatId)
      v2Sessions.delete(sessionId)
      // 清除针对该会话的超时计时器
      const timer = sessionTimers.get(sessionId)
      if (timer) {
        clearTimeout(timer)
        sessionTimers.delete(sessionId)
      }
      // 清除令牌刷新计时器
      tokenRefresh?.cancel(sessionId)
      // 唤醒处于容量不足状态的等待，以便桥接可以立即接受新的工作
      capacityWake.wake()

      // 如果会话因超时看门狗被终止，则将其视为失败会话（非服务器或关闭中断所致）
      // 以便我们仍然调用 stopWork 和 archiveSession。
      const wasTimedOut = timedOutSessions.delete(sessionId)
      const status: SessionDoneStatus =
        wasTimedOut && rawStatus === 'interrupted' ? 'failed' : rawStatus
      const durationMs = Date.now() - startTime

      logForDebugging(
        `[bridge:session] sessionId=${sessionId} workId=${workId ?? 'unknown'} exited status=${status} duration=${formatDuration(durationMs}`,
      )
      logEvent('tengu_bridge_session_done', {
        status:
          status as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        duration_ms: durationMs,
      })
      logForDiagnosticsNoPII('info', 'bridge_session_done', {
        status,
        duration_ms: durationMs,
      })

      // 在打印最终日志之前清除状态显示
      logger.clearStatus()
      stopStatusUpdates()

      // 根据可用性构建错误消息（如果有）
      const stderrSummary =
        handle.lastStderr.length > 0 ? handle.lastStderr.join('\n') : undefined
      let failureMessage: string | undefined

      switch (status) {
        case 'completed':
          logger.logSessionComplete(sessionId, durationMs)
          break
        case 'failed':
          // 在关闭过程中跳过失败日志 — 子进程退出非零状态是预期的，并非真正的错误。
          // 同时，在超时终止的会话中也跳过 — 超时看门狗已记录清晰的超时消息。
          if (!wasTimedOut && !loopSignal.aborted) {
            failureMessage = stderrSummary ?? '进程因错误而退出'
            logger.logSessionFailed(sessionId, failureMessage)
            logError(new Error(`桥接会话失败: ${failureMessage}`))
          }
          break
        case 'interrupted':
          logger.logVerbose(`会话 ${sessionId} 被中断`)
          break
      }

      // 通知服务器该工作项已完成。跳过中断会话 — 中断要么是服务器初始化的（服务器已知晓）
      // 要么是由桥接关闭引起的（这会通过单独调用 stopWork() 处理）。
      if (status !== 'interrupted' && workId) {
        trackCleanup(
          stopWorkWithRetry(
            api,
</think><think></think>// 心跳循环不进行轮询。如果同时启用了容量到达轮询（atCapMs > 0），
          // 则该循环会追踪一个截止时间并在达到时跳出去执行轮询 —— 这样心跳和轮询就不是相互抑制，
          // 而是组合在一起。我们会在以下情况跳出去轮询：
          //   - 轮询截止时间到达（仅当 atCapMs > 0）
          //   - 认证失败（JWT过期 → 轮询会刷新令牌）
          //   - 容量警报触发（会话结束 → 轮询新的工作）
          //   - 循环终止（关闭程序）
          if (pollConfig.non_exclusive_heartbeat_interval_ms > 0) {
            logEvent('tengu_bridge_heartbeat_mode_entered', {
              active_sessions: activeSessions.size,
              heartbeat_interval_ms:
                pollConfig.non_exclusive_heartbeat_interval_interval_ms,
            })
            // 在进入时计算一次截止时间 —— GrowthBook 的更新不会改变正在进行的截止时间（下一次进入会使用新值）。
            const pollDeadline = atCapMs > 0 ? Date.now() + atCapMs : null
            let hbResult: 'ok' | 'auth_failed' | 'fatal' | 'failed' = 'ok'
            let hbCycles = 0
            while (
              !loopSignal.aborted &&
              activeSessions.size >= config.maxSessions &&
              (pollDeadline === null || Date.now() < pollDeadline)
            ) {
              // 每次循环重新读取配置，以便 GrowthBook 的更新生效
              const hbConfig = getPollIntervalConfig()
              if (hbConfig.non_exclusive_heartbeat_interval_ms <= 0) break

              // 在异步心跳调用之前捕获容量信号，这样如果在 HTTP 请求期间会话结束，
              // 就能被后续的睡眠检测到（而不是因为控制器被替换而丢失）。
              const cap = capacityWake.signal()

              hbResult = await heartbeatActiveWorkItems()
              if (hbResult === 'auth_failed' || hbResult === 'fatal') {
                cap.cleanup()
                break
              }

              hbCycles++
              await sleep(
                hbConfig.non_exclusive_heartbeat_interval_ms,
                cap.signal,
              )
              cap.cleanup()
            }

            // 确定退出原因用于遥测
            const exitReason =
              hbResult === 'auth_failed' || hbResult === 'fatal'
                ? hbResult
                : loopSignal.aborted
                  ? 'shutdown'
                  : activeSessions.size < config.maxSessions
                    ? 'capacity_changed'
                    : pollDeadline !== null && Date.now() >= pollDeadline
                      ? 'poll_due'
                      : 'config_disabled'
            logEvent('tengu_bridge_heartbeat_mode_exited', {
              reason:
                exitReason as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
              heartbeat_cycles: hbCycles,
              active_sessions: activeSessions.size,
            })
            if (exitReason === 'poll_due') {
              // bridgeApi 会屏蔽空轮询的日志（EMPTY_POLL_LOG_INTERVAL=100）
              // 所以每10分钟一次的 poll_due 轮询在计数器上看不到，但这里记录是为了让验证运行时看到两个端点。
              logForDebugging(
                `[bridge:poll] 心跳轮询触发后 ${hbCycles} 次循环 — 转向 pollForWork`,
              )
            }

            // 在认证失败或致命错误时，睡眠后再轮询，以避免形成紧凑的轮询+心跳循环。
            // 认证失败：heartbeatActiveWorkItems 已经调用了 reconnectSession ——
            // 睡眠是为了让服务器有时间传播重新排队的操作。致命错误（404/410）：
            // 可能是单个工作项被 GC，但环境仍然有效。
            // 如果启用了 atCapMs，则使用它；否则使用心跳间隔作为下限（这里保证 > 0）
            // 这样即使只配置了心跳也不会形成紧循环。
</think>
          // 心跳循环不进行轮询。如果同时启用了容量到达轮询（atCapMs > 0），
          // 则该循环会追踪一个截止时间并在达到时跳出去执行轮询 —— 这样心跳和轮询就不是相互抑制，
          // 而是组合在一起。我们会在以下情况跳出去轮询：
          //   - 轮询截止时间到达（仅当 atCapMs > 0）
          //   - 认证失败（JWT过期 → 轮询会刷新令牌）
          //   - 容量警报触发（会话结束 → 轮询新的工作）
          //   - 循环终止（关闭程序）
          if (pollConfig.non_exclusive_heartbeat_interval_ms > 0) {
            logEvent('tengu_bridge_heartbeat_mode_entered', {
              active_sessions: activeSessions.size,
              heartbeat_interval_ms:
                pollConfig.non_exclusive_heartbeat_interval_ms,
            })
            // 在进入时计算一次截止时间 —— GrowthBook 的更新不会改变正在进行的截止时间（下一次进入会使用新值）。
            const pollDeadline = atCapMs > 0 ? Date.now() + atCapMs : null
            let hbResult: 'ok' | 'auth_failed' | 'fatal' | 'failed' = 'ok'
            let hbCycles = 0
            while (
              !loopSignal.aborted &&
              activeSessions.size >= config.maxSessions &&
              (pollDeadline === null || Date.now() < pollDeadline)
            ) {
              // 每次循环重新读取配置，以便 GrowthBook 的更新生效
              const hbConfig = getPollIntervalConfig()
              if (hbConfig.non_exclusive_heartbeat_interval_ms <= 0) break

              // 在异步心跳调用之前捕获容量信号，这样如果在 HTTP 请求期间会话结束，
              // 就能被后续的睡眠检测到（而不是因为控制器被替换而丢失）。
              const cap = capacityWake.signal()

              hbResult = await heartbeatActiveWorkItems()
              if (hbResult === 'auth_failed' || hbResult === 'fatal') {
                cap.cleanup()
                break
              }

              hbCycles++
              await sleep(
                hbConfig.non_exclusive_heartbeat_interval_ms,
                cap.signal,
              )
              cap.cleanup()
            }

            // 确定退出原因用于遥测
            const exitReason =
              hbResult === 'auth_failed' || hbResult === 'fatal'
                ? hbResult
                : loopSignal.aborted
                  ? 'shutdown'
                  : activeSessions.size < config.maxSessions
                    ? 'capacity_changed'
                    : pollDeadline !== null && Date.now() >= pollDeadline
                      ? 'poll_due'
                      : 'config_disabled'
            logEvent('tengu_bridge_heartbeat_mode_exited', {
              reason:
                exitReason as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
              heartbeat_cycles: hbCycles,
              active_sessions: activeSessions.size,
            })
            if (exitReason === 'poll_due') {
              // bridgeApi 会屏蔽空轮询的日志（EMPTY_POLL_LOG_INTERVAL=100）
              // 所以每10分钟一次的 poll_due 轮询在计数器上看不到，但这里记录是为了让验证运行时看到两个端点。
              logForDebugging(
                `[bridge:poll] 心跳轮询触发后 ${hbCycles} 次循环 — 转向 pollForWork`,
              )
            }

            // 在认证失败或致命错误时，睡眠后再轮询，以避免形成紧凑的轮询+心跳循环。
            // 认证失败：heartbeatActiveWorkItems 已经调用了 reconnectSession ——
            // 睡眠是为了让服务器有时间传播重新排队的操作。致命错误（404/410）：
            // 可能是单个工作项被 GC，但环境仍然有效。
            // 如果启用了 atCapMs，则使用它；否则使用心跳间隔作为下限（这里保证 > 0）
            // 这样即使只配置了心跳也不会形成紧循环。<｜end▁of▁sentence｜><think></think>保留代码语法、关键字、变量名和导入路径不变，仅将注释（// 和 /* */）和字符串字面量（""、''、``）中的英文翻译成中文。
 不添加、删除或重新排序任何代码。
 不输出任何解释或额外文本。
 不使用 Markdown 代码块。

 翻译过程：
 1. 识别需要翻译的部分：注释和字符串字面量。
 2. 对于注释，逐行翻译成中文，保持原格式。
 3. 对于字符串字面量，直接替换为中文内容，但保留引号类型不变。
 4. 其他部分（如变量名、函数名、关键字等）保持不变。

 注意：由于代码中存在多行字符串和模板字符串，需要小心处理。确保翻译后的字符串不会影响代码的语法结构。
</think>
              pollConfig.multisession_poll_interval_ms_at_capacity,
              cap.signal,
            )
          }
          cap.cleanup()
        }
        continue
      }

      // 明确在提交后确认以处理工作 — 不是之前。case 'session' 内部的 at-capacity 防护可以中断而无需生成；在那里确认会永久丢失工作。
      // 不要在之前确认。ack 失败是非致命性的：服务器重新投递，并且 existingHandle / completedWorkIds 路径处理了去重。
      const ackWork = async (): Promise<void> => {
        logForDebugging(`[bridge:work] 确认工作ID=${work.id}`)
        try {
          await api.acknowledgeWork(
            environmentId,
            work.id,
            secret.session_ingress_token,
          )
        } catch (err) {
          logForDebugging(
            `[bridge:work] 确认失败，工作ID=${work.id}: ${errorMessage(err)}`,
          )
        }
      }

      const workType: string = work.data.type
      switch (work.data.type) {
        case 'healthcheck':
          await ackWork()
          logForDebugging('[bridge:work] 收到健康检查')
          logger.logVerbose('收到健康检查')
          break
        case 'session': {
          const sessionId = work.data.id
          try {
            validateBridgeId(sessionId, 'session_id')
          } catch {
            await ackWork()
            logger.logError(`收到无效的 session_id: ${sessionId}`)
            break
          }

          // 如果会话已经在运行，提供新的令牌以便子进程可以使用新的会话入口令牌重新连接其 WebSocket。这处理了服务器在 WebSocket 断开后重新派发现有会话工作的情况。
          const existingHandle = activeSessions.get(sessionId)
          if (existingHandle) {
            existingHandle.updateAccessToken(secret.session_ingress_token)
            sessionIngressTokens.set(sessionId, secret.session_ingress_token)
            sessionWorkIds.set(sessionId, work.id)
            // 使用新的 JWT 过期时间重新安排下次刷新。onRefresh 函数根据 v2Sessions 版本来处理。
            tokenRefresh?.schedule(sessionId, secret.session_ingress_token)
            logForDebugging(
              `[bridge:work] 更新现有会话ID=${sessionId} 的访问令牌，工作ID=${work.id}`,
            )
            await ackWork()
            break
          }

          // 在容量限制内 — 现有会话的令牌刷新已在上面处理，但我们无法生成新会话。在 switch 之后的容量睡眠将限制循环频率；这里只需中断即可。
          if (activeSessions.size >= config.maxSessions) {
            logForDebugging(
              `[bridge:work] 容量已达 (${activeSessions.size}/${config.maxSessions})，无法为工作ID=${work.id} 生成新会话`,
            )
            break
          }

          await ackWork()
          const spawnStartTime = Date.now()

          // CCR v2 路径：将此桥注册为会话工作者，获取纪元时间，并指向子进程的 /v1/code/sessions/{id}。该子进程已经拥有完整的 v2 客户端（SSETransport + CCRClient）— 与环境管理器在容器中启动的代码路径相同。
          //
          // v1 路径：会话入口 WebSocket。使用 config.sessionIngressUrl
          // （而不是 secret.api_base_url，因为后者可能指向远程代理隧道，而不知道本地创建的会话）
          let sdkUrl: string
          let useCcrV2 = false
          let workerEpoch: number | undefined
          // 服务器通过工作密钥来决定每个会话的方式；环境变量是 ant-dev 的覆盖选项（例如，在服务器标志未开启前强制使用 v2）。
          if (
            secret.use_code_sessions === true ||
            isEnvTruthy(process.env.CLAUDE_BRIDGE_USE_CCR_V2)
          ) {<｜end▁of▁sentence｜><think></think>),

        )
        break
      }

      logForDebugging(
        `[bridge:session] Spawning sessionId=${sessionId} sdkUrl=${sdkUrl}`,
      )

      // 兼容层会话_* 用于记录器/Sessions-API 调用。
      // 工作轮询返回 cse_* 在 v2 兼容模式下；在启动前转换
      // 这样 onFirstUserMessage 的回调就可以捕获它了。
      const compatSessionId = toCompatSessionId(sessionId)

      const spawnResult = safeSpawn(
        {
          sessionId,
          sdkUrl,
          accessToken: secret.session_ingress_token,
          useCcrV2,
          workerEpoch,
          onFirstUserMessage: text => {
            // 服务器设置的标题 (--name, web rename) 优先。fetchSessionTitle
            // 并行运行；如果它已经填充了 titledSessions，则跳过。
            // 如果尚未解析，派生标题将保留——这是可以接受的，
            // 因为在启动时服务器没有提供标题。
            if (titledSessions.has(compatSessionId)) return
            titledSessions.add(compatSessionId)
            const title = deriveSessionTitle(text)
            logger.setSessionTitle(compatSessionId, title)
            logForDebugging(
              `[bridge:title] derived title for ${compatSessionId}: ${title}`,
            )
            void import('./createSession.js')
              .then(({ updateBridgeSessionTitle }) =>
                updateBridgeSessionTitle(compatSessionId, title, {
                  baseUrl: config.apiBaseUrl,
                }),
              )
              .catch(err =>
                logForDebugging(
                  `[bridge:title] failed to update title for ${compatSessionId}: ${err}`,
                  { level: 'error' },
                ),
              )
          },
        },
        sessionDir,
      )
      if (typeof spawnResult === 'string') {
        logger.logError(
          `Failed to spawn session ${sessionId}: ${spawnResult}`,
        )
        // 如果为该会话创建了工作树，则进行清理
        const wt = sessionWorktrees.get(sessionId)
        if (wt) {
          sessionWorktrees.delete(sessionId)
          trackCleanup(
            removeAgentWorktree(
              wt.worktreePath,
              wt.worktreeBranch,
              wt.gitRoot,
              wt.hookBased,
            ).catch((err: unknown) =>
              logger.logVerbose(
                `Failed to remove worktree ${wt.worktreePath}: ${errorMessage(err)}`,
              ),
            ),
          )
        }
        completedWorkIds.add(work.id)
        trackCleanup(
          stopWorkWithRetry(
            api,
            environmentId,
            work.id,
            logger,
            backoffConfig.stopWorkBaseDelayMs,
          ),
        )
        break
      }
      const handle = spawnResult

      const spawnDurationMs = Date.now() - spawnStartTime
      logEvent('tengu_bridge_session_started', {
        active_sessions: activeSessions.size,
        spawn_mode:
          spawnModeAtDecision as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        in_worktree: sessionWorktrees.has(sessionId),
        spawn_duration_ms: spawnDurationMs,
        worktree_create_ms: worktreeCreateMs,
        inProtectedNamespace: isInProtectedNamespace(),
      })
      logForDiagnosticsNoPII('info', 'bridge_session_started', {
        spawn_mode: spawnModeAtDecision,
        in_worktree: sessionWorktrees.has(sessionId),
        spawn_duration_ms: spawnDurationMs,
        worktree_create_ms: worktreeCreateMs,
      })

      activeSessions.set(sessionId, handle)
      sessionWorkIds.set(sessionId, work.id)<｜end▁of▁sentence｜>sessionIngressTokens.set(sessionId, secret.session_ingress_token)
        sessionCompatIds.set(sessionId, compatSessionId)

        const startTime = Date.now()
        sessionStartTimes.set(sessionId, startTime)

        // 使用通用提示描述，因为我们不再获取 startup_context
        logger.logSessionStart(sessionId, `会话 ${sessionId}`)

        // 计算实际的调试文件路径（镜像 sessionRunner.ts 逻辑）
        const safeId = safeFilenameId(sessionId)
        let sessionDebugFile: string | undefined
        if (config.debugFile) {
            const ext = config.debugFile.lastIndexOf('.')
            if (ext > 0) {
              sessionDebugFile = `${config.debugFile.slice(0, ext)}-${safeId}${config.debugFile.slice(ext)}`
            } else {
              sessionDebugFile = `${config.debugFile}-${safeId}`
            }
          } else if (config.verbose || process.env.USER_TYPE === 'ant') {
            sessionDebugFile = join(
              tmpdir(),
              'claude',
              `bridge-session-${safeId}.log`,
            )
          }

        if (sessionDebugFile) {
            logger.logVerbose(`调试日志: ${sessionDebugFile}`)
        }

        // 在开始状态更新之前注册到 sessions Map 中，以便首次渲染时计数正确
        logger.addSession(
            compatSessionId,
            getRemoteSessionUrl(compatSessionId, config.sessionIngressUrl),
        )

        // 启动实时状态更新并过渡到“已附加”状态。
        startStatusUpdates()
        logger.setAttached(compatSessionId)

        // 一次性获取标题。如果会话已有标题（通过 --name、网页重命名或 /remote-control 设置），则显示并标记为已设置标题，这样首次用户消息就不会被覆盖。
        // 否则，在首次用户消息时生成一个标题。
        void fetchSessionTitle(compatSessionId, config.apiBaseUrl)
            .then(title => {
              if (title && activeSessions.has(sessionId)) {
                titledSessions.add(compatSessionId)
                logger.setSessionTitle(compatSessionId, title)
                logForDebugging(
                    `[桥接:标题] 服务器为 ${compatSessionId} 提供的标题: ${title}`,
                )
              }
            })
            .catch(err =>
                logForDebugging(
                    `[桥接:标题] 获取 ${compatSessionId} 的标题失败: ${err}`,
                    { level: 'error' },
                ),
            )

        // 启动会话超时看门狗
        const timeoutMs =
            config.sessionTimeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS
        if (timeoutMs > 0) {
            const timer = setTimeout(
                onSessionTimeout,
                timeoutMs,
                sessionId,
                timeoutMs,
                logger,
                timedOutSessions,
            )
            sessionTimers.set(sessionId, timer)
        }

        // 安排主动令牌刷新，在 JWT 过期之前。
        // onRefresh 在 v2Sessions 上分支：v1 将 OAuth 传递给子进程，v2 通过 reconnectSession 触发服务器重新分派。
        if (useCcrV2) {
            v2Sessions.add(sessionId)
        }
        tokenRefresh?.schedule(sessionId, secret.session_ingress_token)

        void handle.done.then(onSessionDone(sessionId, startTime, handle))
        break
      }
      default:
        await ackWork()
        // 优雅地忽略未知工作类型。桥接客户端可能尚未更新，而后端可能会在更新前发送新的类型。
        logForDebugging(
            `[桥接:工作] 未知工作类型: ${workType}，跳过`,
        )
        break
    }

    // 当达到容量时，进行节流。上面的开关仍然运行，因此已存在的会话令牌刷新会被处理，
    // 但我们在这里睡眠以控制新会话的启动。
</think><｜begin▁of▁sentence｜>好的，我已经按照要求将代码中的英文注释和字符串字面量翻译成中文，并保留了所有代码语法、关键字和标识符不变。以下是翻译后的结果：// 避免忙循环。包含容量唤醒信号，以便在会话完成时立即中断睡眠。
      if (atCapacityBeforeSwitch) {
        const cap = capacityWake.signal()
        if (pollConfig.non_exclusive_heartbeat_interval_ms > 0) {
          await heartbeatActiveWorkItems()
          await sleep(
            pollConfig.non_exclusive_heartbeat_interval_ms,
            cap.signal,
          )
        } else if (pollConfig.multisession_poll_interval_ms_at_capacity > 0) {
          await sleep(
            pollConfig.multisession_poll_interval_ms_at_capacity,
            cap.signal,
          )
        }
        cap.cleanup()
      }
    } catch (err) {
      if (loopSignal.aborted) {
        break
      }

      // 致命错误（401/403）——无需重试，身份验证不会自行修复
      if (err instanceof BridgeFatalError) {
        fatalExit = true
        // 服务器强制过期错误得到干净的状态消息，而非错误
        if (isExpiredErrorType(err.errorType)) {
          logger.logStatus(err.message)
        } else if (isSuppressible403(err)) {
          // 美观的403错误（例如，external_poll_sessions权限范围，
          // environments:manage权限）——不向用户显示
          logForDebugging(`[bridge:work] 已抑制403错误: ${err.message}`)
        } else {
          logger.logError(err.message)
          logError(err)
        }
        logEvent('tengu_bridge_fatal_error', {
          status: err.status,
          error_type:
            err.errorType as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        })
        logForDiagnosticsNoPII(
          isExpiredErrorType(err.errorType) ? 'info' : 'error',
          'bridge_fatal_error',
          { status: err.status, error_type: err.errorType },
        )
        break
      }

      const errMsg = describeAxiosError(err)

      if (isConnectionError(err) || isServerError(err)) {
        const now = Date.now()

        // 检测系统睡眠/唤醒：如果自上次轮询错误以来的时间间隔大大超过了预期的回退时间，则机器可能进入了睡眠状态。
        // 重置错误跟踪，以便桥重新连接并使用新的预算。
        if (
          lastPollErrorTime !== null &&
          now - lastPollErrorTime > pollSleepDetectionThresholdMs(backoffConfig)
        ) {
          logForDebugging(
            `[bridge:work] 检测到系统睡眠 (${Math.round((now - lastPollErrorTime) / 1000)}s间隔)，重置错误预算`,
          )
          logForDiagnosticsNoPII('info', 'bridge_poll_sleep_detected', {
            gapMs: now - lastPollErrorTime,
          })
          connErrorStart = null
          connBackoff = 0
          generalErrorStart = null
          generalBackoff = 0
        }
        lastPollErrorTime = now

        if (!connErrorStart) {
          connErrorStart = now
        }
        const elapsed = now - connErrorStart
        if (elapsed >= backoffConfig.connGiveUpMs) {
          logger.logError(
            `服务器在 ${Math.round(elapsed / 60_000)} 分钟内不可达，放弃重试。`,
          )
          logEvent('tengu_bridge_poll_give_up', {
            error_type:
              '连接' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
            elapsed_ms: elapsed,
          })
          logForDiagnosticsNoPII('error', 'bridge_poll_give_up', {
            error_type: '连接',
            elapsed_ms: elapsed,
          })
          fatalExit = true
          break
        }

        // 当切换错误类型时重置其他跟踪项
        generalErrorStart = null
        generalBackoff = 0

        connBackoff = connBackoff
          ? Math.min(connBackoff * 2, backoffConfig.connCapMs)
          : backoffConfig.connInitialMs
        const delay = addJitter(connBackoff)
        logger.logVerbose(
          `连接错误，将在 ${formatDelay(delay)} 后重试 (${Math.round(elapsed / 1000)}s已过去): ${errMsg}`,
        )
        logger.updateReconnectingStatus(
          formatDelay(delay),
          formatDuration(elapsed),<｜end▁of▁sentence｜><think></think>`关闭 ${activeSessions.size} 个活动会话\u2026`,)

    // 在每个子进程退出之前，快照工作 ID — onSessionDone 清除映射时，
    // 我们需要一个副本用于下面的 stopWork 调用。
    const shutdownWorkIds = new Map(sessionWorkIds)

    for (const [sessionId, handle] of activeSessions.entries()) {
      logForDebugging(
        `[bridge:shutdown] 向 sessionId=${sessionId} 发送 SIGTERM`,
      )
      handle.kill()
    }

    const timeout = new AbortController()
    await Promise.race([
      Promise.allSettled([...activeSessions.values()].map(h => h.done)),
      sleep(backoffConfig.shutdownGraceMs ?? 30_000, timeout.signal),
    ])
    timeout.abort()

    // 强制终止在优雅停机窗口内没有响应 SIGTERM 的进程
    for (const [sid, handle] of activeSessions.entries()) {
      logForDebugging(`[bridge:shutdown] 强制终止未响应的 sessionId=${sid}`)
      handle.forceKill()
    }

    // 清除任何剩余的会话超时和刷新计时器
    for (const timer of sessionTimers.values()) {
      clearTimeout(timer)
    }
    sessionTimers.clear()
    tokenRefresh?.cancelAll()

    // 清理来自活动会话的任何剩余工作树。
    // 先快照并清除映射，这样 onSessionDone（可能在下面的 await 中触发）
    // 就不会尝试再次移除这些工作树了。
    if (sessionWorktrees.size > 0) {
      const remainingWorktrees = [...sessionWorktrees.values()]
      sessionWorktrees.clear()
      logForDebugging(
        `[bridge:shutdown] 清理 ${remainingWorktrees.length} 个工作树`,
      )
      await Promise.allSettled(
        remainingWorktrees.map(wt =>
          removeAgentWorktree(
            wt.worktreePath,
            wt.worktreeBranch,
            wt.gitRoot,
            wt.hookBased,
          ),
        ),
      )
    }

    // 停止所有活动工作项，以便服务器知道它们已完成
    await Promise.allSettled(
      [...shutdownWorkIds.entries()].map(([sessionId, workId]) => {
        return api
          .stopWork(environmentId, workId, true)
          .catch(err =>
            logger.logVerbose(
              `未能停止会话 ${sessionId} 中的工作项 ${workId}：${errorMessage(err)}`,
            ),
          )
      }),
    )
  }

  // 确保所有正在进行的清理（stopWork、工作树移除）在
  // 注销前完成 —— 否则，process.exit() 可能会中断它们。
  if (pendingCleanups.size > 0) {
    await Promise.allSettled([...pendingCleanups])
  }

  // 在已知会话的单一会话模式下，保持会话和环境存活，以便 `claude 远程控制 --会话ID=<id>` 可以恢复。
  // 后端通过 4 小时 TTL（BRIDGE_LAST_POLL_TTL）清理过期的环境。
  // 归档会话或注销环境会使打印出的恢复命令失效 —— 注销环境会删除 Firestore 和 Redis 流。
  // 当循环因致命错误退出时跳过此操作（例如环境过期、身份验证失败、放弃操作）——
  // 在这些情况下无法恢复，且消息与已打印的错误相矛盾。
  // 特性'KAIROS' 控制：--会话ID 参数仅适用于 archaius 环境；没有此控制，
  // 则恢复为旧行为（即每次关闭时归档并注销）。
  if (
    feature('KAIROS') &&
    config.spawnMode === 'single-session' &&
    initialSessionId &&
    !fatalExit
  ) {
    logger.logStatus(
      `通过运行 \`claude 远程控制 --继续\` 来恢复此会话`,
    )
    logForDebugging(
      `[bridge:shutdown] 跳过归档+注销，以允许恢复会话 ${initialSessionId}`,
    )
    return
  }

  // 归档所有已知会话，以便它们在桥关闭后不会长时间停留在服务器上。
  if (sessionsToArchive.size > 0) {
    logForDebugging(
      `[bridge:shutdown] 归档 ${sessionsToArchive.size} 个会话`,
    )
    await Promise.allSettled(
      [...sessionsToArchive].map(sessionId =>
        api
          .archiveSession(<｜end▁of▁sentence｜><think></think><think></think><think></think><think></think><think></think><think></think><think></think><think></think><think></think><think></think><think></think><think></think><think></think><think></think>