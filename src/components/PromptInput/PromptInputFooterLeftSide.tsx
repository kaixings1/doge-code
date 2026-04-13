// biome-ignore-all assist/source/organizeImports: 仅限 ANT 的导入标记，不得重新排序
import { feature } from 'bun:bundle';
// 死代码消除：COORDINATOR_MODE 的条件导入
 
const coordinatorModule = feature('COORDINATOR_MODE')
  ? (require('../../coordinator/coordinatorMode.js') as typeof import('../../coordinator/coordinatorMode.js'))
  : undefined;
 
import { Box, Text, Link } from '../../ink.js';
import * as React from 'react';
import figures from 'figures';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { VimMode, PromptInputMode } from '../../types/textInputTypes.js';
import type { ToolPermissionContext } from '../../Tool.js';
import { isVimModeEnabled } from './utils.js';
import { useShortcutDisplay } from '../../keybindings/useShortcutDisplay.js';
import {
  isDefaultMode,
  permissionModeSymbol,
  permissionModeTitle,
  getModeColor,
} from '../../utils/permissions/PermissionMode.js';
import { BackgroundTaskStatus } from '../tasks/BackgroundTaskStatus.js';
import { isBackgroundTask } from '../../tasks/types.js';
import { isPanelAgentTask } from '../../tasks/LocalAgentTask/LocalAgentTask.js';
import { getVisibleAgentTasks } from '../CoordinatorAgentStatus.js';
import { count } from '../../utils/array.js';
import { shouldHideTasksFooter } from '../tasks/taskStatusUtils.js';
import { isAgentSwarmsEnabled } from '../../utils/agentSwarmsEnabled.js';
import { TeamStatus } from '../teams/TeamStatus.js';
import { isInProcessEnabled } from '../../utils/swarm/backends/registry.js';
import { useAppState, useAppStateStore } from '../../state/AppState.js';
import { getIsRemoteMode } from '../../bootstrap/state.js';
import HistorySearchInput from './HistorySearchInput.js';
import { usePrStatus } from '../../hooks/usePrStatus.js';
import { KeyboardShortcutHint } from '../design-system/KeyboardShortcutHint.js';
import { Byline } from '../design-system/Byline.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { useTasksV2 } from '../../hooks/useTasksV2.js';
import { formatDuration } from '../../utils/format.js';
import { VoiceWarmupHint } from './VoiceIndicator.js';
import { useVoiceEnabled } from '../../hooks/useVoiceEnabled.js';
import { useVoiceState } from '../../context/voice.js';
import { isFullscreenEnvEnabled } from '../../utils/fullscreen.js';
import { isXtermJs } from '../../ink/terminal.js';
import { useHasSelection, useSelection } from '../../ink/hooks/use-selection.js';
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js';
import { getPlatform } from '../../utils/platform.js';
import { PrBadge } from '../PrBadge.js';

// 死代码消除：proactive 模式的条件导入
 
const proactiveModule =
  feature('PROACTIVE') || feature('KAIROS')
    ? require('../../proactive/index.js')
    : null;
 

const NO_OP_SUBSCRIBE = (_cb: () => void) => () => {};
const NULL = () => null;
const MAX_VOICE_HINT_SHOWS = 3;

type Props = {
  exitMessage: {
    show: boolean;
    key?: string;
  };
  vimMode: VimMode | undefined;
  mode: PromptInputMode;
  toolPermissionContext: ToolPermissionContext;
  suppressHint: boolean;
  isLoading: boolean;
  showMemoryTypeSelector?: boolean;
  tasksSelected: boolean;
  teamsSelected: boolean;
  tmuxSelected: boolean;
  teammateFooterIndex?: number;
  isPasting?: boolean;
  isSearching: boolean;
  historyQuery: string;
  setHistoryQuery: (query: string) => void;
  historyFailedMatch: boolean;
  onOpenTasksDialog?: (taskId?: string) => void;
};

// ========== 倒计时组件 ==========
function ProactiveCountdown(): React.ReactNode {
  const nextTickAt = useSyncExternalStore(
    proactiveModule?.subscribeToProactiveChanges ?? NO_OP_SUBSCRIBE,
    proactiveModule?.getNextTickAt ?? NULL,
    NULL,
  );

  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (nextTickAt === null) {
      setRemainingSeconds(null);
      return;
    }

    function update(): void {
      const remaining = Math.max(
        0,
        Math.ceil((nextTickAt! - Date.now()) / 1000),
      );
      setRemainingSeconds(remaining);
    }

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [nextTickAt]);

  if (remainingSeconds === null) return null;

  return (
    <Text dimColor>
      等待{' '}
      {formatDuration(remainingSeconds * 1000, {
        mostSignificantOnly: true,
      })}
    </Text>
  );
}

// ========== 左侧底部栏主组件 ==========
export function PromptInputFooterLeftSide({
  exitMessage,
  vimMode,
  mode,
  toolPermissionContext,
  suppressHint,
  isLoading,
  tasksSelected,
  teamsSelected,
  tmuxSelected,
  teammateFooterIndex,
  isPasting,
  isSearching,
  historyQuery,
  setHistoryQuery,
  historyFailedMatch,
  onOpenTasksDialog,
}: Props): React.ReactNode {
  if (exitMessage.show) {
    return (
      <Text dimColor key="exit-message">
        再按一次 {exitMessage.key} 退出
      </Text>
    );
  }
  if (isPasting) {
    return (
      <Text dimColor key="pasting-message">
        正在粘贴文本…
      </Text>
    );
  }

  const showVim = isVimModeEnabled() && vimMode === 'INSERT' && !isSearching;

  return (
    <Box justifyContent="flex-start" gap={1}>
      {isSearching && (
        <HistorySearchInput
          value={historyQuery}
          onChange={setHistoryQuery}
          historyFailedMatch={historyFailedMatch}
        />
      )}
      {showVim ? (
        <Text dimColor key="vim-insert">
          -- 插入 --
        </Text>
      ) : null}
      <ModeIndicator
        mode={mode}
        toolPermissionContext={toolPermissionContext}
        showHint={!suppressHint && !showVim}
        isLoading={isLoading}
        tasksSelected={tasksSelected}
        teamsSelected={teamsSelected}
        teammateFooterIndex={teammateFooterIndex}
        tmuxSelected={tmuxSelected}
        onOpenTasksDialog={onOpenTasksDialog}
      />
    </Box>
  );
}

// ========== 模式指示器属性 ==========
type ModeIndicatorProps = {
  mode: PromptInputMode;
  toolPermissionContext: ToolPermissionContext;
  showHint: boolean;
  isLoading: boolean;
  tasksSelected: boolean;
  teamsSelected: boolean;
  tmuxSelected: boolean;
  teammateFooterIndex?: number;
  onOpenTasksDialog?: (taskId?: string) => void;
};

// ========== 钨（Tmux）药丸组件（ant 专用） ==========
// 注：原代码中使用了 <TungstenPill />，但未给出定义。这里提供一个最小实现。
// 实际使用时可能需要从正确的路径导入，或根据项目实际情况调整。
function TungstenPill({ selected }: { selected: boolean }): React.ReactElement {
  return (
    <Text color={selected ? 'background' : 'default'} inverse={selected}>
      tmux
    </Text>
  );
}

// ========== 模式指示器核心组件 ==========
function ModeIndicator({
  mode,
  toolPermissionContext,
  showHint,
  isLoading,
  tasksSelected,
  teamsSelected,
  tmuxSelected,
  teammateFooterIndex,
  onOpenTasksDialog,
}: ModeIndicatorProps): React.ReactNode {
  const { columns } = useTerminalSize();
  const modeCycleShortcut = useShortcutDisplay(
    'chat:cycleMode',
    'Chat',
    'shift+tab',
  );
  const tasks = useAppState(s => s.tasks);
  const teamContext = useAppState(s => s.teamContext);
  // 在 initialState 中设置一次（main.tsx --remote 模式），之后永不改变 —— 惰性初始化捕获不可变值，无需订阅。
  const store = useAppStateStore();
  const [remoteSessionUrl] = useState(() => store.getState().remoteSessionUrl);
  const viewSelectionMode = useAppState(s => s.viewSelectionMode);
  const viewingAgentTaskId = useAppState(s => s.viewingAgentTaskId);
  const expandedView = useAppState(s => s.expandedView);
  const showSpinnerTree = expandedView === 'teammates';
  const prStatus = usePrStatus(isLoading, isPrStatusEnabled());
  const hasTmuxSession = useAppState(
    s => "external" === 'ant' && s.tungstenActiveSession !== undefined,
  );

  const nextTickAt = useSyncExternalStore(
    proactiveModule?.subscribeToProactiveChanges ?? NO_OP_SUBSCRIBE,
    proactiveModule?.getNextTickAt ?? NULL,
    NULL,
  );
  // biome-ignore lint/correctness/useHookAtTopLevel: feature() 是编译时常量
  const voiceEnabled = feature('VOICE_MODE') ? useVoiceEnabled() : false;
  const voiceState = feature('VOICE_MODE')
    ? // biome-ignore lint/correctness/useHookAtTopLevel: feature() 是编译时常量
      useVoiceState(s => s.voiceState)
    : ('idle' as const);
  const voiceWarmingUp = feature('VOICE_MODE')
    ? // biome-ignore lint/correctness/useHookAtTopLevel: feature() 是编译时常量
      useVoiceState(s => s.voiceWarmingUp)
    : false;
  const hasSelection = useHasSelection();
  const selGetState = useSelection().getState;
  const hasNextTick = nextTickAt !== null;
  const isCoordinator = feature('COORDINATOR_MODE')
    ? coordinatorModule?.isCoordinatorMode() === true
    : false;
  const runningTaskCount = useMemo(
    () =>
      count(
        Object.values(tasks),
        t =>
          isBackgroundTask(t) &&
          !("external" === 'ant' && isPanelAgentTask(t)),
      ),
    [tasks],
  );
  const tasksV2 = useTasksV2();
  const hasTaskItems = tasksV2 !== undefined && tasksV2.length > 0;
  const escShortcut = useShortcutDisplay('chat:cancel', 'Chat', 'esc').toLowerCase();
  const todosShortcut = useShortcutDisplay('app:toggleTodos', 'Global', 'ctrl+t');
  const killAgentsShortcut = useShortcutDisplay('chat:killAgents', 'Chat', 'ctrl+x ctrl+k');
  const voiceKeyShortcut = feature('VOICE_MODE')
    ? // biome-ignore lint/correctness/useHookAtTopLevel: feature() 是编译时常量
      useShortcutDisplay('voice:pushToTalk', 'Chat', 'Space')
    : '';
  // 在挂载时捕获，这样提示不会在会话中途因为另一个 CC 实例增加计数器而闪烁。
  // 通过 useEffect 在本次会话首次启用语音时递增一次 —— 近似“已显示提示”
  // 而不追踪确切的渲染时条件（该条件依赖于在早期返回钩子边界之后计算的 parts/hintParts）。
  const [voiceHintUnderCap] = feature('VOICE_MODE')
    ? // biome-ignore lint/correctness/useHookAtTopLevel: feature() 是编译时常量
      useState(
        () =>
          (getGlobalConfig().voiceFooterHintSeenCount ?? 0) < MAX_VOICE_HINT_SHOWS,
      )
    : [false];
  // biome-ignore lint/correctness/useHookAtTopLevel: feature() 是编译时常量
  const voiceHintIncrementedRef = feature('VOICE_MODE') ? useRef(false) : null;
  useEffect(() => {
    if (feature('VOICE_MODE')) {
      if (!voiceEnabled || !voiceHintUnderCap) return;
      if (voiceHintIncrementedRef?.current) return;
      if (voiceHintIncrementedRef) voiceHintIncrementedRef.current = true;
      const newCount = (getGlobalConfig().voiceFooterHintSeenCount ?? 0) + 1;
      saveGlobalConfig(prev => {
        if ((prev.voiceFooterHintSeenCount ?? 0) >= newCount) return prev;
        return {
          ...prev,
          voiceFooterHintSeenCount: newCount,
        };
      });
    }
  }, [voiceEnabled, voiceHintUnderCap]);
  const isKillAgentsConfirmShowing = useAppState(
    s => s.notifications.current?.key === 'kill-agents-confirm',
  );

  // 从 teamContext 派生团队信息（无需文件系统 I/O）
  // 匹配 TeamStatus 相同的逻辑以避免尾部分隔符
  // 进程内模式使用 Shift+向下/向上导航，而不是 footer 的团队菜单
  const hasTeams =
    isAgentSwarmsEnabled() &&
    !isInProcessEnabled() &&
    teamContext !== undefined &&
    count(
      Object.values(teamContext.teammates),
      t => t.name !== 'team-lead',
    ) > 0;

  if (mode === 'bash') {
    return <Text color="bashBorder">! 进入 bash 模式</Text>;
  }

  const currentMode = toolPermissionContext?.mode;
  const hasActiveMode = !isDefaultMode(currentMode);
  const viewedTask = viewingAgentTaskId ? tasks[viewingAgentTaskId] : undefined;
  const isViewingTeammate =
    viewSelectionMode === 'viewing-agent' &&
    viewedTask?.type === 'in_process_teammate';
  const isViewingCompletedTeammate =
    isViewingTeammate && viewedTask != null && viewedTask.status !== 'running';
  const hasBackgroundTasks = runningTaskCount > 0 || isViewingTeammate;

  // 统计主要项（权限模式或协调器模式、后台任务、团队）
  const primaryItemCount =
    (isCoordinator || hasActiveMode ? 1 : 0) +
    (hasBackgroundTasks ? 1 : 0) +
    (hasTeams ? 1 : 0);

  // PR 指示器很短（约10个字符）—— 不像旧的 diff 指示器针对 >=100 列调优。
  // 现在自动模式实际上是基线，primaryItemCount 对大多数会话都 >=1；
  // 保持阈值足够低，以便在标准80列终端上显示 PR 状态。
  const shouldShowPrStatus =
    isPrStatusEnabled() &&
    prStatus.number !== null &&
    prStatus.reviewState !== null &&
    prStatus.url !== null &&
    primaryItemCount < 2 &&
    (primaryItemCount === 0 || columns >= 80);

  // 当有 2 个主要项时隐藏 shift+tab 提示
  const shouldShowModeHint = primaryItemCount < 2;

  // 检查是否有进程内队友（显示药丸）
  // 在微调树模式下，药丸被禁用 —— 队友会出现在微调树中而不是药丸
  const hasInProcessTeammates =
    !showSpinnerTree &&
    hasBackgroundTasks &&
    Object.values(tasks).some(t => t.type === 'in_process_teammate');
  const hasTeammatePills =
    hasInProcessTeammates || (!showSpinnerTree && isViewingTeammate);

  // 在远程模式（`claude assistant`，--teleport）下，代理在其他地方运行；
  // 此处显示的本地权限模式不反映代理的状态。
  // 在任务药丸之前渲染，这样长的药丸标签（例如 ultraplan URL）不会将模式指示器挤出屏幕。
  const modePart =
    currentMode && hasActiveMode && !getIsRemoteMode() ? (
      <Text color={getModeColor(currentMode)} key="mode">
        {permissionModeSymbol(currentMode)}{' '}
        {permissionModeTitle(currentMode).toLowerCase()} on
        {shouldShowModeHint && (
          <Text dimColor>
            {' '}
            <KeyboardShortcutHint
              shortcut={modeCycleShortcut}
              action="切换"
              parens
            />
          </Text>
        )}
      </Text>
    ) : null;

  // 构建 parts 数组 - 当有队友药丸时排除 BackgroundTaskStatus（队友药丸有自己的行）
  const parts = [
    // 远程会话指示器
    ...(remoteSessionUrl
      ? [
          <Link url={remoteSessionUrl} key="remote">
            <Text color="ide">{figures.circleDouble} 远程</Text>
          </Link>,
        ]
      : []),
    // BackgroundTaskStatus 不在 parts 中 —— 它作为 Box 兄弟元素渲染，这样它的可点击 Box 就不会嵌套在
    // <Text wrap="truncate"> 包装器内（协调器会抛出 Box-in-Text 错误）。
    // Tmux 药丸（仅 ant）—— 在导航顺序中紧跟在任务之后出现
    ...("external" === 'ant' && hasTmuxSession
      ? [<TungstenPill key="tmux" selected={tmuxSelected} />]
      : []),
    ...(isAgentSwarmsEnabled() && hasTeams
      ? [
          <TeamStatus
            key="teams"
            teamsSelected={teamsSelected}
            showHint={showHint && !hasBackgroundTasks}
          />,
        ]
      : []),
    ...(shouldShowPrStatus
      ? [
          <PrBadge
            key="pr-status"
            number={prStatus.number!}
            url={prStatus.url!}
            reviewState={prStatus.reviewState!}
          />,
        ]
      : []),
  ];

  // 检查是否存在任何进程内队友（用于提示文本循环）
  const hasAnyInProcessTeammates = Object.values(tasks).some(
    t => t.type === 'in_process_teammate' && t.status === 'running',
  );
  const hasRunningAgentTasks = Object.values(tasks).some(
    t => t.type === 'local_agent' && t.status === 'running',
  );

  // 单独获取提示部件，以便可能渲染在第二行
  const hintParts = showHint
    ? getSpinnerHintParts(
        isLoading,
        escShortcut,
        todosShortcut,
        killAgentsShortcut,
        hasTaskItems,
        expandedView,
        hasAnyInProcessTeammates,
        hasRunningAgentTasks,
        isKillAgentsConfirmShowing,
      )
    : [];

  if (isViewingCompletedTeammate) {
    parts.push(
      <Text dimColor key="esc-return">
        <KeyboardShortcutHint
          shortcut={escShortcut}
          action="返回团队领导"
        />
      </Text>,
    );
  } else if ((feature('PROACTIVE') || feature('KAIROS')) && hasNextTick) {
    parts.push(<ProactiveCountdown key="proactive" />);
  } else if (!hasTeammatePills && showHint) {
    parts.push(...hintParts);
  }

  // 当有队友药丸时，始终将它们渲染在自己的行上，位于其他部件之上
  if (hasTeammatePills) {
    // 查看已完成队友时不追加微调提示 —— “esc 返回团队领导”提示已经替代了“esc 中断”
    const otherParts = [
      ...(modePart ? [modePart] : []),
      ...parts,
      ...(isViewingCompletedTeammate ? [] : hintParts),
    ];
    return (
      <Box flexDirection="column">
        <Box>
          <BackgroundTaskStatus
            tasksSelected={tasksSelected}
            isViewingTeammate={isViewingTeammate}
            teammateFooterIndex={teammateFooterIndex}
            isLeaderIdle={!isLoading}
            onOpenDialog={onOpenTasksDialog}
          />
        </Box>
        {otherParts.length > 0 && (
          <Box>
            <Byline>{otherParts}</Byline>
          </Box>
        )}
      </Box>
    );
  }

  // 当面板有可见行时添加“↓ 管理任务”提示
  const hasCoordinatorTasks =
    "external" === 'ant' && getVisibleAgentTasks(tasks).length > 0;

  // 任务药丸作为 Box 兄弟元素渲染（不是 parts 条目），这样它的可点击 Box 就不会嵌套在
  // <Text wrap="truncate"> 中 —— 协调器会抛出 Box-in-Text 错误。在此处计算，
  // 以便下面的空检查仍将“药丸存在”视为非空。
  const tasksPart =
    hasBackgroundTasks && !hasTeammatePills && !shouldHideTasksFooter(tasks, showSpinnerTree) ? (
      <BackgroundTaskStatus
        tasksSelected={tasksSelected}
        isViewingTeammate={isViewingTeammate}
        teammateFooterIndex={teammateFooterIndex}
        isLeaderIdle={!isLoading}
        onOpenDialog={onOpenTasksDialog}
      />
    ) : null;

  if (parts.length === 0 && !tasksPart && !modePart && showHint) {
    parts.push(
      <Text dimColor key="shortcuts-hint">
        ? 查看快捷键
      </Text>,
    );
  }

  // 只有在有内容可说时才替换空闲的语音提示 —— 否则跳过而不是显示空的 Byline。
  // 已移除“esc 清除”（空闲时看起来像“esc 中断”；esc 清除选择是标准 UX），只留下 ctrl+c（copyOnSelect 关闭）和 xterm.js 原生选择提示。
  const copyOnSelect = getGlobalConfig().copyOnSelect ?? true;
  const selectionHintHasContent = hasSelection && (!copyOnSelect || isXtermJs());

  // 预热提示优先 —— 当用户正在按住激活键时，无论其他提示如何都显示反馈。
  if (feature('VOICE_MODE') && voiceEnabled && voiceWarmingUp) {
    parts.push(<VoiceWarmupHint key="voice-warmup" />);
  } else if (isFullscreenEnvEnabled() && selectionHintHasContent) {
    // xterm.js（VS Code/Cursor/Windsurf）强制选择修饰符是平台特定的，并且在 macOS 上受限于（SelectionService.shouldForceSelection）：
    //   macOS:     altKey && macOptionClickForcesSelection（VS Code 默认：false）
    //   非 macOS: shiftKey
    // 在 macOS 上，如果我们收到了 alt+click（lastPressHadAlt），则 VS Code 设置是关闭的 —— 否则 xterm.js 会消费该事件。
    // 告诉用户要切换的确切设置，而不是重复他们刚刚尝试的 option+click 提示。
    // 非响应式 getState() 读取是安全的：lastPressHadAlt 在 hasSelection 为 true 时是不可变的（在拖拽前设置，在选择清除时清除）。
    const isMac = getPlatform() === 'macos';
    const altClickFailed = isMac && (selGetState()?.lastPressHadAlt ?? false);
    parts.push(
      <Text dimColor key="selection-copy">
        <Byline>
          {!copyOnSelect && (
            <KeyboardShortcutHint shortcut="Ctrl+c" action="复制" />
          )}
          {isXtermJs() &&
            (altClickFailed ? (
              <Text>在 VS Code 设置中启用 macOptionClickForcesSelection</Text>
            ) : (
              <KeyboardShortcutHint
                shortcut={isMac ? 'option+click' : 'shift+click'}
                action="原生选择"
              />
            ))}
        </Byline>
      </Text>,
    );
  } else if (
    feature('VOICE_MODE') &&
    parts.length > 0 &&
    showHint &&
    voiceEnabled &&
    voiceState === 'idle' &&
    hintParts.length === 0 &&
    voiceHintUnderCap
  ) {
    parts.push(
      <Text dimColor key="voice-hint">
        按住 {voiceKeyShortcut} 说话
      </Text>,
    );
  }

  if ((tasksPart || hasCoordinatorTasks) && showHint && !hasTeams) {
    parts.push(
      <Text dimColor key="manage-tasks">
        {tasksSelected ? (
          <KeyboardShortcutHint shortcut="Enter" action="查看任务" />
        ) : (
          <KeyboardShortcutHint shortcut="↓" action="管理" />
        )}
      </Text>,
    );
  }

  // 在全屏模式下，底部区域是 flexShrink:0 —— 这里的每一行都是从 ScrollBox 中“偷”来的行。
  // 此组件必须具有稳定的高度，以便 footer 从不增长/收缩并移动滚动内容。
  // 当 parts 为空时返回 null（例如 StatusLine 开启 → suppressHint → showHint=false → 没有“? 查看快捷键”）
  // 会导致后面添加的部件（例如选择复制/原生选择提示）将列从 0→1 行增长。
  // 在全屏模式下始终渲染 1 行；当为空时返回一个空格，以便 Yoga 保留该行而不绘制任何可见内容。
  if (parts.length === 0 && !tasksPart && !modePart) {
    return isFullscreenEnvEnabled() ? <Text> </Text> : null;
  }

  // flexShrink=0 保持模式和药丸的自然宽度；其余部分在 Text 包装器内作为一个字符串在尾部截断。
  return (
    <Box height={1} overflow="hidden">
      {modePart && (
        <Box flexShrink={0}>
          {modePart}
          {(tasksPart || parts.length > 0) && <Text dimColor> · </Text>}
        </Box>
      )}
      {tasksPart && (
        <Box flexShrink={0}>
          {tasksPart}
          {parts.length > 0 && <Text dimColor> · </Text>}
        </Box>
      )}
      {parts.length > 0 && (
        <Text wrap="truncate">
          <Byline>{parts}</Byline>
        </Text>
      )}
    </Box>
  );
}

// ========== 辅助函数：获取微调器提示部件 ==========
function getSpinnerHintParts(
  isLoading: boolean,
  escShortcut: string,
  todosShortcut: string,
  killAgentsShortcut: string,
  hasTaskItems: boolean,
  expandedView: 'none' | 'tasks' | 'teammates',
  hasTeammates: boolean,
  hasRunningAgentTasks: boolean,
  isKillAgentsConfirmShowing: boolean,
): React.ReactElement[] {
  let toggleAction: string;
  if (hasTeammates) {
    // 循环：无 → 任务 → 队友 → 无
    switch (expandedView) {
      case 'none':
        toggleAction = '显示任务';
        break;
      case 'tasks':
        toggleAction = '显示队友';
        break;
      case 'teammates':
        toggleAction = '隐藏';
        break;
    }
  } else {
    toggleAction = expandedView === 'tasks' ? '隐藏任务' : '显示任务';
  }

  // 仅当有任务项可显示或可循环到队友时才显示切换提示
  const showToggleHint = hasTaskItems || hasTeammates;

  return [
    ...(isLoading
      ? [
          <Text dimColor key="esc">
            <KeyboardShortcutHint shortcut={escShortcut} action="中断" />
          </Text>,
        ]
      : []),
    ...(!isLoading && hasRunningAgentTasks && !isKillAgentsConfirmShowing
      ? [
          <Text dimColor key="kill-agents">
            <KeyboardShortcutHint shortcut={killAgentsShortcut} action="停止代理" />
          </Text>,
        ]
      : []),
    ...(showToggleHint
      ? [
          <Text dimColor key="toggle-tasks">
            <KeyboardShortcutHint shortcut={todosShortcut} action={toggleAction} />
          </Text>,
        ]
      : []),
  ];
}

// ========== 辅助函数：PR 状态是否启用 ==========
function isPrStatusEnabled(): boolean {
  return getGlobalConfig().prStatusFooterEnabled ?? true;
}


