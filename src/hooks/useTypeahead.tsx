import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNotifications } from '../context/notifications.js';
import { Text } from '../ink.js';
import { logEvent } from '../services/analytics/index.js';
import { useDebounceCallback } from 'usehooks-ts';
import { type Command, getCommandName } from '../commands.js';
import { getModeFromInput, getValueFromInput } from '../components/PromptInput/inputModes.js';
import type { SuggestionItem, SuggestionType } from '../components/PromptInput/PromptInputFooterSuggestions.js';
import { useIsModalOverlayActive, useRegisterOverlay } from '../context/overlayContext.js';
import { KeyboardEvent } from '../ink/events/keyboard-event.js';
// eslint-disable-next-line custom-rules/prefer-use-keybindings -- 向后兼容桥接，直到消费者将 handleKeyDown 绑定到 <Box onKeyDown>
import { useInput } from '../ink.js';
import { useOptionalKeybindingContext, useRegisterKeybindingContext } from '../keybindings/KeybindingContext.js';
import { useKeybindings } from '../keybindings/useKeybinding.js';
import { useShortcutDisplay } from '../keybindings/useShortcutDisplay.js';
import { useAppState, useAppStateStore } from '../state/AppState.js';
import type { AgentDefinition } from '../tools/AgentTool/loadAgentsDir.js';
import type { InlineGhostText, PromptInputMode } from '../types/textInputTypes.js';
import { isAgentSwarmsEnabled } from '../utils/agentSwarmsEnabled.js';
import { generateProgressiveArgumentHint, parseArguments } from '../utils/argumentSubstitution.js';
import { getShellCompletions, type ShellCompletionType } from '../utils/bash/shellCompletion.js';
import { formatLogMetadata } from '../utils/format.js';
import { getSessionIdFromLog, searchSessionsByCustomTitle } from '../utils/sessionStorage.js';
import { applyCommandSuggestion, findMidInputSlashCommand, generateCommandSuggestions, getBestCommandMatch, isCommandInput } from '../utils/suggestions/commandSuggestions.js';
import { getDirectoryCompletions, getPathCompletions, isPathLikeToken } from '../utils/suggestions/directoryCompletion.js';
import { getShellHistoryCompletion } from '../utils/suggestions/shellHistoryCompletion.js';
import { getSlackChannelSuggestions, hasSlackMcpServer } from '../utils/suggestions/slackChannelSuggestions.js';
import { TEAM_LEAD_NAME } from '../utils/swarm/constants.js';
import { applyFileSuggestion, findLongestCommonPrefix, onIndexBuildComplete, startBackgroundCacheRefresh } from './fileSuggestions.js';
import { generateUnifiedSuggestions } from './unifiedSuggestions.js';

// 支持 Unicode 的文件路径标记字符类：
// \p{L} = 字母（中文、拉丁、西里尔等）
// \p{N} = 数字（包括全角）
// \p{M} = 组合符号（macOS NFD 重音、天城文元音符号）
const AT_TOKEN_HEAD_RE = /^@[\p{L}\p{N}\p{M}_\-./\\()[\]~:]*/u;
const PATH_CHAR_HEAD_RE = /^[\p{L}\p{N}\p{M}_\-./\\()[\]~:]+/u;
const TOKEN_WITH_AT_RE = /(@[\p{L}\p{N}\p{M}_\-./\\()[\]~:]*|[\p{L}\p{N}\p{M}_\-./\\()[\]~:]+)$/u;
const TOKEN_WITHOUT_AT_RE = /[\p{L}\p{N}\p{M}_\-./\\()[\]~:]+$/u;
const HAS_AT_SYMBOL_RE = /(^|\s)@([\p{L}\p{N}\p{M}_\-./\\()[\]~:]*|"[^"]*"?)$/u;
const HASH_CHANNEL_RE = /(^|\s)#([a-z0-9][a-z0-9_-]*)$/;

// 路径补全元数据的类型守卫
function isPathMetadata(metadata: unknown): metadata is {
  type: 'directory' | 'file';
} {
  return typeof metadata === 'object' && metadata !== null && 'type' in metadata && (metadata.type === 'directory' || metadata.type === 'file');
}

// 更新建议时确定 selectedSuggestion 的辅助函数
function getPreservedSelection(prevSuggestions: SuggestionItem[], prevSelection: number, newSuggestions: SuggestionItem[]): number {
  // 没有新建议
  if (newSuggestions.length === 0) {
    return -1;
  }

  // 没有之前的选中项
  if (prevSelection < 0) {
    return 0;
  }

  // 获取之前选中的项
  const prevSelectedItem = prevSuggestions[prevSelection];
  if (!prevSelectedItem) {
    return 0;
  }

  // 尝试在新列表中按 ID 查找相同的项
  const newIndex = newSuggestions.findIndex(item => item.id === prevSelectedItem.id);

  // 如果找到则返回新索引，否则默认返回 0
  return newIndex >= 0 ? newIndex : 0;
}

function buildResumeInputFromSuggestion(suggestion: SuggestionItem): string {
  const metadata = suggestion.metadata as {
    sessionId: string;
  } | undefined;
  return metadata?.sessionId ? `/resume ${metadata.sessionId}` : `/resume ${suggestion.displayText}`;
}

type Props = {
  onInputChange: (value: string) => void;
  onSubmit: (value: string, isSubmittingSlashCommand?: boolean) => void;
  setCursorOffset: (offset: number) => void;
  input: string;
  cursorOffset: number;
  commands: Command[];
  mode: string;
  agents: AgentDefinition[];
  setSuggestionsState: (f: (previousSuggestionsState: {
    suggestions: SuggestionItem[];
    selectedSuggestion: number;
    commandArgumentHint?: string;
  }) => {
    suggestions: SuggestionItem[];
    selectedSuggestion: number;
    commandArgumentHint?: string;
  }) => void;
  suggestionsState: {
    suggestions: SuggestionItem[];
    selectedSuggestion: number;
    commandArgumentHint?: string;
  };
  suppressSuggestions?: boolean;
  markAccepted: () => void;
  onModeChange?: (mode: PromptInputMode) => void;
};

type UseTypeaheadResult = {
  suggestions: SuggestionItem[];
  selectedSuggestion: number;
  suggestionType: SuggestionType;
  maxColumnWidth?: number;
  commandArgumentHint?: string;
  inlineGhostText?: InlineGhostText;
  handleKeyDown: (e: KeyboardEvent) => void;
};

/**
 * 从补全标记中提取搜索标记，移除 @ 前缀和引号
 * @param completionToken 补全标记
 * @returns 移除 @ 和引号后的搜索标记
 */
export function extractSearchToken(completionToken: {
  token: string;
  isQuoted?: boolean;
}): string {
  if (completionToken.isQuoted) {
    // 移除 @" 前缀和可选的结尾 "
    return completionToken.token.slice(2).replace(/"$/, '');
  } else if (completionToken.token.startsWith('@')) {
    return completionToken.token.substring(1);
  } else {
    return completionToken.token;
  }
}

/**
 * 根据上下文格式化带 @ 前缀和引号的替换值
 * @param options 格式化配置
 * @param options.displayText 要显示的文本
 * @param options.mode 当前模式（bash 或 prompt）
 * @param options.hasAtPrefix 原始标记是否有 @ 前缀
 * @param options.needsQuotes 文本是否需要引号（包含空格）
 * @param options.isQuoted 原始标记是否已经带引号（用户输入了 @"...）
 * @param options.isComplete 是否为完整建议（添加尾随空格）
 * @returns 格式化后的替换值
 */
export function formatReplacementValue(options: {
  displayText: string;
  mode: string;
  hasAtPrefix: boolean;
  needsQuotes: boolean;
  isQuoted?: boolean;
  isComplete: boolean;
}): string {
  const {
    displayText,
    mode,
    hasAtPrefix,
    needsQuotes,
    isQuoted,
    isComplete
  } = options;
  const space = isComplete ? ' ' : '';

  if (isQuoted || needsQuotes) {
    // 使用带引号的格式
    return mode === 'bash' ? `"${displayText}"${space}` : `@"${displayText}"${space}`;
  } else if (hasAtPrefix) {
    return mode === 'bash' ? `${displayText}${space}` : `@${displayText}${space}`;
  } else {
    return displayText;
  }
}

/**
 * 应用 Shell 补全建议，替换当前单词
 */
export function applyShellSuggestion(suggestion: SuggestionItem, input: string, cursorOffset: number, onInputChange: (value: string) => void, setCursorOffset: (offset: number) => void, completionType: ShellCompletionType | undefined): void {
  const beforeCursor = input.slice(0, cursorOffset);
  const lastSpaceIndex = beforeCursor.lastIndexOf(' ');
  const wordStart = lastSpaceIndex + 1;

  // 根据补全类型准备替换文本
  let replacementText: string;
  if (completionType === 'variable') {
    replacementText = '$' + suggestion.displayText + ' ';
  } else if (completionType === 'command') {
    replacementText = suggestion.displayText + ' ';
  } else {
    replacementText = suggestion.displayText;
  }
  const newInput = input.slice(0, wordStart) + replacementText + input.slice(cursorOffset);
  onInputChange(newInput);
  setCursorOffset(wordStart + replacementText.length);
}

const DM_MEMBER_RE = /(^|\s)@[\w-]*$/;

function applyTriggerSuggestion(suggestion: SuggestionItem, input: string, cursorOffset: number, triggerRe: RegExp, onInputChange: (value: string) => void, setCursorOffset: (offset: number) => void): void {
  const m = input.slice(0, cursorOffset).match(triggerRe);
  if (!m || m.index === undefined) return;
  const prefixStart = m.index + (m[1]?.length ?? 0);
  const before = input.slice(0, prefixStart);
  const newInput = before + suggestion.displayText + ' ' + input.slice(cursorOffset);
  onInputChange(newInput);
  setCursorOffset(before.length + suggestion.displayText.length + 1);
}

let currentShellCompletionAbortController: AbortController | null = null;

/**
 * 生成 bash shell 补全建议
 */
async function generateBashSuggestions(input: string, cursorOffset: number): Promise<SuggestionItem[]> {
  try {
    if (currentShellCompletionAbortController) {
      currentShellCompletionAbortController.abort();
    }
    currentShellCompletionAbortController = new AbortController();
    const suggestions = await getShellCompletions(input, cursorOffset, currentShellCompletionAbortController.signal);
    return suggestions;
  } catch {
    // 静默失败，不破坏用户体验
    logEvent('tengu_shell_completion_failed', {});
    return [];
  }
}

/**
 * 将目录/路径补全建议应用到输入中
 * 始终添加 @ 前缀，因为我们替换整个标记（包括可能已存在的 @）
 *
 * @param input 当前输入文本
 * @param suggestionId 要应用的建议的 ID
 * @param tokenStartPos 被替换标记的起始位置
 * @param tokenLength 被替换标记的长度
 * @param isDirectory 建议是否为目录（添加 / 后缀）还是文件（添加空格）
 * @returns 包含新输入文本和光标位置的对象
 */
export function applyDirectorySuggestion(input: string, suggestionId: string, tokenStartPos: number, tokenLength: number, isDirectory: boolean): {
  newInput: string;
  cursorPos: number;
} {
  const suffix = isDirectory ? '/' : ' ';
  const before = input.slice(0, tokenStartPos);
  const after = input.slice(tokenStartPos + tokenLength);
  // 始终添加 @ 前缀 - 如果标记已包含 @，我们正在替换整个标记（包括 @）为 @suggestion.id
  const replacement = '@' + suggestionId + suffix;
  const newInput = before + replacement + after;
  return {
    newInput,
    cursorPos: before.length + replacement.length
  };
}

/**
 * 提取光标位置的可补全标记
 * @param text 输入文本
 * @param cursorPos 光标位置
 * @param includeAtSymbol 是否将 @ 符号视为标记的一部分
 * @returns 可补全标记及其起始位置，如果未找到则返回 null
 */
export function extractCompletionToken(text: string, cursorPos: number, includeAtSymbol = false): {
  token: string;
  startPos: number;
  isQuoted?: boolean;
} | null {
  // 空输入检查
  if (!text) return null;

  // 获取光标前的文本
  const textBeforeCursor = text.substring(0, cursorPos);

  // 首先检查带引号的 @ 提及（例如 @"my file with spaces"）
  if (includeAtSymbol) {
    const quotedAtRegex = /@"([^"]*)"?$/;
    const quotedMatch = textBeforeCursor.match(quotedAtRegex);
    if (quotedMatch && quotedMatch.index !== undefined) {
      // 包含光标后直到结束引号或末尾的剩余引用内容
      const textAfterCursor = text.substring(cursorPos);
      const afterQuotedMatch = textAfterCursor.match(/^[^"]*"?/);
      const quotedSuffix = afterQuotedMatch ? afterQuotedMatch[0] : '';
      return {
        token: quotedMatch[0] + quotedSuffix,
        startPos: quotedMatch.index,
        isQuoted: true
      };
    }
  }

  // 针对 @ 标记的快速路径：使用 lastIndexOf 避免昂贵的 $ 锚点扫描
  if (includeAtSymbol) {
    const atIdx = textBeforeCursor.lastIndexOf('@');
    if (atIdx >= 0 && (atIdx === 0 || /\s/.test(textBeforeCursor[atIdx - 1]!))) {
      const fromAt = textBeforeCursor.substring(atIdx);
      const atHeadMatch = fromAt.match(AT_TOKEN_HEAD_RE);
      if (atHeadMatch && atHeadMatch[0].length === fromAt.length) {
        const textAfterCursor = text.substring(cursorPos);
        const afterMatch = textAfterCursor.match(PATH_CHAR_HEAD_RE);
        const tokenSuffix = afterMatch ? afterMatch[0] : '';
        return {
          token: atHeadMatch[0] + tokenSuffix,
          startPos: atIdx,
          isQuoted: false
        };
      }
    }
  }

  // 非 @ 标记或光标在 @ 标记外 —— 使用 $ 锚定在（短）尾部
  const tokenRegex = includeAtSymbol ? TOKEN_WITH_AT_RE : TOKEN_WITHOUT_AT_RE;
  const match = textBeforeCursor.match(tokenRegex);
  if (!match || match.index === undefined) {
    return null;
  }

  // 检查光标是否在标记的中间（光标后有更多单词字符）
  // 如果是，扩展标记以包含直到空格或字符串末尾的所有字符
  const textAfterCursor = text.substring(cursorPos);
  const afterMatch = textAfterCursor.match(PATH_CHAR_HEAD_RE);
  const tokenSuffix = afterMatch ? afterMatch[0] : '';
  return {
    token: match[0] + tokenSuffix,
    startPos: match.index,
    isQuoted: false
  };
}

function extractCommandNameAndArgs(value: string): {
  commandName: string;
  args: string;
} | null {
  if (isCommandInput(value)) {
    const spaceIndex = value.indexOf(' ');
    if (spaceIndex === -1) return {
      commandName: value.slice(1),
      args: ''
    };
    return {
      commandName: value.slice(1, spaceIndex),
      args: value.slice(spaceIndex + 1)
    };
  }
  return null;
}

function hasCommandWithArguments(isAtEndWithWhitespace: boolean, value: string) {
  // 如果 value.endsWith(' ') 但用户不在末尾，则用户可能已经回到命令以编辑命令名称
  // （但保留参数）。
  return !isAtEndWithWhitespace && value.includes(' ') && !value.endsWith(' ');
}

/**
 * 用于处理命令和文件路径的输入提示功能的钩子
 */
export function useTypeahead({
  commands,
  onInputChange,
  onSubmit,
  setCursorOffset,
  input,
  cursorOffset,
  mode,
  agents,
  setSuggestionsState,
  suggestionsState: {
    suggestions,
    selectedSuggestion,
    commandArgumentHint
  },
  suppressSuggestions = false,
  markAccepted,
  onModeChange
}: Props): UseTypeaheadResult {
  const {
    addNotification
  } = useNotifications();
  const thinkingToggleShortcut = useShortcutDisplay('chat:thinkingToggle', '聊天', 'alt+t');
  const [suggestionType, setSuggestionType] = useState<SuggestionType>('none');

  // 一次性计算所有命令的最大列宽（非过滤结果）
  // 防止过滤时布局偏移
  const allCommandsMaxWidth = useMemo(() => {
    const visibleCommands = commands.filter(cmd => !cmd.isHidden);
    if (visibleCommands.length === 0) return undefined;
    const maxLen = Math.max(...visibleCommands.map(cmd => getCommandName(cmd).length));
    return maxLen + 6; // +1 用于 "/" 前缀，+5 用于内边距
  }, [commands]);
  const [maxColumnWidth, setMaxColumnWidth] = useState<number | undefined>(undefined);
  const mcpResources = useAppState(s => s.mcp.resources);
  const store = useAppStateStore();
  const promptSuggestion = useAppState(s => s.promptSuggestion);
  // PromptInput 在队友视图中隐藏建议幽灵文本 —— 在此处镜像该门控
  // 以便 Tab/右箭头无法接受未显示的内容。
  const isViewingTeammate = useAppState(s => !!s.viewingAgentTaskId);

  // 访问键绑定上下文以检查待处理的和弦序列
  const keybindingContext = useOptionalKeybindingContext();

  // 内联幽灵文本的状态（bash 历史补全 - 异步）
  const [inlineGhostText, setInlineGhostText] = useState<InlineGhostText | undefined>(undefined);

  // 提示模式下输入中斜杠命令的同步幽灵文本。
  // 在渲染期间通过 useMemo 计算，以消除使用 useState + useEffect 时出现的一帧闪烁
  //（effect 在渲染后运行）。
  const syncPromptGhostText = useMemo((): InlineGhostText | undefined => {
    if (mode !== 'prompt' || suppressSuggestions) return undefined;
    const midInputCommand = findMidInputSlashCommand(input, cursorOffset);
    if (!midInputCommand) return undefined;
    const match = getBestCommandMatch(midInputCommand.partialCommand, commands);
    if (!match) return undefined;
    return {
      text: match.suffix,
      fullCommand: match.fullCommand,
      insertPosition: midInputCommand.startPos + 1 + midInputCommand.partialCommand.length
    };
  }, [input, cursorOffset, mode, commands, suppressSuggestions]);

  // 合并幽灵文本：提示模式使用同步 useMemo，bash 模式使用异步 useState
  const effectiveGhostText = suppressSuggestions ? undefined : mode === 'prompt' ? syncPromptGhostText : inlineGhostText;

  // 使用 ref 存储 cursorOffset，避免仅光标移动就重新触发建议
  // 我们只希望在实际搜索标记发生变化时重新获取建议
  const cursorOffsetRef = useRef(cursorOffset);
  cursorOffsetRef.current = cursorOffset;

  // 跟踪最新的搜索标记，以丢弃来自慢速异步操作的过时结果
  const latestSearchTokenRef = useRef<string | null>(null);
  // 跟踪先前的输入，以检测实际文本变化与回调重建
  const prevInputRef = useRef('');
  // 跟踪最新的路径标记，以丢弃来自路径补全的过时结果
  const latestPathTokenRef = useRef('');
  // 跟踪最新的 bash 输入，以丢弃来自历史补全的过时结果
  const latestBashInputRef = useRef('');
  // 跟踪最新的 slack 频道标记，以丢弃来自 MCP 的过时结果
  const latestSlackTokenRef = useRef('');
  // 通过 ref 跟踪建议，以避免在选中项变化时重新创建 updateSuggestions
  const suggestionsRef = useRef(suggestions);
  suggestionsRef.current = suggestions;
  // 跟踪手动关闭建议时的输入值，以防止重新触发
  const dismissedForInputRef = useRef<string | null>(null);

  // 清除所有建议
  const clearSuggestions = useCallback(() => {
    setSuggestionsState(() => ({
      commandArgumentHint: undefined,
      suggestions: [],
      selectedSuggestion: -1
    }));
    setSuggestionType('none');
    setMaxColumnWidth(undefined);
    setInlineGhostText(undefined);
  }, [setSuggestionsState]);

  // 获取文件/资源建议的昂贵异步操作
  const fetchFileSuggestions = useCallback(async (searchToken: string, isAtSymbol = false): Promise<void> => {
    latestSearchTokenRef.current = searchToken;
    const combinedItems = await generateUnifiedSuggestions(searchToken, mcpResources, agents, isAtSymbol);
    // 如果在等待期间发起了更新的查询，则丢弃过时结果
    if (latestSearchTokenRef.current !== searchToken) {
      return;
    }
    if (combinedItems.length === 0) {
      // 内联 clearSuggestions 逻辑，避免需要 debouncedFetchFileSuggestions
      setSuggestionsState(() => ({
        commandArgumentHint: undefined,
        suggestions: [],
        selectedSuggestion: -1
      }));
      setSuggestionType('none');
      setMaxColumnWidth(undefined);
      return;
    }
    setSuggestionsState(prev => ({
      commandArgumentHint: undefined,
      suggestions: combinedItems,
      selectedSuggestion: getPreservedSelection(prev.suggestions, prev.selectedSuggestion, combinedItems)
    }));
    setSuggestionType(combinedItems.length > 0 ? 'file' : 'none');
    setMaxColumnWidth(undefined); // 文件建议不设固定宽度
  }, [mcpResources, setSuggestionsState, setSuggestionType, setMaxColumnWidth, agents]);

  // 在挂载时预热文件索引，这样第一次 @ 提及就不会阻塞。
  // 构建在后台运行，具有约 4ms 的事件循环让步，因此不会延迟首次渲染 ——
  // 它只是与用户的第一次 @ 按键竞赛。
  //
  // 如果用户在构建完成前输入，他们会从就绪的块中获得部分结果；
  // 当构建完成时，重新触发最后一次搜索，以便部分结果升级为完整结果。
  // 清除标记引用，以便同一查询不会被丢弃为过时。
  //
  // 在 NODE_ENV=test 下跳过：REPL 挂载测试会针对真实的 CI 工作区（Windows 运行器上超过 27 万个文件）生成 git ls-files，
  // 并且后台构建比测试寿命更长——它的 setImmediate 链泄漏到分片中的后续测试中。订阅者仍然注册，因此直接触发刷新的 fileSuggestions 测试能正常工作。
  useEffect(() => {
    if (process.env.NODE_ENV !== 'test') {
      startBackgroundCacheRefresh();
    }
    return onIndexBuildComplete(() => {
      const token = latestSearchTokenRef.current;
      if (token !== null) {
        latestSearchTokenRef.current = null;
        void fetchFileSuggestions(token, token === '');
      }
    });
  }, [fetchFileSuggestions]);

  // 对文件获取操作进行防抖。50ms 略高于 macOS 默认按键重复（约 33ms），
  // 因此按住删除/退格键会合并为一次搜索，而不是在每次重复按键上卡顿。
  // 在 27 万文件的索引上，搜索本身约 8–15ms。
  const debouncedFetchFileSuggestions = useDebounceCallback(fetchFileSuggestions, 50);

  const fetchSlackChannels = useCallback(async (partial: string): Promise<void> => {
    latestSlackTokenRef.current = partial;
    const channels = await getSlackChannelSuggestions(store.getState().mcp.clients, partial);
    if (latestSlackTokenRef.current !== partial) return;
    setSuggestionsState(prev => ({
      commandArgumentHint: undefined,
      suggestions: channels,
      selectedSuggestion: getPreservedSelection(prev.suggestions, prev.selectedSuggestion, channels)
    }));
    setSuggestionType(channels.length > 0 ? 'slack-channel' : 'none');
    setMaxColumnWidth(undefined);
  },
  // eslint-disable-next-line react-hooks/exhaustive-deps -- store 是稳定的上下文引用
  [setSuggestionsState]);

  // 第一次按 # 后需要 MCP 往返；后续共享同一首单词片段的按键会同步命中缓存。
  const debouncedFetchSlackChannels = useDebounceCallback(fetchSlackChannels, 150);

  // 处理即时建议逻辑（廉价操作）
  // biome-ignore lint/correctness/useExhaustiveDependencies: store 是稳定的上下文引用，在调用时命令式读取
  const updateSuggestions = useCallback(async (value: string, inputCursorOffset?: number): Promise<void> => {
    // 使用提供的光标偏移量或回退到 ref（避免对 cursorOffset 的依赖）
    const effectiveCursorOffset = inputCursorOffset ?? cursorOffsetRef.current;
    if (suppressSuggestions) {
      debouncedFetchFileSuggestions.cancel();
      clearSuggestions();
      return;
    }

    // 检查输入中斜杠命令（例如 "help me /com"）
    // 仅在提示模式下，且输入不以 "/" 开头时（单独处理）
    // 注意：提示模式的幽灵文本通过 syncPromptGhostText useMemo 同步计算。
    // 我们只需要在幽灵文本激活时清除下拉建议。
    if (mode === 'prompt') {
      const midInputCommand = findMidInputSlashCommand(value, effectiveCursorOffset);
      if (midInputCommand) {
        const match = getBestCommandMatch(midInputCommand.partialCommand, commands);
        if (match) {
          // 显示幽灵文本时清除下拉建议
          setSuggestionsState(() => ({
            commandArgumentHint: undefined,
            suggestions: [],
            selectedSuggestion: -1
          }));
          setSuggestionType('none');
          setMaxColumnWidth(undefined);
          return;
        }
      }
    }

    // Bash 模式：检查基于历史记录的幽灵文本补全
    if (mode === 'bash' && value.trim()) {
      latestBashInputRef.current = value;
      const historyMatch = await getShellHistoryCompletion(value);
      // 如果在等待期间输入发生了变化，则丢弃过时结果
      if (latestBashInputRef.current !== value) {
        return;
      }
      if (historyMatch) {
        setInlineGhostText({
          text: historyMatch.suffix,
          fullCommand: historyMatch.fullCommand,
          insertPosition: value.length
        });
        // 显示幽灵文本时清除下拉建议
        setSuggestionsState(() => ({
          commandArgumentHint: undefined,
          suggestions: [],
          selectedSuggestion: -1
        }));
        setSuggestionType('none');
        setMaxColumnWidth(undefined);
        return;
      } else {
        // 没有历史记录匹配，清除幽灵文本
        setInlineGhostText(undefined);
      }
    }

    // 检查 @ 以触发团队成员/命名子代理建议
    // 必须在 @ 文件符号之前检查，以防止冲突
    // 在 bash 模式下跳过 - @ 在 shell 命令中没有特殊含义
    const atMatch = mode !== 'bash' ? value.substring(0, effectiveCursorOffset).match(/(^|\s)@([\w-]*)$/) : null;
    if (atMatch) {
      const partialName = (atMatch[2] ?? '').toLowerCase();
      // 命令式读取 —— 在调用时读取可修复会话中添加的队友/子代理的过时问题。
      const state = store.getState();
      const members: SuggestionItem[] = [];
      const seen = new Set<string>();
      if (isAgentSwarmsEnabled() && state.teamContext) {
        for (const t of Object.values(state.teamContext.teammates ?? {})) {
          if (t.name === TEAM_LEAD_NAME) continue;
          if (!t.name.toLowerCase().startsWith(partialName)) continue;
          seen.add(t.name);
          members.push({
            id: `dm-${t.name}`,
            displayText: `@${t.name}`,
            description: '发送消息'
          });
        }
      }
      for (const [name, agentId] of state.agentNameRegistry) {
        if (seen.has(name)) continue;
        if (!name.toLowerCase().startsWith(partialName)) continue;
        const status = state.tasks[agentId]?.status;
        members.push({
          id: `dm-${name}`,
          displayText: `@${name}`,
          description: status ? `发送消息 · ${status}` : '发送消息'
        });
      }
      if (members.length > 0) {
        debouncedFetchFileSuggestions.cancel();
        setSuggestionsState(prev => ({
          commandArgumentHint: undefined,
          suggestions: members,
          selectedSuggestion: getPreservedSelection(prev.suggestions, prev.selectedSuggestion, members)
        }));
        setSuggestionType('agent');
        setMaxColumnWidth(undefined);
        return;
      }
    }

    // 检查 # 以触发 Slack 频道建议（需要 Slack MCP 服务器）
    if (mode === 'prompt') {
      const hashMatch = value.substring(0, effectiveCursorOffset).match(HASH_CHANNEL_RE);
      if (hashMatch && hasSlackMcpServer(store.getState().mcp.clients)) {
        debouncedFetchSlackChannels(hashMatch[2]!);
        return;
      } else if (suggestionType === 'slack-channel') {
        debouncedFetchSlackChannels.cancel();
        clearSuggestions();
      }
    }

    // 检查 @ 符号以触发文件建议（包括带引号的路径）
    // 包括 MCP 资源的冒号（例如 server:resource/path）
    const hasAtSymbol = value.substring(0, effectiveCursorOffset).match(HAS_AT_SYMBOL_RE);

    // 首先，检查斜杠命令建议（优先级高于 @ 符号）
    // 仅当光标不在 "/" 字符本身上时才显示斜杠命令选择器
    // 如果光标在行末且前面有空格，也不显示
    // 在 bash 模式下不显示斜杠命令
    const isAtEndWithWhitespace = effectiveCursorOffset === value.length && effectiveCursorOffset > 0 && value.length > 0 && value[effectiveCursorOffset - 1] === ' ';

    // 处理命令的目录补全
    if (mode === 'prompt' && isCommandInput(value) && effectiveCursorOffset > 0) {
      const parsedCommand = extractCommandNameAndArgs(value);
      if (parsedCommand && parsedCommand.commandName === 'add-dir' && parsedCommand.args) {
        const {
          args
        } = parsedCommand;

        // 如果 args 以空格结尾，则清除建议（用户已完成路径输入）
        if (args.match(/\s+$/)) {
          debouncedFetchFileSuggestions.cancel();
          clearSuggestions();
          return;
        }
        const dirSuggestions = await getDirectoryCompletions(args);
        if (dirSuggestions.length > 0) {
          setSuggestionsState(prev => ({
            suggestions: dirSuggestions,
            selectedSuggestion: getPreservedSelection(prev.suggestions, prev.selectedSuggestion, dirSuggestions),
            commandArgumentHint: undefined
          }));
          setSuggestionType('directory');
          return;
        }

        // 未找到建议 - 清除并返回
        debouncedFetchFileSuggestions.cancel();
        clearSuggestions();
        return;
      }

      // 处理 /resume 命令的自定义标题补全
      if (parsedCommand && parsedCommand.commandName === 'resume' && parsedCommand.args !== undefined && value.includes(' ')) {
        const {
          args
        } = parsedCommand;

        // 使用部分匹配获取自定义标题建议
        const matches = await searchSessionsByCustomTitle(args, {
          limit: 10
        });
        const suggestions = matches.map(log => {
          const sessionId = getSessionIdFromLog(log);
          return {
            id: `resume-title-${sessionId}`,
            displayText: log.customTitle!,
            description: formatLogMetadata(log),
            metadata: {
              sessionId
            }
          };
        });
        if (suggestions.length > 0) {
          setSuggestionsState(prev => ({
            suggestions,
            selectedSuggestion: getPreservedSelection(prev.suggestions, prev.selectedSuggestion, suggestions),
            commandArgumentHint: undefined
          }));
          setSuggestionType('custom-title');
          return;
        }

        // 未找到建议 - 清除并返回
        clearSuggestions();
        return;
      }
    }

    // 确定是否显示参数提示和命令建议。
    if (mode === 'prompt' && isCommandInput(value) && effectiveCursorOffset > 0 && !hasCommandWithArguments(isAtEndWithWhitespace, value)) {
      let commandArgumentHint: string | undefined = undefined;
      if (value.length > 1) {
        // 我们有一个不带参数的部分或完整命令
        // 检查它是否完全匹配某个命令并且有参数提示

        // 提取命令名称：/ 之后直到第一个空格（或末尾）
        const spaceIndex = value.indexOf(' ');
        const commandName = spaceIndex === -1 ? value.slice(1) : value.slice(1, spaceIndex);

        // 检查是否有真正的参数（命令后的非空白字符）
        const hasRealArguments = spaceIndex !== -1 && value.slice(spaceIndex + 1).trim().length > 0;

        // 检查输入是否恰好是 "command + 单个空格"（准备输入参数）
        const hasExactlyOneTrailingSpace = spaceIndex !== -1 && value.length === spaceIndex + 1;

        // 如果命令后有空格，则不显示建议
        // 这可以防止在 Tab 补全后按 Enter 选择不同的命令
        if (spaceIndex !== -1) {
          const exactMatch = commands.find(cmd => getCommandName(cmd) === commandName);
          if (exactMatch || hasRealArguments) {
            // 优先级 1：静态 argumentHint（仅在第一个尾随空格时显示，为了向后兼容）
            if (exactMatch?.argumentHint && hasExactlyOneTrailingSpace) {
              commandArgumentHint = exactMatch.argumentHint;
            }
            // 优先级 2：来自 argNames 的渐进提示（当有尾随空格时显示）
            else if (exactMatch?.type === 'prompt' && exactMatch.argNames?.length && value.endsWith(' ')) {
              const argsText = value.slice(spaceIndex + 1);
              const typedArgs = parseArguments(argsText);
              commandArgumentHint = generateProgressiveArgumentHint(exactMatch.argNames, typedArgs);
            }
            setSuggestionsState(() => ({
              commandArgumentHint,
              suggestions: [],
              selectedSuggestion: -1
            }));
            setSuggestionType('none');
            setMaxColumnWidth(undefined);
            return;
          }
        }

        // 注意：参数提示仅在恰好有一个尾随空格时显示（当 hasExactlyOneTrailingSpace 为 true 时在上面设置）
      }
      const commandItems = generateCommandSuggestions(value, commands);
      setSuggestionsState(() => ({
        commandArgumentHint,
        suggestions: commandItems,
        selectedSuggestion: commandItems.length > 0 ? 0 : -1
      }));
      setSuggestionType(commandItems.length > 0 ? 'command' : 'none');

      // 使用所有命令的稳定宽度（防止过滤时布局偏移）
      if (commandItems.length > 0) {
        setMaxColumnWidth(allCommandsMaxWidth);
      }
      return;
    }
    if (suggestionType === 'command') {
      // 如果我们之前有命令建议，但输入不再以 '/' 开头
      // 需要清除建议。然而，我们不应返回
      // 因为可能还有相关的 @ 符号和文件建议。
      debouncedFetchFileSuggestions.cancel();
      clearSuggestions();
    } else if (isCommandInput(value) && hasCommandWithArguments(isAtEndWithWhitespace, value)) {
      // 如果我们有一个带参数的命令（没有尾随空格），清除任何过时的提示
      // 防止在状态转换时提示闪烁
      setSuggestionsState(prev => prev.commandArgumentHint ? {
        ...prev,
        commandArgumentHint: undefined
      } : prev);
    }
    if (suggestionType === 'custom-title') {
      // 如果我们之前有自定义标题建议，但输入不再是 /resume
      // 需要清除建议。
      clearSuggestions();
    }
    if (suggestionType === 'agent' && suggestionsRef.current.some((s: SuggestionItem) => s.id?.startsWith('dm-'))) {
      // 如果我们之前有团队成员建议，但输入不再有 @
      // 需要清除建议。
      const hasAt = value.substring(0, effectiveCursorOffset).match(/(^|\s)@([\w-]*)$/);
      if (!hasAt) {
        clearSuggestions();
      }
    }

    // 检查 @ 符号以触发文件和 MCP 资源建议
    // 在 bash 模式下跳过 @ 自动补全 - @ 在 shell 命令中没有特殊含义
    if (hasAtSymbol && mode !== 'bash') {
      // 获取 @ 标记（包括 @ 符号）
      const completionToken = extractCompletionToken(value, effectiveCursorOffset, true);
      if (completionToken && completionToken.token.startsWith('@')) {
        const searchToken = extractSearchToken(completionToken);

        // 如果 @ 后的标记是路径形式的，则使用路径补全而不是模糊搜索
        // 处理 @~/path、@./path、@/path 等目录遍历情况
        if (isPathLikeToken(searchToken)) {
          latestPathTokenRef.current = searchToken;
          const pathSuggestions = await getPathCompletions(searchToken, {
            maxResults: 10
          });
          // 如果在等待期间发起了更新的查询，则丢弃过时结果
          if (latestPathTokenRef.current !== searchToken) {
            return;
          }
          if (pathSuggestions.length > 0) {
            setSuggestionsState(prev => ({
              suggestions: pathSuggestions,
              selectedSuggestion: getPreservedSelection(prev.suggestions, prev.selectedSuggestion, pathSuggestions),
              commandArgumentHint: undefined
            }));
            setSuggestionType('directory');
            return;
          }
        }

        // 如果已经为这个确切的标记获取过，则跳过（防止因建议依赖导致 updateSuggestions 被重新创建而产生循环）
        if (latestSearchTokenRef.current === searchToken) {
          return;
        }
        void debouncedFetchFileSuggestions(searchToken, true);
        return;
      }
    }

    // 如果我们有活跃的文件建议或输入发生了变化，检查文件建议
    if (suggestionType === 'file') {
      const completionToken = extractCompletionToken(value, effectiveCursorOffset, true);
      if (completionToken) {
        const searchToken = extractSearchToken(completionToken);
        // 如果已经为这个确切的标记获取过，则跳过
        if (latestSearchTokenRef.current === searchToken) {
          return;
        }
        void debouncedFetchFileSuggestions(searchToken, false);
      } else {
        // 如果我们之前有文件建议但现在没有补全标记
        debouncedFetchFileSuggestions.cancel();
        clearSuggestions();
      }
    }

    // 如果不在 bash 模式下或输入已更改，则清除 shell 建议
    if (suggestionType === 'shell') {
      const inputSnapshot = (suggestionsRef.current[0]?.metadata as {
        inputSnapshot?: string;
      })?.inputSnapshot;
      if (mode !== 'bash' || value !== inputSnapshot) {
        debouncedFetchFileSuggestions.cancel();
        clearSuggestions();
      }
    }
  }, [suggestionType, commands, setSuggestionsState, clearSuggestions, debouncedFetchFileSuggestions, debouncedFetchSlackChannels, mode, suppressSuggestions,
  // 注意：使用 suggestionsRef 而不是 suggestions，以避免在只有 selectedSuggestion 变化时重新创建此回调
  allCommandsMaxWidth]);

  // 当输入变化时更新建议
  // 注意：我们故意不依赖 cursorOffset —— 仅光标移动不应重新触发建议。
  // cursorOffsetRef 用于在需要时获取当前位置，而不会导致重新渲染。
  useEffect(() => {
    // 如果针对这个确切的输入已经关闭了建议，不要重新触发
    if (dismissedForInputRef.current === input) {
      return;
    }
    // 当实际输入文本发生变化（而不仅仅是 updateSuggestions 被重新创建）时，
    // 重置搜索标记引用，以便可以重新获取相同的查询。
    // 修复：输入 @readme.md，清除，重新输入 @readme.md → 没有建议。
    if (prevInputRef.current !== input) {
      prevInputRef.current = input;
      latestSearchTokenRef.current = null;
    }
    // 输入变化时清除关闭状态
    dismissedForInputRef.current = null;
    void updateSuggestions(input);
  }, [input, updateSuggestions]);

  // 处理 Tab 键按下 - 完成建议或触发文件建议
  const handleTab = useCallback(async () => {
    // 如果有内联幽灵文本，应用它
    if (effectiveGhostText) {
      // 首先检查 bash 模式的历史补全
      if (mode === 'bash') {
        // 用历史记录中的完整命令替换输入
        onInputChange(effectiveGhostText.fullCommand);
        setCursorOffset(effectiveGhostText.fullCommand.length);
        setInlineGhostText(undefined);
        return;
      }

      // 找到输入中斜杠命令以获取其位置（用于提示模式）
      const midInputCommand = findMidInputSlashCommand(input, cursorOffset);
      if (midInputCommand) {
        // 将部分命令替换为完整命令 + 空格
        const before = input.slice(0, midInputCommand.startPos);
        const after = input.slice(midInputCommand.startPos + midInputCommand.token.length);
        const newInput = before + '/' + effectiveGhostText.fullCommand + ' ' + after;
        const newCursorOffset = midInputCommand.startPos + 1 + effectiveGhostText.fullCommand.length + 1;
        onInputChange(newInput);
        setCursorOffset(newCursorOffset);
        return;
      }
    }

    // 如果有活跃的建议，选择一个
    if (suggestions.length > 0) {
      // 取消任何待处理的防抖获取，以防止接受时闪烁
      debouncedFetchFileSuggestions.cancel();
      debouncedFetchSlackChannels.cancel();
      const index = selectedSuggestion === -1 ? 0 : selectedSuggestion;
      const suggestion = suggestions[index];
      if (suggestionType === 'command' && index < suggestions.length) {
        if (suggestion) {
          applyCommandSuggestion(suggestion, false,
          // 不要在 tab 上执行
          commands, onInputChange, setCursorOffset, onSubmit);
          clearSuggestions();
        }
      } else if (suggestionType === 'custom-title' && suggestions.length > 0) {
        // 将自定义标题应用到 /resume 命令，附带 sessionId
        if (suggestion) {
          const newInput = buildResumeInputFromSuggestion(suggestion);
          onInputChange(newInput);
          setCursorOffset(newInput.length);
          clearSuggestions();
        }
      } else if (suggestionType === 'directory' && suggestions.length > 0) {
        const suggestion = suggestions[index];
        if (suggestion) {
          // 检查这是否是命令上下文（例如 /add-dir）还是通用路径补全
          const isInCommandContext = isCommandInput(input);
          let newInput: string;
          if (isInCommandContext) {
            // 命令上下文：只替换参数部分
            const spaceIndex = input.indexOf(' ');
            const commandPart = input.slice(0, spaceIndex + 1); // 包含空格
            const cmdSuffix = isPathMetadata(suggestion.metadata) && suggestion.metadata.type === 'directory' ? '/' : ' ';
            newInput = commandPart + suggestion.id + cmdSuffix;
            onInputChange(newInput);
            setCursorOffset(newInput.length);
            if (isPathMetadata(suggestion.metadata) && suggestion.metadata.type === 'directory') {
              // 对于目录，为更新后的路径获取新的建议
              setSuggestionsState(prev => ({
                ...prev,
                commandArgumentHint: undefined
              }));
              void updateSuggestions(newInput, newInput.length);
            } else {
              clearSuggestions();
            }
          } else {
            // 通用路径补全：用带 @ 前缀的路径替换输入中的路径标记
            // 首先尝试获取带 @ 前缀的标记，检查是否已有前缀
            const completionTokenWithAt = extractCompletionToken(input, cursorOffset, true);
            const completionToken = completionTokenWithAt ?? extractCompletionToken(input, cursorOffset, false);
            if (completionToken) {
              const isDir = isPathMetadata(suggestion.metadata) && suggestion.metadata.type === 'directory';
              const result = applyDirectorySuggestion(input, suggestion.id, completionToken.startPos, completionToken.token.length, isDir);
              newInput = result.newInput;
              onInputChange(newInput);
              setCursorOffset(result.cursorPos);
              if (isDir) {
                // 对于目录，为更新后的路径获取新的建议
                setSuggestionsState(prev => ({
                  ...prev,
                  commandArgumentHint: undefined
                }));
                void updateSuggestions(newInput, result.cursorPos);
              } else {
                // 对于文件，清除建议
                clearSuggestions();
              }
            } else {
              // 未找到补全标记（例如光标在空格后）—— 仅清除建议，不修改输入以避免数据丢失
              clearSuggestions();
            }
          }
        }
      } else if (suggestionType === 'shell' && suggestions.length > 0) {
        const suggestion = suggestions[index];
        if (suggestion) {
          const metadata = suggestion.metadata as {
            completionType: ShellCompletionType;
          } | undefined;
          applyShellSuggestion(suggestion, input, cursorOffset, onInputChange, setCursorOffset, metadata?.completionType);
          clearSuggestions();
        }
      } else if (suggestionType === 'agent' && suggestions.length > 0 && suggestions[index]?.id?.startsWith('dm-')) {
        const suggestion = suggestions[index];
        if (suggestion) {
          applyTriggerSuggestion(suggestion, input, cursorOffset, DM_MEMBER_RE, onInputChange, setCursorOffset);
          clearSuggestions();
        }
      } else if (suggestionType === 'slack-channel' && suggestions.length > 0) {
        const suggestion = suggestions[index];
        if (suggestion) {
          applyTriggerSuggestion(suggestion, input, cursorOffset, HASH_CHANNEL_RE, onInputChange, setCursorOffset);
          clearSuggestions();
        }
      } else if (suggestionType === 'file' && suggestions.length > 0) {
        const completionToken = extractCompletionToken(input, cursorOffset, true);
        if (!completionToken) {
          clearSuggestions();
          return;
        }

        // 检查所有建议是否共享一个比当前输入更长的公共前缀
        const commonPrefix = findLongestCommonPrefix(suggestions);

        // 确定标记是否以 @ 开头，以便在替换时保留它
        const hasAtPrefix = completionToken.token.startsWith('@');
        // 有效标记长度不包括 @ 和引号（如果存在）
        let effectiveTokenLength: number;
        if (completionToken.isQuoted) {
          // 移除 @" 前缀和可选的结尾 " 以获得有效长度
          effectiveTokenLength = completionToken.token.slice(2).replace(/"$/, '').length;
        } else if (hasAtPrefix) {
          effectiveTokenLength = completionToken.token.length - 1;
        } else {
          effectiveTokenLength = completionToken.token.length;
        }

        // 如果存在比用户已输入更长的公共前缀，
        // 用公共前缀替换当前输入
        if (commonPrefix.length > effectiveTokenLength) {
          const replacementValue = formatReplacementValue({
            displayText: commonPrefix,
            mode,
            hasAtPrefix,
            needsQuotes: false,
            // 公共前缀不需要引号，除非已经引号
            isQuoted: completionToken.isQuoted,
            isComplete: false // 部分补全
          });
          applyFileSuggestion(replacementValue, input, completionToken.token, completionToken.startPos, onInputChange, setCursorOffset);
          // 不要清除建议，以便用户可以继续输入或选择特定选项
          // 相反，为新前缀更新
          void updateSuggestions(input.replace(completionToken.token, replacementValue), cursorOffset);
        } else if (index < suggestions.length) {
          // 否则，应用选中的建议
          const suggestion = suggestions[index];
          if (suggestion) {
            const needsQuotes = suggestion.displayText.includes(' ');
            const replacementValue = formatReplacementValue({
              displayText: suggestion.displayText,
              mode,
              hasAtPrefix,
              needsQuotes,
              isQuoted: completionToken.isQuoted,
              isComplete: true // 完整建议
            });
            applyFileSuggestion(replacementValue, input, completionToken.token, completionToken.startPos, onInputChange, setCursorOffset);
            clearSuggestions();
          }
        }
      }
    } else if (input.trim() !== '') {
      let suggestionType: SuggestionType;
      let suggestionItems: SuggestionItem[];
      if (mode === 'bash') {
        suggestionType = 'shell';
        // 这应该非常快，小于 10ms
        const bashSuggestions = await generateBashSuggestions(input, cursorOffset);
        if (bashSuggestions.length === 1) {
          // 如果只有一个建议，立即应用它
          const suggestion = bashSuggestions[0];
          if (suggestion) {
            const metadata = suggestion.metadata as {
              completionType: ShellCompletionType;
            } | undefined;
            applyShellSuggestion(suggestion, input, cursorOffset, onInputChange, setCursorOffset, metadata?.completionType);
          }
          suggestionItems = [];
        } else {
          suggestionItems = bashSuggestions;
        }
      } else {
        suggestionType = 'file';
        // 如果没有建议，获取文件和 MCP 资源建议
        const completionInfo = extractCompletionToken(input, cursorOffset, true);
        if (completionInfo) {
          // 如果标记以 @ 开头，则搜索时不带 @ 前缀
          const isAtSymbol = completionInfo.token.startsWith('@');
          const searchToken = isAtSymbol ? completionInfo.token.substring(1) : completionInfo.token;
          suggestionItems = await generateUnifiedSuggestions(searchToken, mcpResources, agents, isAtSymbol);
        } else {
          suggestionItems = [];
        }
      }
      if (suggestionItems.length > 0) {
        // 多个建议或非 bash 模式：显示列表
        setSuggestionsState(prev => ({
          commandArgumentHint: undefined,
          suggestions: suggestionItems,
          selectedSuggestion: getPreservedSelection(prev.suggestions, prev.selectedSuggestion, suggestionItems)
        }));
        setSuggestionType(suggestionType);
        setMaxColumnWidth(undefined);
      }
    }
  }, [suggestions, selectedSuggestion, input, suggestionType, commands, mode, onInputChange, setCursorOffset, onSubmit, clearSuggestions, cursorOffset, updateSuggestions, mcpResources, setSuggestionsState, agents, debouncedFetchFileSuggestions, debouncedFetchSlackChannels, effectiveGhostText]);

  // 处理回车键按下 - 应用并执行建议
  const handleEnter = useCallback(() => {
    if (selectedSuggestion < 0 || suggestions.length === 0) return;
    const suggestion = suggestions[selectedSuggestion];
    if (suggestionType === 'command' && selectedSuggestion < suggestions.length) {
      if (suggestion) {
        applyCommandSuggestion(suggestion, true,
        // 在回车时执行
        commands, onInputChange, setCursorOffset, onSubmit);
        debouncedFetchFileSuggestions.cancel();
        clearSuggestions();
      }
    } else if (suggestionType === 'custom-title' && selectedSuggestion < suggestions.length) {
      // 应用自定义标题并执行 /resume 命令，附带 sessionId
      if (suggestion) {
        const newInput = buildResumeInputFromSuggestion(suggestion);
        onInputChange(newInput);
        setCursorOffset(newInput.length);
        onSubmit(newInput, /* isSubmittingSlashCommand */true);
        debouncedFetchFileSuggestions.cancel();
        clearSuggestions();
      }
    } else if (suggestionType === 'shell' && selectedSuggestion < suggestions.length) {
      const suggestion = suggestions[selectedSuggestion];
      if (suggestion) {
        const metadata = suggestion.metadata as {
          completionType: ShellCompletionType;
        } | undefined;
        applyShellSuggestion(suggestion, input, cursorOffset, onInputChange, setCursorOffset, metadata?.completionType);
        debouncedFetchFileSuggestions.cancel();
        clearSuggestions();
      }
    } else if (suggestionType === 'agent' && selectedSuggestion < suggestions.length && suggestion?.id?.startsWith('dm-')) {
      applyTriggerSuggestion(suggestion, input, cursorOffset, DM_MEMBER_RE, onInputChange, setCursorOffset);
      debouncedFetchFileSuggestions.cancel();
      clearSuggestions();
    } else if (suggestionType === 'slack-channel' && selectedSuggestion < suggestions.length) {
      if (suggestion) {
        applyTriggerSuggestion(suggestion, input, cursorOffset, HASH_CHANNEL_RE, onInputChange, setCursorOffset);
        debouncedFetchSlackChannels.cancel();
        clearSuggestions();
      }
    } else if (suggestionType === 'file' && selectedSuggestion < suggestions.length) {
      // 在需要时直接提取补全标记
      const completionInfo = extractCompletionToken(input, cursorOffset, true);
      if (completionInfo) {
        if (suggestion) {
          const hasAtPrefix = completionInfo.token.startsWith('@');
          const needsQuotes = suggestion.displayText.includes(' ');
          const replacementValue = formatReplacementValue({
            displayText: suggestion.displayText,
            mode,
            hasAtPrefix,
            needsQuotes,
            isQuoted: completionInfo.isQuoted,
            isComplete: true // 完整建议
          });
          applyFileSuggestion(replacementValue, input, completionInfo.token, completionInfo.startPos, onInputChange, setCursorOffset);
          debouncedFetchFileSuggestions.cancel();
          clearSuggestions();
        }
      }
    } else if (suggestionType === 'directory' && selectedSuggestion < suggestions.length) {
      if (suggestion) {
        // 在命令上下文（例如 /add-dir）中，回车提交命令而不是应用目录建议。
        // 只需清除建议，让提交处理器处理当前输入。
        if (isCommandInput(input)) {
          debouncedFetchFileSuggestions.cancel();
          clearSuggestions();
          return;
        }

        // 通用路径补全：替换路径标记
        const completionTokenWithAt = extractCompletionToken(input, cursorOffset, true);
        const completionToken = completionTokenWithAt ?? extractCompletionToken(input, cursorOffset, false);
        if (completionToken) {
          const isDir = isPathMetadata(suggestion.metadata) && suggestion.metadata.type === 'directory';
          const result = applyDirectorySuggestion(input, suggestion.id, completionToken.startPos, completionToken.token.length, isDir);
          onInputChange(result.newInput);
          setCursorOffset(result.cursorPos);
        }
        // 如果未找到补全标记（例如光标在空格后），不修改输入以避免数据丢失 —— 只清除建议

        debouncedFetchFileSuggestions.cancel();
        clearSuggestions();
      }
    }
  }, [suggestions, selectedSuggestion, suggestionType, commands, input, cursorOffset, mode, onInputChange, setCursorOffset, onSubmit, clearSuggestions, debouncedFetchFileSuggestions, debouncedFetchSlackChannels]);

  // 处理 autocomplete:accept - 通过 Tab 或右箭头接受当前建议
  const handleAutocompleteAccept = useCallback(() => {
    void handleTab();
  }, [handleTab]);

  // 处理 autocomplete:dismiss - 清除建议并防止重新触发
  const handleAutocompleteDismiss = useCallback(() => {
    debouncedFetchFileSuggestions.cancel();
    debouncedFetchSlackChannels.cancel();
    clearSuggestions();
    // 记住关闭时的输入，以防止立即重新触发
    dismissedForInputRef.current = input;
  }, [debouncedFetchFileSuggestions, debouncedFetchSlackChannels, clearSuggestions, input]);

  // 处理 autocomplete:previous - 选择上一个建议
  const handleAutocompletePrevious = useCallback(() => {
    setSuggestionsState(prev => ({
      ...prev,
      selectedSuggestion: prev.selectedSuggestion <= 0 ? suggestions.length - 1 : prev.selectedSuggestion - 1
    }));
  }, [suggestions.length, setSuggestionsState]);

  // 处理 autocomplete:next - 选择下一个建议
  const handleAutocompleteNext = useCallback(() => {
    setSuggestionsState(prev => ({
      ...prev,
      selectedSuggestion: prev.selectedSuggestion >= suggestions.length - 1 ? 0 : prev.selectedSuggestion + 1
    }));
  }, [suggestions.length, setSuggestionsState]);

  // 自动补全上下文键绑定 - 仅在建议可见时激活
  const autocompleteHandlers = useMemo(() => ({
    'autocomplete:accept': handleAutocompleteAccept,
    'autocomplete:dismiss': handleAutocompleteDismiss,
    'autocomplete:previous': handleAutocompletePrevious,
    'autocomplete:next': handleAutocompleteNext
  }), [handleAutocompleteAccept, handleAutocompleteDismiss, handleAutocompletePrevious, handleAutocompleteNext]);

  // 将 autocomplete 注册为覆盖层，以便 CancelRequestHandler 推迟 ESC 处理
  // 这确保 ESC 在取消正在运行的任务之前先关闭自动补全
  const isAutocompleteActive = suggestions.length > 0 || !!effectiveGhostText;
  const isModalOverlayActive = useIsModalOverlayActive();
  useRegisterOverlay('autocomplete', isAutocompleteActive);
  // 注册 Autocomplete 上下文，使其出现在其他处理程序的 activeContexts 中。
  // 这允许 Chat 的解析器看到 Autocomplete 并为其 up/down 绑定让路。
  useRegisterKeybindingContext('Autocomplete', isAutocompleteActive);

  // 当模态覆盖层（例如 DiffDialog）处于活动状态时禁用自动补全键绑定，
  // 以便 ESC 到达覆盖层的处理程序而不是关闭自动补全
  useKeybindings(autocompleteHandlers, {
    context: 'Autocomplete',
    isActive: isAutocompleteActive && !isModalOverlayActive
  });

  function acceptSuggestionText(text: string): void {
    const detectedMode = getModeFromInput(text);
    if (detectedMode !== 'prompt' && onModeChange) {
      onModeChange(detectedMode);
      const stripped = getValueFromInput(text);
      onInputChange(stripped);
      setCursorOffset(stripped.length);
    } else {
      onInputChange(text);
      setCursorOffset(text.length);
    }
  }

  // 处理未被键绑定覆盖的键盘输入行为
  const handleKeyDown = (e: KeyboardEvent): void => {
    // 处理右箭头以接受提示建议幽灵文本
    if (e.key === 'right' && !isViewingTeammate) {
      const suggestionText = promptSuggestion.text;
      const suggestionShownAt = promptSuggestion.shownAt;
      if (suggestionText && suggestionShownAt > 0 && input === '') {
        markAccepted();
        acceptSuggestionText(suggestionText);
        e.stopImmediatePropagation();
        return;
      }
    }

    // 处理 Tab 键回退行为（当没有自动补全建议时）
    // 如果按下了 shift 键则不处理（用于模式循环）
    if (e.key === 'tab' && !e.shift) {
      // 如果自动补全正在处理此事件（存在建议或幽灵文本），则跳过
      if (suggestions.length > 0 || effectiveGhostText) {
        return;
      }
      // 如果 AppState 中存在提示建议，则接受它
      const suggestionText = promptSuggestion.text;
      const suggestionShownAt = promptSuggestion.shownAt;
      if (suggestionText && suggestionShownAt > 0 && input === '' && !isViewingTeammate) {
        e.preventDefault();
        markAccepted();
        acceptSuggestionText(suggestionText);
        return;
      }
      // 如果输入为空，提醒用户关于思考切换快捷键
      if (input.trim() === '') {
        e.preventDefault();
        addNotification({
          key: 'thinking-toggle-hint',
          jsx: <Text dimColor>
              使用 {thinkingToggleShortcut} 切换思考
            </Text>,
          priority: 'immediate',
          timeoutMs: 3000
        });
      }
      return;
    }

    // 只有当我们有建议时才继续处理导航
    if (suggestions.length === 0) return;

    // 处理 Ctrl-N/P 进行导航（箭头键由键绑定处理）
    // 如果我们在和弦序列中间，则跳过，以允许像 ctrl+f n 这样的和弦
    const hasPendingChord = keybindingContext?.pendingChord != null;
    if (e.ctrl && e.key === 'n' && !hasPendingChord) {
      e.preventDefault();
      handleAutocompleteNext();
      return;
    }
    if (e.ctrl && e.key === 'p' && !hasPendingChord) {
      e.preventDefault();
      handleAutocompletePrevious();
      return;
    }

    // 通过回车键处理选择和执行
    // Shift+Enter 和 Meta+Enter 插入换行（由 useTextInput 处理），
    // 因此不要为这些键接受建议。
    if (e.key === 'return' && !e.shift && !e.meta) {
      e.preventDefault();
      handleEnter();
    }
  };

  // 向后兼容桥接：PromptInput 尚未将 handleKeyDown 绑定到 <Box onKeyDown>。
  // 通过 useInput 订阅并适配 InputEvent → KeyboardEvent，直到消费者迁移（单独的 PR）。
  // TODO(onKeyDown-migration): 一旦 PromptInput 传递 handleKeyDown，移除此处。
  useInput((_input, _key, event) => {
    const kbEvent = new KeyboardEvent(event.keypress);
    handleKeyDown(kbEvent);
    if (kbEvent.didStopImmediatePropagation()) {
      event.stopImmediatePropagation();
    }
  });

  return {
    suggestions,
    selectedSuggestion,
    suggestionType,
    maxColumnWidth,
    commandArgumentHint,
    inlineGhostText: effectiveGhostText,
    handleKeyDown
  };
}
