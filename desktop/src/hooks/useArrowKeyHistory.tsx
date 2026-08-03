import React, { useCallback, useRef, useState } from 'react';
import { getModeFromInput } from '../components/PromptInput/inputModes.js';
import { useNotifications } from '../context/notifications.js';
import { ConfigurableShortcutHint } from '../components/ConfigurableShortcutHint.js';
import { FOOTER_TEMPORARY_STATUS_TIMEOUT } from '../components/PromptInput/Notifications.js';
import { getHistory } from '../history.js';
import { Text } from '../ink.js';
import type { PromptInputMode } from '../types/textInputTypes.js';
import type { HistoryEntry, PastedContent } from '../utils/config.js';
export type HistoryMode = PromptInputMode;

// 分块加载历史条目，以减少快速按键时的磁盘读取
const HISTORY_CHUNK_SIZE = 10;

// 共享状态，用于将并发加载请求合并为单次磁盘读取
// 包含模式过滤器以确保不混合已过滤和未过滤的缓存
let pendingLoad: Promise<HistoryEntry[]> | null = null;
let pendingLoadTarget = 0;
let pendingLoadModeFilter: HistoryMode | undefined = undefined;
async function loadHistoryEntries(minCount: number, modeFilter?: HistoryMode): Promise<HistoryEntry[]> {
  // 向上取整到下一个块，避免重复的小量读取
  const target = Math.ceil(minCount / HISTORY_CHUNK_SIZE) * HISTORY_CHUNK_SIZE;

  // 如果已有相同模式过滤器的加载正在等待且能满足需求，则等待它
  if (pendingLoad && pendingLoadTarget >= target && pendingLoadModeFilter === modeFilter) {
    return pendingLoad;
  }

  // 如果加载正在等待但无法满足需求或过滤器不同，需要先等待它
  // 完成，然后启动新的加载（不能中断正在进行的读取）
  if (pendingLoad) {
    await pendingLoad;
  }

  // 启动新的加载
  pendingLoadTarget = target;
  pendingLoadModeFilter = modeFilter;
  pendingLoad = (async () => {
    const entries: HistoryEntry[] = [];
    let loaded = 0;
    for await (const entry of getHistory()) {
      // 如果指定了模式过滤器，仅包含匹配模式的条目
      if (modeFilter) {
        const entryMode = getModeFromInput(entry.display);
        if (entryMode !== modeFilter) {
          continue;
        }
      }
      entries.push(entry);
      loaded++;
      if (loaded >= pendingLoadTarget) break;
    }
    return entries;
  })();
  try {
    return await pendingLoad;
  } finally {
    pendingLoad = null;
    pendingLoadTarget = 0;
    pendingLoadModeFilter = undefined;
  }
}
export function useArrowKeyHistory(onSetInput: (value: string, mode: HistoryMode, pastedContents: Record<number, PastedContent>) => void, currentInput: string, pastedContents: Record<number, PastedContent>, setCursorOffset?: (offset: number) => void, currentMode?: HistoryMode): {
  historyIndex: number;
  setHistoryIndex: (index: number) => void;
  onHistoryUp: () => void;
  onHistoryDown: () => boolean;
  resetHistory: () => void;
  dismissSearchHint: () => void;
} {
  const [historyIndex, setHistoryIndex] = useState(0);
  const [lastShownHistoryEntry, setLastShownHistoryEntry] = useState<(HistoryEntry & {
    mode?: HistoryMode;
  }) | undefined>(undefined);
  const hasShownSearchHintRef = useRef(false);
  const {
    addNotification,
    removeNotification
  } = useNotifications();

  // 缓存已加载的历史条目
  const historyCache = useRef<HistoryEntry[]>([]);
  // 跟踪缓存加载时使用的模式过滤器
  const historyCacheModeFilter = useRef<HistoryMode | undefined>(undefined);

  // 历史索引的同步跟踪器，避免闭包过期问题
  // React 状态更新是异步的，快速按键可能看到过期值
  const historyIndexRef = useRef(0);

  // 跟踪历史导航开始时激活的模式过滤器
  // 在第一次箭头按下时设置，并保持固定直到重置
  const initialModeFilterRef = useRef<HistoryMode | undefined>(undefined);

  // 用于保存草稿的当前输入值的引用
  // 确保使用最新值捕获草稿，而非过期的闭包值
  const currentInputRef = useRef(currentInput);
  const pastedContentsRef = useRef(pastedContents);
  const currentModeRef = useRef(currentMode);

  // 使 ref 与 props 保持同步（每次渲染时同步更新）
  currentInputRef.current = currentInput;
  pastedContentsRef.current = pastedContents;
  currentModeRef.current = currentMode;
  const setInputWithCursor = useCallback((value: string, mode: HistoryMode, contents: Record<number, PastedContent>, cursorToStart = false): void => {
    onSetInput(value, mode, contents);
    setCursorOffset?.(cursorToStart ? 0 : value.length);
  }, [onSetInput, setCursorOffset]);
  const updateInput = useCallback((input: HistoryEntry | undefined, cursorToStart_0 = false): void => {
    if (!input || !input.display) return;
    const mode_0 = getModeFromInput(input.display);
    const value_0 = mode_0 === 'bash' ? input.display.slice(1) : input.display;
    setInputWithCursor(value_0, mode_0, input.pastedContents ?? {}, cursorToStart_0);
  }, [setInputWithCursor]);
  const showSearchHint = useCallback((): void => {
    addNotification({
      key: 'search-history-hint',
      jsx: <Text dimColor>
          <ConfigurableShortcutHint action="history:search" context="Global" fallback="ctrl+r" description="搜索历史" />
        </Text>,
      priority: 'immediate',
      timeoutMs: FOOTER_TEMPORARY_STATUS_TIMEOUT
    });
  }, [addNotification]);
  const onHistoryUp = useCallback((): void => {
    // 递增同步以处理快速按键
    const targetIndex = historyIndexRef.current;
    historyIndexRef.current++;
    const inputAtPress = currentInputRef.current;
    const pastedContentsAtPress = pastedContentsRef.current;
    const modeAtPress = currentModeRef.current;
    if (targetIndex === 0) {
      initialModeFilterRef.current = modeAtPress === 'bash' ? modeAtPress : undefined;

      // 使用 ref 同步保存草稿，获取最新值
      // 确保在任何异步操作或重新渲染前捕获草稿
      const hasInput = inputAtPress.trim() !== '';
      setLastShownHistoryEntry(hasInput ? {
        display: inputAtPress,
        pastedContents: pastedContentsAtPress,
        mode: modeAtPress
      } : undefined);
    }
    const modeFilter = initialModeFilterRef.current;
    void (async () => {
      const neededCount = targetIndex + 1 // 需要的条目数

      // 如果模式过滤器改变，使缓存失效
      if (historyCacheModeFilter.current !== modeFilter) {
        historyCache.current = [];
        historyCacheModeFilter.current = modeFilter;
        historyIndexRef.current = 0;
      }

      // 如果需要，加载更多条目
      if (historyCache.current.length < neededCount) {
        // Batches concurrent requests - rapid keypresses share a single disk read
        const entries = await loadHistoryEntries(neededCount, modeFilter);
        // 仅当加载的条目超过当前缓存时才更新缓存
        // （处理多个加载乱序完成的竞态条件）
        if (entries.length > historyCache.current.length) {
          historyCache.current = entries;
        }
      }

      // 检查是否可以导航
      if (targetIndex >= historyCache.current.length) {
        // 由于无法导航，回滚 ref
        historyIndexRef.current--;
        // 保持草稿不变——用户留在当前输入状态
        return;
      }
      const newIndex = targetIndex + 1;
      setHistoryIndex(newIndex);
      updateInput(historyCache.current[targetIndex], true);

      // 每次会话中导航通过 2 条历史条目后显示一次提示
      if (newIndex >= 2 && !hasShownSearchHintRef.current) {
        hasShownSearchHintRef.current = true;
        showSearchHint();
      }
    })();
  }, [updateInput, showSearchHint]);
  const onHistoryDown = useCallback((): boolean => {
    // 使用 ref 进行一致的读取
    const currentIndex = historyIndexRef.current;
    if (currentIndex > 1) {
      historyIndexRef.current--;
      setHistoryIndex(currentIndex - 1);
      updateInput(historyCache.current[currentIndex - 2]);
    } else if (currentIndex === 1) {
      historyIndexRef.current = 0;
      setHistoryIndex(0);
      if (lastShownHistoryEntry) {
        // 使用保存的模式恢复草稿（如果可用）
        const savedMode = lastShownHistoryEntry.mode;
        if (savedMode) {
          setInputWithCursor(lastShownHistoryEntry.display, savedMode, lastShownHistoryEntry.pastedContents ?? {});
        } else {
          updateInput(lastShownHistoryEntry);
        }
      } else {
        // 在过滤模式下，清除输入时保持在该模式
        setInputWithCursor('', initialModeFilterRef.current ?? 'prompt', {});
      }
    }
    return currentIndex <= 0;
  }, [lastShownHistoryEntry, updateInput, setInputWithCursor]);
  const resetHistory = useCallback((): void => {
    setLastShownHistoryEntry(undefined);
    setHistoryIndex(0);
    historyIndexRef.current = 0;
    initialModeFilterRef.current = undefined;
    removeNotification('search-history-hint');
    historyCache.current = [];
    historyCacheModeFilter.current = undefined;
  }, [removeNotification]);
  const dismissSearchHint = useCallback((): void => {
    removeNotification('search-history-hint');
  }, [removeNotification]);
  return {
    historyIndex,
    setHistoryIndex,
    onHistoryUp,
    onHistoryDown,
    resetHistory,
    dismissSearchHint
  };
}
