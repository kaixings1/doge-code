import { feature } from 'bun:bundle';
import { appendFileSync } from 'fs';
import React from 'react';
import { logEvent } from './services/analytics/index.js';
import { gracefulShutdown, gracefulShutdownSync } from './utils/gracefulShutdown.js';
import { type ChannelEntry, getAllowedChannels, setAllowedChannels, setHasDevChannels, setSessionTrustAccepted, setStatsStore } from './bootstrap/state.js';
import type { Command } from './commands.js';
import { createStatsStore, type StatsStore } from './context/stats.js';
import { getSystemContext } from './context.js';
import { initializeTelemetryAfterTrust } from './entrypoints/init.js';
import { isSynchronizedOutputSupported } from './ink/terminal.js';
import type { RenderOptions, Root, TextProps } from './ink.js';
import { KeybindingSetup } from './keybindings/KeybindingProviderSetup.js';
import { startDeferredPrefetches } from './main.js';
import { checkGate_CACHED_OR_BLOCKING, initializeGrowthBook, resetGrowthBook } from './services/analytics/growthbook.js';
import { isQualifiedForGrove } from './services/api/grove.js';
import { handleMcpjsonServerApprovals } from './services/mcpServerApproval.js';
import { AppStateProvider } from './state/AppState.js';
import { onChangeAppState } from './state/onChangeAppState.js';
import { normalizeApiKeyForConfig } from './utils/authPortable.js';
import { getExternalClaudeMdIncludes, getMemoryFiles, shouldShowClaudeMdExternalIncludesWarning } from './utils/claudemd.js';
import { checkHasTrustDialogAccepted, getCustomApiKeyStatus, getGlobalConfig, saveGlobalConfig } from './utils/config.js';
import { updateDeepLinkTerminalPreference } from './utils/deepLink/terminalPreference.js';
import { isEnvTruthy, isRunningOnHomespace } from './utils/envUtils.js';
import { type FpsMetrics, FpsTracker } from './utils/fpsTracker.js';
import { updateGithubRepoPathMapping } from './utils/githubRepoPathMapping.js';
import { applyConfigEnvironmentVariables } from './utils/managedEnv.js';
import type { PermissionMode } from './utils/permissions/PermissionMode.js';
import { getBaseRenderOptions } from './utils/renderOptions.js';
import { getSettingsWithAllErrors } from './utils/settings/allErrors.js';
import { hasAutoModeOptIn, hasSkipDangerousModePermissionPrompt } from './utils/settings/settings.js';
export function completeOnboarding(): void {
  saveGlobalConfig(current => ({
    ...current,
    hasCompletedOnboarding: true,
    lastOnboardingVersion: MACRO.VERSION
  }));
}
export function showDialog<T = void>(root: Root, renderer: (done: (result: T) => void) => React.ReactNode): Promise<T> {
  return new Promise<T>(resolve => {
    const done = (result: T): void => void resolve(result);
    root.render(renderer(done));
  });
}

/**
 * 通过 Ink 渲染错误消息，然后卸载并退出。
 * 在创建 Ink 根之后用于致命错误 —
 * console.error 被 Ink 的 patchConsole 吞掉，所以我们改为通过 React 树渲染。
 */
export async function exitWithError(root: Root, message: string, beforeExit?: () => Promise<void>): Promise<never> {
  return exitWithMessage(root, message, {
    color: 'error',
    beforeExit
  });
}

/**
 * 通过 Ink 渲染消息，然后卸载并退出。
 * 用于在创建 Ink 根之后显示消息 —
 * console 输出被 Ink 的 patchConsole 吞掉，所以我们改为通过 React 树渲染。
 */
export async function exitWithMessage(root: Root, message: string, options?: {
  color?: TextProps['color'];
  exitCode?: number;
  beforeExit?: () => Promise<void>;
}): Promise<never> {
  const {
    Text
  } = await import('./ink.js');
  const color = options?.color;
  const exitCode = options?.exitCode ?? 1;
  root.render(color ? <Text color={color}>{message}</Text> : <Text>{message}</Text>);
  root.unmount();
  await options?.beforeExit?.();
  // eslint-disable-next-line custom-rules/no-process-exit -- exit after Ink unmount
  process.exit(exitCode);
}

/**
 * 显示包裹在 AppStateProvider + KeybindingSetup 中的设置对话框。
 * 减少 showSetupScreens() 中的样板代码，每个对话框都需要这些包装器。
 */
export function showSetupDialog<T = void>(root: Root, renderer: (done: (result: T) => void) => React.ReactNode, options?: {
  onChangeAppState?: typeof onChangeAppState;
}): Promise<T> {
  return showDialog<T>(root, done => <AppStateProvider onChangeAppState={options?.onChangeAppState}>
      <KeybindingSetup>{renderer(done)}</KeybindingSetup>
    </AppStateProvider>);
}

/**
 * 将主 UI 渲染到根节点并等待其退出。
 * 处理通用结尾：启动延迟预取，等待退出，优雅关闭。
 */
export async function renderAndRun(root: Root, element: React.ReactNode): Promise<void> {
  root.render(element);
  startDeferredPrefetches();
  await root.waitUntilExit();
  await gracefulShutdown(0);
}
export async function showSetupScreens(root: Root, permissionMode: PermissionMode, allowDangerouslySkipPermissions: boolean, commands?: Command[], claudeInChrome?: boolean, devChannels?: ChannelEntry[]): Promise<boolean> {
  if ("production" === 'test' || isEnvTruthy(false) || process.env.IS_DEMO // 演示模式下跳过入门教程
  ) {
    return false;
  }
  const config = getGlobalConfig();
  let onboardingShown = false;
  if (!config.theme || !config.hasCompletedOnboarding // 始终至少显示一次入门教程
  ) {
    onboardingShown = true;
    const {
      Onboarding
    } = await import('./components/Onboarding.js');
    await showSetupDialog(root, done => <Onboarding onDone={() => {
      completeOnboarding();
      void done();
    }} />, {
      onChangeAppState
    });
  }

  // 始终在交互式会话中显示信任对话框，无论权限模式如何。
  // 信任对话框是工作区信任边界 — 它警告有关不受信任的仓库
  // 并检查 CLAUDE.md 外部包含。bypassPermissions 模式
  // 仅影响工具执行权限，不影响工作区信任。
  // 注意：非交互式会话（CI/CD 带 -p）根本不会到达 showSetupScreens。
  // 在 claubbit 中跳过权限检查
  if (!isEnvTruthy(process.env.CLAUBBIT)) {
    // 快速路径：当 CWD 已经受信任时跳过 TrustDialog 导入+渲染。
    // 如果返回 true，TrustDialog 将自动解析，无论
    // 安全功能如何，因此我们可以跳过动态导入和渲染循环。
    if (!checkHasTrustDialogAccepted()) {
      const {
        TrustDialog
      } = await import('./components/TrustDialog/TrustDialog.js');
      await showSetupDialog(root, done => <TrustDialog commands={commands} onDone={done} />);
    }

    // 信号表明此会话的信任已验证。
    // GrowthBook 检查此标志以决定是否包含认证头。
    setSessionTrustAccepted(true);

    // 信任建立后重置并重新初始化 GrowthBook。
    // 登录/注销的防御：清除任何之前的客户端，以便下次初始化
    // 获取新的认证头。
    resetGrowthBook();
    void initializeGrowthBook();

    // 现在信任已建立，预取系统上下文（如果尚未）。
    void getSystemContext();

    // 如果设置有效，检查是否有需要批准的 mcp.json 服务器
    const {
      errors: allErrors
    } = getSettingsWithAllErrors();
    if (allErrors.length === 0) {
      await handleMcpjsonServerApprovals(root);
    }

    // 检查需要批准的 claude.md 外部包含
    if (await shouldShowClaudeMdExternalIncludesWarning()) {
      const externalIncludes = getExternalClaudeMdIncludes(await getMemoryFiles(true));
      const {
        ClaudeMdExternalIncludesDialog
      } = await import('./components/ClaudeMdExternalIncludesDialog.js');
      await showSetupDialog(root, done => <ClaudeMdExternalIncludesDialog onDone={done} isStandaloneDialog externalIncludes={externalIncludes} />);
    }
  }

  // 跟踪当前仓库路径以进行 teleport 目录切换（即发即忘）
  // 这必须在信任之后发生，以防止不受信任的目录污染映射
  void updateGithubRepoPathMapping();
  if (feature('LODESTONE')) {
    updateDeepLinkTerminalPreference();
  }

  // 在信任对话框接受后或绕过模式下应用完整的环境变量
  // 在绕过模式（CI/CD、自动化）中，我们信任环境，因此应用所有变量
  // 在正常模式下，这发生在信任对话框接受之后
  // 这包括来自不受信任来源的可能危险环境变量
  applyConfigEnvironmentVariables();

  // 在应用环境变量后初始化遥测，以便 OTEL 端点环境变量和
  // otelHeadersHelper（需要信任才能执行）可用。
  // 延迟到下一个 tick，以便 OTel 动态导入在首次渲染后解析，
  // 而不是在预渲染微任务队列期间。
  setImmediate(() => initializeTelemetryAfterTrust());
  if (await isQualifiedForGrove()) {
    const {
      GroveDialog
    } = await import('src/components/grove/Grove.js');
    const decision = await showSetupDialog<string>(root, done => <GroveDialog showIfAlreadyViewed={false} location={onboardingShown ? 'onboarding' : 'policy_update_modal'} onDone={done} />);
    if (decision === 'escape') {
      logEvent('tengu_grove_policy_exited', {});
      gracefulShutdownSync(0);
      return false;
    }
  }

  // 检查自定义 API 密钥
  // 在 homespace 上，DOGE_API_KEY 保留在 process.env 中供子进程使用，
  // 但 Claude Code 本身会忽略它（见 auth.ts）。
  if (process.env.DOGE_API_KEY && !isRunningOnHomespace()) {
    const customApiKeyTruncated = normalizeApiKeyForConfig(process.env.DOGE_API_KEY);
    const keyStatus = getCustomApiKeyStatus(customApiKeyTruncated);
    if (keyStatus === 'new') {
      const {
        ApproveApiKey
      } = await import('./components/ApproveApiKey.js');
      await showSetupDialog<boolean>(root, done => <ApproveApiKey customApiKeyTruncated={customApiKeyTruncated} onDone={done} />, {
        onChangeAppState
      });
    }
  }
  if ((permissionMode === 'bypassPermissions' || allowDangerouslySkipPermissions) && !hasSkipDangerousModePermissionPrompt()) {
    const {
      BypassPermissionsModeDialog
    } = await import('./components/BypassPermissionsModeDialog.js');
    await showSetupDialog(root, done => <BypassPermissionsModeDialog onAccept={done} />);
  }
  if (feature('TRANSCRIPT_CLASSIFIER')) {
    // 仅当自动模式实际解析时才显示选择加入对话框 — 如果
    // 网关拒绝了它（组织未列入允许列表、设置已禁用），
    // 显示不可用功能的同意是毫无意义的。
    // verifyAutoModeGateAccess 通知将解释原因。
    if (permissionMode === 'auto' && !hasAutoModeOptIn()) {
      const {
        AutoModeOptInDialog
      } = await import('./components/AutoModeOptInDialog.js');
      await showSetupDialog(root, done => <AutoModeOptInDialog onAccept={done} onDecline={() => gracefulShutdownSync(1)} declineExits />);
    }
  }

  // --dangerously-load-development-channels 确认。接受后，追加
  // 开发频道到 main.tsx 中已设置的任何 --channels 列表。组织策略
  // 未被绕过 — gateChannelServer() 仍在运行；此标志仅用于
  // 规避 --channels 批准的服务器允许列表。
  if (feature('KAIROS') || feature('KAIROS_CHANNELS')) {
    // gateChannelServer 和 ChannelsNotice 在此函数返回后读取 tengu_harbor。
    // 冷磁盘缓存（全新安装，或服务器端添加标志后的首次运行）
    // 默认为 false 并在整个会话期间静默丢弃频道通知 — gh#37026。
    // checkGate_CACHED_OR_BLOCKING 如果磁盘已经显示 true 则立即返回；
    // 仅在冷/过期 false 缓存时阻塞（等待之前触发的相同 memoized
    // initializeGrowthBook 承诺）。还会预热下面开发频道对话框中的
    // isChannelsEnabled() 检查。
    if (getAllowedChannels().length > 0 || (devChannels?.length ?? 0) > 0) {
      await checkGate_CACHED_OR_BLOCKING('tengu_harbor');
    }
    if (devChannels && devChannels.length > 0) {
      const [{
        isChannelsEnabled
      }, {
        getClaudeAIOAuthTokens
      }] = await Promise.all([import('./services/mcp/channelAllowlist.js'), import('./utils/auth.js')]);
      // 当频道被阻塞时跳过对话框（tengu_harbor 关闭或无 OAuth）
      // — 接受后立即在 ChannelsNotice 中看到"不可用"比没有对话框更糟。
      // 无论如何都要追加条目，以便 ChannelsNotice 渲染阻塞分支，
      // 并命名开发条目。这里的 dev:true 用于 ChannelsNotice 中的标志标签
      // （hasNonDev 检查）；它授予的允许列表绕过也无意义，
      // 因为网关会阻塞上游。
      if (!isChannelsEnabled() || !getClaudeAIOAuthTokens()?.accessToken) {
        setAllowedChannels([...getAllowedChannels(), ...devChannels.map(c => ({
          ...c,
          dev: true
        }))]);
        setHasDevChannels(true);
      } else {
        const {
          DevChannelsDialog
        } = await import('./components/DevChannelsDialog.js');
        await showSetupDialog(root, done => <DevChannelsDialog channels={devChannels} onAccept={() => {
          // 标记每个开发条目的 dev 标志，以便允许列表绕过不会泄漏
          // 到 --channels 条目（当同时传递两个标志时）。
          setAllowedChannels([...getAllowedChannels(), ...devChannels.map(c => ({
            ...c,
            dev: true
          }))]);
          setHasDevChannels(true);
          void done();
        }} />);
      }
    }
  }

  // 为首次使用 Chrome 版 Claude 的用户显示 Chrome 入门教程
  if (claudeInChrome && !getGlobalConfig().hasCompletedClaudeInChromeOnboarding) {
    const {
      ClaudeInChromeOnboarding
    } = await import('./components/ClaudeInChromeOnboarding.js');
    await showSetupDialog(root, done => <ClaudeInChromeOnboarding onDone={done} />);
  }
  return onboardingShown;
}
export function getRenderContext(exitOnCtrlC: boolean): {
  renderOptions: RenderOptions;
  getFpsMetrics: () => FpsMetrics | undefined;
  stats: StatsStore;
} {
  let lastFlickerTime = 0;
  const baseOptions = getBaseRenderOptions(exitOnCtrlC);

  // 当 stdin 覆盖激活时记录分析事件
  if (baseOptions.stdin) {
    logEvent('tengu_stdin_interactive', {});
  }
  const fpsTracker = new FpsTracker();
  const stats = createStatsStore();
  setStatsStore(stats);

  // 基准模式：设置时，将每帧阶段耗时记录为 JSONL，供
  // bench/repl-scroll.ts 离线分析使用。捕获完整的 TUI
  // 渲染管线（yoga → 屏幕缓冲区 → diff → 优化 → stdout），
  // 以便对任何阶段的性能工作都可以根据真实用户流程进行验证。
  const frameTimingLogPath = process.env.CLAUDE_CODE_FRAME_TIMING_LOG;
  return {
    getFpsMetrics: () => fpsTracker.getMetrics(),
    stats,
    renderOptions: {
      ...baseOptions,
      onFrame: event => {
        fpsTracker.record(event.durationMs);
        stats.observe('frame_duration_ms', event.durationMs);
        if (frameTimingLogPath && event.phases) {
          // 仅限基准的环境变量门控路径：同步写入，以免突然退出时丢失帧
          // 在 ≤60fps 下约 100 字节可忽略不计。rss/cpu 都是单次系统调用；
          // cpu 是累积的 — 基准侧计算差值。
          const line =
          // eslint-disable-next-line custom-rules/no-direct-json-operations -- tiny object, hot bench path
          JSON.stringify({
            total: event.durationMs,
            ...event.phases,
            rss: process.memoryUsage.rss(),
            cpu: process.cpuUsage()
          }) + '\n';
          // eslint-disable-next-line custom-rules/no-sync-fs -- bench-only, sync so no frames dropped on exit
          appendFileSync(frameTimingLogPath, line);
        }
        // 对支持同步输出的终端跳过闪烁报告 —
        // DEC 2026 在 BSU/ESU 之间缓冲，因此清除+重绘是原子的。
        if (isSynchronizedOutputSupported()) {
          return;
        }
        for (const flicker of event.flickers) {
          if (flicker.reason === 'resize') {
            continue;
          }
          const now = Date.now();
          if (now - lastFlickerTime < 1000) {
            logEvent('tengu_flicker', {
              desiredHeight: flicker.desiredHeight,
              actualHeight: flicker.availableHeight,
              reason: flicker.reason
            } as unknown as Record<string, boolean | number | undefined>);
          }
          lastFlickerTime = now;
        }
      }
    }
  };
}
