/**
 * main.tsx 中一次性对话框 JSX 站点的轻量启动器。
 * 每个启动器动态导入其组件，并以与原始内联调用点完全相同的方式连接 `done` 回调。
 * 零行为变更。
 *
 * 属于 main.tsx React/JSX 提取工作的一部分。参见兄弟 PR
 * perf/extract-interactive-helpers 和 perf/launch-repl。
 */
import React from 'react';
import type { AssistantSession } from './assistant/sessionDiscovery.js';
import type { StatsStore } from './context/stats.js';
import type { Root } from './ink.js';
import { renderAndRun, showSetupDialog } from './interactiveHelpers.js';
import { KeybindingSetup } from './keybindings/KeybindingProviderSetup.js';
import type { AppState } from './state/AppStateStore.js';
import type { AgentMemoryScope } from './tools/AgentTool/agentMemory.js';
import type { TeleportRemoteResponse } from './utils/conversationRecovery.js';
import type { FpsMetrics } from './utils/fpsTracker.js';
import type { ValidationError } from './utils/settings/validation.js';

// 通过模块类型仅类型访问 ResumeConversation 的 Props。
// 无运行时开销 - 编译时擦除。
type ResumeConversationProps = React.ComponentProps<typeof import('./screens/ResumeConversation.js').ResumeConversation>;

/**
 * 位置 ~3173: SnapshotUpdateDialog（代理内存快照更新提示）。
 * 原始回调连接：onComplete={done}, onCancel={() => done('keep')}。
 */
export async function launchSnapshotUpdateDialog(root: Root, props: {
  agentType: string;
  scope: AgentMemoryScope;
  snapshotTimestamp: string;
}): Promise<'merge' | 'keep' | 'replace'> {
  const {
    SnapshotUpdateDialog
  } = await import('./components/agents/SnapshotUpdateDialog.js');
  return showSetupDialog<'merge' | 'keep' | 'replace'>(root, done => <SnapshotUpdateDialog agentType={props.agentType} scope={props.scope} snapshotTimestamp={props.snapshotTimestamp} onComplete={done} onCancel={() => done('keep')} />);
}

/**
 * 位置 ~3250: InvalidSettingsDialog（设置验证错误）。
 * 原始回调连接：onContinue={done}, onExit 从调用者传递。
 */
export async function launchInvalidSettingsDialog(root: Root, props: {
  settingsErrors: ValidationError[];
  onExit: () => void;
}): Promise<void> {
  const {
    InvalidSettingsDialog
  } = await import('./components/InvalidSettingsDialog.js');
  return showSetupDialog(root, done => <InvalidSettingsDialog settingsErrors={props.settingsErrors} onContinue={done} onExit={props.onExit} />);
}

/**
 * 位置 ~4229: AssistantSessionChooser（选择要附加的桥接会话）。
 * 原始回调连接：onSelect={id => done(id)}, onCancel={() => done(null)}。
 */
export async function launchAssistantSessionChooser(root: Root, props: {
  sessions: AssistantSession[];
}): Promise<string | null> {
  const {
    AssistantSessionChooser
  } = await import('./assistant/AssistantSessionChooser.js');
  return showSetupDialog<string | null>(root, done => <AssistantSessionChooser sessions={props.sessions} onSelect={id => done(id)} onCancel={() => done(null)} />);
}

/**
 * `claude assistant` 找到零个会话 — 显示与 `/assistant` 在 daemon.json 为空时相同的安装向导。
 * 成功时解析为安装的目录，取消时为 null。安装失败时拒绝，以便调用者可以
 * 区分错误和用户取消。
 */
export async function launchAssistantInstallWizard(root: Root): Promise<string | null> {
  const {
    NewInstallWizard,
    computeDefaultInstallDir
  } = await import('./commands/assistant/assistant.js');
  const defaultDir = await computeDefaultInstallDir();
  let rejectWithError: (reason: Error) => void;
  const errorPromise = new Promise<never>((_, reject) => {
    rejectWithError = reject;
  });
  const resultPromise = showSetupDialog<string | null>(root, done => <NewInstallWizard defaultDir={defaultDir} onInstalled={dir => done(dir)} onCancel={() => done(null)} onError={message => rejectWithError(new Error(`安装失败：${message}`))} />);
  return Promise.race([resultPromise, errorPromise]);
}

/**
 * 位置 ~4549: TeleportResumeWrapper（交互式 teleport 会话选择器）。
 * 原始回调连接：onComplete={done}, onCancel={() => done(null)}, source="cliArg"。
 */
export async function launchTeleportResumeWrapper(root: Root): Promise<TeleportRemoteResponse | null> {
  const {
    TeleportResumeWrapper
  } = await import('./components/TeleportResumeWrapper.js');
  return showSetupDialog<TeleportRemoteResponse | null>(root, done => <TeleportResumeWrapper onComplete={done} onCancel={() => done(null)} source="cliArg" />);
}

/**
 * 位置 ~4597: TeleportRepoMismatchDialog（选择目标仓库的本地检出）。
 * 原始回调连接：onSelectPath={done}, onCancel={() => done(null)}。
 */
export async function launchTeleportRepoMismatchDialog(root: Root, props: {
  targetRepo: string;
  initialPaths: string[];
}): Promise<string | null> {
  const {
    TeleportRepoMismatchDialog
  } = await import('./components/TeleportRepoMismatchDialog.js');
  return showSetupDialog<string | null>(root, done => <TeleportRepoMismatchDialog targetRepo={props.targetRepo} initialPaths={props.initialPaths} onSelectPath={done} onCancel={() => done(null)} />);
}

/**
 * 位置 ~4903: ResumeConversation 挂载（交互式会话选择器）。
 * 使用 renderAndRun，而非 showSetupDialog。包裹在 <App><KeybindingSetup> 中。
 * 保留原始 getWorktreePaths 和导入之间的 Promise.all 并行性。
 */
export async function launchResumeChooser(root: Root, appProps: {
  getFpsMetrics: () => FpsMetrics | undefined;
  stats: StatsStore;
  initialState: AppState;
}, worktreePathsPromise: Promise<string[]>, resumeProps: Omit<ResumeConversationProps, 'worktreePaths'>): Promise<void> {
  const [worktreePaths, {
    ResumeConversation
  }, {
    App
  }] = await Promise.all([worktreePathsPromise, import('./screens/ResumeConversation.js'), import('./components/App.js')]);
  await renderAndRun(root, <App getFpsMetrics={appProps.getFpsMetrics} stats={appProps.stats} initialState={appProps.initialState}>
      <KeybindingSetup>
        <ResumeConversation {...resumeProps} worktreePaths={worktreePaths} />
      </KeybindingSetup>
    </App>);
}
