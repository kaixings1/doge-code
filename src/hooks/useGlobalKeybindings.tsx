/**
 * 注册全局快捷键处理器的组件
 *
 * 必须在 KeybindingSetup 内部渲染，以便访问快捷键上下文
 * 此组件不渲染任何内容 - 它只注册快捷键处理器
 */
import { feature } from 'bun:bundle';
import { useCallback, useRef } from 'react';
import instances from '../ink/instances.js';
import { useKeybinding } from '../keybindings/useKeybinding.js';
import type { Screen } from '../screens/REPL.js';
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js';
import { type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS, logEvent } from '../services/analytics/index.js';
import { useAppState, useSetAppState } from '../state/AppState.js';
import { count } from '../utils/array.js';
import { logForDebugging } from '../utils/debug.js';
import { getTerminalPanel } from '../utils/terminalPanel.js';
import { TerminalPanelView } from '../components/TerminalPanel/TerminalPanelView.js';
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
  /** 挂载全屏覆盖层（终端面板用） */
  setToolJSX?: (args: {
    jsx: React.ReactNode | null;
    shouldHidePromptInput: boolean;
    isLocalJSXCommand?: boolean;
    /** 显式清除 localJSX 覆盖层 —— 缺此标志时 REPL 的包装器会忽略更新 */
    clearLocalJSX?: boolean;
  } | null) => void;
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
  searchBarOpen = false,
  setToolJSX
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
  //
  // NOTE: gated solely by the compile/runtime feature flag. The former
  // `tengu_terminal_panel` GrowthBook check is intentionally dropped: when
  // CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 (telemetry off),
  // isGrowthBookEnabled() is false and getFeatureValue_* returns the default
  // before ever reading cachedGrowthBookFeatures — so that gate could never
  // be enabled in this environment.
  // 在终端面板与主界面之间切换。
  //
  // 实现走「内嵌 PTY」而非外部 tmux：Windows ConPTY 下 tmux attach 拿不到
  // 控制台句柄，会打印版本号后立即退出（实测 status=0、约 30ms），上层
  // 随即 exitAlternateScreen，表现为「切换了一下又弹回」。改成用
  // Bun.spawn + 管道直接驱动 shell，输出由 TerminalPanelView 渲染。
  const terminalOpenRef = useRef(false);
  // 关闭必须显式带 clearLocalJSX：REPL 的 setToolJSX 包装器在
  // localJSXCommandRef 非空时会忽略所有不含 clearLocalJSX 的更新
  // （src/screens/REPL.tsx:992-999）。只传 null 会被直接 return 吞掉，
  // 覆盖层不卸载但 terminalOpenRef 已置 false —— 下次按 Alt+J 会再挂
  // 一个新 TerminalPanelView 替换整棵树，旧组件不走正常卸载流程，
  // proc.kill() 不保证执行，cmd.exe 变成孤儿（表现为每按一次多一个
  // 版本号 banner）。
  const closePanel = useCallback(() => {
    terminalOpenRef.current = false;
    setToolJSX?.({ jsx: null, shouldHidePromptInput: false, clearLocalJSX: true });
  }, [setToolJSX]);
  // 必须稳定：TerminalPanelView 的 useEffect 依赖 [shell, onUnmount]
  // （TerminalPanelView.tsx:132），内联箭头每次渲染都是新引用 → effect
  // 重跑 → 先 kill 掉正在跑的 shell 再 spawn 一个新的。用户按 Alt+J
  // 后看到「多出一段版本号 banner」就是这么来的（新 shell 的 banner）。
  const handlePanelUnmount = useCallback(() => {
    terminalOpenRef.current = false;
  }, []);
  const handleToggleTerminal = useCallback(() => {
    if (!feature('TERMINAL_PANEL')) return;
    if (!setToolJSX) {
      logForDebugging(
        'Terminal panel: setToolJSX unavailable, falling back to tmux panel',
      );
      getTerminalPanel().toggle();
      return;
    }
    if (terminalOpenRef.current) {
      closePanel();
      return;
    }
    terminalOpenRef.current = true;
    setToolJSX({
      jsx: (
        <TerminalPanelView
          onExit={closePanel}
          onUnmount={handlePanelUnmount}
        />
      ),
      shouldHidePromptInput: true,
      isLocalJSXCommand: true,
    });
  }, [setToolJSX, closePanel, handlePanelUnmount]);
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
  // 不返回值即隐式返回 void —— useKeybinding 里 `handler() !== false` 才
  // stopImmediatePropagation，返回 void 与返回 true 的运行时行为一致，
  // 都是「阻止事件继续传播」。原实现 `return true` 超出回调类型
  // `() => void | false | Promise<void>`（TS2345），是历史遗留的写法。
  const handleRetryNow = useCallback(() => {
    try {
      const { triggerRetryNow } = require('../services/api/withRetry.js');
      triggerRetryNow();
    } catch (_) {
      // 重试信号发送失败不应影响按键处理
    }
  }, []);
  useKeybinding('app:retryNow', handleRetryNow, {
    context: 'Global'
  });

  return null;
}
