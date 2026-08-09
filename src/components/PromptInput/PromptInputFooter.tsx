import { feature } from 'bun:bundle';
import * as React from 'react';
import { memo, type ReactNode, useMemo, useRef } from 'react';
import { isBridgeEnabled } from '../../bridge/bridgeEnabled.js';
import { getBridgeStatus } from '../../bridge/bridgeStatusUtil.js';
import { useSetPromptOverlay } from '../../context/promptOverlayContext.js';
import type { VerificationStatus } from '../../hooks/useApiKeyVerification.js';
import type { IDESelection } from '../../hooks/useIdeSelection.js';
import { useSettings } from '../../hooks/useSettings.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { Box, Text } from '../../ink.js';
import type { MCPServerConnection } from '../../services/mcp/types.js';
import { useAppState } from '../../state/AppState.js';
import type { ToolPermissionContext } from '../../Tool.js';
import type { Message } from '../../types/message.js';
import type { PromptInputMode, VimMode } from '../../types/textInputTypes.js';
import type { AutoUpdaterResult } from '../../utils/autoUpdater.js';
import { isFullscreenEnvEnabled } from '../../utils/fullscreen.js';
import { isUndercover } from '../../utils/undercover.js';
import { CoordinatorTaskPanel, useCoordinatorTaskCount } from '../CoordinatorAgentStatus.js';
import { getLastAssistantMessageId, StatusLine, statusLineShouldDisplay } from '../StatusLine.js';
import { Notifications } from './Notifications.js';
import { PromptInputFooterLeftSide } from './PromptInputFooterLeftSide.js';
import { PromptInputFooterSuggestions, type SuggestionItem } from './PromptInputFooterSuggestions.js';
import { PromptInputHelpMenu } from './PromptInputHelpMenu.js';

type Props = {
  apiKeyStatus: VerificationStatus;
  debug: boolean;
  exitMessage: {
    show: boolean;
    key?: string;
  };
  vimMode: VimMode | undefined;
  mode: PromptInputMode;
  autoUpdaterResult: AutoUpdaterResult | null;
  isAutoUpdating: boolean;
  verbose: boolean;
  onAutoUpdaterResult: (result: AutoUpdaterResult) => void;
  onChangeIsUpdating: (isUpdating: boolean) => void;
  suggestions: SuggestionItem[];
  selectedSuggestion: number;
  maxColumnWidth?: number;
  toolPermissionContext: ToolPermissionContext;
  helpOpen: boolean;
  suppressHint: boolean;
  isLoading: boolean;
  tasksSelected: boolean;
  teamsSelected: boolean;
  bridgeSelected: boolean;
  tmuxSelected: boolean;
  teammateFooterIndex?: number;
  ideSelection: IDESelection | undefined;
  mcpClients?: MCPServerConnection[];
  isPasting?: boolean;
  isInputWrapped?: boolean;
  messages: Message[];
  isSearching: boolean;
  historyQuery: string;
  setHistoryQuery: (query: string) => void;
  historyFailedMatch: boolean;
  onOpenTasksDialog?: (taskId?: string) => void;
};

function PromptInputFooter({
  apiKeyStatus,
  debug,
  exitMessage,
  vimMode,
  mode,
  autoUpdaterResult,
  isAutoUpdating,
  verbose,
  onAutoUpdaterResult,
  onChangeIsUpdating,
  suggestions,
  selectedSuggestion,
  maxColumnWidth,
  toolPermissionContext,
  helpOpen,
  suppressHint: suppressHintFromProps,
  isLoading,
  tasksSelected,
  teamsSelected,
  bridgeSelected,
  tmuxSelected,
  teammateFooterIndex,
  ideSelection,
  mcpClients,
  isPasting = false,
  isInputWrapped = false,
  messages,
  isSearching,
  historyQuery,
  setHistoryQuery,
  historyFailedMatch,
  onOpenTasksDialog
}: Props): ReactNode {
  const settings = useSettings();
  const {
    columns,
    rows
  } = useTerminalSize();
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const lastAssistantMessageId = useMemo(() => getLastAssistantMessageId(messages), [messages]);
  const isNarrow = columns < 80;
  // 在全屏模式下，底部槽位是 flexShrink:0，因此这里的每一行都会从 ScrollBox 中“偷走”一行。
  // 首先丢弃可选的 StatusLine。非全屏模式下，终端有回滚缓冲区可以吸收溢出内容，因此从不隐藏 StatusLine。
  const isFullscreen = isFullscreenEnvEnabled();
  const isShort = isFullscreen && rows < 24;

  // 当 tasks 是活动 footer 项目且没有选中特定的代理行时，高亮 pill。
  // 当 coordinatorTaskIndex >= 0 时，光标已移入 CoordinatorTaskPanel，因此 pill 应取消高亮。
  // coordinatorTaskCount === 0 涵盖了纯 bash 的情况（没有代理行存在，pill 是唯一可选项）。
  const coordinatorTaskCount = useCoordinatorTaskCount();
  const coordinatorTaskIndex = useAppState(s => s.coordinatorTaskIndex);
  const pillSelected = tasksSelected && (coordinatorTaskCount === 0 || coordinatorTaskIndex < 0);

  // 如果用户设置了自定义状态行，或在 ctrl-r 搜索期间，隐藏“? 查看快捷键”的提示
  const suppressHint = suppressHintFromProps || statusLineShouldDisplay(settings) || isSearching;
  // 全屏模式：将数据传递给 FullscreenLayout — 参见 promptOverlayContext.tsx
  const overlayData = useMemo(() => isFullscreen && suggestions.length ? {
    suggestions,
    selectedSuggestion,
    maxColumnWidth
  } : null, [isFullscreen, suggestions, selectedSuggestion, maxColumnWidth]);
  useSetPromptOverlay(overlayData);

  if (suggestions.length && !isFullscreen) {
    return <Box paddingX={2} paddingY={0}>
        <PromptInputFooterSuggestions suggestions={suggestions} selectedSuggestion={selectedSuggestion} maxColumnWidth={maxColumnWidth} />
      </Box>;
  }

  if (helpOpen) {
    return <PromptInputHelpMenu dimColor={true} fixedWidth={true} paddingX={2} />;
  }

  return <>
      <Box flexDirection={isNarrow ? 'column' : 'row'} justifyContent={isNarrow ? 'flex-start' : 'space-between'} paddingX={2} gap={isNarrow ? 0 : 1}>
        <Box flexDirection="column" flexShrink={isNarrow ? 0 : 1}>
          {mode === 'prompt' && !isShort && !exitMessage.show && !isPasting && statusLineShouldDisplay(settings) && <StatusLine messagesRef={messagesRef} lastAssistantMessageId={lastAssistantMessageId} vimMode={vimMode} />}
          <PromptInputFooterLeftSide exitMessage={exitMessage} vimMode={vimMode} mode={mode} toolPermissionContext={toolPermissionContext} suppressHint={suppressHint} isLoading={isLoading} tasksSelected={pillSelected} teamsSelected={teamsSelected} teammateFooterIndex={teammateFooterIndex} tmuxSelected={tmuxSelected} isPasting={isPasting} isSearching={isSearching} historyQuery={historyQuery} setHistoryQuery={setHistoryQuery} historyFailedMatch={historyFailedMatch} onOpenTasksDialog={onOpenTasksDialog} />
        </Box>
        <Box flexShrink={1} gap={1}>
          {isFullscreen ? null : <Notifications apiKeyStatus={apiKeyStatus} autoUpdaterResult={autoUpdaterResult} debug={debug} isAutoUpdating={isAutoUpdating} verbose={verbose} messages={messages} onAutoUpdaterResult={onAutoUpdaterResult} onChangeIsUpdating={onChangeIsUpdating} ideSelection={ideSelection} mcpClients={mcpClients} isInputWrapped={isInputWrapped} isNarrow={isNarrow} />}
          {false && isUndercover() && <Text dimColor>隐身模式</Text>}
          <BridgeStatusIndicator bridgeSelected={bridgeSelected} />
        </Box>
      </Box>
      {false && <CoordinatorTaskPanel />}
    </>;
}

export default memo(PromptInputFooter);

type BridgeStatusProps = {
  bridgeSelected: boolean;
};

function BridgeStatusIndicator({
  bridgeSelected
}: BridgeStatusProps): React.ReactNode {
  if (!feature('BRIDGE_MODE')) return null;

  // biome-ignore lint/correctness/useHookAtTopLevel: feature() 是编译时常量
  const enabled = useAppState(s => s.replBridgeEnabled);
  // biome-ignore lint/correctness/useHookAtTopLevel: feature() 是编译时常量
  const connected = useAppState(s => s.replBridgeConnected);
  // biome-ignore lint/correctness/useHookAtTopLevel: feature() 是编译时常量
  const sessionActive = useAppState(s => s.replBridgeSessionActive);
  // biome-ignore lint/correctness/useHookAtTopLevel: feature() 是编译时常量
  const reconnecting = useAppState(s => s.replBridgeReconnecting);
  // biome-ignore lint/correctness/useHookAtTopLevel: feature() 是编译时常量
  const explicit = useAppState(s => s.replBridgeExplicit);

  // 失败状态通过通知（useReplBridge）显示，而不是 footer 中的 pill。
  if (!isBridgeEnabled() || !enabled) return null;

  const status = getBridgeStatus({
    error: undefined,
    connected,
    sessionActive,
    reconnecting
  });

  // 对于隐式（配置驱动）远程连接，仅显示“正在重新连接”状态
  if (!explicit && status.label !== '远程控制正在重新连接') {
    return null;
  }

  return <Text color={bridgeSelected ? 'background' : status.color} inverse={bridgeSelected} wrap="truncate">
      {status.label}
      {bridgeSelected && <Text dimColor> · 按回车键查看</Text>}
    </Text>;
}
