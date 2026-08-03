/**
 * 注册全局快捷键处理器的组件
 *
 * 必须在 KeybindingSetup 内部渲染，以便访问快捷键上下文
 * 此组件不渲染任何内容 - 它只注册快捷键处理器
 */
import { feature } from 'bun:bundle';
import { useCallback } from 'react';
import instances from '../ink/instances.js';
import { useKeybinding } from '../keybindings/useKeybinding.js';
import type { Screen } from '../screens/REPL.js';
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js';
import { type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS, logEvent } from '../services/analytics/index.js';
import { useAppState, useSetAppState } from '../state/AppState.js';
import { count } from '../utils/array.js';
import { getTerminalPanel } from '../utils/terminalPanel.js';
type Props = {
  screen: Screen;
  setScreen: React.Dispatch<React.SetStateAction<Screen>>;
  showAllInTranscript: boolean;
  setShowAllInTranscript: React.Dispatch<React.SetStateAction<boolean>>;
  messageCount: number;
  onEnterTranscript?: () => void;
  onExitTranscript?: () => void;
  virtualScrollActive?: boolean;
  searchBarOpen?: boolean;
};

/**
 * 注册全局快捷键处理器：
 * - ctrl+t: 切换待办事项列表
 * - ctrl+o: 切换记录模式
 * - ctrl+e: 切换在记录中显示所有消息
 * - ctrl+c/escape: 退出记录模式
 */
export function GlobalKeybindingHandlers({
  screen,
  setScreen,
  showAllInTranscript,
  setShowAllInTranscript,
  messageCount,
  onEnterTranscript,
  onExitTranscript,
  virtualScrollActive,
  searchBarOpen = false
}: Props): null {
  const expandedView = useAppState(s => s.expandedView);
  const setAppState = useSetAppState();

  // 切换待办事项列表 (ctrl+t) - 循环切换视图
  const handleToggleTodos = useCallback(() => {
    logEvent('tengu_toggle_todos', {
      is_expanded: expandedView === 'tasks'
    });
    setAppState(prev => {
      const {
        getAllInProcessTeammateTasks
      } =
       
      require('../tasks/InProcessTeammateTask/InProcessTeammateTask.js') as typeof import('../tasks/InProcessTeammateTask/InProcessTeammateTask.js');
      const hasTeammates = count(getAllInProcessTeammateTasks(prev.tasks), t => t.status === 'running') > 0;
      if (hasTeammates) {
        // 两者都存在：none → tasks → teammates → none
        switch (prev.expandedView) {
          case 'none':
            return {
              ...prev,
              expandedView: 'tasks' as const
            };
          case 'tasks':
            return {
              ...prev,
              expandedView: 'teammates' as const
            };
          case 'teammates':
            return {
              ...prev,
              expandedView: 'none' as const
            };
        }
      }
      // 仅有任务：none ↔ tasks
      return {
        ...prev,
        expandedView: prev.expandedView === 'tasks' ? 'none' as const : 'tasks' as const
      };
    });
  }, [expandedView, setAppState]);

  // 切换记录模式 (ctrl+o)。双向切换：提示 ↔ 记录
  // 简洁视图有自己的专用切换键：ctrl+shift+b
  const isBriefOnly = feature('KAIROS') || feature('KAIROS_BRIEF') ?
  // biome-ignore lint/correctness/useHookAtTopLevel: feature() is a compile-time constant
  useAppState(s_0 => s_0.isBriefOnly) : false;
  const handleToggleTranscript = useCallback(() => {
    if (feature('KAIROS') || feature('KAIROS_BRIEF')) {
      // 逃生通道：当 defaultView=chat 被持久化时，GB 关闭开关
      // 可能导致 isBriefOnly 卡住，显示空白的 filterForBriefTool 视图
      // 用户会尝试使用 ctrl+o —— 首先清除卡住的状态
      // 仅在提示屏幕中需要 —— 记录模式已经忽略 isBriefOnly
      // （Messages.tsx 过滤器受 !isTranscriptMode 控制）
       
      const {
        isBriefEnabled
      } = require('../tools/BriefTool/BriefTool.js') as typeof import('../tools/BriefTool/BriefTool.js');
       
      if (!isBriefEnabled() && isBriefOnly && screen !== 'transcript') {
        setAppState(prev_0 => {
          if (!prev_0.isBriefOnly) return prev_0;
          return {
            ...prev_0,
            isBriefOnly: false
          };
        });
        return;
      }
    }
    const isEnteringTranscript = screen !== 'transcript';
    logEvent('tengu_toggle_transcript', {
      is_entering: isEnteringTranscript,
      show_all: showAllInTranscript,
      message_count: messageCount
    });
    setScreen(s_1 => s_1 === 'transcript' ? 'prompt' : 'transcript');
    setShowAllInTranscript(false);
    if (isEnteringTranscript && onEnterTranscript) {
      onEnterTranscript();
    }
    if (!isEnteringTranscript && onExitTranscript) {
      onExitTranscript();
    }
  }, [screen, setScreen, isBriefOnly, showAllInTranscript, setShowAllInTranscript, messageCount, setAppState, onEnterTranscript, onExitTranscript]);

  // 在记录模式中切换显示所有消息 (ctrl+e)
  const handleToggleShowAll = useCallback(() => {
    logEvent('tengu_transcript_toggle_show_all', {
      is_expanding: !showAllInTranscript,
      message_count: messageCount
    });
    setShowAllInTranscript(prev_1 => !prev_1);
  }, [showAllInTranscript, setShowAllInTranscript, messageCount]);

  // 退出记录模式 (ctrl+c 或 escape)
  const handleExitTranscript = useCallback(() => {
    logEvent('tengu_transcript_exit', {
      show_all: showAllInTranscript,
      message_count: messageCount
    });
    setScreen('prompt');
    setShowAllInTranscript(false);
    if (onExitTranscript) {
      onExitTranscript();
    }
  }, [setScreen, showAllInTranscript, setShowAllInTranscript, messageCount, onExitTranscript]);

  // 切换仅简洁视图 (ctrl+shift+b)。纯显示过滤器切换 —
  // 不影响选择加入状态。非对称门（镜像 /brief）：关闭
  // 转换始终允许，因此即使 GB 关闭开关在会话中途触发，
  // 也能使用相同的按键退出
  const handleToggleBrief = useCallback(() => {
    if (feature('KAIROS') || feature('KAIROS_BRIEF')) {
       
      const {
        isBriefEnabled: isBriefEnabled_0
      } = require('../tools/BriefTool/BriefTool.js') as typeof import('../tools/BriefTool/BriefTool.js');
       
      if (!isBriefEnabled_0() && !isBriefOnly) return;
      const next = !isBriefOnly;
      logEvent('tengu_brief_mode_toggled', {
        enabled: next,
        gated: false,
        source: 'keybinding' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
      });
      setAppState(prev_2 => {
        if (prev_2.isBriefOnly === next) return prev_2;
        return {
          ...prev_2,
          isBriefOnly: next
        };
      });
    }
  }, [isBriefOnly, setAppState]);

  // 注册快捷键处理器
  useKeybinding('app:toggleTodos', handleToggleTodos, {
    context: 'Global'
  });
  useKeybinding('app:toggleTranscript', handleToggleTranscript, {
    context: 'Global'
  });
  if (feature('KAIROS') || feature('KAIROS_BRIEF')) {
    // biome-ignore lint/correctness/useHookAtTopLevel: feature() is a compile-time constant
    useKeybinding('app:toggleBrief', handleToggleBrief, {
      context: 'Global'
    });
  }

  // 注册队友快捷键
  useKeybinding('app:toggleTeammatePreview', () => {
    setAppState(prev_3 => ({
      ...prev_3,
      showTeammateMessagePreview: !prev_3.showTeammateMessagePreview
    }));
  }, {
    context: 'Global'
  });

  // 切换内置终端面板 (meta+j)
  // toggle() 在 spawnSync 中阻塞，直到用户从 tmux 分离
  const handleToggleTerminal = useCallback(() => {
    if (feature('TERMINAL_PANEL')) {
      if (!getFeatureValue_CACHED_MAY_BE_STALE('tengu_terminal_panel', false)) {
        return;
      }
      getTerminalPanel().toggle();
    }
  }, []);
  useKeybinding('app:toggleTerminal', handleToggleTerminal, {
    context: 'Global'
  });

  // 清屏并强制完全重绘 (ctrl+l)。恢复路径：当终端被外部清除时
  // (macOS Cmd+K)，Ink 的 diff 引擎认为未更改的单元格不需要重绘
  const handleRedraw = useCallback(() => {
    instances.get(process.stdout)?.forceRedraw();
  }, []);
  useKeybinding('app:redraw', handleRedraw, {
    context: 'Global'
  });

  // 记录模式专用绑定（仅在记录模式中激活）
  const isInTranscript = screen === 'transcript';
  useKeybinding('transcript:toggleShowAll', handleToggleShowAll, {
    context: 'Transcript',
    isActive: isInTranscript && !virtualScrollActive
  });
  useKeybinding('transcript:exit', handleExitTranscript, {
    context: 'Transcript',
    // 栏打开是一种模式（拥有按键）。导航（高亮可见，n/N 激活，栏关闭）不是 —
    // Esc 直接退出记录，与 less q 相同。useSearchInput 不会 stopPropagation，
    // 因此如果没有这个门，它的 onCancel 和这个处理器都会在按一次 Esc 时触发
    // （子组件先注册，先触发，然后冒泡）
    isActive: isInTranscript && !searchBarOpen
  });

  // DOGE: Ctrl+Y --- 立即重试（中断 API 重试倒计时）
  const handleRetryNow = useCallback(() => {
    try {
      const { triggerRetryNow } = require('../services/api/withRetry.js');
      triggerRetryNow();
      // 标记一下 Ctrl+Y 已触发，防止事件继续传播
      return true;
    } catch (_) {
      return true;
    }
  }, []);
  useKeybinding('app:retryNow', handleRetryNow, {
    context: 'Global'
  });

  return null;
}
