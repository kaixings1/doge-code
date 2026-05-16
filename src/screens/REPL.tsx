import { c as _c } from "react/compiler-runtime";
// biome-ignore-all assist/source/organizeImports: ANT-ONLY import markers must not be reordered
import { feature } from 'bun:bundle';
import { spawnSync } from 'child_process';
import { snapshotOutputTokensForTurn, getCurrentTurnTokenBudget, getTurnOutputTokens, getBudgetContinuationCount, getTotalInputTokens } from '../bootstrap/state.js';
import { parseTokenBudget } from '../utils/tokenBudget.js';
import { count } from '../utils/array.js';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import figures from 'figures';
// eslint-disable-next-line custom-rules/prefer-use-keybindings -- / n N Esc [ v 在对话记录模态上下文中是裸字母，与 ScrollKeybindingHandler 中的 g/G/j/k 同类
import { useInput } from '../ink.js';
import { useSearchInput } from '../hooks/useSearchInput.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { useSearchHighlight } from '../ink/hooks/use-search-highlight.js';
import type { JumpHandle } from '../components/VirtualMessageList.js';
import { renderMessagesToPlainText } from '../utils/exportRenderer.js';
import { openFileInExternalEditor } from '../utils/editor.js';
import { writeFile } from 'fs/promises';
import { Box, Text, useStdin, useTheme, useTerminalFocus, useTerminalTitle, useTabStatus } from '../ink.js';
import type { TabStatusKind } from '../ink/hooks/use-tab-status.js';
import { CostThresholdDialog } from '../components/CostThresholdDialog.js';
import { IdleReturnDialog } from '../components/IdleReturnDialog.js';
import * as React from 'react';
import { useEffect, useMemo, useRef, useState, useCallback, useDeferredValue, useLayoutEffect, type RefObject } from 'react';
import { useNotifications } from '../context/notifications.js';
import { sendNotification } from '../services/notifier.js';
import { startPreventSleep, stopPreventSleep } from '../services/preventSleep.js';
import { useTerminalNotification } from '../ink/useTerminalNotification.js';
import { hasCursorUpViewportYankBug } from '../ink/terminal.js';
import { createFileStateCacheWithSizeLimit, mergeFileStateCaches, READ_FILE_STATE_CACHE_SIZE } from '../utils/fileStateCache.js';
import { updateLastInteractionTime, getLastInteractionTime, getOriginalCwd, getProjectRoot, getSessionId, switchSession, setCostStateForRestore, getTurnHookDurationMs, getTurnHookCount, resetTurnHookDuration, getTurnToolDurationMs, getTurnToolCount, resetTurnToolDuration, getTurnClassifierDurationMs, getTurnClassifierCount, resetTurnClassifierDuration } from '../bootstrap/state.js';
import { asSessionId, asAgentId } from '../types/ids.js';
import { logForDebugging } from '../utils/debug.js';
import { QueryGuard } from '../utils/QueryGuard.js';
import { isEnvTruthy } from '../utils/envUtils.js';
import { formatTokens, truncateToWidth } from '../utils/format.js';
import { consumeEarlyInput } from '../utils/earlyInput.js';
import { setMemberActive } from '../utils/swarm/teamHelpers.js';
import { isSwarmWorker, generateSandboxRequestId, sendSandboxPermissionRequestViaMailbox, sendSandboxPermissionResponseViaMailbox } from '../utils/swarm/permissionSync.js';
import { registerSandboxPermissionCallback } from '../hooks/useSwarmPermissionPoller.js';
import { getTeamName, getAgentName } from '../utils/teammate.js';
import { WorkerPendingPermission } from '../components/permissions/WorkerPendingPermission.js';
import { injectUserMessageToTeammate, getAllInProcessTeammateTasks } from '../tasks/InProcessTeammateTask/InProcessTeammateTask.js';
import { isLocalAgentTask, queuePendingMessage, appendMessageToLocalAgent, type LocalAgentTaskState } from '../tasks/LocalAgentTask/LocalAgentTask.js';
import { registerLeaderToolUseConfirmQueue, unregisterLeaderToolUseConfirmQueue, registerLeaderSetToolPermissionContext, unregisterLeaderSetToolPermissionContext } from '../utils/swarm/leaderPermissionBridge.js';
import { endInteractionSpan } from '../utils/telemetry/sessionTracing.js';
import { useLogMessages } from '../hooks/useLogMessages.js';
import { useReplBridge } from '../hooks/useReplBridge.js';
import { type Command, type CommandResultDisplay, type ResumeEntrypoint, getCommandName, isCommandEnabled } from '../commands.js';
import type { PromptInputMode, QueuedCommand, VimMode } from '../types/textInputTypes.js';
import { MessageSelector, selectableUserMessagesFilter, messagesAfterAreOnlySynthetic } from '../components/MessageSelector.js';
import { useIdeLogging } from '../hooks/useIdeLogging.js';
import { PermissionRequest, type ToolUseConfirm } from '../components/permissions/PermissionRequest.js';
import { ElicitationDialog } from '../components/mcp/ElicitationDialog.js';
import { PromptDialog } from '../components/hooks/PromptDialog.js';
import type { PromptRequest, PromptResponse } from '../types/hooks.js';
import PromptInput from '../components/PromptInput/PromptInput.js';
import { PromptInputQueuedCommands } from '../components/PromptInput/PromptInputQueuedCommands.js';
import { useRemoteSession } from '../hooks/useRemoteSession.js';
import { useDirectConnect } from '../hooks/useDirectConnect.js';
import type { DirectConnectConfig } from '../server/directConnectManager.js';
import { useSSHSession } from '../hooks/useSSHSession.js';
import { useAssistantHistory } from '../hooks/useAssistantHistory.js';
import type { SSHSession } from '../ssh/createSSHSession.js';
import { SkillImprovementSurvey } from '../components/SkillImprovementSurvey.js';
import { useSkillImprovementSurvey } from '../hooks/useSkillImprovementSurvey.js';
import { useMoreRight } from '../moreright/useMoreRight.js';
import { SpinnerWithVerb, BriefIdleStatus, type SpinnerMode } from '../components/Spinner.js';
import { getSystemPrompt } from '../constants/prompts.js';
import { buildEffectiveSystemPrompt } from '../utils/systemPrompt.js';
import { getSystemContext, getUserContext } from '../context.js';
import { getMemoryFiles } from '../utils/claudemd.js';
import { startBackgroundHousekeeping } from '../utils/backgroundHousekeeping.js';
import { getTotalCost, saveCurrentSessionCosts, resetCostState, getStoredSessionCosts } from '../cost-tracker.js';
import { useCostSummary } from '../costHook.js';
import { useFpsMetrics } from '../context/fpsMetrics.js';
import { useAfterFirstRender } from '../hooks/useAfterFirstRender.js';
import { useDeferredHookMessages } from '../hooks/useDeferredHookMessages.js';
import { addToHistory, removeLastFromHistory, expandPastedTextRefs, parseReferences } from '../history.js';
import { prependModeCharacterToInput } from '../components/PromptInput/inputModes.js';
import { prependToShellHistoryCache } from '../utils/suggestions/shellHistoryCompletion.js';
import { useApiKeyVerification } from '../hooks/useApiKeyVerification.js';
import { GlobalKeybindingHandlers } from '../hooks/useGlobalKeybindings.js';
import { CommandKeybindingHandlers } from '../hooks/useCommandKeybindings.js';
import { KeybindingSetup } from '../keybindings/KeybindingProviderSetup.js';
import { useShortcutDisplay } from '../keybindings/useShortcutDisplay.js';
import { getShortcutDisplay } from '../keybindings/shortcutFormat.js';
import { CancelRequestHandler } from '../hooks/useCancelRequest.js';
import { useBackgroundTaskNavigation } from '../hooks/useBackgroundTaskNavigation.js';
import { useSwarmInitialization } from '../hooks/useSwarmInitialization.js';
import { useTeammateViewAutoExit } from '../hooks/useTeammateViewAutoExit.js';
import { errorMessage } from '../utils/errors.js';
import { isHumanTurn } from '../utils/messagePredicates.js';
import { logError } from '../utils/log.js';
// 死代码消除：条件导入
/* eslint-disable custom-rules/no-process-env-top-level, @typescript-eslint/no-require-imports */
const useVoiceIntegration: typeof import('../hooks/useVoiceIntegration.js').useVoiceIntegration = feature('VOICE_MODE') ? require('../hooks/useVoiceIntegration.js').useVoiceIntegration : () => ({
  stripTrailing: () => 0,
  handleKeyEvent: () => {},
  resetAnchor: () => {}
});
const VoiceKeybindingHandler: typeof import('../hooks/useVoiceIntegration.js').VoiceKeybindingHandler = feature('VOICE_MODE') ? require('../hooks/useVoiceIntegration.js').VoiceKeybindingHandler : () => null;
// 挫败感检测仅限 ant（内部使用）。条件 require 以便外部构建完全排除该模块（及其随每次消息更改运行的两个 O(n) useMemo，加上 GrowthBook 拉取）。
const useFrustrationDetection: typeof import('../components/FeedbackSurvey/useFrustrationDetection.js').useFrustrationDetection = (process.env.USER_TYPE) === 'ant' ? require('../components/FeedbackSurvey/useFrustrationDetection.js').useFrustrationDetection : () => ({
  state: 'closed',
  handleTranscriptSelect: () => {}
});
// 仅 ant 的组织警告。条件 require 以便从外部构建中排除组织 UUID 列表（其中一个 UUID 在排除字符串列表中）。
const useAntOrgWarningNotification: typeof import('../hooks/notifs/useAntOrgWarningNotification.js').useAntOrgWarningNotification = (process.env.USER_TYPE) === 'ant' ? require('../hooks/notifs/useAntOrgWarningNotification.js').useAntOrgWarningNotification : () => {};
// 死代码消除：协调器模式的条件导入
const getCoordinatorUserContext: (mcpClients: ReadonlyArray<{
  name: string;
}>, scratchpadDir?: string) => {
  [k: string]: string;
} = feature('COORDINATOR_MODE') ? require('../coordinator/coordinatorMode.js').getCoordinatorUserContext : () => ({});
/* eslint-enable custom-rules/no-process-env-top-level, @typescript-eslint/no-require-imports */
import useCanUseTool from '../hooks/useCanUseTool.js';
import type { ToolPermissionContext, Tool } from '../Tool.js';
import { applyPermissionUpdate, applyPermissionUpdates, persistPermissionUpdate } from '../utils/permissions/PermissionUpdate.js';
import { buildPermissionUpdates } from '../components/permissions/ExitPlanModePermissionRequest/ExitPlanModePermissionRequest.js';
import { stripDangerousPermissionsForAutoMode } from '../utils/permissions/permissionSetup.js';
import type { PermissionMode } from '../types/permissions.js';
import { getScratchpadDir, isScratchpadEnabled } from '../utils/permissions/filesystem.js';
import { WEB_FETCH_TOOL_NAME } from '../tools/WebFetchTool/prompt.js';
import { SLEEP_TOOL_NAME } from '../tools/SleepTool/prompt.js';
import { clearSpeculativeChecks } from '../tools/BashTool/bashPermissions.js';
import type { AutoUpdaterResult } from '../utils/autoUpdater.js';
import { getGlobalConfig, saveGlobalConfig, getGlobalConfigWriteCount } from '../utils/config.js';
import { hasConsoleBillingAccess } from '../utils/billing.js';
import { logEvent, type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS } from '../services/analytics/index.js';
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js';
import { textForResubmit, handleMessageFromStream, type StreamingToolUse, type StreamingThinking, isCompactBoundaryMessage, getMessagesAfterCompactBoundary, getContentText, createUserMessage, createAssistantMessage, createTurnDurationMessage, createAgentsKilledMessage, createApiMetricsMessage, createSystemMessage, createCommandInputMessage, formatCommandInputTags } from '../utils/messages.js';
import { generateSessionTitle } from '../utils/sessionTitle.js';
import { BASH_INPUT_TAG, COMMAND_MESSAGE_TAG, COMMAND_NAME_TAG, LOCAL_COMMAND_STDOUT_TAG } from '../constants/xml.js';
import { escapeXml } from '../utils/xml.js';
import type { ThinkingConfig } from '../utils/thinking.js';
import { gracefulShutdownSync } from '../utils/gracefulShutdown.js';
import { handlePromptSubmit, type PromptInputHelpers } from '../utils/handlePromptSubmit.js';
import { useQueueProcessor } from '../hooks/useQueueProcessor.js';
import { useMailboxBridge } from '../hooks/useMailboxBridge.js';
import { queryCheckpoint, logQueryProfileReport } from '../utils/queryProfiler.js';
import type { Message as MessageType, UserMessage, ProgressMessage, HookResultMessage, PartialCompactDirection } from '../types/message.js';
import { query } from '../query.js';
import { mergeClients, useMergedClients } from '../hooks/useMergedClients.js';
import { getQuerySourceForREPL } from '../utils/promptCategory.js';
import { useMergedTools } from '../hooks/useMergedTools.js';
import { mergeAndFilterTools } from '../utils/toolPool.js';
import { useMergedCommands } from '../hooks/useMergedCommands.js';
import { useSkillsChange } from '../hooks/useSkillsChange.js';
import { useManagePlugins } from '../hooks/useManagePlugins.js';
import { Messages } from '../components/Messages.js';
import { TaskListV2 } from '../components/TaskListV2.js';
import { TeammateViewHeader } from '../components/TeammateViewHeader.js';
import { useTasksV2WithCollapseEffect } from '../hooks/useTasksV2.js';
import { maybeMarkProjectOnboardingComplete } from '../projectOnboardingState.js';
import type { MCPServerConnection } from '../services/mcp/types.js';
import type { ScopedMcpServerConfig } from '../services/mcp/types.js';
import { randomUUID, type UUID } from 'crypto';
import { processSessionStartHooks } from '../utils/sessionStart.js';
import { executeSessionEndHooks, getSessionEndHookTimeoutMs } from '../utils/hooks.js';
import { type IDESelection, useIdeSelection } from '../hooks/useIdeSelection.js';
import { getTools, assembleToolPool } from '../tools.js';
import type { AgentDefinition } from '../tools/AgentTool/loadAgentsDir.js';
import { resolveAgentTools } from '../tools/AgentTool/agentToolUtils.js';
import { resumeAgentBackground } from '../tools/AgentTool/resumeAgent.js';
import { useMainLoopModel } from '../hooks/useMainLoopModel.js';
import { useAppState, useSetAppState, useAppStateStore } from '../state/AppState.js';
import type { ContentBlockParam, ImageBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs';
import type { ProcessUserInputContext } from '../utils/processUserInput/processUserInput.js';
import type { PastedContent } from '../utils/config.js';
import { copyPlanForFork, copyPlanForResume, getPlanSlug, setPlanSlug } from '../utils/plans.js';
import { clearSessionMetadata, resetSessionFilePointer, adoptResumedSessionFile, removeTranscriptMessage, restoreSessionMetadata, getCurrentSessionTitle, isEphemeralToolProgress, isLoggableMessage, saveWorktreeState, getAgentTranscript } from '../utils/sessionStorage.js';
import { deserializeMessages } from '../utils/conversationRecovery.js';
import { extractReadFilesFromMessages, extractBashToolsFromMessages } from '../utils/queryHelpers.js';
import { resetMicrocompactState } from '../services/compact/microCompact.js';
import { runPostCompactCleanup } from '../services/compact/postCompactCleanup.js';
import { provisionContentReplacementState, reconstructContentReplacementState, type ContentReplacementRecord } from '../utils/toolResultStorage.js';
import { partialCompactConversation } from '../services/compact/compact.js';
import type { LogOption } from '../types/logs.js';
import type { AgentColorName } from '../tools/AgentTool/agentColorManager.js';
import { fileHistoryMakeSnapshot, type FileHistoryState, fileHistoryRewind, type FileHistorySnapshot, copyFileHistoryForResume, fileHistoryEnabled, fileHistoryHasAnyChanges } from '../utils/fileHistory.js';
import { type AttributionState, incrementPromptCount } from '../utils/commitAttribution.js';
import { recordAttributionSnapshot } from '../utils/sessionStorage.js';
import { computeStandaloneAgentContext, restoreAgentFromSession, restoreSessionStateFromLog, restoreWorktreeForResume, exitRestoredWorktree } from '../utils/sessionRestore.js';
import { isBgSession, updateSessionName, updateSessionActivity } from '../utils/concurrentSessions.js';
import { isInProcessTeammateTask, type InProcessTeammateTaskState } from '../tasks/InProcessTeammateTask/types.js';
import { restoreRemoteAgentTasks } from '../tasks/RemoteAgentTask/RemoteAgentTask.js';
import { useInboxPoller } from '../hooks/useInboxPoller.js';
// 死代码消除：循环模式的条件导入
/* eslint-disable @typescript-eslint/no-require-imports */
const proactiveModule = feature('PROACTIVE') || feature('KAIROS') ? require('../proactive/index.js') : null;
const PROACTIVE_NO_OP_SUBSCRIBE = (_cb: () => void) => () => {};
const PROACTIVE_FALSE = () => false;
const SUGGEST_BG_PR_NOOP = (_p: string, _n: string): boolean => false;
const useProactive = feature('PROACTIVE') || feature('KAIROS') ? require('../proactive/useProactive.js').useProactive : null;
const useScheduledTasks = feature('AGENT_TRIGGERS') ? require('../hooks/useScheduledTasks.js').useScheduledTasks : null;
 
import { isAgentSwarmsEnabled } from '../utils/agentSwarmsEnabled.js';
import { useTaskListWatcher } from '../hooks/useTaskListWatcher.js';
import type { SandboxAskCallback, NetworkHostPattern } from '../utils/sandbox/sandbox-adapter.js';
import { type IDEExtensionInstallationStatus, closeOpenDiffs, getConnectedIdeClient, type IdeType } from '../utils/ide.js';
import { useIDEIntegration } from '../hooks/useIDEIntegration.js';
import exit from '../commands/exit/index.js';
import { ExitFlow } from '../components/ExitFlow.js';
import { getCurrentWorktreeSession } from '../utils/worktree.js';
import { popAllEditable, enqueue, type SetAppState, getCommandQueue, getCommandQueueLength, removeByFilter } from '../utils/messageQueueManager.js';
import { useCommandQueue } from '../hooks/useCommandQueue.js';
import { SessionBackgroundHint } from '../components/SessionBackgroundHint.js';
import { startBackgroundSession } from '../tasks/LocalMainSessionTask.js';
import { useSessionBackgrounding } from '../hooks/useSessionBackgrounding.js';
import { diagnosticTracker } from '../services/diagnosticTracking.js';
import { handleSpeculationAccept, type ActiveSpeculationState } from '../services/PromptSuggestion/speculation.js';
import { IdeOnboardingDialog } from '../components/IdeOnboardingDialog.js';
import { EffortCallout, shouldShowEffortCallout } from '../components/EffortCallout.js';
import type { EffortValue } from '../utils/effort.js';
import { RemoteCallout } from '../components/RemoteCallout.js';
/* eslint-disable custom-rules/no-process-env-top-level */
const AntModelSwitchCallout = "external" === 'ant' ? require('../components/AntModelSwitchCallout.js').AntModelSwitchCallout : null;
const shouldShowAntModelSwitch = "external" === 'ant' ? require('../components/AntModelSwitchCallout.js').shouldShowModelSwitchCallout : (): boolean => false;
const UndercoverAutoCallout = "external" === 'ant' ? require('../components/UndercoverAutoCallout.js').UndercoverAutoCallout : null;
/* eslint-enable custom-rules/no-process-env-top-level */
import { activityManager } from '../utils/activityManager.js';
import { createAbortController } from '../utils/abortController.js';
import { MCPConnectionManager } from '../services/mcp/MCPConnectionManager.js';
import { useFeedbackSurvey } from '../components/FeedbackSurvey/useFeedbackSurvey.js';
import { useMemorySurvey } from '../components/FeedbackSurvey/useMemorySurvey.js';
import { usePostCompactSurvey } from '../components/FeedbackSurvey/usePostCompactSurvey.js';
import { FeedbackSurvey } from '../components/FeedbackSurvey/FeedbackSurvey.js';
import { useInstallMessages } from '../hooks/notifs/useInstallMessages.js';
import { useAwaySummary } from '../hooks/useAwaySummary.js';
import { useChromeExtensionNotification } from '../hooks/useChromeExtensionNotification.js';
import { useOfficialMarketplaceNotification } from '../hooks/useOfficialMarketplaceNotification.js';
import { usePromptsFromClaudeInChrome } from '../hooks/usePromptsFromClaudeInChrome.js';
import { getTipToShowOnSpinner, recordShownTip } from '../services/tips/tipScheduler.js';
import type { Theme } from '../utils/theme.js';
import { checkAndDisableBypassPermissionsIfNeeded, checkAndDisableAutoModeIfNeeded, useKickOffCheckAndDisableBypassPermissionsIfNeeded, useKickOffCheckAndDisableAutoModeIfNeeded } from '../utils/permissions/bypassPermissionsKillswitch.js';
import { SandboxManager } from '../utils/sandbox/sandbox-adapter.js';
import { SANDBOX_NETWORK_ACCESS_TOOL_NAME } from '../cli/structuredIO.js';
import { useFileHistorySnapshotInit } from '../hooks/useFileHistorySnapshotInit.js';
import { SandboxPermissionRequest } from '../components/permissions/SandboxPermissionRequest.js';
import { SandboxViolationExpandedView } from '../components/SandboxViolationExpandedView.js';
import { useSettingsErrors } from '../hooks/notifs/useSettingsErrors.js';
import { useMcpConnectivityStatus } from '../hooks/notifs/useMcpConnectivityStatus.js';
import { useAutoModeUnavailableNotification } from '../hooks/notifs/useAutoModeUnavailableNotification.js';
import { AUTO_MODE_DESCRIPTION } from '../components/AutoModeOptInDialog.js';
import { useLspInitializationNotification } from '../hooks/notifs/useLspInitializationNotification.js';
import { useLspPluginRecommendation } from '../hooks/useLspPluginRecommendation.js';
import { LspRecommendationMenu } from '../components/LspRecommendation/LspRecommendationMenu.js';
import { useClaudeCodeHintRecommendation } from '../hooks/useClaudeCodeHintRecommendation.js';
import { PluginHintMenu } from '../components/ClaudeCodeHint/PluginHintMenu.js';
import { DesktopUpsellStartup, shouldShowDesktopUpsellStartup } from '../components/DesktopUpsell/DesktopUpsellStartup.js';
import { usePluginInstallationStatus } from '../hooks/notifs/usePluginInstallationStatus.js';
import { usePluginAutoupdateNotification } from '../hooks/notifs/usePluginAutoupdateNotification.js';
import { performStartupChecks } from '../utils/plugins/performStartupChecks.js';
import { UserTextMessage } from '../components/messages/UserTextMessage.js';
import { AwsAuthStatusBox } from '../components/AwsAuthStatusBox.js';
import { useRateLimitWarningNotification } from '../hooks/notifs/useRateLimitWarningNotification.js';
import { useDeprecationWarningNotification } from '../hooks/notifs/useDeprecationWarningNotification.js';
import { useNpmDeprecationNotification } from '../hooks/notifs/useNpmDeprecationNotification.js';
import { useIDEStatusIndicator } from '../hooks/notifs/useIDEStatusIndicator.js';
import { useModelMigrationNotifications } from '../hooks/notifs/useModelMigrationNotifications.js';
import { useCanSwitchToExistingSubscription } from '../hooks/notifs/useCanSwitchToExistingSubscription.js';
import { useTeammateLifecycleNotification } from '../hooks/notifs/useTeammateShutdownNotification.js';
import { useFastModeNotification } from '../hooks/notifs/useFastModeNotification.js';
import { AutoRunIssueNotification, shouldAutoRunIssue, getAutoRunIssueReasonText, getAutoRunCommand, type AutoRunIssueReason } from '../utils/autoRunIssue.js';
import type { HookProgress } from '../types/hooks.js';
import { TungstenLiveMonitor } from '../tools/TungstenTool/TungstenLiveMonitor.js';
 
const WebBrowserPanelModule = feature('WEB_BROWSER_TOOL') ? require('../tools/WebBrowserTool/WebBrowserPanel.js') as typeof import('../tools/WebBrowserTool/WebBrowserPanel.js') : null;
 
import { IssueFlagBanner } from '../components/PromptInput/IssueFlagBanner.js';
import { useIssueFlagBanner } from '../hooks/useIssueFlagBanner.js';
import { CompanionSprite, CompanionFloatingBubble, MIN_COLS_FOR_FULL_SPRITE } from '../buddy/CompanionSprite.js';
import { DevBar } from '../components/DevBar.js';
// Session manager removed - using AppState now
import type { RemoteSessionConfig } from '../remote/RemoteSessionManager.js';
import { REMOTE_SAFE_COMMANDS } from '../commands.js';
import type { RemoteMessageContent } from '../utils/teleport/api.js';
import { FullscreenLayout, useUnseenDivider, computeUnseenDivider } from '../components/FullscreenLayout.js';
import { isFullscreenEnvEnabled, maybeGetTmuxMouseHint, isMouseTrackingEnabled } from '../utils/fullscreen.js';
import { AlternateScreen } from '../ink/components/AlternateScreen.js';
import { ScrollKeybindingHandler } from '../components/ScrollKeybindingHandler.js';
import { useMessageActions, MessageActionsKeybindings, MessageActionsBar, type MessageActionsState, type MessageActionsNav, type MessageActionCaps } from '../components/messageActions.js';
import { setClipboard } from '../ink/termio/osc.js';
import type { ScrollBoxHandle } from '../ink/components/ScrollBox.js';
import { createAttachmentMessage, getQueuedCommandAttachments } from '../utils/attachments.js';

// 用于接受 MCPServerConnection[] 的钩子的稳定空数组 — 避免在远程模式下每次渲染都创建新的 [] 字面量，否则会导致 useEffect 依赖变化和无限重新渲染循环。
const EMPTY_MCP_CLIENTS: MCPServerConnection[] = [];

// 用于非 KAIROS 分支的 useAssistantHistory 存根 — 避免每次渲染创建新的函数标识，否则会破坏 composedOnScroll 的记忆化。
const HISTORY_STUB = {
  maybeLoadOlder: (_: ScrollBoxHandle) => {}
};
// 用户发起滚动后，在空输入框中键入时，不要重新固定到底部的时间窗口。Josh Rosen 的工作流程：Claude 输出长内容 → 向上滚动阅读开头 → 开始输入 → 在此修复前，会跳到底部。
// https://anthropic.slack.com/archives/C07VBSHV7EV/p1773545449871739
const RECENT_SCROLL_REPIN_WINDOW_MS = 3000;

// 使用 LRU 缓存防止无界内存增长
// 100 个文件应足以满足大多数编码会话，同时防止在大型项目中跨多个文件工作时出现内存问题

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2) : sorted[mid]!;
}

/**
 * 显示对话记录模式底部的小组件，带有动态按键绑定。
 * 必须在 KeybindingSetup 内渲染才能访问按键绑定上下文。
 */
function TranscriptModeFooter(t0) {
  const $ = _c(9);
  const {
    showAllInTranscript,
    virtualScroll,
    searchBadge,
    suppressShowAll: t1,
    status
  } = t0;
  const suppressShowAll = t1 === undefined ? false : t1;
  const toggleShortcut = useShortcutDisplay("app:toggleTranscript", "Global", "Ctrl+o");
  const showAllShortcut = useShortcutDisplay("transcript:toggleShowAll", "Transcript", "ctrl+e");
  const t2 = searchBadge ? ` · n/N 导航` : virtualScroll ? ` · ${figures.arrowUp}${figures.arrowDown} 滚动 · home/end 顶部/底部` : suppressShowAll ? "" : ` · ${showAllShortcut} ${showAllInTranscript ? "折叠" : "显示全部"}`;
  let t3;
  if ($[0] !== t2 || $[1] !== toggleShortcut) {
    t3 = <Text dimColor={true}>显示详细记录 · {toggleShortcut} 切换{t2}</Text>;
    $[0] = t2;
    $[1] = toggleShortcut;
    $[2] = t3;
  } else {
    t3 = $[2];
  }
  let t4;
  if ($[3] !== searchBadge || $[4] !== status) {
    t4 = status ? <><Box flexGrow={1} /><Text>{status} </Text></> : searchBadge ? <><Box flexGrow={1} /><Text dimColor={true}>{searchBadge.current}/{searchBadge.count}{"  "}</Text></> : null;
    $[3] = searchBadge;
    $[4] = status;
    $[5] = t4;
  } else {
    t4 = $[5];
  }
  let t5;
  if ($[6] !== t3 || $[7] !== t4) {
    t5 = <Box noSelect={true} alignItems="center" alignSelf="center" borderTopDimColor={true} borderBottom={false} borderLeft={false} borderRight={false} borderStyle="single" marginTop={1} paddingLeft={2} width="100%">{t3}{t4}</Box>;
    $[6] = t3;
    $[7] = t4;
    $[8] = t5;
  } else {
    t5 = $[8];
  }
  return t5;
}

/** 类似 less 风格的搜索栏。单行，与 TranscriptModeFooter 相同的上边框样式，因此在底部槽位交换它们不会改变 ScrollBox 高度。
 *  useSearchInput 处理 readline 编辑；我们报告查询更改并渲染计数器。增量式 — 每次按键重新搜索并高亮。 */
function TranscriptSearchBar({
  jumpRef,
  count,
  current,
  onClose,
  onCancel,
  setHighlight,
  initialQuery
}: {
  jumpRef: RefObject<JumpHandle | null>;
  count: number;
  current: number;
  /** 回车 — 提交。查询在 n/N 期间持续存在。 */
  onClose: (lastQuery: string) => void;
  /** Esc/ctrl+c/ctrl+g — 恢复到输入前的状态。 */
  onCancel: () => void;
  setHighlight: (query: string) => void;
  // 使用之前的查询作为种子（less: / 显示上次模式）。挂载时使用相同的查询重新扫描 — 幂等（相同匹配，最近指针，相同高亮）。用户可以编辑或清除。
  initialQuery: string;
}): React.ReactNode {
  const {
    query,
    cursorOffset
  } = useSearchInput({
    isActive: true,
    initialQuery,
    onExit: () => onClose(query),
    onCancel
  });
  // 索引预热在查询效果之前运行，以便衡量真实成本 — 否则 setSearchQuery 会先填充缓存，预热报告 ~0ms，而用户感受到实际延迟。
  // 对话记录会话中的第一次 / 会支付 extractSearchText 的成本。
  // 随后的 / 立即返回 0（VML 中的 indexWarmed ref）。
  // 对话记录在 ctrl+o 时冻结，因此缓存保持有效。
  // 初始 'building' 使得挂载时 warmDone 为 false — [query] 效果等待预热效果的第一次解析，而不是与其竞争。如果 initial 为 null，挂载时 warmDone 为 true → [query] 触发 → setSearchQuery 填充缓存 → 预热报告 ~0ms，而用户感受到实际延迟。
  const [indexStatus, setIndexStatus] = React.useState<'building' | {
    ms: number;
  } | null>('building');
  React.useEffect(() => {
    let alive = true;
    const warm = jumpRef.current?.warmSearchIndex;
    if (!warm) {
      setIndexStatus(null); // VML 尚未挂载 — 罕见，跳过指示器
      return;
    }
    setIndexStatus('building');
    warm().then(ms => {
      if (!alive) return;
      // <20ms = 不可感知。显示“索引耗时 3ms”没有意义。
      if (ms < 20) {
        setIndexStatus(null);
      } else {
        setIndexStatus({
          ms
        });
        setTimeout(() => alive && setIndexStatus(null), 2000);
      }
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 仅挂载：每次 / 打开一次搜索栏
  // 将查询效果限制在预热完成之后。setHighlight 保持即时（屏幕空间叠加，无索引）。setSearchQuery（扫描）等待预热完成。
  const warmDone = indexStatus !== 'building';
  useEffect(() => {
    if (!warmDone) return;
    jumpRef.current?.setSearchQuery(query);
    setHighlight(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, warmDone]);
  const off = cursorOffset;
  const cursorChar = off < query.length ? query[off] : ' ';
  return <Box borderTopDimColor borderBottom={false} borderLeft={false} borderRight={false} borderStyle="single" marginTop={1} paddingLeft={2} width="100%"
  // applySearchHighlight 扫描整个屏幕缓冲区。此处渲染的查询文本确实在屏幕上 — /foo 在栏中匹配自己的 'foo'。如果没有内容匹配，那是唯一可见的匹配 → 获得 CURRENT → 下划线。noSelect 使得 searchHighlight.ts:76 跳过这些单元格（与边距相同的排除）。你也无法选择栏的文本；它是瞬态装饰，没问题。
  noSelect>
      <Text>/</Text>
      <Text>{query.slice(0, off)}</Text>
      <Text inverse>{cursorChar}</Text>
      {off < query.length && <Text>{query.slice(off + 1)}</Text>}
      <Box flexGrow={1} />
      {indexStatus === 'building' ? <Text dimColor>正在索引… </Text> : indexStatus ? <Text dimColor>已在 {indexStatus.ms}ms 内索引 </Text> : count === 0 && query ? <Text color="error">无匹配结果 </Text> : count > 0 ?
    // 引擎计数（对 extractSearchText 的 indexOf）。可能与渲染计数有偏差，用于幽灵/幻影消息 — 徽章是大致位置提示。scanElement 给出精确的每条消息位置，但计数所有消息会增加成本，约为 1-3ms × 匹配消息数。
    <Text dimColor>
          {current}/{count}
          {'  '}
        </Text> : null}
    </Box>;
}
const TITLE_ANIMATION_FRAMES = ['⠂', '⠐'];
const TITLE_STATIC_PREFIX = '✳';
const TITLE_ANIMATION_INTERVAL_MS = 960;

/**
 * 设置终端标签页标题，在查询运行时显示动画前缀符号。与 REPL 隔离，使得 960ms 动画滴答只重新渲染这个叶子组件（返回 null — 纯副作用），而不是整个 REPL 树。提取之前，滴答导致每次响应的整个持续时间内每秒约 1 次 REPL 渲染，拖累 PromptInput 及其相关组件。
 */
function AnimatedTerminalTitle(t0) {
  const $ = _c(6);
  const {
    isAnimating,
    title,
    disabled,
    noPrefix
  } = t0;
  const terminalFocused = useTerminalFocus();
  const [frame, setFrame] = useState(0);
  let t1;
  let t2;
  if ($[0] !== disabled || $[1] !== isAnimating || $[2] !== noPrefix || $[3] !== terminalFocused) {
    t1 = () => {
      if (disabled || noPrefix || !isAnimating || !terminalFocused) {
        return;
      }
      const interval = setInterval(_temp2, TITLE_ANIMATION_INTERVAL_MS, setFrame);
      return () => clearInterval(interval);
    };
    t2 = [disabled, noPrefix, isAnimating, terminalFocused];
    $[0] = disabled;
    $[1] = isAnimating;
    $[2] = noPrefix;
    $[3] = terminalFocused;
    $[4] = t1;
    $[5] = t2;
  } else {
    t1 = $[4];
    t2 = $[5];
  }
  useEffect(t1, t2);
  const prefix = isAnimating ? TITLE_ANIMATION_FRAMES[frame] ?? TITLE_STATIC_PREFIX : TITLE_STATIC_PREFIX;
  useTerminalTitle(disabled ? null : noPrefix ? title : `${prefix} ${title}`);
  return null;
}
function _temp2(setFrame_0) {
  return setFrame_0(_temp);
}
function _temp(f) {
  return (f + 1) % TITLE_ANIMATION_FRAMES.length;
}
type ReplRuntimeBoundaryState = {
  error: Error | null;
};
class ReplRuntimeBoundary extends React.Component<{
  children: React.ReactNode;
}, ReplRuntimeBoundaryState> {
  override state: ReplRuntimeBoundaryState = {
    error: null
  };
  static override getDerivedStateFromError(error: Error): ReplRuntimeBoundaryState {
    return {
      error
    };
  }
  override componentDidCatch(error: Error): void {
    const message = error?.stack ?? error?.message ?? String(error);
    logForDebugging(`[REPL:boundary] ${message}`, {
      level: 'error'
    });
    logError(error);
  }
  override render(): React.ReactNode {
    if (!this.state.error) {
      return this.props.children;
    }
    return <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Text color="warning">REPL 已进入恢复回退模式。</Text>
        <Text dimColor>{this.state.error.message || String(this.state.error)}</Text>
        <Text dimColor>The main screen subtree failed during startup. This session stays open so missing modules can be restored incrementally.</Text>
      </Box>;
  }
}
export type Props = {
  commands: Command[];
  debug: boolean;
  initialTools: Tool[];
  // 用于填充 REPL 的初始消息
  initialMessages?: MessageType[];
  // 延迟的钩子消息 Promise — REPL 立即渲染，并在解析时注入钩子消息。在第一次 API 调用前等待。
  pendingHookMessages?: Promise<HookResultMessage[]>;
  initialFileHistorySnapshots?: FileHistorySnapshot[];
  // 从恢复会话的对话记录中的内容替换记录 — 用于重建 contentReplacementState，以便相同的结果被重新替换
  initialContentReplacements?: ContentReplacementRecord[];
  // 恢复会话的初始代理上下文（通过 /rename 或 /color 设置名称/颜色）
  initialAgentName?: string;
  initialAgentColor?: AgentColorName;
  mcpClients?: MCPServerConnection[];
  dynamicMcpConfig?: Record<string, ScopedMcpServerConfig>;
  autoConnectIdeFlag?: boolean;
  strictMcpConfig?: boolean;
  systemPrompt?: string;
  appendSystemPrompt?: string;
  // 可选回调，在查询执行前调用
  // 在用户消息添加到对话后但在 API 调用前调用
  // 返回 false 阻止查询执行
  onBeforeQuery?: (input: string, newMessages: MessageType[]) => Promise<boolean>;
  // 当一次响应完成（模型完成响应）时调用的可选回调
  onTurnComplete?: (messages: MessageType[]) => void | Promise<void>;
  // 为 true 时，禁用 REPL 输入（隐藏提示并阻止消息选择器）
  disabled?: boolean;
  // 用于主线程的可选代理定义
  mainThreadAgentDefinition?: AgentDefinition;
  // 为 true 时，禁用所有斜杠命令
  disableSlashCommands?: boolean;
  // 任务列表 ID：设置后启用任务模式，监视任务列表并自动处理任务。
  taskListId?: string;
  // 用于 --remote 模式的远程会话配置（使用 CCR 作为执行引擎）
  remoteSessionConfig?: RemoteSessionConfig;
  // 用于 `claude connect` 模式的直接连接配置（连接到 claude 服务器）
  directConnectConfig?: DirectConnectConfig;
  // 用于 `claude ssh` 模式的 SSH 会话（本地 REPL，通过 ssh 远程工具）
  sshSession?: SSHSession;
  // 当启用思考时使用的思考配置
  thinkingConfig: ThinkingConfig;
};
export type Screen = 'prompt' | 'transcript';
export function REPL({
  commands: initialCommands,
  debug,
  initialTools,
  initialMessages,
  pendingHookMessages,
  initialFileHistorySnapshots,
  initialContentReplacements,
  initialAgentName,
  initialAgentColor,
  mcpClients: initialMcpClients,
  dynamicMcpConfig: initialDynamicMcpConfig,
  autoConnectIdeFlag,
  strictMcpConfig = false,
  systemPrompt: customSystemPrompt,
  appendSystemPrompt,
  onBeforeQuery,
  onTurnComplete,
  disabled = false,
  mainThreadAgentDefinition: initialMainThreadAgentDefinition,
  disableSlashCommands = false,
  taskListId,
  remoteSessionConfig,
  directConnectConfig,
  sshSession,
  thinkingConfig
}: Props): React.ReactNode {
  const isRemoteSession = !!remoteSessionConfig;

  // 环境变量控制在挂载时提升 — isEnvTruthy 执行 toLowerCase+trim+includes，这些在渲染路径上（在 PageUp 频繁按下时很热）。
  const titleDisabled = useMemo(() => isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_TERMINAL_TITLE), []);
  const moreRightEnabled = useMemo(() => "external" === 'ant' && isEnvTruthy(process.env.CLAUDE_MORERIGHT), []);
  const disableVirtualScroll = useMemo(() => isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_VIRTUAL_SCROLL), []);
  const disableMessageActions = feature('MESSAGE_ACTIONS') ?
  // biome-ignore lint/correctness/useHookAtTopLevel: feature() 是编译时常量
  useMemo(() => isEnvTruthy(process.env.CLAUDE_CODE_DISABLE_MESSAGE_ACTIONS), []) : false;

  // 记录 REPL 挂载/卸载生命周期
  useEffect(() => {
    logForDebugging(`[REPL:挂载] REPL 已挂载, disabled=${disabled}`);
    return () => logForDebugging(`[REPL:卸载] REPL 正在卸载`);
  }, [disabled]);

  // 代理定义为状态，以便 /resume 可以在会话中更新它
  const [mainThreadAgentDefinition, setMainThreadAgentDefinition] = useState(initialMainThreadAgentDefinition);
  const toolPermissionContext = useAppState(s => s.toolPermissionContext);
  const verbose = useAppState(s => s.verbose);
  const mcp = useAppState(s => s.mcp);
  const plugins = useAppState(s => s.plugins);
  const agentDefinitions = useAppState(s => s.agentDefinitions);
  const fileHistory = useAppState(s => s.fileHistory);
  const initialMessage = useAppState(s => s.initialMessage);
  const queuedCommands = useCommandQueue();
  // feature() 是构建时常量 — 死代码消除会在外部构建中完全移除钩子调用，因此尽管看起来是条件性的，但这是安全的。
  // 这些字段包含不得出现在外部构建中的排除字符串。
  const spinnerTip = useAppState(s => s.spinnerTip);
  const showExpandedTodos = useAppState(s => s.expandedView) === 'tasks';
  const pendingWorkerRequest = useAppState(s => s.pendingWorkerRequest);
  const pendingSandboxRequest = useAppState(s => s.pendingSandboxRequest);
  const teamContext = useAppState(s => s.teamContext);
  const tasks = useAppState(s => s.tasks);
  const workerSandboxPermissions = useAppState(s => s.workerSandboxPermissions);
  const elicitation = useAppState(s => s.elicitation);
  const ultraplanPendingChoice = useAppState(s => s.ultraplanPendingChoice);
  const ultraplanLaunchPending = useAppState(s => s.ultraplanLaunchPending);
  const viewingAgentTaskId = useAppState(s => s.viewingAgentTaskId);
  const setAppState = useSetAppState();

  // 引导：保留的 local_agent 尚未加载磁盘 → 读取旁路 JSONL 并与流已追加的 UUID 合并。
  // 流在保留时立即追加（无延迟）；引导填充前缀。先写磁盘再返回意味着实时数据始终是磁盘的后缀。
  const viewedLocalAgent = viewingAgentTaskId ? tasks[viewingAgentTaskId] : undefined;
  const needsBootstrap = isLocalAgentTask(viewedLocalAgent) && viewedLocalAgent.retain && !viewedLocalAgent.diskLoaded;
  useEffect(() => {
    if (!viewingAgentTaskId || !needsBootstrap) return;
    const taskId = viewingAgentTaskId;
    void getAgentTranscript(asAgentId(taskId)).then(result => {
      setAppState(prev => {
        const t = prev.tasks[taskId];
        if (!isLocalAgentTask(t) || t.diskLoaded || !t.retain) return prev;
        const live = t.messages ?? [];
        const liveUuids = new Set(live.map(m => m.uuid));
        const diskOnly = result ? result.messages.filter(m => !liveUuids.has(m.uuid)) : [];
        return {
          ...prev,
          tasks: {
            ...prev.tasks,
            [taskId]: {
              ...t,
              messages: [...diskOnly, ...live],
              diskLoaded: true
            }
          }
        };
      });
    });
  }, [viewingAgentTaskId, needsBootstrap, setAppState]);
  const store = useAppStateStore();
  const terminal = useTerminalNotification();
  const mainLoopModel = useMainLoopModel();

  // 注意：standaloneAgentContext 在 main.tsx（通过 initialState）或 ResumeConversation.tsx（在渲染 REPL 之前通过 setAppState）中初始化，以避免在挂载时使用基于 useEffect 的状态初始化（根据 CLAUDE.md 指南）

  // 命令的本地状态（当技能文件更改时可热重载）
  const [localCommands, setLocalCommands] = useState(initialCommands);

  // 监听技能文件更改并重新加载所有命令
  useSkillsChange(isRemoteSession ? undefined : getProjectRoot(), setLocalCommands);

  // 跟踪主动模式以用于工具依赖 - SleepTool 根据主动状态过滤
  const proactiveActive = React.useSyncExternalStore(proactiveModule?.subscribeToProactiveChanges ?? PROACTIVE_NO_OP_SUBSCRIBE, proactiveModule?.isProactiveActive ?? PROACTIVE_FALSE);

  // BriefTool.isEnabled() 从引导状态读取 getUserMsgOptIn()，/brief 在会话中切换时同时改变 isBriefOnly。下面的 memo 需要一个 React 可见的依赖来在发生时重新运行 getTools()；isBriefOnly 是触发重新渲染的 AppState 镜像。如果没有这个，在会话中切换 /brief 会留下过时的工具列表（没有 SendUserMessage），模型输出纯文本，被 brief 过滤器隐藏。
  const isBriefOnly = useAppState(s => s.isBriefOnly);
  const localTools = useMemo(() => getTools(toolPermissionContext), [toolPermissionContext, proactiveActive, isBriefOnly]);
  useKickOffCheckAndDisableBypassPermissionsIfNeeded();
  useKickOffCheckAndDisableAutoModeIfNeeded();
  const [dynamicMcpConfig, setDynamicMcpConfig] = useState<Record<string, ScopedMcpServerConfig> | undefined>(initialDynamicMcpConfig);
  const onChangeDynamicMcpConfig = useCallback((config: Record<string, ScopedMcpServerConfig>) => {
    setDynamicMcpConfig(config);
  }, [setDynamicMcpConfig]);
  const [screen, setScreen] = useState<Screen>('prompt');
  const [showAllInTranscript, setShowAllInTranscript] = useState(false);
  // [ 强制进入转储到滚动缓冲区的路径（在对话记录模式内）。与 CLAUDE_CODE_NO_FLICKER=0（进程生命周期）分开 — 这是临时的，在退出对话记录时重置。诊断逃生舱口，以便终端/tmux 原生 cmd-F 可以搜索完整的扁平渲染。
  const [dumpMode, setDumpMode] = useState(false);
  // 为编辑器渲染进度 v-for-editor。内联在底部 — 通知在 PromptInput 内渲染，在对话记录模式下未挂载。
  const [editorStatus, setEditorStatus] = useState('');
  // 在退出对话记录时递增。异步 v-render 在开始时捕获此值；每个状态写入如果过时则无操作（用户在渲染中间离开对话记录 — 稳定的 setState 会向下一个会话输出幽灵提示）。同时清除任何待处理的 4 秒自动清除。
  const editorGenRef = useRef(0);
  const editorTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const editorRenderingRef = useRef(false);
  const {
    addNotification,
    removeNotification
  } = useNotifications();

  // eslint-disable-next-line prefer-const
  let trySuggestBgPRIntercept = SUGGEST_BG_PR_NOOP;
  const mcpClients = useMergedClients(initialMcpClients, mcp.clients);

  // IDE 集成
  const [ideSelection, setIDESelection] = useState<IDESelection | undefined>(undefined);
  const [ideToInstallExtension, setIDEToInstallExtension] = useState<IdeType | null>(null);
  const [ideInstallationStatus, setIDEInstallationStatus] = useState<IDEExtensionInstallationStatus | null>(null);
  const [showIdeOnboarding, setShowIdeOnboarding] = useState(false);
  // 死代码消除：模型切换 callout 状态（仅 ant）
  const [showModelSwitchCallout, setShowModelSwitchCallout] = useState(() => {
    if ("external" === 'ant') {
      return shouldShowAntModelSwitch();
    }
    return false;
  });
  const [showEffortCallout, setShowEffortCallout] = useState(() => shouldShowEffortCallout(mainLoopModel));
  const showRemoteCallout = useAppState(s => s.showRemoteCallout);
  const [showDesktopUpsellStartup, setShowDesktopUpsellStartup] = useState(() => shouldShowDesktopUpsellStartup());
  // 通知
  useModelMigrationNotifications();
  useCanSwitchToExistingSubscription();
  useIDEStatusIndicator({
    ideSelection,
    mcpClients,
    ideInstallationStatus
  });
  useMcpConnectivityStatus({
    mcpClients
  });
  useAutoModeUnavailableNotification();
  usePluginInstallationStatus();
  usePluginAutoupdateNotification();
  useSettingsErrors();
  useRateLimitWarningNotification(mainLoopModel);
  useFastModeNotification();
  useDeprecationWarningNotification(mainLoopModel);
  useNpmDeprecationNotification();
  useAntOrgWarningNotification();
  useInstallMessages();
  useChromeExtensionNotification();
  useOfficialMarketplaceNotification();
  useLspInitializationNotification();
  useTeammateLifecycleNotification();
  const {
    recommendation: lspRecommendation,
    handleResponse: handleLspResponse
  } = useLspPluginRecommendation();
  const {
    recommendation: hintRecommendation,
    handleResponse: handleHintResponse
  } = useClaudeCodeHintRecommendation();

  // 记忆化组合的初始工具数组以防止引用更改
  const combinedInitialTools = useMemo(() => {
    return [...localTools, ...initialTools];
  }, [localTools, initialTools]);

  // 初始化插件管理
  useManagePlugins({
    enabled: !isRemoteSession
  });
  const tasksV2 = useTasksV2WithCollapseEffect();

  // 开始后台插件安装

  // 安全：此代码保证仅在用户确认“信任此文件夹”对话框后运行。信任对话框在 cli.tsx（约第 387 行）中显示，在 REPL 组件渲染之前。该对话框会阻止执行，直到用户接受，然后才挂载 REPL 组件并运行此效果。
  // 这确保来自仓库和用户设置的插件安装仅在用户明确同意信任当前工作目录后发生。
  useEffect(() => {
    if (isRemoteSession) return;
    void performStartupChecks(setAppState);
  }, [setAppState, isRemoteSession]);

  // 允许 Claude in Chrome MCP 通过 MCP 通知发送提示，并将权限模式更改同步到 Chrome 扩展
  usePromptsFromClaudeInChrome(isRemoteSession ? EMPTY_MCP_CLIENTS : mcpClients, toolPermissionContext.mode);

  // 初始化 swarm 功能：队友钩子和上下文
  // 处理全新生成和恢复的队友会话
  useSwarmInitialization(setAppState, initialMessages, {
    enabled: !isRemoteSession
  });
  const mergedTools = useMergedTools(combinedInitialTools, mcp.tools, toolPermissionContext);

  // 如果设置了 mainThreadAgentDefinition，则应用代理工具限制
  const {
    tools,
    allowedAgentTypes
  } = useMemo(() => {
    if (!mainThreadAgentDefinition) {
      return {
        tools: mergedTools,
        allowedAgentTypes: undefined as string[] | undefined
      };
    }
    const resolved = resolveAgentTools(mainThreadAgentDefinition, mergedTools, false, true);
    return {
      tools: resolved.resolvedTools,
      allowedAgentTypes: resolved.allowedAgentTypes
    };
  }, [mainThreadAgentDefinition, mergedTools]);

  // 合并来自本地状态、插件和 MCP 的命令
  const commandsWithPlugins = useMergedCommands(localCommands, plugins.commands as Command[]);
  const mergedCommands = useMergedCommands(commandsWithPlugins, mcp.commands as Command[]);
  // 如果 disableSlashCommands 为 true，则过滤掉所有命令
  const commands = useMemo(() => disableSlashCommands ? [] : mergedCommands, [disableSlashCommands, mergedCommands]);
  useIdeLogging(isRemoteSession ? EMPTY_MCP_CLIENTS : mcp.clients);
  useIdeSelection(isRemoteSession ? EMPTY_MCP_CLIENTS : mcp.clients, setIDESelection);
  const [streamMode, setStreamMode] = useState<SpinnerMode>('responding');
  // Ref 镜像，以便 onSubmit 可以读取最新值，而无需将 streamMode 添加到其依赖项中。streamMode 在每次响应的流式传输期间在 requesting/responding/tool-use 之间翻转约 10 次；将其放在 onSubmit 的依赖项中会导致每次翻转都重新创建 onSubmit，进而级联到 PromptInput 属性变动和下游 useCallback/useMemo 失效。回调内部唯一的消费者是调试日志和遥测（handlePromptSubmit.ts），因此过时一个渲染周期的值是无害的 — 但 ref 镜像每次渲染都会同步，因此总是新鲜的。
  const streamModeRef = useRef(streamMode);
  streamModeRef.current = streamMode;
  const [streamingToolUses, setStreamingToolUses] = useState<StreamingToolUse[]>([]);
  const [streamingThinking, setStreamingThinking] = useState<StreamingThinking | null>(null);

  // 在完成后 30 秒自动隐藏流式思考
  useEffect(() => {
    if (streamingThinking && !streamingThinking.isStreaming && streamingThinking.streamingEndedAt) {
      const elapsed = Date.now() - streamingThinking.streamingEndedAt;
      const remaining = 30000 - elapsed;
      if (remaining > 0) {
        const timer = setTimeout(setStreamingThinking, remaining, null);
        return () => clearTimeout(timer);
      } else {
        setStreamingThinking(null);
      }
    }
  }, [streamingThinking]);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  // 始终指向当前中止控制器的 Ref，供 REPL 桥接器在远程中断到达时中止活动查询使用。
  const abortControllerRef = useRef<AbortController | null>(null);
  abortControllerRef.current = abortController;

  // 桥接器结果回调的 Ref — 在 useReplBridge 初始化后设置，在 onQuery finally 块中读取以通知移动客户端响应结束。
  const sendBridgeResultRef = useRef<() => void>(() => {});

  // 同步恢复回调的 Ref — 在 restoreMessageSync 定义后设置，在 onQuery finally 块中读取以在中断时自动恢复。
  const restoreMessageSyncRef = useRef<(m: UserMessage) => void>(() => {});

  // 全屏布局的滚动框的 Ref，用于键盘滚动。
  // 当全屏模式禁用时为空（ref 从未附加）。
  const scrollRef = useRef<ScrollBoxHandle>(null);
  // 模态槽内部 ScrollBox 的单独 Ref — 通过 FullscreenLayout → ModalContext 传递，以便 Tabs 可以为其自己的 ScrollBox 附加以处理高内容（例如 /status 的 MCP 服务器列表）。不由键盘驱动 — ScrollKeybindingHandler 停留在外部 ref 上，因此 PgUp/PgDn/滚轮始终滚动模态后面的对话记录。
  // 保留管道以备将来模态滚动接线。
  const modalScrollRef = useRef<ScrollBoxHandle>(null);
  // 上次用户发起滚动的时间戳（滚轮、PgUp/PgDn、ctrl+u、End/Home、G、拖动滚动）。在 composedOnScroll 中标记 — ScrollKeybindingHandler 为每个用户滚动操作调用的唯一检查点。
  // 程序化滚动（repinScroll 的 scrollToBottom，粘性自动跟随）不经过 composedOnScroll，因此不会标记此时间戳。使用 Ref 而非 state：不会在每次滚轮滴答时重新渲染。
  const lastUserScrollTsRef = useRef(0);

  // 查询生命周期的同步状态机。替换了容易出错的双状态模式，其中 isLoading（React 状态，异步批处理）和 isQueryRunning（ref，同步）可能不同步。参见 QueryGuard.ts。
  const queryGuard = React.useRef(new QueryGuard()).current;

  // 订阅 guard — 在调度或运行期间为 true。
  // 这是“本地查询是否正在进行”的唯一真实来源。
  const isQueryActive = React.useSyncExternalStore(queryGuard.subscribe, queryGuard.getSnapshot);

  // 用于本地查询 guard 之外的操作的单独加载标志：
  // 远程会话（useRemoteSession / useDirectConnect）和前台后台任务（useSessionBackgrounding）。这些不经过 onQuery / queryGuard，因此需要它们自己的微调器可见性状态。
  // 如果远程模式有初始提示（CCR 正在处理），则初始化为 true。
  const [isExternalLoading, setIsExternalLoadingRaw] = React.useState(remoteSessionConfig?.hasInitialPrompt ?? false);

  // 派生：任何活动加载源。只读 — 没有设置器。本地查询加载由 queryGuard 驱动（reserve/tryStart/end/cancelReservation），外部加载由 setIsExternalLoading 驱动。
  const isLoading = isQueryActive || isExternalLoading;

  // 耗时由 SpinnerWithVerb 根据这些 refs 在每个动画帧上计算，避免了重新渲染整个 REPL 的 useInterval。
  // animation frame, avoiding a useInterval that re-renders the entire REPL.
  const [userInputOnProcessing, setUserInputOnProcessingRaw] = React.useState<string | undefined>(undefined);
  // 设置 userInputOnProcessing 时 messagesRef.current.length。一旦 displayedMessages 增长超过此值，占位符就会隐藏 — 即真实的用户消息已经出现在可见对话记录中。
  const userInputBaselineRef = React.useRef(0);
  // 当提交的提示正在处理但其用户消息尚未到达 setMessages 时为 true。setMessages 使用此标志来保持基线同步，当在此窗口期间不相关的异步消息（桥接状态、钩子结果、计划任务）落地时。
  const userMessagePendingRef = React.useRef(false);

  // 用于精确计算耗时的墙上时钟时间跟踪 refs
  const loadingStartTimeRef = React.useRef<number>(0);
  const totalPausedMsRef = React.useRef(0);
  const pauseStartTimeRef = React.useRef<number | null>(null);
  const resetTimingRefs = React.useCallback(() => {
    loadingStartTimeRef.current = Date.now();
    totalPausedMsRef.current = 0;
    pauseStartTimeRef.current = null;
  }, []);

  // 当 isQueryActive 从 false 转换为 true 时内联重置计时 refs。
  // queryGuard.reserve()（在 executeUserInput 中）在 processUserInput 的第一个 await 之前触发，但 onQuery try 块中的 ref 重置在后面运行。在此间隙中，React 使用 loadingStartTimeRef=0 渲染微调器，计算出 elapsedTimeMs = Date.now() - 0 ≈ 56 年。此内联重置在观察 isQueryActive 为 true 的第一次渲染上运行 — 与首次显示微调器的渲染相同 — 因此当微调器读取它时 ref 是正确的。参见 INC-4549。
  const wasQueryActiveRef = React.useRef(false);
  if (isQueryActive && !wasQueryActiveRef.current) {
    resetTimingRefs();
  }
  wasQueryActiveRef.current = isQueryActive;

  // setIsExternalLoading 的包装器，在转换为 true 时重置计时 refs — SpinnerWithVerb 读取这些值以计算耗时，因此远程会话/前台任务也需要重置（不仅仅是本地查询，后者在 onQuery 中重置）。如果没有这个，仅远程会话会显示约 56 年耗时（Date.now() - 0）。
  const setIsExternalLoading = React.useCallback((value: boolean) => {
    setIsExternalLoadingRaw(value);
    if (value) resetTimingRefs();
  }, [resetTimingRefs]);

  // 第一次有 swarm 队友运行的响应开始时间
  // 用于计算延迟消息的总耗时（包括队友执行时间）
  const swarmStartTimeRef = React.useRef<number | null>(null);
  const swarmBudgetInfoRef = React.useRef<{
    tokens: number;
    limit: number;
    nudges: number;
  } | undefined>(undefined);

  // Ref 用于跟踪当前 focusedInputDialog，供回调使用
  // 这避免了在计时器回调中检查对话框状态时出现陈旧闭包
  const focusedInputDialogRef = React.useRef<ReturnType<typeof getFocusedInputDialog>>(undefined);

  // 最后一次按键后延迟对话框显示的时间
  const PROMPT_SUPPRESSION_MS = 1500;
  // 当用户正在积极输入时为 true — 延迟中断对话框，以免按键意外关闭或回答用户尚未阅读的权限提示。
  const [isPromptInputActive, setIsPromptInputActive] = React.useState(false);
  const [autoUpdaterResult, setAutoUpdaterResult] = useState<AutoUpdaterResult | null>(null);
  useEffect(() => {
    if (autoUpdaterResult?.notifications) {
      autoUpdaterResult.notifications.forEach(notification => {
        addNotification({
          key: 'auto-updater-notification',
          text: notification,
          priority: 'low'
        });
      });
    }
  }, [autoUpdaterResult, addNotification]);

  // tmux + 全屏 + `mouse off`：一次性提示滚轮不会滚动。
  // 我们不再改变 tmux 的会话范围鼠标选项（它会毒害兄弟面板）；tmux 用户已经从 vim/less 中知道这种权衡。
  useEffect(() => {
    if (isFullscreenEnvEnabled()) {
      void maybeGetTmuxMouseHint().then(hint => {
        if (hint) {
          addNotification({
            key: 'tmux-mouse-hint',
            text: hint,
            priority: 'low'
          });
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [showUndercoverCallout, setShowUndercoverCallout] = useState(false);
  useEffect(() => {
    if ("external" === 'ant') {
      void (async () => {
        // 等待仓库分类稳定（已记忆化，如果已初始化则为无操作）。
        const {
          isInternalModelRepo
        } = await import('../utils/commitAttribution.js');
        await isInternalModelRepo();
        const {
          shouldShowUndercoverAutoNotice
        } = await import('../utils/undercover.js');
        if (shouldShowUndercoverAutoNotice()) {
          setShowUndercoverCallout(true);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [toolJSX, setToolJSXInternal] = useState<{
    jsx: React.ReactNode | null;
    shouldHidePromptInput: boolean;
    shouldContinueAnimation?: true;
    showSpinner?: boolean;
    isLocalJSXCommand?: boolean;
    isImmediate?: boolean;
  } | null>(null);

  // 单独跟踪本地 JSX 命令，以便工具不会覆盖它们。
  // 这使得“即时”命令（如 /btw）可以在 Claude 处理期间持续存在。
  const localJSXCommandRef = useRef<{
    jsx: React.ReactNode | null;
    shouldHidePromptInput: boolean;
    shouldContinueAnimation?: true;
    showSpinner?: boolean;
    isLocalJSXCommand: true;
  } | null>(null);

  // setToolJSX 的包装器，保留本地 JSX 命令（如 /btw）。
  // 当本地 JSX 命令处于活动状态时，我们忽略来自工具的更新，除非它们明确设置了 clearLocalJSX: true（来自 onDone 回调）。
  //
  // 添加新的即时命令：
  // 1. 在命令定义中设置 `immediate: true`
  // 2. 在命令的 JSX 中调用 setToolJSX 时设置 `isLocalJSXCommand: true`
  // 3. 在 onDone 回调中，使用 `setToolJSX({ jsx: null, shouldHidePromptInput: false, clearLocalJSX: true })` 明确清除覆盖层
  const setToolJSX = useCallback((args: {
    jsx: React.ReactNode | null;
    shouldHidePromptInput: boolean;
    shouldContinueAnimation?: true;
    showSpinner?: boolean;
    isLocalJSXCommand?: boolean;
    clearLocalJSX?: boolean;
  } | null) => {
    // 如果设置本地 JSX 命令，将其存储在 ref 中
    if (args?.isLocalJSXCommand) {
      const {
        clearLocalJSX: _,
        ...rest
      } = args;
      localJSXCommandRef.current = {
        ...rest,
        isLocalJSXCommand: true
      };
      setToolJSXInternal(rest);
      return;
    }

    // 如果 ref 中有活动的本地 JSX 命令
    if (localJSXCommandRef.current) {
      // 仅在明确请求时允许清除（来自 onDone 回调）
      if (args?.clearLocalJSX) {
        localJSXCommandRef.current = null;
        setToolJSXInternal(null);
        return;
      }
      // 否则，保持本地 JSX 命令可见 — 忽略工具更新
      return;
    }

    // 没有活动的本地 JSX 命令，允许任何更新
    if (args?.clearLocalJSX) {
      setToolJSXInternal(null);
      return;
    }
    setToolJSXInternal(args);
  }, []);
  const [toolUseConfirmQueue, setToolUseConfirmQueue] = useState<ToolUseConfirm[]>([]);
  // 由权限请求组件注册的粘性底部 JSX（当前仅为 ExitPlanModePermissionRequest）。在 FullscreenLayout 的 `bottom` 槽位中渲染，以便在用户滚动长计划时响应选项保持可见。
  const [permissionStickyFooter, setPermissionStickyFooter] = useState<React.ReactNode | null>(null);
  const [sandboxPermissionRequestQueue, setSandboxPermissionRequestQueue] = useState<Array<{
    hostPattern: NetworkHostPattern;
    resolvePromise: (allowConnection: boolean) => void;
  }>>([]);
  const [promptQueue, setPromptQueue] = useState<Array<{
    request: PromptRequest;
    title: string;
    toolInputSummary?: string | null;
    resolve: (response: PromptResponse) => void;
    reject: (error: Error) => void;
  }>>([]);

  // 跟踪沙盒权限请求的桥接清理函数，以便本地对话框处理程序可以在本地用户首先响应时取消远程提示。按主机键控，以支持并发相同主机的请求。
  const sandboxBridgeCleanupRef = useRef<Map<string, Array<() => void>>>(new Map());

  // -- 终端标题管理
  // 会话标题（通过 /rename 设置或在恢复时恢复）优先于代理名称，代理名称优先于 Haiku 提取的主题；
  // 所有都回退到产品名称。
  const terminalTitleFromRename = useAppState(s => s.settings.terminalTitleFromRename) !== false;
  const sessionTitle = terminalTitleFromRename ? getCurrentSessionTitle(getSessionId()) : undefined;
  const [haikuTitle, setHaikuTitle] = useState<string>();
  // 控制生成标签页标题的一次性 Haiku 调用。在恢复时（存在 initialMessages）初始化为 true，这样我们就不会从对话中间上下文重新命名恢复的会话。
  const haikuTitleAttemptedRef = useRef((initialMessages?.length ?? 0) > 0);
  const agentTitle = mainThreadAgentDefinition?.agentType;
  const terminalTitle = sessionTitle ?? agentTitle ?? haikuTitle ?? 'Claude Code';
  const isWaitingForApproval = toolUseConfirmQueue.length > 0 || promptQueue.length > 0 || pendingWorkerRequest || pendingSandboxRequest;
  // 本地 jsx 命令（如 /plugin，/config）显示等待输入的用户界面对话框。要求 jsx != null — 如果标志卡在 true 但 jsx 为 null，则视为未显示，这样 TextInput 焦点和队列处理器不会因为幽灵覆盖层而死锁。
  const isShowingLocalJSXCommand = toolJSX?.isLocalJSXCommand === true && toolJSX?.jsx != null;
  const titleIsAnimating = isLoading && !isWaitingForApproval && !isShowingLocalJSXCommand;
  // 标题动画状态存在于 <AnimatedTerminalTitle> 中，因此 960ms 滴答不会重新渲染 REPL。titleDisabled/terminalTitle 仍在此处计算，因为 onQueryImpl 会读取它们（后台会话描述，Haiku 标题提取门）。

  // 防止 macOS 在 Claude 工作时休眠
  useEffect(() => {
    if (isLoading && !isWaitingForApproval && !isShowingLocalJSXCommand) {
      startPreventSleep();
      return () => stopPreventSleep();
    }
  }, [isLoading, isWaitingForApproval, isShowingLocalJSXCommand]);
  const sessionStatus: TabStatusKind = isWaitingForApproval || isShowingLocalJSXCommand ? 'waiting' : isLoading ? 'busy' : 'idle';
          const waitingFor = sessionStatus !== 'waiting' ? undefined : toolUseConfirmQueue.length > 0 ? `批准 ${toolUseConfirmQueue[0]!.tool.name}` : pendingWorkerRequest ? '工作器请求' : pendingSandboxRequest ? '沙箱请求' : isShowingLocalJSXCommand ? '对话框打开' : '需要输入';

  // 将状态推送到 PID 文件以供 `claude ps` 使用。即发即弃；当缺少/过时时，ps 回退到对话记录尾部推导。
  useEffect(() => {
    if (feature('BG_SESSIONS')) {
      void updateSessionActivity({
        status: sessionStatus,
        waitingFor
      });
    }
  }, [sessionStatus, waitingFor]);

  // 第三方默认：关闭 — OSC 21337 仅在 ant 中使用，直到规范稳定。
  // 使用门控，以便在同时渲染标题微调器和侧边栏指示器的终端中发生冲突时可以回滚。当标志打开时，用户 facing 配置设置控制它是否活动。
  const tabStatusGateEnabled = getFeatureValue_CACHED_MAY_BE_STALE('tengu_terminal_sidebar', false);
  const showStatusInTerminalTab = tabStatusGateEnabled && (getGlobalConfig().showStatusInTerminalTab ?? false);
  useTabStatus(titleDisabled || !showStatusInTerminalTab ? null : sessionStatus);

  // 多窗口声音提醒：状态变化时播放提示音
  // - busy -> idle: 对话完成提醒
  // - 变为 waiting: 需要用户干预提醒
  const { playInterventionSound, playTaskCompleteSound } = require('../utils/soundNotification.js');
  const prevSessionStatusRef = useRef(sessionStatus);
  useEffect(() => {
    const prev = prevSessionStatusRef.current;
    if (prev === sessionStatus) return;
    prevSessionStatusRef.current = sessionStatus;

    if (sessionStatus === 'waiting') {
      // 需要用户干预：工具审批、输入等
      playInterventionSound();
    } else if (sessionStatus === 'idle' && prev === 'busy') {
      // 对话完成
      playTaskCompleteSound();
    }
  }, [sessionStatus]);

  // Register the leader's setToolUseConfirmQueue for in-process teammates
  useEffect(() => {
    registerLeaderToolUseConfirmQueue(setToolUseConfirmQueue);
    return () => unregisterLeaderToolUseConfirmQueue();
  }, [setToolUseConfirmQueue]);
  const [messages, rawSetMessages] = useState<MessageType[]>(initialMessages ?? []);
  const messagesRef = useRef(messages);
  // 存储显示的 willowMode 变体（如果未显示提示则为 false）。
  // 在 hint_shown 时捕获，以便 hint_converted 遥测报告相同的变体 — GrowthBook 值不应该在会话中改变，但读取一次保证配对事件之间的一致性。
  const idleHintShownRef = useRef<string | false>(false);
  // 包装 setMessages，使得 messagesRef 在调用返回时立即是最新的 — 而不是等到 React 稍后处理批处理。将更新器 eagerly 应用到 ref，然后将计算值（而不是函数）交给 React。rawSetMessages 批处理变为后写胜出，并且最后一个写入是正确的，因为每个调用都针对已经更新的 ref 进行组合。这是 Zustand 模式：ref 是真实来源，React 状态是渲染投影。如果没有这个，那些排队函数式更新器然后同步读取 ref 的路径（例如 handleSpeculationAccept → onQuery）会看到过时数据。
  const setMessages = useCallback((action: React.SetStateAction<MessageType[]>) => {
    const prev = messagesRef.current;
    const next = typeof action === 'function' ? action(messagesRef.current) : action;
    messagesRef.current = next;
    if (next.length < userInputBaselineRef.current) {
      // 缩小（压缩/回滚/清除）— 夹紧以便 placeholderText 的长度检查不会过时。
      userInputBaselineRef.current = 0;
    } else if (next.length > prev.length && userMessagePendingRef.current) {
      // 增长，而提交的用户消息尚未落地。如果添加的消息不包含它（桥接状态、钩子结果、计划任务在 processUserInputBase 期间异步落地），则增加基线以使占位符保持可见。一旦用户消息落地，停止跟踪 — 后续添加（助手流）不应重新显示占位符。
      const delta = next.length - prev.length;
      const added = prev.length === 0 || next[0] === prev[0] ? next.slice(-delta) : next.slice(0, delta);
      if (added.some(isHumanTurn)) {
        userMessagePendingRef.current = false;
      } else {
        userInputBaselineRef.current = next.length;
      }
    }
    rawSetMessages(next);
  }, []);
  // 捕获占位符文本旁边的基线消息计数，以便渲染可以在 displayedMessages 增长超过基线时隐藏它。
  const setUserInputOnProcessing = useCallback((input: string | undefined) => {
    if (input !== undefined) {
      userInputBaselineRef.current = messagesRef.current.length;
      userMessagePendingRef.current = true;
    } else {
      userMessagePendingRef.current = false;
    }
    setUserInputOnProcessingRaw(input);
  }, []);
  // 全屏：跟踪未读分隔线位置。dividerIndex 每次滚动会话仅更改约两次（首次滚动离开 + 重新固定）。pillVisible 和 stickyPrompt 现在位于 FullscreenLayout 中 — 它们直接订阅 ScrollBox，因此每帧滚动不会重新渲染 REPL。
  const {
    dividerIndex,
    dividerYRef,
    onScrollAway,
    onRepin,
    jumpToNew,
    shiftDivider
  } = useUnseenDivider(messages.length);
  if (feature('AWAY_SUMMARY')) {
    // biome-ignore lint/correctness/useHookAtTopLevel: feature() 是编译时常量
    useAwaySummary(messages, setMessages, isLoading);
  }
  const [cursor, setCursor] = useState<MessageActionsState | null>(null);
  const cursorNavRef = useRef<MessageActionsNav | null>(null);
  // 记忆化以便 Messages 的 React.memo 保持有效。
  const unseenDivider = useMemo(() => computeUnseenDivider(messages, dividerIndex),
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 长度变化覆盖追加；useUnseenDivider 的计数减少守卫在替换/回滚时清除 dividerIndex
  [dividerIndex, messages.length]);
  // 重新固定滚动到底部并清除未读消息基线。在任何用户驱动的返回实时操作（提交、输入空、覆盖层出现/消失）时调用。
  const repinScroll = useCallback(() => {
    scrollRef.current?.scrollToBottom();
    onRepin();
    setCursor(null);
  }, [onRepin, setCursor]);
  // 在 onSubmit 处为提交处理程序重新固定的后备。如果缓冲的 stdin 事件（滚轮/拖动）在处理程序触发和状态提交之间竞争，处理程序的 scrollToBottom 可能被撤消。此效果在用户消息实际落地的渲染上运行 — 绑定到 React 的提交周期，因此不能与 stdin 竞争。以 lastMsg 标识（而非 messages.length）为键，因此 useAssistantHistory 的 prepend 不会虚假地重新固定。
  const lastMsg = messages.at(-1);
  const lastMsgIsHuman = lastMsg != null && isHumanTurn(lastMsg);
  useEffect(() => {
    if (lastMsgIsHuman) {
      repinScroll();
    }
  }, [lastMsgIsHuman, lastMsg, repinScroll]);
  // 助手聊天：在向上滚动时懒加载远程历史记录。除非 KAIROS 构建 + config.viewerOnly，否则无操作。feature() 是构建时常量，因此该分支在非 KAIROS 构建中被死代码消除（与上面的 useUnseenDivider 模式相同）。
  const {
    maybeLoadOlder
  } = feature('KAIROS') ?
  // biome-ignore lint/correctness/useHookAtTopLevel: feature() 是编译时常量
  useAssistantHistory({
    config: remoteSessionConfig,
    setMessages,
    scrollRef,
    onPrepend: shiftDivider
  }) : HISTORY_STUB;
  // 组合 useUnseenDivider 的回调与懒加载触发器。
  const composedOnScroll = useCallback((sticky: boolean, handle: ScrollBoxHandle) => {
    lastUserScrollTsRef.current = Date.now();
    if (sticky) {
      onRepin();
    } else {
      onScrollAway(handle);
      if (feature('KAIROS')) maybeLoadOlder(handle);
      // Dismiss the companion bubble on scroll — it's absolute-positioned
      // at bottom-right and covers transcript content. Scrolling = user is
      // trying to read something under it.
      if (true) {
        setAppState(prev => prev.companionReaction === undefined ? prev : {
          ...prev,
          companionReaction: undefined
        });
      }
    }
  }, [onRepin, onScrollAway, maybeLoadOlder, setAppState]);
  // 延迟的 SessionStart 钩子消息 — REPL 立即渲染，钩子消息在解析时注入。awaitPendingHooks() 必须在第一次 API 调用之前调用，以便模型看到钩子上下文。
  const awaitPendingHooks = useDeferredHookMessages(pendingHookMessages, setMessages);

  // Messages 组件的延迟消息 — 以过渡优先级渲染，以便协调器每 5ms 让步一次，在昂贵的消息处理管道运行时保持输入响应。
  const deferredMessages = useDeferredValue(messages);
  const deferredBehind = messages.length - deferredMessages.length;
  if (deferredBehind > 0) {
    logForDebugging(`[useDeferredValue] Messages deferred by ${deferredBehind} (${deferredMessages.length}→${messages.length})`);
  }

  // Frozen state for transcript mode - stores lengths instead of cloning arrays for memory efficiency
  const [frozenTranscriptState, setFrozenTranscriptState] = useState<{
    messagesLength: number;
    streamingToolUsesLength: number;
  } | null>(null);
  // Initialize input with any early input that was captured before REPL was ready.
  // Using lazy initialization ensures cursor offset is set correctly in PromptInput.
  const [inputValue, setInputValueRaw] = useState(() => consumeEarlyInput());
  const inputValueRef = useRef(inputValue);
  inputValueRef.current = inputValue;
  const insertTextRef = useRef<{
    insert: (text: string) => void;
    setInputWithCursor: (value: string, cursor: number) => void;
    cursorOffset: number;
  } | null>(null);

  // Wrap setInputValue to co-locate suppression state updates.
  // Both setState calls happen in the same synchronous context so React
  // batches them into a single render, eliminating the extra render that
  // the previous useEffect → setState pattern caused.
  const setInputValue = useCallback((value: string) => {
    if (trySuggestBgPRIntercept(inputValueRef.current, value)) return;
    // In fullscreen mode, typing into an empty prompt re-pins scroll to
    // bottom. Only fires on empty→non-empty so scrolling up to reference
    // something while composing a message doesn't yank the view back on
    // every keystroke. Restores the pre-fullscreen muscle memory of
    // typing to snap back to the end of the conversation.
    // Skipped if the user scrolled within the last 3s — they're actively
    // reading, not lost. lastUserScrollTsRef starts at 0 so the first-
    // ever keypress (no scroll yet) always repins.
    if (inputValueRef.current === '' && value !== '' && Date.now() - lastUserScrollTsRef.current >= RECENT_SCROLL_REPIN_WINDOW_MS) {
      repinScroll();
    }
    // Sync ref immediately (like setMessages) so callers that read
    // inputValueRef before React commits — e.g. the auto-restore finally
    // block's `=== ''` guard — see the fresh value, not the stale render.
    inputValueRef.current = value;
    setInputValueRaw(value);
    setIsPromptInputActive(value.trim().length > 0);
  }, [setIsPromptInputActive, repinScroll, trySuggestBgPRIntercept]);

  // Schedule a timeout to stop suppressing dialogs after the user stops typing.
  // Only manages the timeout — the immediate activation is handled by setInputValue above.
  useEffect(() => {
    if (inputValue.trim().length === 0) return;
    const timer = setTimeout(setIsPromptInputActive, PROMPT_SUPPRESSION_MS, false);
    return () => clearTimeout(timer);
  }, [inputValue]);
  const [inputMode, setInputMode] = useState<PromptInputMode>('prompt');
  const [stashedPrompt, setStashedPrompt] = useState<{
    text: string;
    cursorOffset: number;
    pastedContents: Record<number, PastedContent>;
  } | undefined>();

  // Callback to filter commands based on CCR's available slash commands
  const handleRemoteInit = useCallback((remoteSlashCommands: string[]) => {
    const remoteCommandSet = new Set(remoteSlashCommands);
    // Keep commands that CCR lists OR that are in the local-safe set
    setLocalCommands(prev => prev.filter(cmd => remoteCommandSet.has(cmd.name) || REMOTE_SAFE_COMMANDS.has(cmd)));
  }, [setLocalCommands]);
  const [inProgressToolUseIDs, setInProgressToolUseIDs] = useState<Set<string>>(new Set());
  const hasInterruptibleToolInProgressRef = useRef(false);

  // Remote session hook - manages WebSocket connection and message handling for --remote mode
  const remoteSession = useRemoteSession({
    config: remoteSessionConfig,
    setMessages,
    setIsLoading: setIsExternalLoading,
    onInit: handleRemoteInit,
    setToolUseConfirmQueue,
    tools: combinedInitialTools,
    setStreamingToolUses,
    setStreamMode,
    setInProgressToolUseIDs
  });

  // Direct connect hook - manages WebSocket to a claude server for `claude connect` mode
  const directConnect = useDirectConnect({
    config: directConnectConfig,
    setMessages,
    setIsLoading: setIsExternalLoading,
    setToolUseConfirmQueue,
    tools: combinedInitialTools
  });

  // SSH session hook - manages ssh child process for `claude ssh` mode.
  // Same callback shape as useDirectConnect; only the transport under the
  // hood differs (ChildProcess stdin/stdout vs WebSocket).
  const sshRemote = useSSHSession({
    session: sshSession,
    setMessages,
    setIsLoading: setIsExternalLoading,
    setToolUseConfirmQueue,
    tools: combinedInitialTools
  });

  // Use whichever remote mode is active
  const activeRemote = sshRemote.isRemoteMode ? sshRemote : directConnect.isRemoteMode ? directConnect : remoteSession;
  const [pastedContents, setPastedContents] = useState<Record<number, PastedContent>>({});
  const [submitCount, setSubmitCount] = useState(0);
  // Ref instead of state to avoid triggering React re-renders on every
  // streaming text_delta. The spinner reads this via its animation timer.
  const responseLengthRef = useRef(0);
  // API performance metrics ref for ant-only spinner display (TTFT/OTPS).
  // Accumulates metrics from all API requests in a turn for P50 aggregation.
  const apiMetricsRef = useRef<Array<{
    ttftMs: number;
    firstTokenTime: number;
    lastTokenTime: number;
    responseLengthBaseline: number;
    // Tracks responseLengthRef at the time of the last content addition.
    // Updated by both streaming deltas and subagent message content.
    // lastTokenTime is also updated at the same time, so the OTPS
    // denominator correctly includes subagent processing time.
    endResponseLength: number;
  }>>([]);
  const setResponseLength = useCallback((f: (prev: number) => number) => {
    const prev = responseLengthRef.current;
    responseLengthRef.current = f(prev);
    // When content is added (not a compaction reset), update the latest
    // metrics entry so OTPS reflects all content generation activity.
    // Updating lastTokenTime here ensures the denominator includes both
    // streaming time AND subagent execution time, preventing inflation.
    if (responseLengthRef.current > prev) {
      const entries = apiMetricsRef.current;
      if (entries.length > 0) {
        const lastEntry = entries.at(-1)!;
        lastEntry.lastTokenTime = Date.now();
        lastEntry.endResponseLength = responseLengthRef.current;
      }
    }
  }, []);

  // Streaming text display: set state directly per delta (Ink's 16ms render
  // throttle batches rapid updates). Cleared on message arrival (messages.ts)
  // so displayedMessages switches from deferredMessages to messages atomically.
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const reducedMotion = useAppState(s => s.settings.prefersReducedMotion) ?? false;
  const showStreamingText = !reducedMotion && !hasCursorUpViewportYankBug();
  const onStreamingText = useCallback((f: (current: string | null) => string | null) => {
    if (!showStreamingText) return;
    setStreamingText(f);
  }, [showStreamingText]);

  // Hide the in-progress source line so text streams line-by-line, not
  // char-by-char. lastIndexOf returns -1 when no newline, giving '' → null.
  // Guard on showStreamingText so toggling reducedMotion mid-stream
  // immediately hides the streaming preview.
  const visibleStreamingText = streamingText && showStreamingText ? streamingText.substring(0, streamingText.lastIndexOf('\n') + 1) || null : null;
  const [lastQueryCompletionTime, setLastQueryCompletionTime] = useState(0);
  const [spinnerMessage, setSpinnerMessage] = useState<string | null>(null);
  const [spinnerColor, setSpinnerColor] = useState<keyof Theme | null>(null);
  const [spinnerShimmerColor, setSpinnerShimmerColor] = useState<keyof Theme | null>(null);
  const [isMessageSelectorVisible, setIsMessageSelectorVisible] = useState(false);
  const [messageSelectorPreselect, setMessageSelectorPreselect] = useState<UserMessage | undefined>(undefined);
  const [showCostDialog, setShowCostDialog] = useState(false);
  const [conversationId, setConversationId] = useState(randomUUID());

  // Idle-return dialog: shown when user submits after a long idle gap
  const [idleReturnPending, setIdleReturnPending] = useState<{
    input: string;
    idleMinutes: number;
  } | null>(null);
  const skipIdleCheckRef = useRef(false);
  const lastQueryCompletionTimeRef = useRef(lastQueryCompletionTime);
  lastQueryCompletionTimeRef.current = lastQueryCompletionTime;

  // Aggregate tool result budget: per-conversation decision tracking.
  // When the GrowthBook flag is on, query.ts enforces the budget; when
  // off (undefined), enforcement is skipped entirely. Stale entries after
  // /clear, rewind, or compact are harmless (tool_use_ids are UUIDs, stale
  // keys are never looked up). Memory is bounded by total replacement count
  // × ~2KB preview over the REPL lifetime — negligible.
  //
  // Lazy init via useState initializer — useRef(expr) evaluates expr on every
  // render (React ignores it after first, but the computation still runs).
  // For large resumed sessions, reconstruction does O(messages × blocks)
  // work; we only want that once.
  const [contentReplacementStateRef] = useState(() => ({
    current: provisionContentReplacementState(initialMessages, initialContentReplacements)
  }));
  const [haveShownCostDialog, setHaveShownCostDialog] = useState(getGlobalConfig().hasAcknowledgedCostThreshold);
  const [vimMode, setVimMode] = useState<VimMode>('INSERT');
  const [showBashesDialog, setShowBashesDialog] = useState<string | boolean>(false);
  const [isSearchingHistory, setIsSearchingHistory] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  // showBashesDialog is REPL-level so it survives PromptInput unmounting.
  // When ultraplan approval fires while the pill dialog is open, PromptInput
  // unmounts (focusedInputDialog → 'ultraplan-choice') but this stays true;
  // after accepting, PromptInput remounts into an empty "No tasks" dialog
  // (the completed ultraplan task has been filtered out). Close it here.
  useEffect(() => {
    if (ultraplanPendingChoice && showBashesDialog) {
      setShowBashesDialog(false);
    }
  }, [ultraplanPendingChoice, showBashesDialog]);
  const isTerminalFocused = useTerminalFocus();
  const terminalFocusRef = useRef(isTerminalFocused);
  terminalFocusRef.current = isTerminalFocused;
  const [theme] = useTheme();

  // resetLoadingState runs twice per turn (onQueryImpl tail + onQuery finally).
  // Without this guard, both calls pick a tip → two recordShownTip → two
  // saveGlobalConfig writes back-to-back. Reset at submit in onSubmit.
  const tipPickedThisTurnRef = React.useRef(false);
  const pickNewSpinnerTip = useCallback(() => {
    if (tipPickedThisTurnRef.current) return;
    tipPickedThisTurnRef.current = true;
    const newMessages = messagesRef.current.slice(bashToolsProcessedIdx.current);
    for (const tool of extractBashToolsFromMessages(newMessages)) {
      bashTools.current.add(tool);
    }
    bashToolsProcessedIdx.current = messagesRef.current.length;
    void getTipToShowOnSpinner({
      theme,
      readFileState: readFileState.current,
      bashTools: bashTools.current
    }).then(async tip => {
      if (tip) {
        const content = await tip.content({
          theme
        });
        setAppState(prev => ({
          ...prev,
          spinnerTip: content
        }));
        recordShownTip(tip);
      } else {
        setAppState(prev => {
          if (prev.spinnerTip === undefined) return prev;
          return {
            ...prev,
            spinnerTip: undefined
          };
        });
      }
    });
  }, [setAppState, theme]);

  // Resets UI loading state. Does NOT call onTurnComplete - that should be
  // called explicitly only when a query turn actually completes.
  const resetLoadingState = useCallback(() => {
    // isLoading is now derived from queryGuard — no setter call needed.
    // queryGuard.end() (onQuery finally) or cancelReservation() (executeUserInput
    // finally) have already transitioned the guard to idle by the time this runs.
    // External loading (remote/backgrounding) is reset separately by those hooks.
    setIsExternalLoading(false);
    setUserInputOnProcessing(undefined);
    responseLengthRef.current = 0;
    apiMetricsRef.current = [];
    setStreamingText(null);
    setStreamingToolUses([]);
    setSpinnerMessage(null);
    setSpinnerColor(null);
    setSpinnerShimmerColor(null);
    pickNewSpinnerTip();
    endInteractionSpan();
    // Speculative bash classifier checks are only valid for the current
    // turn's commands — clear after each turn to avoid accumulating
    // Promise chains for unconsumed checks (denied/aborted paths).
    clearSpeculativeChecks();
  }, [pickNewSpinnerTip]);

  // Session backgrounding — hook is below, after getToolUseContext

  const hasRunningTeammates = useMemo(() => getAllInProcessTeammateTasks(tasks).some(t => t.status === 'running'), [tasks]);

  // Show deferred turn duration message once all swarm teammates finish
  useEffect(() => {
    if (!hasRunningTeammates && swarmStartTimeRef.current !== null) {
      const totalMs = Date.now() - swarmStartTimeRef.current;
      const deferredBudget = swarmBudgetInfoRef.current;
      swarmStartTimeRef.current = null;
      swarmBudgetInfoRef.current = undefined;
      setMessages(prev => [...prev, createTurnDurationMessage(totalMs, deferredBudget,
      // Count only what recordTranscript will persist — ephemeral
      // progress ticks and non-ant attachments are filtered by
      // isLoggableMessage and never reach disk. Using raw prev.length
      // would make checkResumeConsistency report false delta<0 for
      // every turn that ran a progress-emitting tool.
      count(prev, isLoggableMessage))]);
    }
  }, [hasRunningTeammates, setMessages]);

  // Show auto permissions warning when entering auto mode
  // (either via Shift+Tab toggle or on startup). Debounced to avoid
  // flashing when the user is cycling through modes quickly.
  // Only shown 3 times total across sessions.
  const safeYoloMessageShownRef = useRef(false);
  useEffect(() => {
    if (feature('TRANSCRIPT_CLASSIFIER')) {
      if (toolPermissionContext.mode !== 'auto') {
        safeYoloMessageShownRef.current = false;
        return;
      }
      if (safeYoloMessageShownRef.current) return;
      const config = getGlobalConfig();
      const count = config.autoPermissionsNotificationCount ?? 0;
      if (count >= 3) return;
      const timer = setTimeout((ref, setMessages) => {
        ref.current = true;
        saveGlobalConfig(prev => {
          const prevCount = prev.autoPermissionsNotificationCount ?? 0;
          if (prevCount >= 3) return prev;
          return {
            ...prev,
            autoPermissionsNotificationCount: prevCount + 1
          };
        });
        setMessages(prev => [...prev, createSystemMessage(AUTO_MODE_DESCRIPTION, 'warning')]);
      }, 800, safeYoloMessageShownRef, setMessages);
      return () => clearTimeout(timer);
    }
  }, [toolPermissionContext.mode, setMessages]);

  // If worktree creation was slow and sparse-checkout isn't configured,
  // nudge the user toward settings.worktree.sparsePaths.
  const worktreeTipShownRef = useRef(false);
  useEffect(() => {
    if (worktreeTipShownRef.current) return;
    const wt = getCurrentWorktreeSession();
    if (!wt?.creationDurationMs || wt.usedSparsePaths) return;
    if (wt.creationDurationMs < 15_000) return;
    worktreeTipShownRef.current = true;
    const secs = Math.round(wt.creationDurationMs / 1000);
    setMessages(prev => [...prev, createSystemMessage(`Worktree creation took ${secs}s. For large repos, set \`worktree.sparsePaths\` in .claude/settings.json to check out only the directories you need — e.g. \`{"worktree": {"sparsePaths": ["src", "packages/foo"]}}\`.`, 'info')]);
  }, [setMessages]);

  // Hide spinner when the only in-progress tool is Sleep
  const onlySleepToolActive = useMemo(() => {
    const lastAssistant = messages.findLast(m => m.type === 'assistant');
    if (lastAssistant?.type !== 'assistant') return false;
    const inProgressToolUses = lastAssistant.message.content.filter(b => b.type === 'tool_use' && inProgressToolUseIDs.has(b.id));
    return inProgressToolUses.length > 0 && inProgressToolUses.every(b => b.type === 'tool_use' && b.name === SLEEP_TOOL_NAME);
  }, [messages, inProgressToolUseIDs]);
  const {
    onBeforeQuery: mrOnBeforeQuery,
    onTurnComplete: mrOnTurnComplete,
    render: mrRender
  } = useMoreRight({
    enabled: moreRightEnabled,
    setMessages,
    inputValue,
    setInputValue,
    setToolJSX
  });
  const showSpinner = (!toolJSX || toolJSX.showSpinner === true) && toolUseConfirmQueue.length === 0 && promptQueue.length === 0 && (
  // Show spinner during input processing, API call, while teammates are running,
  // or while pending task notifications are queued (prevents spinner bounce between consecutive notifications)
  isLoading || userInputOnProcessing || hasRunningTeammates ||
  // Keep spinner visible while task notifications are queued for processing.
  // Without this, the spinner briefly disappears between consecutive notifications
  // (e.g., multiple background agents completing in rapid succession) because
  // isLoading goes false momentarily between processing each one.
  getCommandQueueLength() > 0) &&
  // Hide spinner when waiting for leader to approve permission request
  !pendingWorkerRequest && !onlySleepToolActive && (
  // Hide spinner when streaming text is visible (the text IS the feedback),
  // but keep it when isBriefOnly suppresses the streaming text display
  !visibleStreamingText || isBriefOnly);

  // Check if any permission or ask question prompt is currently visible
  // This is used to prevent the survey from opening while prompts are active
  const hasActivePrompt = toolUseConfirmQueue.length > 0 || promptQueue.length > 0 || sandboxPermissionRequestQueue.length > 0 || elicitation.queue.length > 0 || workerSandboxPermissions.queue.length > 0;
  const feedbackSurveyOriginal = useFeedbackSurvey(messages, isLoading, submitCount, 'session', hasActivePrompt);
  const skillImprovementSurvey = useSkillImprovementSurvey(setMessages);
  const showIssueFlagBanner = useIssueFlagBanner(messages, submitCount);

  // Wrap feedback survey handler to trigger auto-run /issue
  const feedbackSurvey = useMemo(() => ({
    ...feedbackSurveyOriginal,
    handleSelect: (selected: 'dismissed' | 'bad' | 'fine' | 'good') => {
      // Reset the ref when a new survey response comes in
      didAutoRunIssueRef.current = false;
      const showedTranscriptPrompt = feedbackSurveyOriginal.handleSelect(selected);
      // Auto-run /issue for "bad" if transcript prompt wasn't shown
      if (selected === 'bad' && !showedTranscriptPrompt && shouldAutoRunIssue('feedback_survey_bad')) {
        setAutoRunIssueReason('feedback_survey_bad');
        didAutoRunIssueRef.current = true;
      }
    }
  }), [feedbackSurveyOriginal]);

  // Post-compact survey: shown after compaction if feature gate is enabled
  const postCompactSurvey = usePostCompactSurvey(messages, isLoading, hasActivePrompt, {
    enabled: !isRemoteSession
  });

  // Memory survey: shown when the assistant mentions memory and a memory file
  // was read this conversation
  const memorySurvey = useMemorySurvey(messages, isLoading, hasActivePrompt, {
    enabled: !isRemoteSession
  });

  // Frustration detection: show transcript sharing prompt after detecting frustrated messages
  const frustrationDetection = useFrustrationDetection(messages, isLoading, hasActivePrompt, feedbackSurvey.state !== 'closed' || postCompactSurvey.state !== 'closed' || memorySurvey.state !== 'closed');

  // Initialize IDE integration
  useIDEIntegration({
    autoConnectIdeFlag,
    ideToInstallExtension,
    setDynamicMcpConfig,
    setShowIdeOnboarding,
    setIDEInstallationState: setIDEInstallationStatus
  });
  useFileHistorySnapshotInit(initialFileHistorySnapshots, fileHistory, fileHistoryState => setAppState(prev => ({
    ...prev,
    fileHistory: fileHistoryState
  })));
  const resume = useCallback(async (sessionId: UUID, log: LogOption, entrypoint: ResumeEntrypoint) => {
    const resumeStart = performance.now();
    try {
      // Deserialize messages to properly clean up the conversation
      // This filters unresolved tool uses and adds a synthetic assistant message if needed
      const messages = deserializeMessages(log.messages);

      // Match coordinator/normal mode to the resumed session
      if (feature('COORDINATOR_MODE')) {
         
        const coordinatorModule = require('../coordinator/coordinatorMode.js') as typeof import('../coordinator/coordinatorMode.js');
         
        const warning = coordinatorModule.matchSessionMode(log.mode);
        if (warning) {
          // Re-derive agent definitions after mode switch so built-in agents
          // reflect the new coordinator/normal mode
           
          const {
            getAgentDefinitionsWithOverrides,
            getActiveAgentsFromList
          } = require('../tools/AgentTool/loadAgentsDir.js') as typeof import('../tools/AgentTool/loadAgentsDir.js');
           
          getAgentDefinitionsWithOverrides.cache.clear?.();
          const freshAgentDefs = await getAgentDefinitionsWithOverrides(getOriginalCwd());
          setAppState(prev => ({
            ...prev,
            agentDefinitions: {
              ...freshAgentDefs,
              allAgents: freshAgentDefs.allAgents,
              activeAgents: getActiveAgentsFromList(freshAgentDefs.allAgents)
            }
          }));
          messages.push(createSystemMessage(warning, 'warning'));
        }
      }

      // Fire SessionEnd hooks for the current session before starting the
      // resumed one, mirroring the /clear flow in conversation.ts.
      const sessionEndTimeoutMs = getSessionEndHookTimeoutMs();
      await executeSessionEndHooks('resume', {
        getAppState: () => store.getState(),
        setAppState,
        signal: AbortSignal.timeout(sessionEndTimeoutMs),
        timeoutMs: sessionEndTimeoutMs
      });

      // Process session start hooks for resume
      const hookMessages = await processSessionStartHooks('resume', {
        sessionId,
        agentType: mainThreadAgentDefinition?.agentType,
        model: mainLoopModel
      });

      // Append hook messages to the conversation
      messages.push(...hookMessages);
      // For forks, generate a new plan slug and copy the plan content so the
      // original and forked sessions don't clobber each other's plan files.
      // For regular resumes, reuse the original session's plan slug.
      if (entrypoint === 'fork') {
        void copyPlanForFork(log, asSessionId(sessionId));
      } else {
        void copyPlanForResume(log, asSessionId(sessionId));
      }

      // Restore file history and attribution state from the resumed conversation
      restoreSessionStateFromLog(log, setAppState);
      if (log.fileHistorySnapshots) {
        void copyFileHistoryForResume(log);
      }

      // Restore agent setting from the resumed conversation
      // Always reset to the new session's values (or clear if none),
      // matching the standaloneAgentContext pattern below
      const {
        agentDefinition: restoredAgent
      } = restoreAgentFromSession(log.agentSetting, initialMainThreadAgentDefinition, agentDefinitions);
      setMainThreadAgentDefinition(restoredAgent);
      setAppState(prev => ({
        ...prev,
        agent: restoredAgent?.agentType
      }));

      // Restore standalone agent context from the resumed conversation
      // Always reset to the new session's values (or clear if none)
      setAppState(prev => ({
        ...prev,
        standaloneAgentContext: computeStandaloneAgentContext(log.agentName, log.agentColor)
      }));
      void updateSessionName(log.agentName);

      // Restore read file state from the message history
      restoreReadFileState(messages, log.projectPath ?? getOriginalCwd());

      // Clear any active loading state (no queryId since we're not in a query)
      resetLoadingState();
      setAbortController(null);
      setConversationId(sessionId);

      // Get target session's costs BEFORE saving current session
      // (saveCurrentSessionCosts overwrites the config, so we need to read first)
      const targetSessionCosts = getStoredSessionCosts(sessionId);

      // Save current session's costs before switching to avoid losing accumulated costs
      saveCurrentSessionCosts();

      // Reset cost state for clean slate before restoring target session
      resetCostState();

      // Switch session (id + project dir atomically). fullPath may point to
      // a different project (cross-worktree, /branch); null derives from
      // current originalCwd.
      switchSession(asSessionId(sessionId), log.fullPath ? dirname(log.fullPath) : null);
      // Rename asciicast recording to match the resumed session ID
      const {
        renameRecordingForSession
      } = await import('../utils/asciicast.js');
      await renameRecordingForSession();
      await resetSessionFilePointer();

      // Clear then restore session metadata so it's re-appended on exit via
      // reAppendSessionMetadata. clearSessionMetadata must be called first:
      // restoreSessionMetadata only sets-if-truthy, so without the clear,
      // a session without an agent name would inherit the previous session's
      // cached name and write it to the wrong transcript on first message.
      clearSessionMetadata();
      restoreSessionMetadata(log);
      // Resumed sessions shouldn't re-title from mid-conversation context
      // (same reasoning as the useRef seed), and the previous session's
      // Haiku title shouldn't carry over.
      haikuTitleAttemptedRef.current = true;
      setHaikuTitle(undefined);

      // Exit any worktree a prior /resume entered, then cd into the one
      // this session was in. Without the exit, resuming from worktree B
      // to non-worktree C leaves cwd/currentWorktreeSession stale;
      // resuming B→C where C is also a worktree fails entirely
      // (getCurrentWorktreeSession guard blocks the switch).
      //
      // Skipped for /branch: forkLog doesn't carry worktreeSession, so
      // this would kick the user out of a worktree they're still working
      // in. Same fork skip as processResumedConversation for the adopt —
      // fork materializes its own file via recordTranscript on REPL mount.
      if (entrypoint !== 'fork') {
        exitRestoredWorktree();
        restoreWorktreeForResume(log.worktreeSession);
        adoptResumedSessionFile();
        void restoreRemoteAgentTasks({
          abortController: new AbortController(),
          getAppState: () => store.getState(),
          setAppState
        });
      } else {
        // Fork: same re-persist as /clear (conversation.ts). The clear
        // above wiped currentSessionWorktree, forkLog doesn't carry it,
        // and the process is still in the same worktree.
        const ws = getCurrentWorktreeSession();
        if (ws) saveWorktreeState(ws);
      }

      // Persist the current mode so future resumes know what mode this session was in
      if (feature('COORDINATOR_MODE')) {
         
        const {
          saveMode
        } = require('../utils/sessionStorage.js');
        const {
          isCoordinatorMode
        } = require('../coordinator/coordinatorMode.js') as typeof import('../coordinator/coordinatorMode.js');
         
        saveMode(isCoordinatorMode() ? 'coordinator' : 'normal');
      }

      // Restore target session's costs from the data we read earlier
      if (targetSessionCosts) {
        setCostStateForRestore(targetSessionCosts);
      }

      // Reconstruct replacement state for the resumed session. Runs after
      // setSessionId so any NEW replacements post-resume write to the
      // resumed session's tool-results dir. Gated on ref.current: the
      // initial mount already read the feature flag, so we don't re-read
      // it here (mid-session flag flips stay unobservable in both
      // directions).
      //
      // Skipped for in-session /branch: the existing ref is already correct
      // (branch preserves tool_use_ids), so there's no need to reconstruct.
      // createFork() does write content-replacement entries to the forked
      // JSONL with the fork's sessionId, so `claude -r {forkId}` also works.
      if (contentReplacementStateRef.current && entrypoint !== 'fork') {
        contentReplacementStateRef.current = reconstructContentReplacementState(messages, log.contentReplacements ?? []);
      }

      // Reset messages to the provided initial messages
      // Use a callback to ensure we're not dependent on stale state
      setMessages(() => messages);

      // Clear any active tool JSX
      setToolJSX(null);

      // Clear input to ensure no residual state
      setInputValue('');
      logEvent('tengu_session_resumed', {
        entrypoint: entrypoint as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        success: true,
        resume_duration_ms: Math.round(performance.now() - resumeStart)
      });
    } catch (error) {
      logEvent('tengu_session_resumed', {
        entrypoint: entrypoint as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        success: false
      });
      throw error;
    }
  }, [resetLoadingState, setAppState]);

  // Lazy init: useRef(createX()) would call createX on every render and
  // discard the result. LRUCache construction inside FileStateCache is
  // expensive (~170ms), so we use useState's lazy initializer to create
  // it exactly once, then feed that stable reference into useRef.
  const [initialReadFileState] = useState(() => createFileStateCacheWithSizeLimit(READ_FILE_STATE_CACHE_SIZE));
  const readFileState = useRef(initialReadFileState);
  const bashTools = useRef(new Set<string>());
  const bashToolsProcessedIdx = useRef(0);
  // Session-scoped skill discovery tracking (feeds was_discovered on
  // tengu_skill_tool_invocation). Must persist across getToolUseContext
  // rebuilds within a session: turn-0 discovery writes via processUserInput
  // before onQuery builds its own context, and discovery on turn N must
  // still attribute a SkillTool call on turn N+k. Cleared in clearConversation.
  const discoveredSkillNamesRef = useRef(new Set<string>());
  // Session-level dedup for nested_memory CLAUDE.md attachments.
  // readFileState is a 100-entry LRU; once it evicts a CLAUDE.md path,
  // the next discovery cycle re-injects it. Cleared in clearConversation.
  const loadedNestedMemoryPathsRef = useRef(new Set<string>());

  // Helper to restore read file state from messages (used for resume flows)
  // This allows Claude to edit files that were read in previous sessions
  const restoreReadFileState = useCallback((messages: MessageType[], cwd: string) => {
    const extracted = extractReadFilesFromMessages(messages, cwd, READ_FILE_STATE_CACHE_SIZE);
    readFileState.current = mergeFileStateCaches(readFileState.current, extracted);
    for (const tool of extractBashToolsFromMessages(messages)) {
      bashTools.current.add(tool);
    }
  }, []);

  // Extract read file state from initialMessages on mount
  // This handles CLI flag resume (--resume-session) and ResumeConversation screen
  // where messages are passed as props rather than through the resume callback
  useEffect(() => {
    if (initialMessages && initialMessages.length > 0) {
      restoreReadFileState(initialMessages, getOriginalCwd());
      void restoreRemoteAgentTasks({
        abortController: new AbortController(),
        getAppState: () => store.getState(),
        setAppState
      });
    }
    // Only run on mount - initialMessages shouldn't change during component lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const {
    status: apiKeyStatus,
    reverify
  } = useApiKeyVerification();

  // Auto-run /issue state
  const [autoRunIssueReason, setAutoRunIssueReason] = useState<AutoRunIssueReason | null>(null);
  // Ref to track if autoRunIssue was triggered this survey cycle,
  // so we can suppress the [1] follow-up prompt even after
  // autoRunIssueReason is cleared.
  const didAutoRunIssueRef = useRef(false);

  // State for exit feedback flow
  const [exitFlow, setExitFlow] = useState<React.ReactNode>(null);
  const [isExiting, setIsExiting] = useState(false);

  // Calculate if cost dialog should be shown
  const showingCostDialog = !isLoading && showCostDialog;

  // Determine which dialog should have focus (if any)
  // Permission and interactive dialogs can show even when toolJSX is set,
  // as long as shouldContinueAnimation is true. This prevents deadlocks when
  // agents set background hints while waiting for user interaction.
  function getFocusedInputDialog(): 'message-selector' | 'sandbox-permission' | 'tool-permission' | 'prompt' | 'worker-sandbox-permission' | 'elicitation' | 'cost' | 'idle-return' | 'init-onboarding' | 'ide-onboarding' | 'model-switch' | 'undercover-callout' | 'effort-callout' | 'remote-callout' | 'lsp-recommendation' | 'plugin-hint' | 'desktop-upsell' | 'ultraplan-choice' | 'ultraplan-launch' | undefined {
    // Exit states always take precedence
    if (isExiting || exitFlow) return undefined;

    // High priority dialogs (always show regardless of typing)
    if (isMessageSelectorVisible) return 'message-selector';

    // Suppress interrupt dialogs while user is actively typing
    if (isPromptInputActive) return undefined;
    if (sandboxPermissionRequestQueue[0]) return 'sandbox-permission';

    // Permission/interactive dialogs (show unless blocked by toolJSX)
    const allowDialogsWithAnimation = !toolJSX || toolJSX.shouldContinueAnimation;
    if (allowDialogsWithAnimation && toolUseConfirmQueue[0]) return 'tool-permission';
    if (allowDialogsWithAnimation && promptQueue[0]) return 'prompt';
    // Worker sandbox permission prompts (network access) from swarm workers
    if (allowDialogsWithAnimation && workerSandboxPermissions.queue[0]) return 'worker-sandbox-permission';
    if (allowDialogsWithAnimation && elicitation.queue[0]) return 'elicitation';
    if (allowDialogsWithAnimation && showingCostDialog) return 'cost';
    if (allowDialogsWithAnimation && idleReturnPending) return 'idle-return';
    if (feature('ULTRAPLAN') && allowDialogsWithAnimation && !isLoading && ultraplanPendingChoice) return 'ultraplan-choice';
    if (feature('ULTRAPLAN') && allowDialogsWithAnimation && !isLoading && ultraplanLaunchPending) return 'ultraplan-launch';

    // Onboarding dialogs (special conditions)
    if (allowDialogsWithAnimation && showIdeOnboarding) return 'ide-onboarding';

    // Model switch callout (ant-only, eliminated from external builds)
    if ("external" === 'ant' && allowDialogsWithAnimation && showModelSwitchCallout) return 'model-switch';

    // Undercover auto-enable explainer (ant-only, eliminated from external builds)
    if ("external" === 'ant' && allowDialogsWithAnimation && showUndercoverCallout) return 'undercover-callout';

    // Effort callout (shown once for Opus 4.6 users when effort is enabled)
    if (allowDialogsWithAnimation && showEffortCallout) return 'effort-callout';

    // Remote callout (shown once before first bridge enable)
    if (allowDialogsWithAnimation && showRemoteCallout) return 'remote-callout';

    // LSP plugin recommendation (lowest priority - non-blocking suggestion)
    if (allowDialogsWithAnimation && lspRecommendation) return 'lsp-recommendation';

    // Plugin hint from CLI/SDK stderr (same priority band as LSP rec)
    if (allowDialogsWithAnimation && hintRecommendation) return 'plugin-hint';

    // Desktop app upsell (max 3 launches, lowest priority)
    if (allowDialogsWithAnimation && showDesktopUpsellStartup) return 'desktop-upsell';
    return undefined;
  }
  const focusedInputDialog = getFocusedInputDialog();

  // True when permission prompts exist but are hidden because the user is typing
  const hasSuppressedDialogs = isPromptInputActive && (sandboxPermissionRequestQueue[0] || toolUseConfirmQueue[0] || promptQueue[0] || workerSandboxPermissions.queue[0] || elicitation.queue[0] || showingCostDialog);

  // Keep ref in sync so timer callbacks can read the current value
  focusedInputDialogRef.current = focusedInputDialog;

  // Immediately capture pause/resume when focusedInputDialog changes
  // This ensures accurate timing even under high system load, rather than
  // relying on the 100ms polling interval to detect state changes
  useEffect(() => {
    if (!isLoading) return;
    const isPaused = focusedInputDialog === 'tool-permission';
    const now = Date.now();
    if (isPaused && pauseStartTimeRef.current === null) {
      // Just entered pause state - record the exact moment
      pauseStartTimeRef.current = now;
    } else if (!isPaused && pauseStartTimeRef.current !== null) {
      // Just exited pause state - accumulate paused time immediately
      totalPausedMsRef.current += now - pauseStartTimeRef.current;
      pauseStartTimeRef.current = null;
    }
  }, [focusedInputDialog, isLoading]);

  // Re-pin scroll to bottom whenever the permission overlay appears or
  // dismisses. Overlay now renders below messages inside the same
  // ScrollBox (no remount), so we need an explicit scrollToBottom for:
  //  - appear: user may have been scrolled up (sticky broken) — the
  //    dialog is blocking and must be visible
  //  - dismiss: user may have scrolled up to read context during the
  //    overlay, and onScroll was suppressed so the pill state is stale
  // useLayoutEffect so the re-pin commits before the Ink frame renders —
  // no 1-frame flash of the wrong scroll position.
  const prevDialogRef = useRef(focusedInputDialog);
  useLayoutEffect(() => {
    const was = prevDialogRef.current === 'tool-permission';
    const now = focusedInputDialog === 'tool-permission';
    if (was !== now) repinScroll();
    prevDialogRef.current = focusedInputDialog;
  }, [focusedInputDialog, repinScroll]);
  function onCancel() {
    if (focusedInputDialog === 'elicitation') {
      // Elicitation dialog handles its own Escape, and closing it shouldn't affect any loading state.
      return;
    }
    logForDebugging(`[onCancel] focusedInputDialog=${focusedInputDialog} streamMode=${streamMode}`);

    // Pause proactive mode so the user gets control back.
    // It will resume when they submit their next input (see onSubmit).
    if (feature('PROACTIVE') || feature('KAIROS')) {
      proactiveModule?.pauseProactive();
    }
    queryGuard.forceEnd();
    skipIdleCheckRef.current = false;

    // Preserve partially-streamed text so the user can read what was
    // generated before pressing Esc. Pushed before resetLoadingState clears
    // streamingText, and before query.ts yields the async interrupt marker,
    // giving final order [user, partial-assistant, [Request interrupted by user]].
    if (streamingText?.trim()) {
      setMessages(prev => [...prev, createAssistantMessage({
        content: streamingText
      })]);
    }
    resetLoadingState();

    // Clear any active token budget so the backstop doesn't fire on
    // a stale budget if the query generator hasn't exited yet.
    if (feature('TOKEN_BUDGET')) {
      snapshotOutputTokensForTurn(null);
    }
    if (focusedInputDialog === 'tool-permission') {
      // Tool use confirm handles the abort signal itself
      toolUseConfirmQueue[0]?.onAbort();
      setToolUseConfirmQueue([]);
    } else if (focusedInputDialog === 'prompt') {
      // Reject all pending prompts and clear the queue
      for (const item of promptQueue) {
        item.reject(new Error('用户取消了提示'));
      }
      setPromptQueue([]);
      abortController?.abort('user-cancel');
    } else if (activeRemote.isRemoteMode) {
      // Remote mode: send interrupt signal to CCR
      activeRemote.cancelRequest();
    } else {
      abortController?.abort('user-cancel');
    }

    // Clear the controller so subsequent Escape presses don't see a stale
    // aborted signal. Without this, canCancelRunningTask is false (signal
    // defined but .aborted === true), so isActive becomes false if no other
    // activating conditions hold — leaving the Escape keybinding inactive.
    setAbortController(null);

    // forceEnd() skips the finally path — fire directly (aborted=true).
    void mrOnTurnComplete(messagesRef.current, true);
  }

  // Function to handle queued command when canceling a permission request
  const handleQueuedCommandOnCancel = useCallback(() => {
    const result = popAllEditable(inputValue, 0);
    if (!result) return;
    setInputValue(result.text);
    setInputMode('prompt');

    // Restore images from queued commands to pastedContents
    if (result.images.length > 0) {
      setPastedContents(prev => {
        const newContents = {
          ...prev
        };
        for (const image of result.images) {
          newContents[image.id] = image;
        }
        return newContents;
      });
    }
  }, [setInputValue, setInputMode, inputValue, setPastedContents]);

  // CancelRequestHandler props - rendered inside KeybindingSetup
  const cancelRequestProps = {
    setToolUseConfirmQueue,
    onCancel,
    onAgentsKilled: () => setMessages(prev => [...prev, createAgentsKilledMessage()]),
    isMessageSelectorVisible: isMessageSelectorVisible || !!showBashesDialog,
    screen,
    abortSignal: abortController?.signal,
    popCommandFromQueue: handleQueuedCommandOnCancel,
    vimMode,
    isLocalJSXCommand: toolJSX?.isLocalJSXCommand,
    isSearchingHistory,
    isHelpOpen,
    inputMode,
    inputValue,
    streamMode
  };
  useEffect(() => {
    const totalCost = getTotalCost();
    if (totalCost >= 5 /* $5 */ && !showCostDialog && !haveShownCostDialog) {
      logEvent('tengu_cost_threshold_reached', {});
      // Mark as shown even if the dialog won't render (no console billing
      // access). Otherwise this effect re-fires on every message change for
      // the rest of the session — 200k+ spurious events observed.
      setHaveShownCostDialog(true);
      if (hasConsoleBillingAccess()) {
        setShowCostDialog(true);
      }
    }
  }, [messages, showCostDialog, haveShownCostDialog]);
  const sandboxAskCallback: SandboxAskCallback = useCallback(async (hostPattern: NetworkHostPattern) => {
    // If running as a swarm worker, forward the request to the leader via mailbox
    if (isAgentSwarmsEnabled() && isSwarmWorker()) {
      const requestId = generateSandboxRequestId();

      // Send the request to the leader via mailbox
      const sent = await sendSandboxPermissionRequestViaMailbox(hostPattern.host, requestId);
      return new Promise(resolveShouldAllowHost => {
        if (!sent) {
          // If we couldn't send via mailbox, fall back to local handling
          setSandboxPermissionRequestQueue(prev => [...prev, {
            hostPattern,
            resolvePromise: resolveShouldAllowHost
          }]);
          return;
        }

        // Register the callback for when the leader responds
        registerSandboxPermissionCallback({
          requestId,
          host: hostPattern.host,
          resolve: resolveShouldAllowHost
        });

        // Update AppState to show pending indicator
        setAppState(prev => ({
          ...prev,
          pendingSandboxRequest: {
            requestId,
            host: hostPattern.host
          }
        }));
      });
    }

    // Normal flow for non-workers: show local UI and optionally race
    // against the REPL bridge (Remote Control) if connected.
    return new Promise(resolveShouldAllowHost => {
      let resolved = false;
      function resolveOnce(allow: boolean): void {
        if (resolved) return;
        resolved = true;
        resolveShouldAllowHost(allow);
      }

      // Queue the local sandbox permission dialog
      setSandboxPermissionRequestQueue(prev => [...prev, {
        hostPattern,
        resolvePromise: resolveOnce
      }]);

      // When the REPL bridge is connected, also forward the sandbox
      // permission request as a can_use_tool control_request so the
      // remote user (e.g. on claude.ai) can approve it too.
      if (feature('BRIDGE_MODE')) {
        const bridgeCallbacks = store.getState().replBridgePermissionCallbacks;
        if (bridgeCallbacks) {
          const bridgeRequestId = randomUUID();
          bridgeCallbacks.sendRequest(bridgeRequestId, SANDBOX_NETWORK_ACCESS_TOOL_NAME, {
            host: hostPattern.host
          }, randomUUID(), `允许连接到 ${hostPattern.host}？`);
          const unsubscribe = bridgeCallbacks.onResponse(bridgeRequestId, response => {
            unsubscribe();
            const allow = response.behavior === 'allow';
            // Resolve ALL pending requests for the same host, not just
            // this one — mirrors the local dialog handler pattern.
            setSandboxPermissionRequestQueue(queue => {
              queue.filter(item => item.hostPattern.host === hostPattern.host).forEach(item => item.resolvePromise(allow));
              return queue.filter(item => item.hostPattern.host !== hostPattern.host);
            });
            // Clean up all sibling bridge subscriptions for this host
            // (other concurrent same-host requests) before deleting.
            const siblingCleanups = sandboxBridgeCleanupRef.current.get(hostPattern.host);
            if (siblingCleanups) {
              for (const fn of siblingCleanups) {
                fn();
              }
              sandboxBridgeCleanupRef.current.delete(hostPattern.host);
            }
          });

          // Register cleanup so the local dialog handler can cancel
          // the remote prompt and unsubscribe when the local user
          // responds first.
          const cleanup = () => {
            unsubscribe();
            bridgeCallbacks.cancelRequest(bridgeRequestId);
          };
          const existing = sandboxBridgeCleanupRef.current.get(hostPattern.host) ?? [];
          existing.push(cleanup);
          sandboxBridgeCleanupRef.current.set(hostPattern.host, existing);
        }
      }
    });
  }, [setAppState, store]);

  // #34044: if user explicitly set sandbox.enabled=true but deps are missing,
  // isSandboxingEnabled() returns false silently. Surface the reason once at
  // mount so users know their security config isn't being enforced. Full
  // reason goes to debug log; notification points to /sandbox for details.
  // addNotification is stable (useCallback) so the effect fires once.
  useEffect(() => {
    const reason = SandboxManager.getSandboxUnavailableReason();
    if (!reason) return;
    if (SandboxManager.isSandboxRequired()) {
      process.stderr.write(`\nError: sandbox required but unavailable: ${reason}\n` + `  sandbox.failIfUnavailable is set — refusing to start without a working sandbox.\n\n`);
      gracefulShutdownSync(1, 'other');
      return;
    }
    logForDebugging(`沙盒已禁用: ${reason}`, {
      level: 'warn'
    });
    addNotification({
      key: 'sandbox-unavailable',
      jsx: <>
          <Text color="warning">沙盒已禁用</Text>
          <Text dimColor> · /sandbox</Text>
        </>,
      priority: 'medium'
    });
  }, [addNotification]);
  if (SandboxManager.isSandboxingEnabled()) {
    // If sandboxing is enabled (setting.sandbox is defined, initialise the manager)
    SandboxManager.initialize(sandboxAskCallback).catch(err => {
      // Initialization/validation failed - display error and exit
      process.stderr.write(`\n❌ Sandbox Error: ${errorMessage(err)}\n`);
      gracefulShutdownSync(1, 'other');
    });
  }
  const setToolPermissionContext = useCallback((context: ToolPermissionContext, options?: {
    preserveMode?: boolean;
  }) => {
    setAppState(prev => ({
      ...prev,
      toolPermissionContext: {
        ...context,
        // Preserve the coordinator's mode only when explicitly requested.
        // Workers' getAppState() returns a transformed context with mode
        // 'acceptEdits' that must not leak into the coordinator's actual
        // state via permission-rule updates — those call sites pass
        // { preserveMode: true }. User-initiated mode changes (e.g.,
        // selecting "allow all edits") must NOT be overridden.
        mode: options?.preserveMode ? prev.toolPermissionContext.mode : context.mode
      }
    }));

    // When permission context changes, recheck all queued items
    // This handles the case where approving item1 with "don't ask again"
    // should auto-approve other queued items that now match the updated rules
    setImmediate(setToolUseConfirmQueue => {
      // Use setToolUseConfirmQueue callback to get current queue state
      // instead of capturing it in the closure, to avoid stale closure issues
      setToolUseConfirmQueue(currentQueue => {
        currentQueue.forEach(item => {
          void item.recheckPermission();
        });
        return currentQueue;
      });
    }, setToolUseConfirmQueue);
  }, [setAppState, setToolUseConfirmQueue]);

  // Register the leader's setToolPermissionContext for in-process teammates
  useEffect(() => {
    registerLeaderSetToolPermissionContext(setToolPermissionContext);
    return () => unregisterLeaderSetToolPermissionContext();
  }, [setToolPermissionContext]);
  const canUseTool = useCanUseTool(setToolUseConfirmQueue, setToolPermissionContext);
  const requestPrompt = useCallback((title: string, toolInputSummary?: string | null) => (request: PromptRequest): Promise<PromptResponse> => new Promise<PromptResponse>((resolve, reject) => {
    setPromptQueue(prev => [...prev, {
      request,
      title,
      toolInputSummary,
      resolve,
      reject
    }]);
  }), []);
  const getToolUseContext = useCallback((messages: MessageType[], newMessages: MessageType[], abortController: AbortController, mainLoopModel: string): ProcessUserInputContext => {
    // Read mutable values fresh from the store rather than closure-capturing
    // useAppState() snapshots. Same values today (closure is refreshed by the
    // render between turns); decouples freshness from React's render cycle for
    // a future headless conversation loop. Same pattern refreshTools() uses.
    const s = store.getState();

    // Compute tools fresh from store.getState() rather than the closure-
    // captured `tools`. useManageMCPConnections populates appState.mcp
    // async as servers connect — the store may have newer MCP state than
    // the closure captured at render time. Also doubles as refreshTools()
    // for mid-query tool list updates.
    const computeTools = () => {
      const state = store.getState();
      const assembled = assembleToolPool(state.toolPermissionContext, state.mcp.tools);
      const merged = mergeAndFilterTools(combinedInitialTools, assembled, state.toolPermissionContext.mode);
      if (!mainThreadAgentDefinition) return merged;
      return resolveAgentTools(mainThreadAgentDefinition, merged, false, true).resolvedTools;
    };
    return {
      abortController,
      options: {
        commands,
        tools: computeTools(),
        debug,
        verbose: s.verbose,
        mainLoopModel,
        thinkingConfig: s.thinkingEnabled !== false ? thinkingConfig : {
          type: 'disabled'
        },
        // Merge fresh from store rather than closing over useMergedClients'
        // memoized output. initialMcpClients is a prop (session-constant).
        mcpClients: mergeClients(initialMcpClients, s.mcp.clients),
        mcpResources: s.mcp.resources,
        ideInstallationStatus: ideInstallationStatus,
        isNonInteractiveSession: false,
        dynamicMcpConfig,
        theme,
        agentDefinitions: allowedAgentTypes ? {
          ...s.agentDefinitions,
          allowedAgentTypes
        } : s.agentDefinitions,
        customSystemPrompt,
        appendSystemPrompt,
        refreshTools: computeTools
      },
      getAppState: () => store.getState(),
      setAppState,
      messages,
      setMessages,
      updateFileHistoryState(updater: (prev: FileHistoryState) => FileHistoryState) {
        // Perf: skip the setState when the updater returns the same reference
        // (e.g. fileHistoryTrackEdit returns `state` when the file is already
        // tracked). Otherwise every no-op call would notify all store listeners.
        setAppState(prev => {
          const updated = updater(prev.fileHistory);
          if (updated === prev.fileHistory) return prev;
          return {
            ...prev,
            fileHistory: updated
          };
        });
      },
      updateAttributionState(updater: (prev: AttributionState) => AttributionState) {
        setAppState(prev => {
          const updated = updater(prev.attribution);
          if (updated === prev.attribution) return prev;
          return {
            ...prev,
            attribution: updated
          };
        });
      },
      openMessageSelector: () => {
        if (!disabled) {
          setIsMessageSelectorVisible(true);
        }
      },
      onChangeAPIKey: reverify,
      readFileState: readFileState.current,
      setToolJSX,
      addNotification,
      appendSystemMessage: msg => setMessages(prev => [...prev, msg]),
      sendOSNotification: opts => {
        void sendNotification(opts, terminal);
      },
      onChangeDynamicMcpConfig,
      onInstallIDEExtension: setIDEToInstallExtension,
      nestedMemoryAttachmentTriggers: new Set<string>(),
      loadedNestedMemoryPaths: loadedNestedMemoryPathsRef.current,
      dynamicSkillDirTriggers: new Set<string>(),
      discoveredSkillNames: discoveredSkillNamesRef.current,
      setResponseLength,
      pushApiMetricsEntry: "external" === 'ant' ? (ttftMs: number) => {
        const now = Date.now();
        const baseline = responseLengthRef.current;
        apiMetricsRef.current.push({
          ttftMs,
          firstTokenTime: now,
          lastTokenTime: now,
          responseLengthBaseline: baseline,
          endResponseLength: baseline
        });
      } : undefined,
      setStreamMode,
      onCompactProgress: event => {
        switch (event.type) {
          case 'hooks_start':
            setSpinnerColor('claudeBlue_FOR_SYSTEM_SPINNER');
            setSpinnerShimmerColor('claudeBlueShimmer_FOR_SYSTEM_SPINNER');
            setSpinnerMessage(event.hookType === 'pre_compact' ? 'Running PreCompact hooks\u2026' : event.hookType === 'post_compact' ? 'Running PostCompact hooks\u2026' : 'Running SessionStart hooks\u2026');
            break;
          case 'compact_start':
            setSpinnerMessage('正在压缩对话');
            break;
          case 'compact_end':
            setSpinnerMessage(null);
            setSpinnerColor(null);
            setSpinnerShimmerColor(null);
            break;
        }
      },
      setInProgressToolUseIDs,
      setHasInterruptibleToolInProgress: (v: boolean) => {
        hasInterruptibleToolInProgressRef.current = v;
      },
      resume,
      setConversationId,
      requestPrompt: feature('HOOK_PROMPTS') ? requestPrompt : undefined,
      contentReplacementState: contentReplacementStateRef.current
    };
  }, [commands, combinedInitialTools, mainThreadAgentDefinition, debug, initialMcpClients, ideInstallationStatus, dynamicMcpConfig, theme, allowedAgentTypes, store, setAppState, reverify, addNotification, setMessages, onChangeDynamicMcpConfig, resume, requestPrompt, disabled, customSystemPrompt, appendSystemPrompt, setConversationId]);

  // Session backgrounding (Ctrl+B to background/foreground)
  const handleBackgroundQuery = useCallback(() => {
    // Stop the foreground query so the background one takes over
    abortController?.abort('background');
    // Aborting subagents may produce task-completed notifications.
    // Clear task notifications so the queue processor doesn't immediately
    // start a new foreground query; forward them to the background session.
    const removedNotifications = removeByFilter(cmd => cmd.mode === 'task-notification');
    void (async () => {
      const toolUseContext = getToolUseContext(messagesRef.current, [], new AbortController(), mainLoopModel);
      const [defaultSystemPrompt, userContext, systemContext] = await Promise.all([getSystemPrompt(toolUseContext.options.tools, mainLoopModel, Array.from(toolPermissionContext.additionalWorkingDirectories.keys()), toolUseContext.options.mcpClients), getUserContext(), getSystemContext()]);
      const systemPrompt = buildEffectiveSystemPrompt({
        mainThreadAgentDefinition,
        toolUseContext,
        customSystemPrompt,
        defaultSystemPrompt,
        appendSystemPrompt
      });
      toolUseContext.renderedSystemPrompt = systemPrompt;
      const notificationAttachments = await getQueuedCommandAttachments(removedNotifications).catch(() => []);
      const notificationMessages = notificationAttachments.map(createAttachmentMessage);

      // Deduplicate: if the query loop already yielded a notification into
      // messagesRef before we removed it from the queue, skip duplicates.
      // We use prompt text for dedup because source_uuid is not set on
      // task-notification QueuedCommands (enqueuePendingNotification callers
      // don't pass uuid), so it would always be undefined.
      const existingPrompts = new Set<string>();
      for (const m of messagesRef.current) {
        if (m.type === 'attachment' && m.attachment.type === 'queued_command' && m.attachment.commandMode === 'task-notification' && typeof m.attachment.prompt === 'string') {
          existingPrompts.add(m.attachment.prompt);
        }
      }
      const uniqueNotifications = notificationMessages.filter(m => m.attachment.type === 'queued_command' && (typeof m.attachment.prompt !== 'string' || !existingPrompts.has(m.attachment.prompt)));
      startBackgroundSession({
        messages: [...messagesRef.current, ...uniqueNotifications],
        queryParams: {
          systemPrompt,
          userContext,
          systemContext,
          canUseTool,
          toolUseContext,
          querySource: getQuerySourceForREPL()
        },
        description: terminalTitle,
        setAppState,
        agentDefinition: mainThreadAgentDefinition
      });
    })();
  }, [abortController, mainLoopModel, toolPermissionContext, mainThreadAgentDefinition, getToolUseContext, customSystemPrompt, appendSystemPrompt, canUseTool, setAppState]);
  const {
    handleBackgroundSession
  } = useSessionBackgrounding({
    setMessages,
    setIsLoading: setIsExternalLoading,
    resetLoadingState,
    setAbortController,
    onBackgroundQuery: handleBackgroundQuery
  });
  const onQueryEvent = useCallback((event: Parameters<typeof handleMessageFromStream>[0]) => {
    handleMessageFromStream(event, newMessage => {
      if (isCompactBoundaryMessage(newMessage)) {
        // Fullscreen: keep pre-compact messages for scrollback. query.ts
        // slices at the boundary for API calls, Messages.tsx skips the
        // boundary filter in fullscreen, and useLogMessages treats this
        // as an incremental append (first uuid unchanged). Cap at one
        // compact-interval of scrollback — normalizeMessages/applyGrouping
        // are O(n) per render, so drop everything before the previous
        // boundary to keep n bounded across multi-day sessions.
        if (isFullscreenEnvEnabled()) {
          setMessages(old => [...getMessagesAfterCompactBoundary(old, {
            includeSnipped: true
          }), newMessage]);
        } else {
          setMessages(() => [newMessage]);
        }
        // Bump conversationId so Messages.tsx row keys change and
        // stale memoized rows remount with post-compact content.
        setConversationId(randomUUID());
        // Compaction succeeded — clear the context-blocked flag so ticks resume
        if (feature('PROACTIVE') || feature('KAIROS')) {
          proactiveModule?.setContextBlocked(false);
        }
      } else if (newMessage.type === 'progress' && isEphemeralToolProgress(newMessage.data.type)) {
        // Replace the previous ephemeral progress tick for the same tool
        // call instead of appending. Sleep/Bash emit a tick per second and
        // only the last one is rendered; appending blows up the messages
        // array (13k+ observed) and the transcript (120MB of sleep_progress
        // lines). useLogMessages tracks length, so same-length replacement
        // also skips the transcript write.
        // agent_progress / hook_progress / skill_progress are NOT ephemeral
        // — each carries distinct state the UI needs (e.g. subagent tool
        // history). Replacing those leaves the AgentTool UI stuck at
        // "Initializing…" because it renders the full progress trail.
        setMessages(oldMessages => {
          const last = oldMessages.at(-1);
          if (last?.type === 'progress' && last.parentToolUseID === newMessage.parentToolUseID && last.data.type === newMessage.data.type) {
            const copy = oldMessages.slice();
            copy[copy.length - 1] = newMessage;
            return copy;
          }
          return [...oldMessages, newMessage];
        });
      } else {
        setMessages(oldMessages => [...oldMessages, newMessage]);
      }
      // Block ticks on API errors to prevent tick → error → tick
      // runaway loops (e.g., auth failure, rate limit, blocking limit).
      // Cleared on compact boundary (above) or successful response (below).
      if (feature('PROACTIVE') || feature('KAIROS')) {
        if (newMessage.type === 'assistant' && 'isApiErrorMessage' in newMessage && newMessage.isApiErrorMessage) {
          proactiveModule?.setContextBlocked(true);
        } else if (newMessage.type === 'assistant') {
          proactiveModule?.setContextBlocked(false);
        }
      }
    }, newContent => {
      // setResponseLength handles updating both responseLengthRef (for
      // spinner animation) and apiMetricsRef (endResponseLength/lastTokenTime
      // for OTPS). No separate metrics update needed here.
      setResponseLength(length => length + newContent.length);
    }, setStreamMode, setStreamingToolUses, tombstonedMessage => {
      setMessages(oldMessages => oldMessages.filter(m => m !== tombstonedMessage));
      void removeTranscriptMessage(tombstonedMessage.uuid);
    }, setStreamingThinking, metrics => {
      const now = Date.now();
      const baseline = responseLengthRef.current;
      apiMetricsRef.current.push({
        ...metrics,
        firstTokenTime: now,
        lastTokenTime: now,
        responseLengthBaseline: baseline,
        endResponseLength: baseline
      });
    }, onStreamingText);
  }, [setMessages, setResponseLength, setStreamMode, setStreamingToolUses, setStreamingThinking, onStreamingText]);
  const onQueryImpl = useCallback(async (messagesIncludingNewMessages: MessageType[], newMessages: MessageType[], abortController: AbortController, shouldQuery: boolean, additionalAllowedTools: string[], mainLoopModelParam: string, effort?: EffortValue) => {
    // Prepare IDE integration for new prompt. Read mcpClients fresh from
    // store — useManageMCPConnections may have populated it since the
    // render that captured this closure (same pattern as computeTools).
    if (shouldQuery) {
      const freshClients = mergeClients(initialMcpClients, store.getState().mcp.clients);
      void diagnosticTracker.handleQueryStart(freshClients);
      const ideClient = getConnectedIdeClient(freshClients);
      if (ideClient) {
        void closeOpenDiffs(ideClient);
      }
    }

    // Mark onboarding as complete when any user message is sent to Claude
    void maybeMarkProjectOnboardingComplete();

    // Extract a session title from the first real user message. One-shot
    // via ref (was tengu_birch_mist experiment: first-message-only to save
    // Haiku calls). The ref replaces the old `messages.length <= 1` check,
    // which was broken by SessionStart hook messages (prepended via
    // useDeferredHookMessages) and attachment messages (appended by
    // processTextPrompt) — both pushed length past 1 on turn one, so the
    // title silently fell through to the "Claude Code" default.
    if (!titleDisabled && !sessionTitle && !agentTitle && !haikuTitleAttemptedRef.current) {
      const firstUserMessage = newMessages.find(m => m.type === 'user' && !m.isMeta);
      const text = firstUserMessage?.type === 'user' ? getContentText(firstUserMessage.message.content) : null;
      // Skip synthetic breadcrumbs — slash-command output, prompt-skill
      // expansions (/commit → <command-message>), local-command headers
      // (/help → <command-name>), and bash-mode (!cmd → <bash-input>).
      // None of these are the user's topic; wait for real prose.
      if (text && !text.startsWith(`<${LOCAL_COMMAND_STDOUT_TAG}>`) && !text.startsWith(`<${COMMAND_MESSAGE_TAG}>`) && !text.startsWith(`<${COMMAND_NAME_TAG}>`) && !text.startsWith(`<${BASH_INPUT_TAG}>`)) {
        haikuTitleAttemptedRef.current = true;
        void generateSessionTitle(text, new AbortController().signal).then(title => {
          if (title) setHaikuTitle(title);else haikuTitleAttemptedRef.current = false;
        }, () => {
          haikuTitleAttemptedRef.current = false;
        });
      }
    }

    // Apply slash-command-scoped allowedTools (from skill frontmatter) to the
    // store once per turn. This also covers the reset: the next non-skill turn
    // passes [] and clears it. Must run before the !shouldQuery gate: forked
    // commands (executeForkedSlashCommand) return shouldQuery=false, and
    // createGetAppStateWithAllowedTools in forkedAgent.ts reads this field, so
    // stale skill tools would otherwise leak into forked agent permissions.
    // Previously this write was hidden inside getToolUseContext's getAppState
    // (~85 calls/turn); hoisting it here makes getAppState a pure read and stops
    // ephemeral contexts (permission dialog, BackgroundTasksDialog) from
    // accidentally clearing it mid-turn.
    store.setState(prev => {
      const cur = prev.toolPermissionContext.alwaysAllowRules.command;
      if (cur === additionalAllowedTools || cur?.length === additionalAllowedTools.length && cur.every((v, i) => v === additionalAllowedTools[i])) {
        return prev;
      }
      return {
        ...prev,
        toolPermissionContext: {
          ...prev.toolPermissionContext,
          alwaysAllowRules: {
            ...prev.toolPermissionContext.alwaysAllowRules,
            command: additionalAllowedTools
          }
        }
      };
    });

    // The last message is an assistant message if the user input was a bash command,
    // or if the user input was an invalid slash command.
    if (!shouldQuery) {
      // Manual /compact sets messages directly (shouldQuery=false) bypassing
      // handleMessageFromStream. Clear context-blocked if a compact boundary
      // is present so proactive ticks resume after compaction.
      if (newMessages.some(isCompactBoundaryMessage)) {
        // Bump conversationId so Messages.tsx row keys change and
        // stale memoized rows remount with post-compact content.
        setConversationId(randomUUID());
        if (feature('PROACTIVE') || feature('KAIROS')) {
          proactiveModule?.setContextBlocked(false);
        }
      }
      resetLoadingState();
      setAbortController(null);
      return;
    }
    const toolUseContext = getToolUseContext(messagesIncludingNewMessages, newMessages, abortController, mainLoopModelParam);
    // getToolUseContext reads tools/mcpClients fresh from store.getState()
    // (via computeTools/mergeClients). Use those rather than the closure-
    // captured `tools`/`mcpClients` — useManageMCPConnections may have
    // flushed new MCP state between the render that captured this closure
    // and now. Turn 1 via processInitialMessage is the main beneficiary.
    const {
      tools: freshTools,
      mcpClients: freshMcpClients
    } = toolUseContext.options;

    // Scope the skill's effort override to this turn's context only —
    // wrapping getAppState keeps the override out of the global store so
    // background agents and UI subscribers (Spinner, LogoV2) never see it.
    if (effort !== undefined) {
      const previousGetAppState = toolUseContext.getAppState;
      toolUseContext.getAppState = () => ({
        ...previousGetAppState(),
        effortValue: effort
      });
    }
    queryCheckpoint('query_context_loading_start');
    const [,, defaultSystemPrompt, baseUserContext, systemContext] = await Promise.all([
    // IMPORTANT: do this after setMessages() above, to avoid UI jank
    checkAndDisableBypassPermissionsIfNeeded(toolPermissionContext, setAppState),
    // Gated on TRANSCRIPT_CLASSIFIER so GrowthBook kill switch runs wherever auto mode is built in
    feature('TRANSCRIPT_CLASSIFIER') ? checkAndDisableAutoModeIfNeeded(toolPermissionContext, setAppState, store.getState().fastMode) : undefined, getSystemPrompt(freshTools, mainLoopModelParam, Array.from(toolPermissionContext.additionalWorkingDirectories.keys()), freshMcpClients), getUserContext(), getSystemContext()]);
    const userContext = {
      ...baseUserContext,
      ...getCoordinatorUserContext(freshMcpClients, isScratchpadEnabled() ? getScratchpadDir() : undefined),
      ...((feature('PROACTIVE') || feature('KAIROS')) && proactiveModule?.isProactiveActive() && !terminalFocusRef.current ? {
        terminalFocus: 'The terminal is unfocused \u2014 the user is not actively watching.'
      } : {})
    };
    queryCheckpoint('query_context_loading_end');
    const systemPrompt = buildEffectiveSystemPrompt({
      mainThreadAgentDefinition,
      toolUseContext,
      customSystemPrompt,
      defaultSystemPrompt,
      appendSystemPrompt
    });
    toolUseContext.renderedSystemPrompt = systemPrompt;
    queryCheckpoint('query_query_start');
    resetTurnHookDuration();
    resetTurnToolDuration();
    resetTurnClassifierDuration();
    for await (const event of query({
      messages: messagesIncludingNewMessages,
      systemPrompt,
      userContext,
      systemContext,
      canUseTool,
      toolUseContext,
	  includePartialMessages: true,
      querySource: getQuerySourceForREPL()
    })) {
      onQueryEvent(event);
    }
    if (true) {
      void fireCompanionObserver(messagesRef.current, reaction => setAppState(prev => prev.companionReaction === reaction ? prev : {
        ...prev,
        companionReaction: reaction
      }));
    }
    queryCheckpoint('query_end');

    // Capture ant-only API metrics before resetLoadingState clears the ref.
    // For multi-request turns (tool use loops), compute P50 across all requests.
    if ("external" === 'ant' && apiMetricsRef.current.length > 0) {
      const entries = apiMetricsRef.current;
      const ttfts = entries.map(e => e.ttftMs);
      // Compute per-request OTPS using only active streaming time and
      // streaming-only content. endResponseLength tracks content added by
      // streaming deltas only, excluding subagent/compaction inflation.
      const otpsValues = entries.map(e => {
        const delta = Math.round((e.endResponseLength - e.responseLengthBaseline) / 4);
        const samplingMs = e.lastTokenTime - e.firstTokenTime;
        return samplingMs > 0 ? Math.round(delta / (samplingMs / 1000)) : 0;
      });
      const isMultiRequest = entries.length > 1;
      const hookMs = getTurnHookDurationMs();
      const hookCount = getTurnHookCount();
      const toolMs = getTurnToolDurationMs();
      const toolCount = getTurnToolCount();
      const classifierMs = getTurnClassifierDurationMs();
      const classifierCount = getTurnClassifierCount();
      const turnMs = Date.now() - loadingStartTimeRef.current;
      setMessages(prev => [...prev, createApiMetricsMessage({
        ttftMs: isMultiRequest ? median(ttfts) : ttfts[0]!,
        otps: isMultiRequest ? median(otpsValues) : otpsValues[0]!,
        isP50: isMultiRequest,
        hookDurationMs: hookMs > 0 ? hookMs : undefined,
        hookCount: hookCount > 0 ? hookCount : undefined,
        turnDurationMs: turnMs > 0 ? turnMs : undefined,
        toolDurationMs: toolMs > 0 ? toolMs : undefined,
        toolCount: toolCount > 0 ? toolCount : undefined,
        classifierDurationMs: classifierMs > 0 ? classifierMs : undefined,
        classifierCount: classifierCount > 0 ? classifierCount : undefined,
        configWriteCount: getGlobalConfigWriteCount()
      })]);
    }
    resetLoadingState();

    // Log query profiling report if enabled
    logQueryProfileReport();

    // Signal that a query turn has completed successfully
    await onTurnComplete?.(messagesRef.current);
  }, [initialMcpClients, resetLoadingState, getToolUseContext, toolPermissionContext, setAppState, customSystemPrompt, onTurnComplete, appendSystemPrompt, canUseTool, mainThreadAgentDefinition, onQueryEvent, sessionTitle, titleDisabled]);
  const onQuery = useCallback(async (newMessages: MessageType[], abortController: AbortController, shouldQuery: boolean, additionalAllowedTools: string[], mainLoopModelParam: string, onBeforeQueryCallback?: (input: string, newMessages: MessageType[]) => Promise<boolean>, input?: string, effort?: EffortValue): Promise<void> => {
    // If this is a teammate, mark them as active when starting a turn
    if (isAgentSwarmsEnabled()) {
      const teamName = getTeamName();
      const agentName = getAgentName();
      if (teamName && agentName) {
        // Fire and forget - turn starts immediately, write happens in background
        void setMemberActive(teamName, agentName, true);
      }
    }

    // Concurrent guard via state machine. tryStart() atomically checks
    // and transitions idle→running, returning the generation number.
    // Returns null if already running — no separate check-then-set.
    const thisGeneration = queryGuard.tryStart();
    if (thisGeneration === null) {
      logEvent('tengu_concurrent_onquery_detected', {});

      // Extract and enqueue user message text, skipping meta messages
      // (e.g. expanded skill content, tick prompts) that should not be
      // replayed as user-visible text.
      newMessages.filter((m): m is UserMessage => m.type === 'user' && !m.isMeta).map(_ => getContentText(_.message.content)).filter(_ => _ !== null).forEach((msg, i) => {
        enqueue({
          value: msg,
          mode: 'prompt'
        });
        if (i === 0) {
          logEvent('tengu_concurrent_onquery_enqueued', {});
        }
      });
      return;
    }
    try {
      // isLoading is derived from queryGuard — tryStart() above already
      // transitioned dispatching→running, so no setter call needed here.
      resetTimingRefs();
      setMessages(oldMessages => [...oldMessages, ...newMessages]);
      responseLengthRef.current = 0;
      if (feature('TOKEN_BUDGET')) {
        const parsedBudget = input ? parseTokenBudget(input) : null;
        snapshotOutputTokensForTurn(parsedBudget ?? getCurrentTurnTokenBudget());
      }
      apiMetricsRef.current = [];
      setStreamingToolUses([]);
      setStreamingText(null);

      // messagesRef is updated synchronously by the setMessages wrapper
      // above, so it already includes newMessages from the append at the
      // top of this try block.  No reconstruction needed, no waiting for
      // React's scheduler (previously cost 20-56ms per prompt; the 56ms
      // case was a GC pause caught during the await).
      const latestMessages = messagesRef.current;
      if (input) {
        await mrOnBeforeQuery(input, latestMessages, newMessages.length);
      }

      // Pass full conversation history to callback
      if (onBeforeQueryCallback && input) {
        const shouldProceed = await onBeforeQueryCallback(input, latestMessages);
        if (!shouldProceed) {
          return;
        }
      }
      await onQueryImpl(latestMessages, newMessages, abortController, shouldQuery, additionalAllowedTools, mainLoopModelParam, effort);
    } finally {
      // queryGuard.end() atomically checks generation and transitions
      // running→idle. Returns false if a newer query owns the guard
      // (cancel+resubmit race where the stale finally fires as a microtask).
      if (queryGuard.end(thisGeneration)) {
        setLastQueryCompletionTime(Date.now());
        skipIdleCheckRef.current = false;
        // Always reset loading state in finally - this ensures cleanup even
        // if onQueryImpl throws. onTurnComplete is called separately in
        // onQueryImpl only on successful completion.
        resetLoadingState();
        await mrOnTurnComplete(messagesRef.current, abortController.signal.aborted);

        // Notify bridge clients that the turn is complete so mobile apps
        // can stop the spark animation and show post-turn UI.
        sendBridgeResultRef.current();

        // Auto-hide tungsten panel content at turn end (ant-only), but keep
        // tungstenActiveSession set so the pill stays in the footer and the user
        // can reopen the panel. Background tmux tasks (e.g. /hunter) run for
        // minutes — wiping the session made the pill disappear entirely, forcing
        // the user to re-invoke Tmux just to peek. Skip on abort so the panel
        // stays open for inspection (matches the turn-duration guard below).
        if ("external" === 'ant' && !abortController.signal.aborted) {
          setAppState(prev => {
            if (prev.tungstenActiveSession === undefined) return prev;
            if (prev.tungstenPanelAutoHidden === true) return prev;
            return {
              ...prev,
              tungstenPanelAutoHidden: true
            };
          });
        }

        // Capture budget info before clearing (ant-only)
        let budgetInfo: {
          tokens: number;
          limit: number;
          nudges: number;
        } | undefined;
        if (feature('TOKEN_BUDGET')) {
          if (getCurrentTurnTokenBudget() !== null && getCurrentTurnTokenBudget()! > 0 && !abortController.signal.aborted) {
            budgetInfo = {
              tokens: getTurnOutputTokens(),
              limit: getCurrentTurnTokenBudget()!,
              nudges: getBudgetContinuationCount()
            };
          }
          snapshotOutputTokensForTurn(null);
        }

        // Add turn duration message for turns longer than 30s or with a budget
        // Skip if user aborted or if in loop mode (too noisy between ticks)
        // Defer if swarm teammates are still running (show when they finish)
        const turnDurationMs = Date.now() - loadingStartTimeRef.current - totalPausedMsRef.current;
        if ((turnDurationMs > 30000 || budgetInfo !== undefined) && !abortController.signal.aborted && !proactiveActive) {
          const hasRunningSwarmAgents = getAllInProcessTeammateTasks(store.getState().tasks).some(t => t.status === 'running');
          if (hasRunningSwarmAgents) {
            // Only record start time on the first deferred turn
            if (swarmStartTimeRef.current === null) {
              swarmStartTimeRef.current = loadingStartTimeRef.current;
            }
            // Always update budget — later turns may carry the actual budget
            if (budgetInfo) {
              swarmBudgetInfoRef.current = budgetInfo;
            }
          } else {
            setMessages(prev => [...prev, createTurnDurationMessage(turnDurationMs, budgetInfo, count(prev, isLoggableMessage))]);
          }
        }
        // Clear the controller so CancelRequestHandler's canCancelRunningTask
        // reads false at the idle prompt. Without this, the stale non-aborted
        // controller makes ctrl+c fire onCancel() (aborting nothing) instead of
        // propagating to the double-press exit flow.
        setAbortController(null);
      }

      // Auto-restore: if the user interrupted before any meaningful response
      // arrived, rewind the conversation and restore their prompt — same as
      // opening the message selector and picking the last message.
      // This runs OUTSIDE the queryGuard.end() check because onCancel calls
      // forceEnd(), which bumps the generation so end() returns false above.
      // Guards: reason === 'user-cancel' (onCancel/Esc; programmatic aborts
      // use 'background'/'interrupt' and must not rewind — note abort() with
      // no args sets reason to a DOMException, not undefined), !isActive (no
      // newer query started — cancel+resubmit race), empty input (don't
      // clobber text typed during loading), no queued commands (user queued
      // B while A was loading → they've moved on, don't restore A; also
      // avoids removeLastFromHistory removing B's entry instead of A's),
      // not viewing a teammate (messagesRef is the main conversation — the
      // old Up-arrow quick-restore had this guard, preserve it).
      if (abortController.signal.reason === 'user-cancel' && !queryGuard.isActive && inputValueRef.current === '' && getCommandQueueLength() === 0 && !store.getState().viewingAgentTaskId) {
        const msgs = messagesRef.current;
        const lastUserMsg = msgs.findLast(selectableUserMessagesFilter);
        if (lastUserMsg) {
          const idx = msgs.lastIndexOf(lastUserMsg);
          if (messagesAfterAreOnlySynthetic(msgs, idx)) {
            // The submit is being undone — undo its history entry too,
            // otherwise Up-arrow shows the restored text twice.
            removeLastFromHistory();
            restoreMessageSyncRef.current(lastUserMsg);
          }
        }
      }
    }
  }, [onQueryImpl, setAppState, resetLoadingState, queryGuard, mrOnBeforeQuery, mrOnTurnComplete]);

  // Handle initial message (from CLI args or plan mode exit with context clear)
  // This effect runs when isLoading becomes false and there's a pending message
  const initialMessageRef = useRef(false);
  useEffect(() => {
    const pending = initialMessage;
    if (!pending || isLoading || initialMessageRef.current) return;

    // Mark as processing to prevent re-entry
    initialMessageRef.current = true;
    async function processInitialMessage(initialMsg: NonNullable<typeof pending>) {
      // Clear context if requested (plan mode exit)
      if (initialMsg.clearContext) {
        // Preserve the plan slug before clearing context, so the new session
        // can access the same plan file after regenerateSessionId()
        const oldPlanSlug = initialMsg.message.planContent ? getPlanSlug() : undefined;
        const {
          clearConversation
        } = await import('../commands/clear/conversation.js');
        await clearConversation({
          setMessages,
          readFileState: readFileState.current,
          discoveredSkillNames: discoveredSkillNamesRef.current,
          loadedNestedMemoryPaths: loadedNestedMemoryPathsRef.current,
          getAppState: () => store.getState(),
          setAppState,
          setConversationId
        });
        haikuTitleAttemptedRef.current = false;
        setHaikuTitle(undefined);
        bashTools.current.clear();
        bashToolsProcessedIdx.current = 0;

        // Restore the plan slug for the new session so getPlan() finds the file
        if (oldPlanSlug) {
          setPlanSlug(getSessionId(), oldPlanSlug);
        }
      }

      // Atomically: clear initial message, set permission mode and rules, and store plan for verification
      const shouldStorePlanForVerification = initialMsg.message.planContent && "external" === 'ant' && isEnvTruthy(undefined);
      setAppState(prev => {
        // Build and apply permission updates (mode + allowedPrompts rules)
        let updatedToolPermissionContext = initialMsg.mode ? applyPermissionUpdates(prev.toolPermissionContext, buildPermissionUpdates(initialMsg.mode, initialMsg.allowedPrompts)) : prev.toolPermissionContext;
        // For auto, override the mode (buildPermissionUpdates maps
        // it to 'default' via toExternalPermissionMode) and strip dangerous rules
        if (feature('TRANSCRIPT_CLASSIFIER') && initialMsg.mode === 'auto') {
          updatedToolPermissionContext = stripDangerousPermissionsForAutoMode({
            ...updatedToolPermissionContext,
            mode: 'auto',
            prePlanMode: undefined
          });
        }
        return {
          ...prev,
          initialMessage: null,
          toolPermissionContext: updatedToolPermissionContext,
          ...(shouldStorePlanForVerification && {
            pendingPlanVerification: {
              plan: initialMsg.message.planContent!,
              verificationStarted: false,
              verificationCompleted: false
            }
          })
        };
      });

      // Create file history snapshot for code rewind
      if (fileHistoryEnabled()) {
        void fileHistoryMakeSnapshot((updater: (prev: FileHistoryState) => FileHistoryState) => {
          setAppState(prev => ({
            ...prev,
            fileHistory: updater(prev.fileHistory)
          }));
        }, initialMsg.message.uuid);
      }

      // Ensure SessionStart hook context is available before the first API
      // call. onSubmit calls this internally but the onQuery path below
      // bypasses onSubmit — hoist here so both paths see hook messages.
      await awaitPendingHooks();

      // Route all initial prompts through onSubmit to ensure UserPromptSubmit hooks fire
      // TODO: Simplify by always routing through onSubmit once it supports
      // ContentBlockParam arrays (images) as input
      const content = initialMsg.message.message.content;

      // Route all string content through onSubmit to ensure hooks fire
      // For complex content (images, etc.), fall back to direct onQuery
      // Plan messages bypass onSubmit to preserve planContent metadata for rendering
      if (typeof content === 'string' && !initialMsg.message.planContent) {
        // Route through onSubmit for proper processing including UserPromptSubmit hooks
        void onSubmit(content, {
          setCursorOffset: () => {},
          clearBuffer: () => {},
          resetHistory: () => {}
        });
      } else {
        // Plan messages or complex content (images, etc.) - send directly to model
        // Plan messages use onQuery to preserve planContent metadata for rendering
        // TODO: Once onSubmit supports ContentBlockParam arrays, remove this branch
        const newAbortController = createAbortController();
        setAbortController(newAbortController);
        void onQuery([initialMsg.message], newAbortController, true,
        // shouldQuery
        [],
        // additionalAllowedTools
        mainLoopModel);
      }

      // Reset ref after a delay to allow new initial messages
      setTimeout(ref => {
        ref.current = false;
      }, 100, initialMessageRef);
    }
    void processInitialMessage(pending);
  }, [initialMessage, isLoading, setMessages, setAppState, onQuery, mainLoopModel, tools]);
  const onSubmit = useCallback(async (input: string, helpers: PromptInputHelpers, speculationAccept?: {
    state: ActiveSpeculationState;
    speculationSessionTimeSavedMs: number;
    setAppState: SetAppState;
  }, options?: {
    fromKeybinding?: boolean;
  }) => {
    // Re-pin scroll to bottom on submit so the user always sees the new
    // exchange (matches OpenCode's auto-scroll behavior).
    repinScroll();

    // Resume loop mode if paused
    if (feature('PROACTIVE') || feature('KAIROS')) {
      proactiveModule?.resumeProactive();
    }

    // Handle immediate commands - these bypass the queue and execute right away
    // even while Claude is processing. Commands opt-in via `immediate: true`.
    // Commands triggered via keybindings are always treated as immediate.
    if (!speculationAccept && input.trim().startsWith('/')) {
      // Expand [Pasted text #N] refs so immediate commands (e.g. /btw) receive
      // the pasted content, not the placeholder. The non-immediate path gets
      // this expansion later in handlePromptSubmit.
      const trimmedInput = expandPastedTextRefs(input, pastedContents).trim();
      const spaceIndex = trimmedInput.indexOf(' ');
      const commandName = spaceIndex === -1 ? trimmedInput.slice(1) : trimmedInput.slice(1, spaceIndex);
      const commandArgs = spaceIndex === -1 ? '' : trimmedInput.slice(spaceIndex + 1).trim();

      // Find matching command - treat as immediate if:
      // 1. Command has `immediate: true`, OR
      // 2. Command was triggered via keybinding (fromKeybinding option)
      const matchingCommand = commands.find(cmd => isCommandEnabled(cmd) && (cmd.name === commandName || cmd.aliases?.includes(commandName) || getCommandName(cmd) === commandName));
      if (matchingCommand?.name === 'clear' && idleHintShownRef.current) {
        logEvent('tengu_idle_return_action', {
          action: 'hint_converted' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          variant: idleHintShownRef.current as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          idleMinutes: Math.round((Date.now() - lastQueryCompletionTimeRef.current) / 60_000),
          messageCount: messagesRef.current.length,
          totalInputTokens: getTotalInputTokens()
        });
        idleHintShownRef.current = false;
      }
      const shouldTreatAsImmediate = queryGuard.isActive && (matchingCommand?.immediate || options?.fromKeybinding);
      if (matchingCommand && shouldTreatAsImmediate && matchingCommand.type === 'local-jsx') {
        // Only clear input if the submitted text matches what's in the prompt.
        // When a command keybinding fires, input is "/<command>" but the actual
        // input value is the user's existing text - don't clear it in that case.
        if (input.trim() === inputValueRef.current.trim()) {
          setInputValue('');
          helpers.setCursorOffset(0);
          helpers.clearBuffer();
          setPastedContents({});
        }
        const pastedTextRefs = parseReferences(input).filter(r => pastedContents[r.id]?.type === 'text');
        const pastedTextCount = pastedTextRefs.length;
        const pastedTextBytes = pastedTextRefs.reduce((sum, r) => sum + (pastedContents[r.id]?.content.length ?? 0), 0);
        logEvent('tengu_paste_text', {
          pastedTextCount,
          pastedTextBytes
        });
        logEvent('tengu_immediate_command_executed', {
          commandName: matchingCommand.name as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
          fromKeybinding: options?.fromKeybinding ?? false
        });

        // Execute the command directly
        const executeImmediateCommand = async (): Promise<void> => {
          let doneWasCalled = false;
          const onDone = (result?: string, doneOptions?: {
            display?: CommandResultDisplay;
            metaMessages?: string[];
          }): void => {
            doneWasCalled = true;
            setToolJSX({
              jsx: null,
              shouldHidePromptInput: false,
              clearLocalJSX: true
            });
            const newMessages: MessageType[] = [];
            if (result && doneOptions?.display !== 'skip') {
              addNotification({
                key: `immediate-${matchingCommand.name}`,
                text: result,
                priority: 'immediate'
              });
              // In fullscreen the command just showed as a centered modal
              // pane — the notification above is enough feedback. Adding
              // "❯ /config" + "⎿ dismissed" to the transcript is clutter
              // (those messages are type:system subtype:local_command —
              // user-visible but NOT sent to the model, so skipping them
              // doesn't change model context). Outside fullscreen the
              // transcript entry stays so scrollback shows what ran.
              if (!isFullscreenEnvEnabled()) {
                newMessages.push(createCommandInputMessage(formatCommandInputTags(getCommandName(matchingCommand), commandArgs)), createCommandInputMessage(`<${LOCAL_COMMAND_STDOUT_TAG}>${escapeXml(result)}</${LOCAL_COMMAND_STDOUT_TAG}>`));
              }
            }
            // Inject meta messages (model-visible, user-hidden) into the transcript
            if (doneOptions?.metaMessages?.length) {
              newMessages.push(...doneOptions.metaMessages.map(content => createUserMessage({
                content,
                isMeta: true
              })));
            }
            if (newMessages.length) {
              setMessages(prev => [...prev, ...newMessages]);
            }
            // Restore stashed prompt after local-jsx command completes.
            // The normal stash restoration path (below) is skipped because
            // local-jsx commands return early from onSubmit.
            if (stashedPrompt !== undefined) {
              setInputValue(stashedPrompt.text);
              helpers.setCursorOffset(stashedPrompt.cursorOffset);
              setPastedContents(stashedPrompt.pastedContents);
              setStashedPrompt(undefined);
            }
          };

          // Build context for the command (reuses existing getToolUseContext).
          // Read messages via ref to keep onSubmit stable across message
          // updates — matches the pattern at L2384/L2400/L2662 and avoids
          // pinning stale REPL render scopes in downstream closures.
          const context = getToolUseContext(messagesRef.current, [], createAbortController(), mainLoopModel);
          const mod = await matchingCommand.load();
          const jsx = await mod.call(onDone, context, commandArgs);

          // Skip if onDone already fired — prevents stuck isLocalJSXCommand
          // (see processSlashCommand.tsx local-jsx case for full mechanism).
          if (jsx && !doneWasCalled) {
            // shouldHidePromptInput: false keeps Notifications mounted
            // so the onDone result isn't lost
            setToolJSX({
              jsx,
              shouldHidePromptInput: false,
              isLocalJSXCommand: true
            });
          }
        };
        void executeImmediateCommand();
        return; // Always return early - don't add to history or queue
      }
    }

    // Remote mode: skip empty input early before any state mutations
    if (activeRemote.isRemoteMode && !input.trim()) {
      return;
    }

    // Idle-return: prompt returning users to start fresh when the
    // conversation is large and the cache is cold. tengu_willow_mode
    // controls treatment: "dialog" (blocking), "hint" (notification), "off".
    {
      const willowMode = getFeatureValue_CACHED_MAY_BE_STALE('tengu_willow_mode', 'off');
      const idleThresholdMin = Number(process.env.CLAUDE_CODE_IDLE_THRESHOLD_MINUTES ?? 75);
      const tokenThreshold = Number(process.env.CLAUDE_CODE_IDLE_TOKEN_THRESHOLD ?? 100_000);
      if (willowMode !== 'off' && !getGlobalConfig().idleReturnDismissed && !skipIdleCheckRef.current && !speculationAccept && !input.trim().startsWith('/') && lastQueryCompletionTimeRef.current > 0 && getTotalInputTokens() >= tokenThreshold) {
        const idleMs = Date.now() - lastQueryCompletionTimeRef.current;
        const idleMinutes = idleMs / 60_000;
        if (idleMinutes >= idleThresholdMin && willowMode === 'dialog') {
          setIdleReturnPending({
            input,
            idleMinutes
          });
          setInputValue('');
          helpers.setCursorOffset(0);
          helpers.clearBuffer();
          return;
        }
      }
    }

    // Add to history for direct user submissions.
    // Queued command processing (executeQueuedInput) doesn't call onSubmit,
    // so notifications and already-queued user input won't be added to history here.
    // Skip history for keybinding-triggered commands (user didn't type the command).
    if (!options?.fromKeybinding) {
      addToHistory({
        display: speculationAccept ? input : prependModeCharacterToInput(input, inputMode),
        pastedContents: speculationAccept ? {} : pastedContents
      });
      // Add the just-submitted command to the front of the ghost-text
      // cache so it's suggested immediately (not after the 60s TTL).
      if (inputMode === 'bash') {
        prependToShellHistoryCache(input.trim());
      }
    }

    // Restore stash if present, but NOT for slash commands or when loading.
    // - Slash commands (especially interactive ones like /model, /context) hide
    //   the prompt and show a picker UI. Restoring the stash during a command would
    //   place the text in a hidden input, and the user would lose it by typing the
    //   next command. Instead, preserve the stash so it survives across command runs.
    // - When loading, the submitted input will be queued and handlePromptSubmit
    //   will clear the input field (onInputChange('')), which would clobber the
    //   restored stash. Defer restoration to after handlePromptSubmit (below).
    //   Remote mode is exempt: it sends via WebSocket and returns early without
    //   calling handlePromptSubmit, so there's no clobbering risk — restore eagerly.
    // In both deferred cases, the stash is restored after await handlePromptSubmit.
    const isSlashCommand = !speculationAccept && input.trim().startsWith('/');
    // Submit runs "now" (not queued) when not already loading, or when
    // accepting speculation, or in remote mode (which sends via WS and
    // returns early without calling handlePromptSubmit).
    const submitsNow = !isLoading || speculationAccept || activeRemote.isRemoteMode;
    if (stashedPrompt !== undefined && !isSlashCommand && submitsNow) {
      setInputValue(stashedPrompt.text);
      helpers.setCursorOffset(stashedPrompt.cursorOffset);
      setPastedContents(stashedPrompt.pastedContents);
      setStashedPrompt(undefined);
    } else if (submitsNow) {
      if (!options?.fromKeybinding) {
        // Clear input when not loading or accepting speculation.
        // Preserve input for keybinding-triggered commands.
        setInputValue('');
        helpers.setCursorOffset(0);
      }
      setPastedContents({});
    }
    if (submitsNow) {
      setInputMode('prompt');
      setIDESelection(undefined);
      setSubmitCount(_ => _ + 1);
      helpers.clearBuffer();
      tipPickedThisTurnRef.current = false;

      // Show the placeholder in the same React batch as setInputValue('').
      // Skip for slash/bash (they have their own echo), speculation and remote
      // mode (both setMessages directly with no gap to bridge).
      if (!isSlashCommand && inputMode === 'prompt' && !speculationAccept && !activeRemote.isRemoteMode) {
        setUserInputOnProcessing(input);
        // showSpinner includes userInputOnProcessing, so the spinner appears
        // on this render. Reset timing refs now (before queryGuard.reserve()
        // would) so elapsed time doesn't read as Date.now() - 0. The
        // isQueryActive transition above does the same reset — idempotent.
        resetTimingRefs();
      }

      // Increment prompt count for attribution tracking and save snapshot
      // The snapshot persists promptCount so it survives compaction
      if (feature('COMMIT_ATTRIBUTION')) {
        setAppState(prev => ({
          ...prev,
          attribution: incrementPromptCount(prev.attribution, snapshot => {
            void recordAttributionSnapshot(snapshot).catch(error => {
              logForDebugging(`归因: 保存快照失败: ${error}`);
            });
          })
        }));
      }
    }

    // 处理推测接受
    if (speculationAccept) {
      const {
        queryRequired
      } = await handleSpeculationAccept(speculationAccept.state, speculationAccept.speculationSessionTimeSavedMs, speculationAccept.setAppState, input, {
        setMessages,
        readFileState,
        cwd: getOriginalCwd()
      });
      if (queryRequired) {
        const newAbortController = createAbortController();
        setAbortController(newAbortController);
        void onQuery([], newAbortController, true, [], mainLoopModel);
      }
      return;
    }

    // 远程模式：通过 stream-json 发送输入，而不是本地查询。
    // 来自远程的权限请求被桥接到 toolUseConfirmQueue，并使用标准 PermissionRequest 组件渲染。
    //
    // 本地 jsx 斜杠命令（例如 /agents，/config）在此进程中渲染 UI — 没有远程等效项。让这些回退到 handlePromptSubmit，以便它们在本地执行。提示命令和纯文本发送到远程。
    if (activeRemote.isRemoteMode && !(isSlashCommand && commands.find(c => {
      const name = input.trim().slice(1).split(/\s/)[0];
      return isCommandEnabled(c) && (c.name === name || c.aliases?.includes(name!) || getCommandName(c) === name);
    })?.type === 'local-jsx')) {
      // 当有粘贴的附件（图像）时构建内容块
      const pastedValues = Object.values(pastedContents);
      const imageContents = pastedValues.filter(c => c.type === 'image');
      const imagePasteIds = imageContents.length > 0 ? imageContents.map(c => c.id) : undefined;
      let messageContent: string | ContentBlockParam[] = input.trim();
      let remoteContent: RemoteMessageContent = input.trim();
      if (pastedValues.length > 0) {
        const contentBlocks: ContentBlockParam[] = [];
        const remoteBlocks: Array<{
          type: string;
          [key: string]: unknown;
        }> = [];
        const trimmedInput = input.trim();
        if (trimmedInput) {
          contentBlocks.push({
            type: 'text',
            text: trimmedInput
          });
          remoteBlocks.push({
            type: 'text',
            text: trimmedInput
          });
        }
        for (const pasted of pastedValues) {
          if (pasted.type === 'image') {
            const source = {
              type: 'base64' as const,
              media_type: (pasted.mediaType ?? 'image/png') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: pasted.content
            };
            contentBlocks.push({
              type: 'image',
              source
            });
            remoteBlocks.push({
              type: 'image',
              source
            });
          } else {
            contentBlocks.push({
              type: 'text',
              text: pasted.content
            });
            remoteBlocks.push({
              type: 'text',
              text: pasted.content
            });
          }
        }
        messageContent = contentBlocks;
        remoteContent = remoteBlocks;
      }

      // 创建用户消息并添加到 UI
      // 注意：上面的早期返回已经处理了空输入
      const userMessage = createUserMessage({
        content: messageContent,
        imagePasteIds
      });
      setMessages(prev => [...prev, userMessage]);

      // 发送到远程会话
      await activeRemote.sendMessage(remoteContent, {
        uuid: userMessage.uuid
      });
      return;
    }

    // 确保在第一次 API 调用之前 SessionStart 钩子上下文可用。
    await awaitPendingHooks();
    await handlePromptSubmit({
      input,
      helpers,
      queryGuard,
      isExternalLoading,
      mode: inputMode,
      commands,
      onInputChange: setInputValue,
      setPastedContents,
      setToolJSX,
      getToolUseContext,
      messages: messagesRef.current,
      mainLoopModel,
      pastedContents,
      ideSelection,
      setUserInputOnProcessing,
      setAbortController,
      abortController,
      onQuery,
      setAppState,
      querySource: getQuerySourceForREPL(),
      onBeforeQuery,
      canUseTool,
      addNotification,
      setMessages,
      // 通过 ref 读取，以便 streamMode 可以从 onSubmit deps 中删除 —
      // handlePromptSubmit 仅将其用于调试日志 + 遥测事件。
      streamMode: streamModeRef.current,
      hasInterruptibleToolInProgress: hasInterruptibleToolInProgressRef.current
    });

    // 恢复上面延迟的隐藏。两种情况：
    // - 斜杠命令：handlePromptSubmit 等待完整的命令执行（包括交互式选择器）。现在恢复将隐藏放回可见输入中。
    // - 加载（排队）：handlePromptSubmit 排队 + 清除输入，然后快速返回。现在恢复在清除后将隐藏放回。
    if ((isSlashCommand || isLoading) && stashedPrompt !== undefined) {
      setInputValue(stashedPrompt.text);
      helpers.setCursorOffset(stashedPrompt.cursorOffset);
      setPastedContents(stashedPrompt.pastedContents);
      setStashedPrompt(undefined);
    }
  }, [queryGuard,
  // isLoading 在 !isLoading 检查中读取，用于输入清除和 submitCount 门控。它派生自 isQueryActive || isExternalLoading，因此将其包含在此处确保闭包捕获新鲜值。
  isLoading, isExternalLoading, inputMode, commands, setInputValue, setInputMode, setPastedContents, setSubmitCount, setIDESelection, setToolJSX, getToolUseContext,
  // 消息通过回调内部的 messagesRef.current 读取，以保持 onSubmit 在消息更新中稳定（参见 L2384/L2400/L2662）。
  // 没有这个，每次 setMessages 调用（每次响应约 30 次）都会重新创建 onSubmit，在下游闭包中固定 REPL 渲染作用域（1776B）+ 该渲染的消息数组版本（PromptInput，handleAutoRunIssue）。
  // 堆分析显示在 #20174/#20175 之后累积了约 9 个 REPL 作用域和约 15 个消息数组版本，都追溯到此依赖项。
  mainLoopModel, pastedContents, ideSelection, setUserInputOnProcessing, setAbortController, addNotification, onQuery, stashedPrompt, setStashedPrompt, setAppState, onBeforeQuery, canUseTool, remoteSession, setMessages, awaitPendingHooks, repinScroll]);

  // 当用户在查看队友的对话记录时提交输入的回调
  const onAgentSubmit = useCallback(async (input: string, task: InProcessTeammateTaskState | LocalAgentTaskState, helpers: PromptInputHelpers) => {
    if (isLocalAgentTask(task)) {
      appendMessageToLocalAgent(task.id, createUserMessage({
        content: input
      }), setAppState);
      if (task.status === 'running') {
        queuePendingMessage(task.id, input, setAppState);
      } else {
        void resumeAgentBackground({
          agentId: task.id,
          prompt: input,
          toolUseContext: getToolUseContext(messagesRef.current, [], new AbortController(), mainLoopModel),
          canUseTool
        }).catch(err => {
          logForDebugging(`恢复代理后台失败：${errorMessage(err)}`);
          addNotification({
            key: `resume-agent-failed-${task.id}`,
            jsx: <Text color="error">
                  恢复代理失败：{errorMessage(err)}
                </Text>,
            priority: 'low'
          });
        });
      }
    } else {
      injectUserMessageToTeammate(task.id, input, setAppState);
    }
    setInputValue('');
    helpers.setCursorOffset(0);
    helpers.clearBuffer();
  }, [setAppState, setInputValue, getToolUseContext, canUseTool, mainLoopModel, addNotification]);

  // 自动运行 /issue 或 /good-claude 的处理程序（在 onSubmit 之后定义）
  const handleAutoRunIssue = useCallback(() => {
    const command = autoRunIssueReason ? getAutoRunCommand(autoRunIssueReason) : '/issue';
    setAutoRunIssueReason(null); // 清除状态
    onSubmit(command, {
      setCursorOffset: () => {},
      clearBuffer: () => {},
      resetHistory: () => {}
    }).catch(err => {
      logForDebugging(`自动运行 ${command} 失败: ${errorMessage(err)}`);
    });
  }, [onSubmit, autoRunIssueReason]);
  const handleCancelAutoRunIssue = useCallback(() => {
    setAutoRunIssueReason(null);
  }, []);

  // 当用户在调查感谢屏幕上按 1 以分享详细信息时的处理程序
  const handleSurveyRequestFeedback = useCallback(() => {
    const command = "external" === 'ant' ? '/issue' : '/feedback';
    onSubmit(command, {
      setCursorOffset: () => {},
      clearBuffer: () => {},
      resetHistory: () => {}
    }).catch(err => {
      logForDebugging(`调查反馈请求失败：${err instanceof Error ? err.message : String(err)}`);
    });
  }, [onSubmit]);

  // onSubmit 是不稳定的（依赖项包括每次响应都变化的 `messages`）。
  // `handleOpenRateLimitOptions` 被传递到每个 MessageRow，每个 MessageRow fiber 在挂载时固定闭包（以及传递地整个 REPL 渲染作用域，约 1.8KB）。使用 ref 使此回调稳定，以便旧的 REPL 作用域可以被 GC — 在 1000 次响应的会话中节省约 35MB。
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;
  const handleOpenRateLimitOptions = useCallback(() => {
    void onSubmitRef.current('/rate-limit-options', {
      setCursorOffset: () => {},
      clearBuffer: () => {},
      resetHistory: () => {}
    });
  }, []);
  const handleExit = useCallback(async () => {
    setIsExiting(true);
    // 在后台会话中，总是分离而不是杀死 — 即使工作树处于活动状态也是如此。
    // 没有这个守卫，下面的工作树分支会在 exit.tsx 加载之前短路进入 ExitFlow（调用 gracefulShutdown）。
    if (feature('BG_SESSIONS') && isBgSession()) {
      spawnSync('tmux', ['detach-client'], {
        stdio: 'ignore'
      });
      setIsExiting(false);
      return;
    }
    const showWorktree = getCurrentWorktreeSession() !== null;
    if (showWorktree) {
      setExitFlow(<ExitFlow showWorktree onDone={() => {}} onCancel={() => {
        setExitFlow(null);
        setIsExiting(false);
      }} />);
      return;
    }
    const exitMod = await exit.load();
    const exitFlowResult = await exitMod.call(() => {});
    setExitFlow(exitFlowResult);
    // 如果 call() 返回而没有杀死进程（后台会话分离），则清除 isExiting 以便在重新附加时 UI 可用。正常路径上无操作 — gracefulShutdown 的 process.exit() 意味着我们永远不会到达这里。
    if (exitFlowResult === null) {
      setIsExiting(false);
    }
  }, []);
  const handleShowMessageSelector = useCallback(() => {
    setIsMessageSelectorVisible(prev => !prev);
  }, []);

  // 将对话状态回滚到 `message` 之前：切片消息、重置会话 ID、微压缩状态、权限模式、提示建议。
  // 不触及提示输入。索引从 messagesRef 计算（始终通过 setMessages 包装器新鲜），因此调用者不必担心过时的闭包。
  const rewindConversationTo = useCallback((message: UserMessage) => {
    const prev = messagesRef.current;
    const messageIndex = prev.lastIndexOf(message);
    if (messageIndex === -1) return;
    logEvent('tengu_conversation_rewind', {
      preRewindMessageCount: prev.length,
      postRewindMessageCount: messageIndex,
      messagesRemoved: prev.length - messageIndex,
      rewindToMessageIndex: messageIndex
    });
    setMessages(prev.slice(0, messageIndex));
    // 注意，这必须在 setMessages 之后发生
    setConversationId(randomUUID());
    // 重置缓存的微压缩状态，以便过时的固定缓存编辑不会引用来自截断消息的 tool_use_ids
    resetMicrocompactState();
    if (feature('CONTEXT_COLLAPSE')) {
      // 回滚截断 REPL 数组。其存档跨度超出回滚点的提交不能再被投影（projectView 静默跳过它们），但是分阶段队列和 ID 映射引用过时的 uuid。最简单的安全重置：丢弃所有内容。ctx-agent 将在下一个阈值交叉时重新分阶段。
      /* eslint-disable @typescript-eslint/no-require-imports */
       
      ;
      (require('../services/contextCollapse/index.js') as typeof import('../services/contextCollapse/index.js')).resetContextCollapse();
       
    }

    // 从我们正在回滚到的消息恢复状态
    setAppState(prev => ({
      ...prev,
      // 从消息恢复权限模式
      toolPermissionContext: message.permissionMode && prev.toolPermissionContext.mode !== message.permissionMode ? {
        ...prev.toolPermissionContext,
        mode: message.permissionMode
      } : prev.toolPermissionContext,
      // 清除先前对话状态的过时提示建议
      promptSuggestion: {
        text: null,
        promptId: null,
        shownAt: 0,
        acceptedAt: 0,
        generationRequestId: null
      }
    }));
  }, [setMessages, setAppState]);

  // 同步回滚 + 输入填充。直接用于中断时自动恢复（以便 React 与中止的 setMessages 批处理 → 单次渲染，无闪烁）。MessageSelector 通过 handleRestoreMessage 将其包装在 setImmediate 中。
  const restoreMessageSync = useCallback((message: UserMessage) => {
    rewindConversationTo(message);
    const r = textForResubmit(message);
    if (r) {
      setInputValue(r.text);
      setInputMode(r.mode);
    }

    // 恢复粘贴的图像
    if (Array.isArray(message.message.content) && message.message.content.some(block => block.type === 'image')) {
      const imageBlocks: Array<ImageBlockParam> = message.message.content.filter(block => block.type === 'image');
      if (imageBlocks.length > 0) {
        const newPastedContents: Record<number, PastedContent> = {};
        imageBlocks.forEach((block, index) => {
          if (block.source.type === 'base64') {
            const id = message.imagePasteIds?.[index] ?? index + 1;
            newPastedContents[id] = {
              id,
              type: 'image',
              content: block.source.data,
              mediaType: block.source.media_type
            };
          }
        });
        setPastedContents(newPastedContents);
      }
    }
  }, [rewindConversationTo, setInputValue]);
  restoreMessageSyncRef.current = restoreMessageSync;

  // MessageSelector 路径：通过 setImmediate 延迟，以便“已中断”消息在回滚之前渲染为静态输出 — 否则它会作为残留物留在屏幕顶部。
  const handleRestoreMessage = useCallback(async (message: UserMessage) => {
    setImmediate((restore, message) => restore(message), restoreMessageSync, message);
  }, [restoreMessageSync]);

  // 不记忆 — 钩子通过 ref 存储上限，在分派时读取最新闭包。
  // 24 字符前缀：deriveUUID 保留前 24 个字符，可渲染的 uuid 前缀与原始源匹配。
  const findRawIndex = (uuid: string) => {
    const prefix = uuid.slice(0, 24);
    return messages.findIndex(m => m.uuid.slice(0, 24) === prefix);
  };
  const messageActionCaps: MessageActionCaps = {
    copy: text =>
    // setClipboard 返回 OSC 52 — 调用者必须 stdout.write（tmux 副作用 load-buffer，但那是 tmux 专用的）。
    void setClipboard(text).then(raw => {
      if (raw) process.stdout.write(raw);
      addNotification({
        // 与文本选择复制相同的键 — 重复复制替换提示，不排队。
        key: 'selection-copied',
        text: '已复制',
        color: 'success',
        priority: 'immediate',
        timeoutMs: 2000
      });
    }),
    edit: async msg => {
      // 与 /rewind 相同的跳过确认检查：无损 → 直接，否则确认对话框。
      const rawIdx = findRawIndex(msg.uuid);
      const raw = rawIdx >= 0 ? messages[rawIdx] : undefined;
      if (!raw || !selectableUserMessagesFilter(raw)) return;
      const noFileChanges = !(await fileHistoryHasAnyChanges(fileHistory, raw.uuid));
      const onlySynthetic = messagesAfterAreOnlySynthetic(messages, rawIdx);
      if (noFileChanges && onlySynthetic) {
        // rewindConversationTo 的 setMessages 与流追加竞争 — 首先取消（幂等）。
        onCancel();
        // handleRestoreMessage 也恢复粘贴的图像。
        void handleRestoreMessage(raw);
      } else {
        // 对话框路径：onPreRestore（= onCancel）在用户确认时触发，而不是在“算了”时触发。
        setMessageSelectorPreselect(raw);
        setIsMessageSelectorVisible(true);
      }
    }
  };
  const {
    enter: enterMessageActions,
    handlers: messageActionHandlers
  } = useMessageActions(cursor, setCursor, cursorNavRef, messageActionCaps);
  async function onInit() {
    try {
      // Always verify API key on startup, so we can show the user an error in the
      // bottom right corner of the screen if the API key is invalid.
      void reverify();

      // Populate readFileState with CLAUDE.md files at startup
      const memoryFiles = await getMemoryFiles();
      if (memoryFiles.length > 0) {
        const fileList = memoryFiles.map(f => `  [${f.type}] ${f.path} (${f.content.length} chars)${f.parent ? ` (included by ${f.parent})` : ''}`).join('\n');
        logForDebugging(`Loaded ${memoryFiles.length} CLAUDE.md/rules files:\n${fileList}`);
      } else {
        logForDebugging('未找到 CLAUDE.md/rules 文件');
      }
      for (const file of memoryFiles) {
      // 当注入的内容与磁盘不匹配时（剥离的 HTML 注释、剥离的前置数据、MEMORY.md 截断），缓存原始磁盘字节和 isPartialView，以便编辑/写入在嵌套内存去重仍然工作时需要真正的读取。
        readFileState.current.set(file.path, {
          content: file.contentDiffersFromDisk ? file.rawContent ?? file.content : file.content,
          timestamp: Date.now(),
          offset: undefined,
          limit: undefined,
          isPartialView: file.contentDiffersFromDisk
        });
      }

      // Initial message handling is done via the initialMessage effect
    } catch (error) {
      const initError = error instanceof Error ? error : new Error(String(error));
      logForDebugging(`[REPL:init] ${initError.stack ?? initError.message}`, {
        level: 'error'
      });
      logError(initError);
      addNotification({
        key: 'restored-repl-init-failed',
        jsx: <>
            <Text color="warning">startup degraded</Text>
            <Text dimColor> · REPL init failed, running in fallback mode</Text>
          </>,
        priority: 'high'
      });
    }
  }

  // 注册成本摘要跟踪器
  useCostSummary(useFpsMetrics());

  // 在本地记录对话记录，用于调试和对话恢复
  // 如果我们只有初始消息，则不记录对话；优化了用户恢复会话然后在不做任何其他事情之前退出的情况
  useLogMessages(messages, messages.length === initialMessages?.length);

  // REPL 桥接器：将用户/助手消息复制到桥接器会话，以便通过 claude.ai 进行远程访问。在外部构建中或未启用时无操作。
  const {
    sendBridgeResult
  } = useReplBridge(messages, setMessages, abortControllerRef, commands, mainLoopModel);
  sendBridgeResultRef.current = sendBridgeResult;
  useAfterFirstRender();

  // 跟踪提示队列使用情况以进行分析。每次从空到非空转换时触发一次，而不是每次长度变化时触发 — 否则渲染循环（并发 onQuery 抖动等）会大量调用 saveGlobalConfig，在并发会话下命中 ELOCKED，并回退到未锁定写入。
  // 该写入风暴是 ~/.claude.json 损坏（GH #3117）的主要触发因素。
  const hasCountedQueueUseRef = useRef(false);
  useEffect(() => {
    if (queuedCommands.length < 1) {
      hasCountedQueueUseRef.current = false;
      return;
    }
    if (hasCountedQueueUseRef.current) return;
    hasCountedQueueUseRef.current = true;
    saveGlobalConfig(current => ({
      ...current,
      promptQueueUseCount: (current.promptQueueUseCount ?? 0) + 1
    }));
  }, [queuedCommands.length]);

  // 当查询完成且队列有项目时处理排队命令

  const executeQueuedInput = useCallback(async (queuedCommands: QueuedCommand[]) => {
    await handlePromptSubmit({
      helpers: {
        setCursorOffset: () => {},
        clearBuffer: () => {},
        resetHistory: () => {}
      },
      queryGuard,
      commands,
      onInputChange: () => {},
      setPastedContents: () => {},
      setToolJSX,
      getToolUseContext,
      messages,
      mainLoopModel,
      ideSelection,
      setUserInputOnProcessing,
      setAbortController,
      onQuery,
      setAppState,
      querySource: getQuerySourceForREPL(),
      onBeforeQuery,
      canUseTool,
      addNotification,
      setMessages,
      queuedCommands
    });
  }, [queryGuard, commands, setToolJSX, getToolUseContext, messages, mainLoopModel, ideSelection, setUserInputOnProcessing, canUseTool, setAbortController, onQuery, addNotification, setAppState, onBeforeQuery]);
  useQueueProcessor({
    executeQueuedInput,
    hasActiveLocalJsxUI: isShowingLocalJSXCommand,
    queryGuard
  });

  // 我们将使用来自 state.ts 的全局 lastInteractionTime

  // 当输入更改时更新最后交互时间。
  // 必须是即时的，因为 useEffect 在 Ink 渲染周期刷新后运行。
  useEffect(() => {
    activityManager.recordUserActivity();
    updateLastInteractionTime(true);
  }, [inputValue, submitCount]);
  useEffect(() => {
    if (submitCount === 1) {
      startBackgroundHousekeeping();
    }
  }, [submitCount]);

  // 当 Claude 完成响应且用户空闲时显示通知
  useEffect(() => {
    // 如果 Claude 忙碌，不要设置通知
    if (isLoading) return;

    // 仅在此会话中第一次新交互后启用通知
    if (submitCount === 0) return;

    // 尚无查询完成
    if (lastQueryCompletionTime === 0) return;

    // 设置超时以检查空闲状态
    const timer = setTimeout((lastQueryCompletionTime, isLoading, toolJSX, focusedInputDialogRef, terminal) => {
      // 检查用户自响应结束后是否已交互
      const lastUserInteraction = getLastInteractionTime();
      if (lastUserInteraction > lastQueryCompletionTime) {
        // 用户自 Claude 完成后已交互 — 他们不空闲，不通知
        return;
      }

      // 用户自响应结束后未交互，检查其他条件
      const idleTimeSinceResponse = Date.now() - lastQueryCompletionTime;
      if (!isLoading && !toolJSX &&
      // 使用 ref 获取当前对话框状态，避免过时闭包
      focusedInputDialogRef.current === undefined && idleTimeSinceResponse >= getGlobalConfig().messageIdleNotifThresholdMs) {
        void sendNotification({
          message: 'Claude 正在等待您的输入',
          notificationType: 'idle_prompt'
        }, terminal);
      }
    }, getGlobalConfig().messageIdleNotifThresholdMs, lastQueryCompletionTime, isLoading, toolJSX, focusedInputDialogRef, terminal);
    return () => clearTimeout(timer);
  }, [isLoading, toolJSX, submitCount, lastQueryCompletionTime, terminal]);

  // 空闲返回提示：当超过空闲阈值时显示通知。
  // 计时器在配置的空闲时间后触发；通知持续存在，直到被忽略或用户提交。
  useEffect(() => {
    if (lastQueryCompletionTime === 0) return;
    if (isLoading) return;
    const willowMode: string = getFeatureValue_CACHED_MAY_BE_STALE('tengu_willow_mode', 'off');
    if (willowMode !== 'hint' && willowMode !== 'hint_v2') return;
    if (getGlobalConfig().idleReturnDismissed) return;
    const tokenThreshold = Number(process.env.CLAUDE_CODE_IDLE_TOKEN_THRESHOLD ?? 100_000);
    if (getTotalInputTokens() < tokenThreshold) return;
    const idleThresholdMs = Number(process.env.CLAUDE_CODE_IDLE_THRESHOLD_MINUTES ?? 75) * 60_000;
    const elapsed = Date.now() - lastQueryCompletionTime;
    const remaining = idleThresholdMs - elapsed;
    const timer = setTimeout((lqct, addNotif, msgsRef, mode, hintRef) => {
      if (msgsRef.current.length === 0) return;
      const totalTokens = getTotalInputTokens();
      const formattedTokens = formatTokens(totalTokens);
      const idleMinutes = (Date.now() - lqct) / 60_000;
      addNotif({
        key: 'idle-return-hint',
        jsx: mode === 'hint_v2' ? <>
                <Text dimColor>新任务？</Text>
                <Text color="suggestion">/clear</Text>
                <Text dimColor> 可节省 </Text>
                <Text color="suggestion">{formattedTokens} token</Text>
              </> : <Text color="warning">
                新任务？使用 /clear 可节省 {formattedTokens} token
              </Text>,
        priority: 'medium',
        // 持续到提交 — 提示在 T+75 分钟空闲时触发，用户可能直到数小时后才返回。removeNotification 在 useEffect 清理中处理忽略。0x7fffffff = setTimeout 最大值（约 24.8 天）。
        timeoutMs: 0x7fffffff
      });
      hintRef.current = mode;
      logEvent('tengu_idle_return_action', {
        action: 'hint_shown' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        variant: mode as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        idleMinutes: Math.round(idleMinutes),
        messageCount: msgsRef.current.length,
        totalInputTokens: totalTokens
      });
    }, Math.max(0, remaining), lastQueryCompletionTime, addNotification, messagesRef, willowMode, idleHintShownRef);
    return () => {
      clearTimeout(timer);
      removeNotification('idle-return-hint');
      idleHintShownRef.current = false;
    };
  }, [lastQueryCompletionTime, isLoading, addNotification, removeNotification]);

  // 提交来自队友消息或任务模式的传入提示，作为新的响应
  // 如果提交成功返回 true，如果查询已在运行返回 false
  const handleIncomingPrompt = useCallback((content: string, options?: {
    isMeta?: boolean;
  }): boolean => {
    if (queryGuard.isActive) return false;

    // 延迟到用户排队命令 — 用户输入总是优先于系统消息（队友消息、任务列表项等）
    // 在调用时从模块级存储读取（而不是渲染时快照）以避免过时闭包 — 此回调的依赖项不包括队列。
    if (getCommandQueue().some(cmd => cmd.mode === 'prompt' || cmd.mode === 'bash')) {
      return false;
    }
    const newAbortController = createAbortController();
    setAbortController(newAbortController);

    // 使用格式化的内容创建用户消息（包括 XML 包装器）
    const userMessage = createUserMessage({
      content,
      isMeta: options?.isMeta ? true : undefined
    });
    void onQuery([userMessage], newAbortController, true, [], mainLoopModel);
    return true;
  }, [onQuery, mainLoopModel, store]);

  // 语音输入集成（仅 VOICE_MODE 构建）
  const voice = feature('VOICE_MODE') ?
  // biome-ignore lint/correctness/useHookAtTopLevel: feature() 是编译时常量
  useVoiceIntegration({
    setInputValueRaw,
    inputValueRef,
    insertTextRef
  }) : {
    stripTrailing: () => 0,
    handleKeyEvent: () => {},
    resetAnchor: () => {},
    interimRange: null
  };
  useInboxPoller({
    enabled: isAgentSwarmsEnabled(),
    isLoading,
    focusedInputDialog,
    onSubmitMessage: handleIncomingPrompt
  });
  useMailboxBridge({
    isLoading,
    onSubmitMessage: handleIncomingPrompt
  });

  // Scheduled tasks from .claude/scheduled_tasks.json (CronCreate/Delete/List)
  if (feature('AGENT_TRIGGERS')) {
    // Assistant mode bypasses the isLoading gate (the proactive tick →
    // Sleep → tick loop would otherwise starve the scheduler).
    // kairosEnabled is set once in initialState (main.tsx) and never mutated — no
    // subscription needed. The tengu_kairos_cron runtime gate is checked inside
    // useScheduledTasks's effect (not here) since wrapping a hook call in a dynamic
    // condition would break rules-of-hooks.
    const assistantMode = store.getState().kairosEnabled;
    // biome-ignore lint/correctness/useHookAtTopLevel: feature() is a compile-time constant
    useScheduledTasks!({
      isLoading,
      assistantMode,
      setMessages
    });
  }

  // 注意：权限轮询现在由 useInboxPoller 处理
  // - 工作者通过邮箱消息接收权限响应
  // - 领导者通过邮箱消息接收权限请求

  if ("external" === 'ant') {
    // Tasks mode: watch for tasks and auto-process them
    // eslint-disable-next-line react-hooks/rules-of-hooks
    // biome-ignore lint/correctness/useHookAtTopLevel: 条件性用于外部构建中的死代码消除
    useTaskListWatcher({
      taskListId,
      isLoading,
      onSubmitTask: handleIncomingPrompt
    });

    // 循环模式：启用时自动滴答（通过 /job 命令）
    // eslint-disable-next-line react-hooks/rules-of-hooks
    // biome-ignore lint/correctness/useHookAtTopLevel: 条件性用于外部构建中的死代码消除
    useProactive?.({
      // 当初始消息待处理时抑制滴答 — 初始消息将异步处理，过早的滴答会与之竞争，导致展开的技能文本的并发查询排队。
      isLoading: isLoading || initialMessage !== null,
      queuedCommandsLength: queuedCommands.length,
      hasActiveLocalJsxUI: isShowingLocalJSXCommand,
      isInPlanMode: toolPermissionContext.mode === 'plan',
      onSubmitTick: (prompt: string) => handleIncomingPrompt(prompt, {
        isMeta: true
      }),
      onQueueTick: (prompt: string) => enqueue({
        mode: 'prompt',
        value: prompt,
        isMeta: true
      })
    });
  }

  // 当到达 'now' 优先级的消息（例如来自通过 UDS 的聊天 UI 客户端）时，中止当前操作。
  useEffect(() => {
    if (queuedCommands.some(cmd => cmd.priority === 'now')) {
      abortControllerRef.current?.abort('interrupt');
    }
  }, [queuedCommands]);

  // Initial load
  useEffect(() => {
    void onInit().catch(error => {
      const initError = error instanceof Error ? error : new Error(String(error));
      logForDebugging(`[REPL:init:unhandled] ${initError.stack ?? initError.message}`, {
        level: 'error'
      });
      logError(initError);
    });

    // 卸载时清理
    return () => {
      void diagnosticTracker.shutdown();
    };
    // TODO: 修复此问题
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 监听挂起/恢复事件
  const {
    internal_eventEmitter
  } = useStdin();
  const [remountKey, setRemountKey] = useState(0);
  useEffect(() => {
    const handleSuspend = () => {
      // 打印挂起说明
      process.stdout.write(`\nClaude Code 已挂起。运行 \`fg\` 可将 Claude Code 带回前台。\n注意：ctrl + z 现在挂起 Claude Code，ctrl + _ 撤销输入。\n`);
    };
    const handleResume = () => {
      // 强制完整组件树替换，而不是终端清除
      // Ink 现在在 SIGCONT 上内部处理行数重置
      setRemountKey(prev => prev + 1);
    };
    internal_eventEmitter?.on('suspend', handleSuspend);
    internal_eventEmitter?.on('resume', handleResume);
    return () => {
      internal_eventEmitter?.off('suspend', handleSuspend);
      internal_eventEmitter?.off('resume', handleResume);
    };
  }, [internal_eventEmitter]);

  // 从消息状态派生停止钩子微调器后缀
  const stopHookSpinnerSuffix = useMemo(() => {
    if (!isLoading) return null;

    // 查找停止钩子进度消息
    const progressMsgs = messages.filter((m): m is ProgressMessage<HookProgress> => m.type === 'progress' && (m.data as HookProgress).type === 'hook_progress' && ((m.data as HookProgress).hookEvent === 'Stop' || (m.data as HookProgress).hookEvent === 'SubagentStop'));
    if (progressMsgs.length === 0) return null;

    // 获取最近的停止钩子执行
    const currentToolUseID = progressMsgs.at(-1)?.toolUseID;
    if (!currentToolUseID) return null;

    // 检查此执行是否已有摘要消息（钩子已完成）
    const hasSummaryForCurrentExecution = messages.some(m => m.type === 'system' && m.subtype === 'stop_hook_summary' && m.toolUseID === currentToolUseID);
    if (hasSummaryForCurrentExecution) return null;
    const currentHooks = progressMsgs.filter(p => p.toolUseID === currentToolUseID);
    const total = currentHooks.length;

    // 计数已完成的钩子
    const completedCount = count(messages, m => {
      if (m.type !== 'attachment') return false;
      const attachment = m.attachment;
      return 'hookEvent' in attachment && (attachment.hookEvent === 'Stop' || attachment.hookEvent === 'SubagentStop') && 'toolUseID' in attachment && attachment.toolUseID === currentToolUseID;
    });

    // 检查是否有任何钩子具有自定义状态消息
    const customMessage = currentHooks.find(p => p.data.statusMessage)?.data.statusMessage;
    if (customMessage) {
      // 如果有多个钩子，使用带有进度计数器的自定义消息
      return total === 1 ? `${customMessage}…` : `${customMessage}… ${completedCount}/${total}`;
    }

    // 回退到默认行为
    const hookType = currentHooks[0]?.data.hookEvent === 'SubagentStop' ? '子代理停止' : '停止';
    if ("external" === 'ant') {
      const cmd = currentHooks[completedCount]?.data.command;
      const label = cmd ? ` '${truncateToWidth(cmd, 40)}'` : '';
      return total === 1 ? `正在运行 ${hookType} 钩子${label}` : `正在运行 ${hookType} 钩子${label}\u2026 ${completedCount}/${total}`;
    }
    return total === 1 ? `正在运行 ${hookType} 钩子` : `正在运行停止钩子… ${completedCount}/${total}`;
  }, [messages, isLoading]);

  // 进入对话记录模式时捕获冻结状态的回调
  const handleEnterTranscript = useCallback(() => {
    setFrozenTranscriptState({
      messagesLength: messages.length,
      streamingToolUsesLength: streamingToolUses.length
    });
  }, [messages.length, streamingToolUses.length]);

  // 退出对话记录模式时清除冻结状态的回调
  const handleExitTranscript = useCallback(() => {
    setFrozenTranscriptState(null);
  }, []);

  // GlobalKeybindingHandlers 组件的属性（在 KeybindingSetup 内渲染）
  const virtualScrollActive = isFullscreenEnvEnabled() && !disableVirtualScroll;

  // 对话记录搜索状态。钩子必须是无条件的，因此它们住在这里（不在下面的 `if (screen === 'transcript')` 分支中）；isActive 对 useInput 进行门控。查询在栏打开/关闭之间持续存在，因此 n/N 在 Enter 忽略栏后仍然有效（less 语义）。
  const jumpRef = useRef<JumpHandle | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCount, setSearchCount] = useState(0);
  const [searchCurrent, setSearchCurrent] = useState(0);
  const onSearchMatchesChange = useCallback((count: number, current: number) => {
    setSearchCount(count);
    setSearchCurrent(current);
  }, []);
  useInput((input, key, event) => {
    if (key.ctrl || key.meta) return;
    // 这里没有 Esc 处理 — less 没有导航模式。搜索状态（高亮，n/N）只是状态。Esc/q/ctrl+c → transcript:exit（无门控）。高亮在退出时通过屏幕更改效果清除。
    if (input === '/') {
      // 立即捕获 scrollTop — 输入是预览，0 匹配会跳回此处。同步 ref 写入，在栏的挂载效果调用 setSearchQuery 之前触发。
      jumpRef.current?.setAnchor();
      setSearchOpen(true);
      event.stopImmediatePropagation();
      return;
    }
    // 按住键批处理：分词器合并为 'nnn'。与 ScrollKeybindingHandler.tsx 中的 modalPagerAction 相同的统一批处理模式。每个重复是一个步骤（n 不像 g 那样是幂等的）。
    const c = input[0];
    if ((c === 'n' || c === 'N') && input === c.repeat(input.length) && searchCount > 0) {
      const fn = c === 'n' ? jumpRef.current?.nextMatch : jumpRef.current?.prevMatch;
      if (fn) for (let i = 0; i < input.length; i++) fn();
      event.stopImmediatePropagation();
    }
  },
  // 搜索需要虚拟滚动（jumpRef 驱动 VirtualMessageList）。[ 会杀死它，所以 !dumpMode — 在 [ 之后没有东西可跳转。
  {
    isActive: screen === 'transcript' && virtualScrollActive && !searchOpen && !dumpMode
  });
  const {
    setQuery: setHighlight,
    scanElement,
    setPositions
  } = useSearchHighlight();

  // 调整大小 → 中止搜索。位置是（msg，query，WIDTH）键控的 — 宽度更改后缓存位置过时（新布局，新换行）。清除 searchQuery 触发 VML 的 setSearchQuery('')，清除 positionsCache + setPositions(null)。栏关闭。用户再次点击 / → 一切新鲜。
  const transcriptCols = useTerminalSize().columns;
  const prevColsRef = React.useRef(transcriptCols);
  React.useEffect(() => {
    if (prevColsRef.current !== transcriptCols) {
      prevColsRef.current = transcriptCols;
      if (searchQuery || searchOpen) {
        setSearchOpen(false);
        setSearchQuery('');
        setSearchCount(0);
        setSearchCurrent(0);
        jumpRef.current?.disarmSearch();
        setHighlight('');
      }
    }
  }, [transcriptCols, searchQuery, searchOpen, setHighlight]);

  // 对话记录逃生舱口。模态上下文中的裸字母（没有竞争的提示输入）— 与 ScrollKeybindingHandler 中的 g/G/j/k 同类。
  useInput((input, key, event) => {
    if (key.ctrl || key.meta) {
      // Ctrl+E: toggle show all / fold messages in transcript mode.
      // This is a safety net in case the keybinding system's
      // transcript:toggleShowAll fails to fire (e.g., ChordInterceptor
      // or context mismatch swallows the event).
      if (key.ctrl && input === 'e') {
        setShowAllInTranscript(prev => !prev);
        event.stopImmediatePropagation();
      }
      return;
    }
    if (input === 'q') {
      // less：q 退出分页器。ctrl+o 切换；q 是世系退出。
      handleExitTranscript();
      event.stopImmediatePropagation();
      return;
    }
    if (input === '[' && !dumpMode) {
      // 强制转储到滚动缓冲区。也展开 + 取消上限 — 转储子集没有意义。终端/tmux cmd-F 现在可以找到任何东西。在此处守卫（不在 isActive 中），以便 v 在 [ 之后仍然工作 — 转储模式底部在 ~4898 行连接 editorStatus，确认 v 旨在保持活动。
      setDumpMode(true);
      setShowAllInTranscript(true);
      event.stopImmediatePropagation();
    } else if (input === 'v') {
      // less 风格：v 在 $VISUAL/$EDITOR 中打开文件。渲染完整的对话记录（与 /export 使用的相同路径），写入临时文件，交给编辑器。
      // openFileInExternalEditor 处理终端的 alt-screen 挂起/恢复；GUI 编辑器分离派生。
      event.stopImmediatePropagation();
      // 丢弃双击：渲染是异步的，在完成前第二次按下将运行第二个并行渲染（双倍内存，两个临时文件，两次编辑器派生）。editorGenRef 仅保护对话记录退出过时，而不是同会话并发。
      if (editorRenderingRef.current) return;
      editorRenderingRef.current = true;
      // 捕获代数 + 创建过时感知的设置器。每次写入检查代数（对话记录退出会递增它 → 来自异步渲染的后期写入静默）。
      const gen = editorGenRef.current;
      const setStatus = (s: string): void => {
        if (gen !== editorGenRef.current) return;
        clearTimeout(editorTimerRef.current);
        setEditorStatus(s);
      };
      setStatus(`渲染 ${deferredMessages.length} 条消息…`);
      void (async () => {
        try {
          // 宽度 = 终端减去 vim 的行号边距（4 位数字 + 空格 + 余量）。下限为 80。PassThrough 没有 .columns，因此没有这个 Ink 默认为 80。尾随空格剥离：右对齐时间戳仍然在 EOL 留下 flexbox 间隔符运行。
          // eslint-disable-next-line custom-rules/prefer-use-terminal-size -- 按键时一次性，不是响应式渲染依赖项
          const w = Math.max(80, (process.stdout.columns ?? 80) - 6);
          const raw = await renderMessagesToPlainText(deferredMessages, tools, w);
          const text = raw.replace(/[ \t]+$/gm, '');
          const path = join(tmpdir(), `cc-transcript-${Date.now()}.txt`);
          await writeFile(path, text);
          const opened = openFileInExternalEditor(path);
          setStatus(opened ? `正在打开 ${path}` : `已写入 ${path} · 未设置 $VISUAL/$EDITOR`);
        } catch (e) {
          setStatus(`渲染失败：${e instanceof Error ? e.message : String(e)}`);
        }
        editorRenderingRef.current = false;
        if (gen !== editorGenRef.current) return;
        editorTimerRef.current = setTimeout(s => s(''), 4000, setEditorStatus);
      })();
    }
  },
  // !searchOpen：在搜索栏中输入 'v' 或 '[' 是搜索输入，而不是命令。这里没有 !dumpMode — v 在 [ 之后应该工作（[ 处理程序内联守卫自身）。
  {
    isActive: screen === 'transcript' && virtualScrollActive && !searchOpen
  });

  // 每次进入对话记录时都是新的 `less`。防止过时高亮匹配不相关的正常模式文本（覆盖层是 alt-screen-global），并避免重新进入时出现意外的 n/N。同样的退出重置 [ 转储模式 — 每次 ctrl+o 进入都是一个新实例。

  const inTranscript = screen === 'transcript' && virtualScrollActive;
  useEffect(() => {
    if (!inTranscript) {
      setSearchQuery('');
      setSearchCount(0);
      setSearchCurrent(0);
      setSearchOpen(false);
      editorGenRef.current++;
      clearTimeout(editorTimerRef.current);
      setDumpMode(false);
      setEditorStatus('');
    }
  }, [inTranscript]);
  useEffect(() => {
    setHighlight(inTranscript ? searchQuery : '');
    // 清除基于位置的 CURRENT（黄色）覆盖层。setHighlight 只清除基于扫描的反转。没有这个，在 ctrl-c 退出对话记录后，黄色框会以其最后的屏幕坐标持续存在。
    if (!inTranscript) setPositions(null);
  }, [inTranscript, searchQuery, setHighlight, setPositions]);
  const globalKeybindingProps = {
    screen,
    setScreen,
    showAllInTranscript,
    setShowAllInTranscript,
    messageCount: messages.length,
    onEnterTranscript: handleEnterTranscript,
    onExitTranscript: handleExitTranscript,
    virtualScrollActive,
    // 栏打开是一种模式（拥有按键 — j/k 键入，Esc 取消）。
    // 导航（查询已设置，栏关闭）不是 — Esc 退出对话记录，与 less q 相同，高亮仍然可见。useSearchInput 不停止传播，因此没有这个门，transcript:exit 会在取消栏的同一个 Esc 上触发（子首先注册，首先触发，冒泡）。
    searchBarOpen: searchOpen
  };

  // 使用冻结长度切片数组，避免克隆的内存开销
  const transcriptMessages = frozenTranscriptState ? deferredMessages.slice(0, frozenTranscriptState.messagesLength) : deferredMessages;
  const transcriptStreamingToolUses = frozenTranscriptState ? streamingToolUses.slice(0, frozenTranscriptState.streamingToolUsesLength) : streamingToolUses;

  // 处理 shift+down 用于队友导航和后台任务管理。
  // 当本地 jsx 对话框（例如 /mcp）打开时，守卫 onOpenBackgroundTasks — 否则 Shift+Down 会将 BackgroundTasksDialog 堆叠在上面并使输入死锁。
  useBackgroundTaskNavigation({
    onOpenBackgroundTasks: isShowingLocalJSXCommand ? undefined : () => setShowBashesDialog(true)
  });
  // 队友完成或出错时自动退出查看模式
  useTeammateViewAutoExit();
  if (screen === 'transcript') {
    // 虚拟滚动替换 30 条消息上限：所有内容都可滚动，内存受视口限制。没有它，将对话记录包装在 ScrollBox 中将挂载所有消息（在长会话上约 250 MB — 正是问题所在），因此杀开关和非全屏路径必须回退到传统渲染：无 alt 屏幕，转储到终端滚动缓冲区，30 上限 + Ctrl+E。重用 scrollRef 是安全的 — 正常模式和对话记录模式是互斥的（这个早期返回），因此任何时候只有一个 ScrollBox 被挂载。
    const transcriptScrollRef = isFullscreenEnvEnabled() && !disableVirtualScroll && !dumpMode ? scrollRef : undefined;
    const transcriptMessagesElement = <Messages messages={transcriptMessages} tools={tools} commands={commands} verbose={true} toolJSX={null} toolUseConfirmQueue={[]} inProgressToolUseIDs={inProgressToolUseIDs} isMessageSelectorVisible={false} conversationId={conversationId} screen={screen} agentDefinitions={agentDefinitions} streamingToolUses={transcriptStreamingToolUses} showAllInTranscript={showAllInTranscript} onOpenRateLimitOptions={handleOpenRateLimitOptions} isLoading={isLoading} hidePastThinking={true} streamingThinking={streamingThinking} scrollRef={transcriptScrollRef} jumpRef={jumpRef} onSearchMatchesChange={onSearchMatchesChange} scanElement={scanElement} setPositions={setPositions} disableRenderCap={dumpMode} />;
    const transcriptToolJSX = toolJSX && <Box flexDirection="column" width="100%">
        {toolJSX.jsx}
      </Box>;
    const transcriptReturn = <KeybindingSetup>
        <AnimatedTerminalTitle isAnimating={titleIsAnimating} title={terminalTitle} disabled={titleDisabled} noPrefix={showStatusInTerminalTab} />
        <GlobalKeybindingHandlers {...globalKeybindingProps} />
        {feature('VOICE_MODE') ? <VoiceKeybindingHandler voiceHandleKeyEvent={voice.handleKeyEvent} stripTrailing={voice.stripTrailing} resetAnchor={voice.resetAnchor} isActive={!toolJSX?.isLocalJSXCommand} /> : null}
        <CommandKeybindingHandlers onSubmit={onSubmit} isActive={!toolJSX?.isLocalJSXCommand} />
        {transcriptScrollRef ?
      // ScrollKeybindingHandler 必须在 CancelRequestHandler 之前挂载，以便 ctrl+c-with-selection 复制而不是取消活动任务。
      // 其原始的 useInput 处理程序仅在存在选择时停止传播 — 没有选择时，ctrl+c 会传递给 CancelRequestHandler。
      <ScrollKeybindingHandler scrollRef={scrollRef}
      // 当模态框显示时，将滚轮/ctrl+u/d 让给 UltraplanChoiceDialog 自己的滚动处理程序
      isActive={focusedInputDialog !== 'ultraplan-choice'}
      // g/G/j/k/ctrl+u/ctrl+d 会吃掉搜索栏想要的按键。搜索时关闭。
      isModal={!searchOpen}
      // 手动滚动退出搜索上下文 — 清除黄色当前匹配标记。位置是（msg，rowOffset）键控的；j/k 更改 scrollTop 所以 rowOffset 过时 → 错误的行获得黄色。下一个 n/N 通过 step()→jump() 重新建立。
      onScroll={() => jumpRef.current?.disarmSearch()} /> : null}
        <CancelRequestHandler {...cancelRequestProps} />
        {transcriptScrollRef ? <FullscreenLayout scrollRef={scrollRef} scrollable={<>
                {transcriptMessagesElement}
                {transcriptToolJSX}
                <SandboxViolationExpandedView />
              </>} bottom={searchOpen ? <TranscriptSearchBar jumpRef={jumpRef}
      // 种子尝试过（c01578c8）— 破坏了 /hello 肌肉记忆（光标落在 'foo' 后，/hello → foohello）。
      // 取消恢复以不同方式处理“不要丢失先前搜索”的担忧（onCancel 重新应用 searchQuery）。
      initialQuery="" count={searchCount} current={searchCurrent} onClose={q => {
        // 回车 — 提交。0 匹配守卫：垃圾查询不应持久化（徽章隐藏，n/N 无论如何都死了）。
        setSearchQuery(searchCount > 0 ? q : '');
        setSearchOpen(false);
        // onCancel 路径：栏在它的 useEffect([query]) 可以用 '' 触发之前卸载。没有这个，searchCount 保持过时（n 守卫在 :4956 通过）和 VML 的 matches[] 也是（nextMatch 遍历旧数组）。幽灵导航，没有高亮。onExit（回车，q 非空）仍然提交。
        if (!q) {
          setSearchCount(0);
          setSearchCurrent(0);
          jumpRef.current?.setSearchQuery('');
        }
      }} onCancel={() => {
        // Esc/ctrl+c/ctrl+g — 撤销。栏的效果最后一次触发时带有任何键入的内容。searchQuery（REPL 状态）自 / 以来未更改（onClose = 提交，未运行）。
        // 两次 VML 调用：'' 恢复锚点（0 匹配 else 分支），然后 searchQuery 从锚点的最近重新扫描。两者同步 — 一个 React 批处理。
        // setHighlight 显式：REPL 的同步效果依赖是 searchQuery（未更改），不会重新触发。
        setSearchOpen(false);
        jumpRef.current?.setSearchQuery('');
        jumpRef.current?.setSearchQuery(searchQuery);
        setHighlight(searchQuery);
      }} setHighlight={setHighlight} /> : <TranscriptModeFooter showAllInTranscript={showAllInTranscript} virtualScroll={true} status={editorStatus || undefined} searchBadge={searchQuery && searchCount > 0 ? {
        current: searchCurrent,
        count: searchCount
      } : undefined} />} /> : <>
            {transcriptMessagesElement}
            {transcriptToolJSX}
            <SandboxViolationExpandedView />
            <TranscriptModeFooter showAllInTranscript={showAllInTranscript} virtualScroll={false} suppressShowAll={dumpMode} status={editorStatus || undefined} />
          </>}
      </KeybindingSetup>;
    // 虚拟滚动分支（上面的 FullscreenLayout）需要 <AlternateScreen>'s <Box height={rows}> 约束 — 没有它，ScrollBox 的 flexGrow 没有上限，视口 = 内容高度，scrollTop 固定在 0，Ink 的屏幕缓冲区大小为完整的间隔符（长会话上 200×5k+ 行）。与下面正常模式的包装相同的根类型 + props，因此 React 跨切换协调，alt 缓冲区保持在输入状态。30 上限转储分支保持未包装 — 它需要原生终端滚动回退。
    if (transcriptScrollRef) {
      return <AlternateScreen mouseTracking={isMouseTrackingEnabled()}>
          {transcriptReturn}
        </AlternateScreen>;
    }
    return transcriptReturn;
  }

  // 获取查看的代理任务（从选择器内联以获取显式数据流）。
  // viewedAgentTask：队友或本地代理 — 驱动下面的布尔检查。viewedTeammateTask：仅队友，用于队友特定字段访问（inProgressToolUseIDs）。
  const viewedTask = viewingAgentTaskId ? tasks[viewingAgentTaskId] : undefined;
  const viewedTeammateTask = viewedTask && isInProcessTeammateTask(viewedTask) ? viewedTask : undefined;
  const viewedAgentTask = viewedTeammateTask ?? (viewedTask && isLocalAgentTask(viewedTask) ? viewedTask : undefined);

  // 当流式文本显示时绕过 useDeferredValue，以便 Messages 在与流式文本清除相同的帧中渲染最终消息。当未加载时也绕过 — deferredMessages 仅在流式传输期间重要（保持输入响应）；在响应结束后，立即显示消息可防止微调器消失但答案尚未出现的抖动间隙。只有 reducedMotion 用户在加载期间保留延迟路径。
  const usesSyncMessages = showStreamingText || !isLoading;
  // 当查看代理时，永远不要回退到领导者 — 在引导/流填充之前为空。关闭 see-leader-type-agent 脚枪。
  const displayedMessages = viewedAgentTask ? viewedAgentTask.messages ?? [] : usesSyncMessages ? messages : deferredMessages;
  // 显示占位符，直到真实的用户消息出现在 displayedMessages 中。userInputOnProcessing 在整个响应期间保持设置（在 resetLoadingState 中清除）；此长度检查在 displayedMessages 增长超过在提交时捕获的基线后隐藏它。
  // 涵盖两种情况：在调用 setMessages 之前（processUserInput），以及当 deferredMessages 落后于 messages 时。当查看代理时抑制 — displayedMessages 在那里是一个不同的数组，并且 onAgentSubmit 无论如何都不使用占位符。
  const placeholderText = userInputOnProcessing && !viewedAgentTask && displayedMessages.length <= userInputBaselineRef.current ? userInputOnProcessing : undefined;
  const toolPermissionOverlay = focusedInputDialog === 'tool-permission' ? <PermissionRequest key={toolUseConfirmQueue[0]?.toolUseID} onDone={() => setToolUseConfirmQueue(([_, ...tail]) => tail)} onReject={handleQueuedCommandOnCancel} toolUseConfirm={toolUseConfirmQueue[0]!} toolUseContext={getToolUseContext(messages, messages, abortController ?? createAbortController(), mainLoopModel)} verbose={verbose} workerBadge={toolUseConfirmQueue[0]?.workerBadge} setStickyFooter={isFullscreenEnvEnabled() ? setPermissionStickyFooter : undefined} /> : null;

  // 窄终端：伴侣折叠为单行，REPL 堆叠在自己的行上（全屏中输入上方，滚动回退下方），而不是行并排。宽终端保持行布局，精灵在右侧。
  const companionNarrow = transcriptCols < MIN_COLS_FOR_FULL_SPRITE;
  // 当 PromptInput 提前返回 BackgroundTasksDialog 时隐藏精灵。
  // 精灵作为 PromptInput 的行兄弟存在，因此对话框的 Pane 分隔符以 useTerminalSize() 宽度绘制，但只获得 terminalWidth - spriteWidth — 分隔符提前停止，对话框文本提前换行。不要检查 footerSelection：药丸 FOCUS（箭头向下到任务药丸）必须保持精灵可见，以便箭头向右可以导航到它。
  const companionVisible = !toolJSX?.shouldHidePromptInput && !focusedInputDialog && !showBashesDialog;

  // 在全屏中，所有本地 jsx 斜杠命令都浮动在模态槽中 — FullscreenLayout 将它们包装在绝对定位的底部锚定窗格中（▔ 分隔符，ModalContext）。内部的窗格/对话框检测上下文并跳过自己的顶级框架。非全屏保留下面的内联渲染路径。以前通过底部路由的命令（即时：/model, /mcp, /btw, ...）和可滚动的（非即时：/config, /theme, /diff, ...）现在都放在这里。
  const toolJsxCentered = isFullscreenEnvEnabled() && toolJSX?.isLocalJSXCommand === true;
  const centeredModal: React.ReactNode = toolJsxCentered ? toolJSX!.jsx : null;

  // 根部的 <AlternateScreen>：其内部的所有内容都在其 <Box height={rows}> 内。处理程序/上下文是零高度的，因此 FullscreenLayout 中 ScrollBox 的 flexGrow 相对于此 Box 解析。上面的对话记录早期返回以同样的方式包装其虚拟滚动分支；只有 30 上限转储分支保持未包装，以支持原生终端滚动回退。
  const mainReturn = <KeybindingSetup>
      <AnimatedTerminalTitle isAnimating={titleIsAnimating} title={terminalTitle} disabled={titleDisabled} noPrefix={showStatusInTerminalTab} />
      <GlobalKeybindingHandlers {...globalKeybindingProps} />
      {feature('VOICE_MODE') ? <VoiceKeybindingHandler voiceHandleKeyEvent={voice.handleKeyEvent} stripTrailing={voice.stripTrailing} resetAnchor={voice.resetAnchor} isActive={!toolJSX?.isLocalJSXCommand} /> : null}
      <CommandKeybindingHandlers onSubmit={onSubmit} isActive={!toolJSX?.isLocalJSXCommand} />
      {/* ScrollKeybindingHandler 必须在 CancelRequestHandler 之前挂载，以便
          ctrl+c-with-selection 复制而不是取消活动任务。
          其原始的 useInput 处理程序仅在存在选择时停止传播 — 没有选择时，ctrl+c 会传递给 CancelRequestHandler。
          PgUp/PgDn/滚轮始终滚动对话记录后面的模态框 —
          模态框的内部 ScrollBox 不由键盘驱动。当模态框显示时 onScroll 保持抑制，以便滚动不会标记分隔符/药丸状态。 */}
      <ScrollKeybindingHandler scrollRef={scrollRef} isActive={isFullscreenEnvEnabled() && (centeredModal != null || !focusedInputDialog || focusedInputDialog === 'tool-permission')} onScroll={centeredModal || toolPermissionOverlay || viewedAgentTask ? undefined : composedOnScroll} />
      {feature('MESSAGE_ACTIONS') && isFullscreenEnvEnabled() && !disableMessageActions ? <MessageActionsKeybindings handlers={messageActionHandlers} isActive={cursor !== null} /> : null}
      <CancelRequestHandler {...cancelRequestProps} />
      <MCPConnectionManager key={remountKey} dynamicMcpConfig={dynamicMcpConfig} isStrictMcpConfig={strictMcpConfig}>
        <FullscreenLayout scrollRef={scrollRef} overlay={toolPermissionOverlay} bottomFloat={true && companionVisible && !companionNarrow ? <CompanionFloatingBubble /> : undefined} modal={centeredModal} modalScrollRef={modalScrollRef} dividerYRef={dividerYRef} hidePill={!!viewedAgentTask} hideSticky={!!viewedTeammateTask} newMessageCount={unseenDivider?.count ?? 0} onPillClick={() => {
        setCursor(null);
        jumpToNew(scrollRef.current);
      }} scrollable={<>
              <TeammateViewHeader />
              <Messages messages={displayedMessages} tools={tools} commands={commands} verbose={verbose} toolJSX={toolJSX} toolUseConfirmQueue={toolUseConfirmQueue} inProgressToolUseIDs={viewedTeammateTask ? viewedTeammateTask.inProgressToolUseIDs ?? new Set() : inProgressToolUseIDs} isMessageSelectorVisible={isMessageSelectorVisible} conversationId={conversationId} screen={screen} streamingToolUses={streamingToolUses} showAllInTranscript={showAllInTranscript} agentDefinitions={agentDefinitions} onOpenRateLimitOptions={handleOpenRateLimitOptions} isLoading={isLoading} streamingText={isLoading && !viewedAgentTask ? visibleStreamingText : null} isBriefOnly={viewedAgentTask ? false : isBriefOnly} unseenDivider={viewedAgentTask ? undefined : unseenDivider} scrollRef={isFullscreenEnvEnabled() ? scrollRef : undefined} trackStickyPrompt={isFullscreenEnvEnabled() ? true : undefined} cursor={cursor} setCursor={setCursor} cursorNavRef={cursorNavRef} />
              <AwsAuthStatusBox />
              {/* 当模态框显示时隐藏处理中占位符 —
                  它会位于最后可见的对话记录行上方，正好在 ▔ 分隔符上方，显示“❯ /config”作为多余的杂乱（模态框本身就是 /config UI）。在模态框外部它保持存在，以便用户在处理时看到他们的输入回显。 */}
              {!disabled && placeholderText && !centeredModal && <UserTextMessage param={{
          text: placeholderText,
          type: 'text'
        }} addMargin={true} verbose={verbose} />}
              {toolJSX && !(toolJSX.isLocalJSXCommand && toolJSX.isImmediate) && !toolJsxCentered && <Box flexDirection="column" width="100%">
                    {toolJSX.jsx}
                  </Box>}
              {false && <TungstenLiveMonitor />}
              {feature('WEB_BROWSER_TOOL') ? WebBrowserPanelModule && <WebBrowserPanelModule.WebBrowserPanel /> : null}
              <Box flexGrow={1} />
              {showSpinner && <SpinnerWithVerb mode={streamMode} spinnerTip={spinnerTip} responseLengthRef={responseLengthRef} apiMetricsRef={apiMetricsRef} overrideMessage={spinnerMessage} spinnerSuffix={stopHookSpinnerSuffix} verbose={verbose} loadingStartTimeRef={loadingStartTimeRef} totalPausedMsRef={totalPausedMsRef} pauseStartTimeRef={pauseStartTimeRef} overrideColor={spinnerColor} overrideShimmerColor={spinnerShimmerColor} hasActiveTools={inProgressToolUseIDs.size > 0} leaderIsIdle={!isLoading} useTimeGradient={true} />}
              {!showSpinner && !isLoading && !userInputOnProcessing && !hasRunningTeammates && isBriefOnly && !viewedAgentTask && <BriefIdleStatus />}
              {isFullscreenEnvEnabled() && <PromptInputQueuedCommands />}
            </>} bottom={<Box flexDirection={true && companionNarrow ? 'column' : 'row'} width="100%" alignItems={true && companionNarrow ? undefined : 'flex-end'}>
              {true && companionNarrow && isFullscreenEnvEnabled() && companionVisible ? <CompanionSprite /> : null}
              <Box flexDirection="column" flexGrow={1}>
                {permissionStickyFooter}
                {/* 即时本地 jsx 命令（/btw, /sandbox, /assistant,
                  /issue）在此渲染，而不是在 scrollable 内部。它们保持挂载，而主对话在它们后面流式传输，因此 ScrollBox 在每条新消息上重新布局会拖拽它们。底部是 flexShrink={0}，在 ScrollBox 外部 — 它从不移动。
                  非即时本地 jsx（/diff, /status, /theme，约 40 个）保留在 scrollable 中：主循环暂停所以没有抖动，并且它们的高内容（DiffDetailView 渲染多达 400 行且没有内部滚动）需要外部的 ScrollBox。 */}
                {toolJSX?.isLocalJSXCommand && toolJSX.isImmediate && !toolJsxCentered && <Box flexDirection="column" width="100%">
                      {toolJSX.jsx}
                    </Box>}
                {!showSpinner && !toolJSX?.isLocalJSXCommand && showExpandedTodos && tasksV2 && tasksV2.length > 0 && <Box width="100%" flexDirection="column">
                      <TaskListV2 tasks={tasksV2} isStandalone={true} />
                    </Box>}
                {focusedInputDialog === 'sandbox-permission' && <SandboxPermissionRequest key={sandboxPermissionRequestQueue[0]!.hostPattern.host} hostPattern={sandboxPermissionRequestQueue[0]!.hostPattern} onUserResponse={(response: {
            allow: boolean;
            persistToSettings: boolean;
          }) => {
            const {
              allow,
              persistToSettings
            } = response;
            const currentRequest = sandboxPermissionRequestQueue[0];
            if (!currentRequest) return;
            const approvedHost = currentRequest.hostPattern.host;
            if (persistToSettings) {
              const update = {
                type: 'addRules' as const,
                rules: [{
                  toolName: WEB_FETCH_TOOL_NAME,
                  ruleContent: `domain:${approvedHost}`
                }],
                behavior: (allow ? 'allow' : 'deny') as 'allow' | 'deny',
                destination: 'localSettings' as const
              };
              setAppState(prev => ({
                ...prev,
                toolPermissionContext: applyPermissionUpdate(prev.toolPermissionContext, update)
              }));
              persistPermissionUpdate(update);

              // 立即更新沙盒内存配置，以防止在设置更改被检测到之前未决请求溜过
              SandboxManager.refreshConfig();
            }

            // 解析同一主机的所有待处理请求，而不仅仅是第一个
            // 这处理了多个并行请求进入同一域的情况
            setSandboxPermissionRequestQueue(queue => {
              queue.filter(item => item.hostPattern.host === approvedHost).forEach(item => item.resolvePromise(allow));
              return queue.filter(item => item.hostPattern.host !== approvedHost);
            });

            // 清理此主机的桥接订阅并取消远程提示
            // 因为本地用户已经响应。
            const cleanups = sandboxBridgeCleanupRef.current.get(approvedHost);
            if (cleanups) {
              for (const fn of cleanups) {
                fn();
              }
              sandboxBridgeCleanupRef.current.delete(approvedHost);
            }
          }} />}
                {focusedInputDialog === 'prompt' && <PromptDialog key={promptQueue[0]!.request.prompt} title={promptQueue[0]!.title} toolInputSummary={promptQueue[0]!.toolInputSummary} request={promptQueue[0]!.request} onRespond={selectedKey => {
            const item = promptQueue[0];
            if (!item) return;
            item.resolve({
              prompt_response: item.request.prompt,
              selected: selectedKey
            });
            setPromptQueue(([, ...tail]) => tail);
          }} onAbort={() => {
            const item = promptQueue[0];
            if (!item) return;
            item.reject(new Error('用户取消的提示'));
            setPromptQueue(([, ...tail]) => tail);
          }} />}
                {/* 在等待领导者批准时，在工作线程侧显示待处理指示器 */}
                {pendingWorkerRequest && <WorkerPendingPermission toolName={pendingWorkerRequest.toolName} description={pendingWorkerRequest.description} />}
                {/* 在工作线程侧为沙盒权限显示待处理指示器 */}
                {pendingSandboxRequest && <WorkerPendingPermission toolName="网络访问" description={`等待领导者批准对 ${pendingSandboxRequest.host} 的网络访问`} />}
                {/* 来自 swarm 工作者的工作线程沙盒权限请求 */}
                {focusedInputDialog === 'worker-sandbox-permission' && <SandboxPermissionRequest key={workerSandboxPermissions.queue[0]!.requestId} hostPattern={{
            host: workerSandboxPermissions.queue[0]!.host,
            port: undefined
          } as NetworkHostPattern} onUserResponse={(response: {
            allow: boolean;
            persistToSettings: boolean;
          }) => {
            const {
              allow,
              persistToSettings
            } = response;
            const currentRequest = workerSandboxPermissions.queue[0];
            if (!currentRequest) return;
            const approvedHost = currentRequest.host;

            // 通过邮箱向工作线程发送响应
            void sendSandboxPermissionResponseViaMailbox(currentRequest.workerName, currentRequest.requestId, approvedHost, allow, teamContext?.teamName);
            if (persistToSettings && allow) {
              const update = {
                type: 'addRules' as const,
                rules: [{
                  toolName: WEB_FETCH_TOOL_NAME,
                  ruleContent: `domain:${approvedHost}`
                }],
                behavior: 'allow' as const,
                destination: 'localSettings' as const
              };
              setAppState(prev => ({
                ...prev,
                toolPermissionContext: applyPermissionUpdate(prev.toolPermissionContext, update)
              }));
              persistPermissionUpdate(update);
              SandboxManager.refreshConfig();
            }

            // 从队列中移除
            setAppState(prev => ({
              ...prev,
              workerSandboxPermissions: {
                ...prev.workerSandboxPermissions,
                queue: prev.workerSandboxPermissions.queue.slice(1)
              }
            }));
          }} />}
                {focusedInputDialog === 'elicitation' && <ElicitationDialog key={elicitation.queue[0]!.serverName + ':' + String(elicitation.queue[0]!.requestId)} event={elicitation.queue[0]!} onResponse={(action, content) => {
            const currentRequest = elicitation.queue[0];
            if (!currentRequest) return;
            // 调用 respond 回调以解析 Promise
            currentRequest.respond({
              action,
              content
            });
            // 对于 URL accept，保持在队列中用于阶段 2
            const isUrlAccept = currentRequest.params.mode === 'url' && action === 'accept';
            if (!isUrlAccept) {
              setAppState(prev => ({
                ...prev,
                elicitation: {
                  queue: prev.elicitation.queue.slice(1)
                }
              }));
            }
          }} onWaitingDismiss={action => {
            const currentRequest = elicitation.queue[0];
            // 从队列中移除
            setAppState(prev => ({
              ...prev,
              elicitation: {
                queue: prev.elicitation.queue.slice(1)
              }
            }));
            currentRequest?.onWaitingDismiss?.(action);
          }} />}
                {focusedInputDialog === 'cost' && <CostThresholdDialog onDone={() => {
            setShowCostDialog(false);
            setHaveShownCostDialog(true);
            saveGlobalConfig(current => ({
              ...current,
              hasAcknowledgedCostThreshold: true
            }));
            logEvent('tengu_cost_threshold_acknowledged', {});
          }} />}
                {focusedInputDialog === 'idle-return' && idleReturnPending && <IdleReturnDialog idleMinutes={idleReturnPending.idleMinutes} totalInputTokens={getTotalInputTokens()} onDone={async action => {
            const pending = idleReturnPending;
            setIdleReturnPending(null);
            logEvent('tengu_idle_return_action', {
              action: action as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
              idleMinutes: Math.round(pending.idleMinutes),
              messageCount: messagesRef.current.length,
              totalInputTokens: getTotalInputTokens()
            });
            if (action === 'dismiss') {
              setInputValue(pending.input);
              return;
            }
            if (action === 'never') {
              saveGlobalConfig(current => {
                if (current.idleReturnDismissed) return current;
                return {
                  ...current,
                  idleReturnDismissed: true
                };
              });
            }
            if (action === 'clear') {
              const {
                clearConversation
              } = await import('../commands/clear/conversation.js');
              await clearConversation({
                setMessages,
                readFileState: readFileState.current,
                discoveredSkillNames: discoveredSkillNamesRef.current,
                loadedNestedMemoryPaths: loadedNestedMemoryPathsRef.current,
                getAppState: () => store.getState(),
                setAppState,
                setConversationId
              });
              haikuTitleAttemptedRef.current = false;
              setHaikuTitle(undefined);
              bashTools.current.clear();
              bashToolsProcessedIdx.current = 0;
            }
            skipIdleCheckRef.current = true;
            void onSubmitRef.current(pending.input, {
              setCursorOffset: () => {},
              clearBuffer: () => {},
              resetHistory: () => {}
            });
          }} />}
                {focusedInputDialog === 'ide-onboarding' && <IdeOnboardingDialog onDone={() => setShowIdeOnboarding(false)} installationStatus={ideInstallationStatus} />}
                {false && focusedInputDialog === 'model-switch' && AntModelSwitchCallout && <AntModelSwitchCallout onDone={(selection: string, modelAlias?: string) => {
            setShowModelSwitchCallout(false);
            if (selection === 'switch' && modelAlias) {
              setAppState(prev => ({
                ...prev,
                mainLoopModel: modelAlias,
                mainLoopModelForSession: null
              }));
            }
          }} />}
                {false && focusedInputDialog === 'undercover-callout' && UndercoverAutoCallout && <UndercoverAutoCallout onDone={() => setShowUndercoverCallout(false)} />}
                {focusedInputDialog === 'effort-callout' && <EffortCallout model={mainLoopModel} onDone={selection => {
            setShowEffortCallout(false);
            if (selection !== 'dismiss') {
              setAppState(prev => ({
                ...prev,
                effortValue: selection
              }));
            }
          }} />}
                {focusedInputDialog === 'remote-callout' && <RemoteCallout onDone={selection => {
            setAppState(prev => {
              if (!prev.showRemoteCallout) return prev;
              return {
                ...prev,
                showRemoteCallout: false,
                ...(selection === 'enable' && {
                  replBridgeEnabled: true,
                  replBridgeExplicit: true,
                  replBridgeOutboundOnly: false
                })
              };
            });
          }} />}

                {exitFlow}

                {focusedInputDialog === 'plugin-hint' && hintRecommendation && <PluginHintMenu pluginName={hintRecommendation.pluginName} pluginDescription={hintRecommendation.pluginDescription} marketplaceName={hintRecommendation.marketplaceName} sourceCommand={hintRecommendation.sourceCommand} onResponse={handleHintResponse} />}

                {focusedInputDialog === 'lsp-recommendation' && lspRecommendation && <LspRecommendationMenu pluginName={lspRecommendation.pluginName} pluginDescription={lspRecommendation.pluginDescription} fileExtension={lspRecommendation.fileExtension} onResponse={handleLspResponse} />}

                {focusedInputDialog === 'desktop-upsell' && <DesktopUpsellStartup onDone={() => setShowDesktopUpsellStartup(false)} />}

                {feature('ULTRAPLAN') ? focusedInputDialog === 'ultraplan-choice' && ultraplanPendingChoice && <UltraplanChoiceDialog plan={ultraplanPendingChoice.plan} sessionId={ultraplanPendingChoice.sessionId} taskId={ultraplanPendingChoice.taskId} setMessages={setMessages} readFileState={readFileState.current} getAppState={() => store.getState()} setConversationId={setConversationId} /> : null}

                {feature('ULTRAPLAN') ? focusedInputDialog === 'ultraplan-launch' && ultraplanLaunchPending && <UltraplanLaunchDialog onChoice={(choice, opts) => {
            const blurb = ultraplanLaunchPending.blurb;
            setAppState(prev => prev.ultraplanLaunchPending ? {
              ...prev,
              ultraplanLaunchPending: undefined
            } : prev);
            if (choice === 'cancel') return;
            // 命令的 onDone 使用 display:'skip'，因此在此处添加回显 — 在 ~5s teleportToRemote 解析之前提供即时反馈。
            setMessages(prev => [...prev, createCommandInputMessage(formatCommandInputTags('ultraplan', blurb))]);
            const appendStdout = (msg: string) => setMessages(prev => [...prev, createCommandInputMessage(`<${LOCAL_COMMAND_STDOUT_TAG}>${escapeXml(msg)}</${LOCAL_COMMAND_STDOUT_TAG}>`)]);
            // 如果查询正在进行中，延迟第二条消息
            // 以便它落在助手回复之后，而不是介于用户的提示和回复之间。
            const appendWhenIdle = (msg: string) => {
              if (!queryGuard.isActive) {
                appendStdout(msg);
                return;
              }
              const unsub = queryGuard.subscribe(() => {
                if (queryGuard.isActive) return;
                unsub();
                // 如果在我们等待时用户停止了 ultraplan，则跳过 — 避免为已消失的会话显示过时的“监视 <url>”消息。
                if (!store.getState().ultraplanSessionUrl) return;
                appendStdout(msg);
              });
            };
            void launchUltraplan({
              blurb,
              getAppState: () => store.getState(),
              setAppState,
              signal: createAbortController().signal,
              disconnectedBridge: opts?.disconnectedBridge,
              onSessionReady: appendWhenIdle
            }).then(appendStdout).catch(logError);
          }} /> : null}

                {mrRender()}

                {!toolJSX?.shouldHidePromptInput && !focusedInputDialog && !isExiting && !disabled && !cursor && <>
                      {autoRunIssueReason && <AutoRunIssueNotification onRun={handleAutoRunIssue} onCancel={handleCancelAutoRunIssue} reason={getAutoRunIssueReasonText(autoRunIssueReason)} />}
                      {postCompactSurvey.state !== 'closed' ? <FeedbackSurvey state={postCompactSurvey.state} lastResponse={postCompactSurvey.lastResponse} handleSelect={postCompactSurvey.handleSelect} inputValue={inputValue} setInputValue={setInputValue} onRequestFeedback={handleSurveyRequestFeedback} /> : memorySurvey.state !== 'closed' ? <FeedbackSurvey state={memorySurvey.state} lastResponse={memorySurvey.lastResponse} handleSelect={memorySurvey.handleSelect} handleTranscriptSelect={memorySurvey.handleTranscriptSelect} inputValue={inputValue} setInputValue={setInputValue} onRequestFeedback={handleSurveyRequestFeedback} message="Claude 使用记忆的效果如何？（可选）" /> : <FeedbackSurvey state={feedbackSurvey.state} lastResponse={feedbackSurvey.lastResponse} handleSelect={feedbackSurvey.handleSelect} handleTranscriptSelect={feedbackSurvey.handleTranscriptSelect} inputValue={inputValue} setInputValue={setInputValue} onRequestFeedback={didAutoRunIssueRef.current ? undefined : handleSurveyRequestFeedback} />}
                      {/* 挫败感触发的对话记录分享提示 */}
                      {frustrationDetection.state !== 'closed' && <FeedbackSurvey state={frustrationDetection.state} lastResponse={null} handleSelect={() => {}} handleTranscriptSelect={frustrationDetection.handleTranscriptSelect} inputValue={inputValue} setInputValue={setInputValue} />}
                      {/* Skill improvement survey - appears when improvements detected (ant-only) */}
                      {false && skillImprovementSurvey.suggestion && <SkillImprovementSurvey isOpen={skillImprovementSurvey.isOpen} skillName={skillImprovementSurvey.suggestion.skillName} updates={skillImprovementSurvey.suggestion.updates} handleSelect={skillImprovementSurvey.handleSelect} inputValue={inputValue} setInputValue={setInputValue} />}
                      {showIssueFlagBanner && <IssueFlagBanner />}
                      {}
                      <PromptInput debug={debug} ideSelection={ideSelection} hasSuppressedDialogs={!!hasSuppressedDialogs} isLocalJSXCommandActive={isShowingLocalJSXCommand} getToolUseContext={getToolUseContext} toolPermissionContext={toolPermissionContext} setToolPermissionContext={setToolPermissionContext} apiKeyStatus={apiKeyStatus} commands={commands} agents={agentDefinitions.activeAgents} isLoading={isLoading} onExit={handleExit} verbose={verbose} messages={messages} onAutoUpdaterResult={setAutoUpdaterResult} autoUpdaterResult={autoUpdaterResult} input={inputValue} onInputChange={setInputValue} mode={inputMode} onModeChange={setInputMode} stashedPrompt={stashedPrompt} setStashedPrompt={setStashedPrompt} submitCount={submitCount} onShowMessageSelector={handleShowMessageSelector} onMessageActionsEnter={
            // 在 isLoading 期间工作 — 编辑首先取消；uuid 选择在追加中存活。
            feature('MESSAGE_ACTIONS') && isFullscreenEnvEnabled() && !disableMessageActions ? enterMessageActions : undefined} mcpClients={mcpClients} pastedContents={pastedContents} setPastedContents={setPastedContents} vimMode={vimMode} setVimMode={setVimMode} showBashesDialog={showBashesDialog} setShowBashesDialog={setShowBashesDialog} onSubmit={onSubmit} onAgentSubmit={onAgentSubmit} isSearchingHistory={isSearchingHistory} setIsSearchingHistory={setIsSearchingHistory} helpOpen={isHelpOpen} setHelpOpen={setIsHelpOpen} insertTextRef={feature('VOICE_MODE') ? insertTextRef : undefined} voiceInterimRange={voice.interimRange} />
                      <SessionBackgroundHint onBackgroundSession={handleBackgroundSession} isLoading={isLoading} />
                    </>}
                {cursor &&
          // inputValue is REPL state; typed text survives the round-trip.
          <MessageActionsBar cursor={cursor} />}
                {focusedInputDialog === 'message-selector' && <MessageSelector messages={messages} preselectedMessage={messageSelectorPreselect} onPreRestore={onCancel} onRestoreCode={async (message: UserMessage) => {
            await fileHistoryRewind((updater: (prev: FileHistoryState) => FileHistoryState) => {
              setAppState(prev => ({
                ...prev,
                fileHistory: updater(prev.fileHistory)
              }));
            }, message.uuid);
          }} onSummarize={async (message: UserMessage, feedback?: string, direction: PartialCompactDirection = 'from') => {
            // 投射被截断的消息，以便压缩模型不会总结有意删除的内容。
            const compactMessages = getMessagesAfterCompactBoundary(messages);
            const messageIndex = compactMessages.indexOf(message);
            if (messageIndex === -1) {
              // 选择了一条被截断或压缩前的消息，选择器仍然显示（REPL 保留完整历史用于滚动回退）。显示原因而不是静默无操作。
              setMessages(prev => [...prev, createSystemMessage('该消息已不在活动上下文中（已被裁剪或压缩）。请选择更新的消息。', 'warning')]);
              return;
            }
            const newAbortController = createAbortController();
            const context = getToolUseContext(compactMessages, [], newAbortController, mainLoopModel);
            const appState = context.getAppState();
            const defaultSysPrompt = await getSystemPrompt(context.options.tools, context.options.mainLoopModel, Array.from(appState.toolPermissionContext.additionalWorkingDirectories.keys()), context.options.mcpClients);
            const systemPrompt = buildEffectiveSystemPrompt({
              mainThreadAgentDefinition: undefined,
              toolUseContext: context,
              customSystemPrompt: context.options.customSystemPrompt,
              defaultSystemPrompt: defaultSysPrompt,
              appendSystemPrompt: context.options.appendSystemPrompt
            });
            const [userContext, systemContext] = await Promise.all([getUserContext(), getSystemContext()]);
            const result = await partialCompactConversation(compactMessages, messageIndex, context, {
              systemPrompt,
              userContext,
              systemContext,
              toolUseContext: context,
              forkContextMessages: compactMessages
            }, feedback, direction);
            const kept = result.messagesToKeep ?? [];
            const ordered = direction === 'up_to' ? [...result.summaryMessages, ...kept] : [...kept, ...result.summaryMessages];
            const postCompact = [result.boundaryMarker, ...ordered, ...result.attachments, ...result.hookResults];
            // Fullscreen 'from' keeps scrollback; 'up_to' must not
            // (old[0] unchanged + grown array means incremental
            // useLogMessages path, so boundary never persisted).
            // Find by uuid since old is raw REPL history and snipped
            // entries can shift the projected messageIndex.
            if (isFullscreenEnvEnabled() && direction === 'from') {
              setMessages(old => {
                const rawIdx = old.findIndex(m => m.uuid === message.uuid);
                return [...old.slice(0, rawIdx === -1 ? 0 : rawIdx), ...postCompact];
              });
            } else {
              setMessages(postCompact);
            }
            // Partial compact bypasses handleMessageFromStream — clear
            // the context-blocked flag so proactive ticks resume.
            if (feature('PROACTIVE') || feature('KAIROS')) {
              proactiveModule?.setContextBlocked(false);
            }
            setConversationId(randomUUID());
            runPostCompactCleanup(context.options.querySource);
            if (direction === 'from') {
              const r = textForResubmit(message);
              if (r) {
                setInputValue(r.text);
                setInputMode(r.mode);
              }
            }

            // Show notification with ctrl+o hint
            const historyShortcut = getShortcutDisplay('app:toggleTranscript', 'Global', 'Ctrl+o');
            addNotification({
              key: 'summarize-ctrl-o-hint',
              text: `Conversation summarized (${historyShortcut} for history)`,
              priority: 'medium',
              timeoutMs: 8000
            });
          }} onRestoreMessage={handleRestoreMessage} onClose={() => {
            setIsMessageSelectorVisible(false);
            setMessageSelectorPreselect(undefined);
          }} />}
                {false && <DevBar />}
              </Box>
              {true && !(companionNarrow && isFullscreenEnvEnabled()) && companionVisible ? <CompanionSprite /> : null}
            </Box>} />
      </MCPConnectionManager>
    </KeybindingSetup>;
  const stabilizedReturn = <ReplRuntimeBoundary>{mainReturn}</ReplRuntimeBoundary>;
  if (isFullscreenEnvEnabled()) {
    return <AlternateScreen mouseTracking={isMouseTrackingEnabled()}>
        {stabilizedReturn}
      </AlternateScreen>;
  }
  return stabilizedReturn;
}
