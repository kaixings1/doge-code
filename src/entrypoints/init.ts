import { profileCheckpoint } from '../utils/startupProfiler.js'
import '../bootstrap/state.js'
import '../utils/config.js'
import type { Attributes, MetricOptions } from '@opentelemetry/api'
import memoize from 'lodash-es/memoize.js'
import { getIsNonInteractiveSession } from '../bootstrap/state.js'
import type { AttributedCounter } from '../bootstrap/state.js'
import { getSessionCounter, setMeter } from '../bootstrap/state.js'
import { shutdownLspServerManager } from '../services/lsp/manager.js'
import { populateOAuthAccountInfoIfNeeded } from '../services/oauth/client.js'
import {
  initializePolicyLimitsLoadingPromise,
  isPolicyLimitsEligible,
} from '../services/policyLimits/index.js'
import {
  initializeRemoteManagedSettingsLoadingPromise,
  isEligibleForRemoteManagedSettings,
  waitForRemoteManagedSettingsToLoad,
} from '../services/remoteManagedSettings/index.js'
import { preconnectAnthropicApi } from '../utils/apiPreconnect.js'
import { applyExtraCACertsFromConfig } from '../utils/caCertsConfig.js'
import { registerCleanup } from '../utils/cleanupRegistry.js'
import { enableConfigs, recordFirstStartTime } from '../utils/config.js'
import { logForDebugging } from '../utils/debug.js'
import { detectCurrentRepository } from '../utils/detectRepository.js'
import { logForDiagnosticsNoPII } from '../utils/diagLogs.js'
import { initJetBrainsDetection } from '../utils/envDynamic.js'
import { isEnvTruthy } from '../utils/envUtils.js'
import { ConfigParseError, errorMessage } from '../utils/errors.js'
// showInvalidConfigDialog 在错误路径中动态导入，以避免在初始化时加载 React
import {
  gracefulShutdownSync,
  setupGracefulShutdown,
} from '../utils/gracefulShutdown.js'
import {
  applyConfigEnvironmentVariables,
  applySafeConfigEnvironmentVariables,
} from '../utils/managedEnv.js'
import { configureGlobalMTLS } from '../utils/mtls.js'
import {
  ensureScratchpadDir,
  isScratchpadEnabled,
} from '../utils/permissions/filesystem.js'
// initializeTelemetry 通过 setMeterState() 中的 import() 延迟加载，以推迟
// 约 400KB 的 OpenTelemetry + protobuf 模块，直到遥测实际初始化。
// gRPC 导出器（通过 @grpc/grpc-js 约 700KB）在 instrumentation.ts 中进一步延迟加载。
import { configureGlobalAgents } from '../utils/proxy.js'
import { isBetaTracingEnabled } from '../utils/telemetry/betaSessionTracing.js'
import { getTelemetryAttributes } from '../utils/telemetryAttributes.js'
import { setShellIfWindows } from '../utils/windowsPaths.js'

// initialize1PEventLogging 动态导入以延迟 OpenTelemetry sdk-logs/resources

// 跟踪遥测是否已初始化，以防止重复初始化
let telemetryInitialized = false

export const init = memoize(async (): Promise<void> => {
  const initStartTime = Date.now()
  logForDiagnosticsNoPII('info', 'init_started')
  profileCheckpoint('init_function_start')

  // 验证配置是否有效并启用配置系统
  try {
    const configsStart = Date.now()
    enableConfigs()
    logForDiagnosticsNoPII('info', 'init_configs_enabled', {
      duration_ms: Date.now() - configsStart,
    })
    profileCheckpoint('init_configs_enabled')

    // 在信任对话框之前仅应用安全的环境变量
    // 完整的环境变量在建立信任后应用
    const envVarsStart = Date.now()
    applySafeConfigEnvironmentVariables()

    // 尽早将 settings.json 中的 NODE_EXTRA_CA_CERTS 应用到 process.env，
    // 在任何 TLS 连接之前。Bun 在启动时通过 BoringSSL 缓存 TLS 证书存储，
    // 因此这必须在第一次 TLS 握手之前完成。
    applyExtraCACertsFromConfig()

    logForDiagnosticsNoPII('info', 'init_safe_env_vars_applied', {
      duration_ms: Date.now() - envVarsStart,
    })
    profileCheckpoint('init_safe_env_vars_applied')

    // 确保退出时刷新所有内容
    setupGracefulShutdown()
    profileCheckpoint('init_after_graceful_shutdown')

    // 初始化第一方事件日志记录（没有安全问题，但推迟到启动后以避免
    // 在启动时加载 OpenTelemetry sdk-logs）。growthbook.js 此时已在
    // 模块缓存中（firstPartyEventLogger 导入了它），因此第二次动态导入不会增加加载成本。
    void Promise.all([
      import('../services/analytics/firstPartyEventLogger.js'),
      import('../services/analytics/growthbook.js'),
    ]).then(([fp, gb]) => {
      fp.initialize1PEventLogging()
      // 如果 tengu_1p_event_batch_config 在会话中期更改，则重建日志记录器提供者。
      // 更改检测（isEqual）在处理程序内部，因此未更改的刷新是无操作的。
      gb.onGrowthBookRefresh(() => {
        void fp.reinitialize1PEventLoggingIfConfigChanged()
      })
    })
    profileCheckpoint('init_after_1p_event_logging')

    // 如果 OAuth 账户信息尚未缓存在配置中，则填充它。这是必需的，因为通过
    // VSCode 扩展登录时 OAuth 账户信息可能不会被填充。
    void populateOAuthAccountInfoIfNeeded()
    profileCheckpoint('init_after_oauth_populate')

    // 异步初始化 JetBrains IDE 检测（为后续同步访问填充缓存）
    void initJetBrainsDetection()
    profileCheckpoint('init_after_jetbrains_detection')

    // 异步检测 GitHub 仓库（为 gitDiff PR 链接填充缓存）
    void detectCurrentRepository()

    // 尽早初始化加载 promise，以便其他系统（如插件钩子）
    // 可以等待远程设置加载。该 promise 包含超时，以防止
    // 如果从未调用 loadRemoteManagedSettings() 时发生死锁（例如 Agent SDK 测试）。
    if (isEligibleForRemoteManagedSettings()) {
      initializeRemoteManagedSettingsLoadingPromise()
    }
    if (isPolicyLimitsEligible()) {
      initializePolicyLimitsLoadingPromise()
    }
    profileCheckpoint('init_after_remote_settings_check')

    // 记录首次启动时间
    recordFirstStartTime()

    // 配置全局 mTLS 设置
    const mtlsStart = Date.now()
    logForDebugging('[init] configureGlobalMTLS starting')
    configureGlobalMTLS()
    logForDiagnosticsNoPII('info', 'init_mtls_configured', {
      duration_ms: Date.now() - mtlsStart,
    })
    logForDebugging('[init] configureGlobalMTLS complete')

    // 配置全局 HTTP 代理器（proxy 和/或 mTLS）
    const proxyStart = Date.now()
    logForDebugging('[init] configureGlobalAgents starting')
    configureGlobalAgents()
    logForDiagnosticsNoPII('info', 'init_proxy_configured', {
      duration_ms: Date.now() - proxyStart,
    })
    logForDebugging('[init] configureGlobalAgents complete')
    profileCheckpoint('init_network_configured')

    // 预连接到 Anthropic API — 将 TCP+TLS 握手（约 100-200ms）
    // 与 API 请求前约 100ms 的操作处理器工作重叠。在 CA 证书 + 代理配置之后，
    // 以便预热连接使用正确的传输。即发即弃；对于代理/mTLS/unix/云提供商
    // 会跳过，因为 SDK 的调度器不会重用全局连接池。
    preconnectAnthropicApi()

    // CCR upstreamproxy：启动本地 CONNECT 中继，以便代理子进程
    // 可以通过凭据注入访问组织配置的上游。受 CLAUDE_CODE_REMOTE + GrowthBook
    // 门控；任何错误时故障开放。延迟导入，以便非 CCR 启动不承担模块加载成本。
    // getUpstreamProxyEnv 函数注册到 subprocessEnv.ts 中，以便子进程生成可以
    // 注入代理变量，而无需静态导入 upstreamproxy 模块。
    if (isEnvTruthy(process.env.CLAUDE_CODE_REMOTE)) {
      try {
        const { initUpstreamProxy, getUpstreamProxyEnv } = await import(
          '../upstreamproxy/upstreamproxy.js'
        )
        const { registerUpstreamProxyEnvFn } = await import(
          '../utils/subprocessEnv.js'
        )
        registerUpstreamProxyEnvFn(getUpstreamProxyEnv)
        await initUpstreamProxy()
      } catch (err) {
        logForDebugging(
          `[init] upstreamproxy init failed: ${err instanceof Error ? err.message : String(err)}; continuing without proxy`,
          { level: 'warn' },
        )
      }
    }

    // 如果相关则设置 git-bash
    setShellIfWindows()

    // 注册 LSP 管理器清理（初始化在 main.tsx 中处理 --plugin-dir 后进行）
    registerCleanup(shutdownLspServerManager)

    // gh-32730：由子代理（或没有显式 TeamDelete 的主代理）创建的团队
    // 会永远留在磁盘上。为本会话创建的所有团队注册清理。
    // 延迟导入：swarm 代码在功能门控后面，大多数会话从不创建团队。
    registerCleanup(async () => {
      const { cleanupSessionTeams } = await import(
        '../utils/swarm/teamHelpers.js'
      )
      await cleanupSessionTeams()
    })

    // 如果启用则初始化暂存目录
    if (isScratchpadEnabled()) {
      const scratchpadStart = Date.now()
      await ensureScratchpadDir()
      logForDiagnosticsNoPII('info', 'init_scratchpad_created', {
        duration_ms: Date.now() - scratchpadStart,
      })
    }

    logForDiagnosticsNoPII('info', 'init_completed', {
      duration_ms: Date.now() - initStartTime,
    })
    profileCheckpoint('init_function_end')
  } catch (error) {
    if (error instanceof ConfigParseError) {
      // 当无法安全渲染时跳过交互式 Ink 对话框。
      // 该对话框会破坏 JSON 消费者（例如在 VM 沙箱中运行
      // `plugin marketplace list --json` 的桌面市场插件管理器）。
      if (getIsNonInteractiveSession()) {
        process.stderr.write(
          `Configuration error in ${error.filePath}: ${error.message}\n`,
        )
        gracefulShutdownSync(1)
        return
      }

      // 显示包含错误对象的无效配置对话框，并等待其完成
      return import('../components/InvalidConfigDialog.js').then(m =>
        m.showInvalidConfigDialog({ error }),
      )
      // 对话框本身处理 process.exit，因此我们不需要在此处进行额外的清理
    } else {
      // 对于非配置错误，重新抛出它们
      throw error
    }
  }
})

/**
 * 在用户授予信任后初始化遥测。
 * 对于符合远程设置条件的用户，等待设置加载（非阻塞），
 * 然后在初始化遥测之前重新应用环境变量（以包含远程设置）。
 * 对于不符合条件的用户，立即初始化遥测。
 * 此函数应在信任对话框被接受后仅调用一次。
 */
export function initializeTelemetryAfterTrust(): void {
  if (isEligibleForRemoteManagedSettings()) {
    // 对于使用 beta 追踪的 SDK/无头模式，首先急切初始化，
    // 以确保追踪器在第一次查询运行之前准备就绪。
    // 下面的异步路径仍会运行，但 doInitializeTelemetry() 会防止重复初始化。
    if (getIsNonInteractiveSession() && isBetaTracingEnabled()) {
      void doInitializeTelemetry().catch(error => {
        logForDebugging(
          `[3P telemetry] Eager telemetry init failed (beta tracing): ${errorMessage(error)}`,
          { level: 'error' },
        )
      })
    }
    logForDebugging(
      '[3P telemetry] Waiting for remote managed settings before telemetry init',
    )
    void waitForRemoteManagedSettingsToLoad()
      .then(async () => {
        logForDebugging(
          '[第三方遥测] 远程管理设置已加载，正在初始化遥测',
        )
        // 重新应用环境变量以在初始化遥测之前获取远程设置。
        applyConfigEnvironmentVariables()
        await doInitializeTelemetry()
      })
      .catch(error => {
        logForDebugging(
          `[3P telemetry] Telemetry init failed (remote settings path): ${errorMessage(error)}`,
          { level: 'error' },
        )
      })
  } else {
    void doInitializeTelemetry().catch(error => {
      logForDebugging(
        `[3P telemetry] Telemetry init failed: ${errorMessage(error)}`,
        { level: 'error' },
      )
    })
  }
}

async function doInitializeTelemetry(): Promise<void> {
  if (telemetryInitialized) {
    // 已初始化，无需执行任何操作
    return
  }

  // 在初始化前设置标志以防止重复初始化
  telemetryInitialized = true
  try {
    await setMeterState()
  } catch (error) {
    // 在失败时重置标志，以便后续调用可以重试
    telemetryInitialized = false
    throw error
  }
}

async function setMeterState(): Promise<void> {
  // 延迟加载仪表化以推迟约 400KB 的 OpenTelemetry + protobuf
  const { initializeTelemetry } = await import(
    '../utils/telemetry/instrumentation.js'
  )
  // 初始化客户 OTLP 遥测（指标、日志、追踪）
  const meter = await initializeTelemetry()
  if (meter) {
    // 创建带属性计数器的工厂函数
    const createAttributedCounter = (
      name: string,
      options: MetricOptions,
    ): AttributedCounter => {
      const counter = meter?.createCounter(name, options)

      return {
        add(value: number, additionalAttributes: Attributes = {}) {
          // 始终获取最新的遥测属性以确保它们是最新的
          const currentAttributes = getTelemetryAttributes()
          const mergedAttributes = {
            ...currentAttributes,
            ...additionalAttributes,
          }
          counter?.add(value, mergedAttributes)
        },
      }
    }

    setMeter(meter, createAttributedCounter)

    // 在此处递增会话计数器，因为启动遥测路径在异步初始化完成之前
    // 运行，因此计数器在那里将为 null。
    getSessionCounter()?.add(1)
  }
}
