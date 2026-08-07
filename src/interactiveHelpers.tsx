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
  //console.error('[STEP-A] renderAndRun: before root.render');
  root.render(element);
  //console.error('[STEP-B] renderAndRun: after root.render');
  startDeferredPrefetches();
  //console.error('[STEP-C] renderAndRun: after startDeferredPrefetches, before waitUntilExit');
  await root.waitUntilExit();
  //console.error('[STEP-D] renderAndRun: after waitUntilExit');
  await gracefulShutdown(0);
  //console.error('[STEP-E] renderAndRun: after gracefulShutdown');
}
export async function showSetupScreens(root: Root, permissionMode: PermissionMode, allowDangerouslySkipPermissions: boolean, commands?: Command[], claudeInChrome?: boolean, devChannels?: ChannelEntry[]): Promise<boolean> {
  //console.error('[SETUP-0] showSetupScreens: start, permissionMode=' + permissionMode);
  // 🔑 彻底绕过所有需要 stdin 交互的对话框（TrustDialog、Onboarding、Grove、ApproveApiKey 等）。
  // 在 Windows cmd.exe + Git Bash 环境下，Ink TUI 的 keypress 事件监听可能失效，
  // 导致 <Select> 组件永久等待用户按 Enter/Esc，程序卡死。
  // 直接自动接受信任并跳过所有对话框。
  setSessionTrustAccepted(true);
  const projectPath = require('./utils/cwd.js').getCwd();
  saveGlobalConfig(current => {
    const projects = { ...current.projects };
    const existing = projects[projectPath] || {};
    projects[projectPath] = { ...existing, hasTrustDialogAccepted: true };
    return { ...current, projects };
  });
  //console.error('[SETUP-AUTO-TRUST] trust accepted, all dialogs skipped');
  return false;
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
