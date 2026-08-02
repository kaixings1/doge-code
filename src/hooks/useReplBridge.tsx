import { feature } from 'bun:bundle';
import React, { useCallback, useEffect, useRef } from 'react';
import { isLocalBridgeMode } from '../bridge/bridgeConfig.js';
import { setMainLoopModelOverride } from '../bootstrap/state.js';
import { type BridgePermissionCallbacks, type BridgePermissionResponse, isBridgePermissionResponse } from '../bridge/bridgePermissionCallbacks.js';
import { buildBridgeConnectUrl } from '../bridge/bridgeStatusUtil.js';
import { extractInboundMessageFields } from '../bridge/inboundMessages.js';
import type { BridgeState, ReplBridgeHandle } from '../bridge/replBridge.js';
import { setReplBridgeHandle } from '../bridge/replBridgeHandle.js';
import type { Command } from '../commands.js';
import { getSlashCommandToolSkills, isBridgeSafeCommand } from '../commands.js';
import { getRemoteSessionUrl } from '../constants/product.js';
import { useNotifications } from '../context/notifications.js';
import type { PermissionMode, SDKMessage } from '../entrypoints/agentSdkTypes.js';
import type { SDKControlResponse } from '../entrypoints/sdk/controlTypes.js';
import { Text } from '../ink.js';
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../services/analytics/growthbook.js';
import { useAppState, useAppStateStore, useSetAppState } from '../state/AppState.js';
import type { Message } from '../types/message.js';
import { getCwd } from '../utils/cwd.js';
import { logForDebugging } from '../utils/debug.js';
import { errorMessage } from '../utils/errors.js';
import { enqueue } from '../utils/messageQueueManager.js';
import { buildSystemInitMessage } from '../utils/messages/systemInit.js';
import { createBridgeStatusMessage, createSystemMessage } from '../utils/messages.js';
import { getAutoModeUnavailableNotification, getAutoModeUnavailableReason, isAutoModeGateEnabled, isBypassPermissionsModeDisabled, transitionPermissionMode } from '../utils/permissions/permissionSetup.js';
import { getLeaderToolUseConfirmQueue } from '../utils/swarm/leaderPermissionBridge.js';

export const BRIDGE_FAILURE_DISMISS_MS = 10_000;
const MAX_CONSECUTIVE_INIT_FAILURES = 3;

export function useReplBridge(messages: Message[], setMessages: (action: React.SetStateAction<Message[]>) => void, abortControllerRef: React.RefObject<AbortController | null>, commands: readonly Command[], mainLoopModel: string): {
  sendBridgeResult: () => void;
} {
  const handleRef = useRef<ReplBridgeHandle | null>(null);
  const teardownPromiseRef = useRef<Promise<void> | undefined>(undefined);
  const lastWrittenIndexRef = useRef(0);
  const flushedUUIDsRef = useRef(new Set<string>());
  const failureTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const consecutiveFailuresRef = useRef(0);
  const setAppState = useSetAppState();
  const commandsRef = useRef(commands);
  commandsRef.current = commands;
  const mainLoopModelRef = useRef(mainLoopModel);
  mainLoopModelRef.current = mainLoopModel;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const store = useAppStateStore();
  const { addNotification } = useNotifications();
  // 始终调用 Hook（React Hooks 规则要求），通过 isLocalBridgeMode 在运行时控制
  const replBridgeEnabled = feature('BRIDGE_MODE') ?
    useAppState(s => s.replBridgeEnabled) : false;
  const replBridgeConnected = feature('BRIDGE_MODE') ?
    useAppState(s => s.replBridgeConnected) : false;
  const replBridgeOutboundOnly = feature('BRIDGE_MODE') ?
    useAppState(s => s.replBridgeOutboundOnly) : false;
  const replBridgeInitialName = feature('BRIDGE_MODE') ?
    useAppState(s => s.replBridgeInitialName) : undefined;

  useEffect(() => {
    // 本地桥接模式 或 正常桥接模式
    if (!isLocalBridgeMode() && !feature('BRIDGE_MODE')) return;
    if (!replBridgeEnabled && !isLocalBridgeMode()) return;

    const outboundOnly = replBridgeOutboundOnly;
    function notifyBridgeFailed(detail?: string): void {
      if (outboundOnly) return;
      addNotification({
        key: 'bridge-failed',
        jsx: <>
            <Text color="error">远程控制失败</Text>
            {detail && <Text dimColor> 路 {detail}</Text>}
          </>,
        priority: 'immediate'
      });
    }
    if (consecutiveFailuresRef.current >= MAX_CONSECUTIVE_INIT_FAILURES) {
      logForDebugging(`[bridge:repl] 钩子：${consecutiveFailuresRef.current} 次连续初始化失败，本次会话不再重试`);
      const fuseHint = '因重复失败已禁用 路 重启以重试';
      notifyBridgeFailed(fuseHint);
      setAppState(prev => {
        if (prev.replBridgeError === fuseHint && !prev.replBridgeEnabled) return prev;
        return { ...prev, replBridgeError: fuseHint, replBridgeEnabled: false };
      });
      return;
    }
    let cancelled = false;
    const initialMessageCount = messages.length;
    void (async () => {
      try {
        if (teardownPromiseRef.current) {
          logForDebugging('[bridge:repl] 钩子：等待前一次拆除完成后再重新初始化');
          await teardownPromiseRef.current;
          teardownPromiseRef.current = undefined;
          logForDebugging('[bridge:repl] 钩子：前一次拆除已完成，继续重新初始化');
        }
        if (cancelled) return;

        // 本地桥接模式：连接本地桥接服务器
        if (isLocalBridgeMode()) {
          const { initLocalBridge } = await import('../bridge/localBridge.js');
          const localHandle = await initLocalBridge({
            outboundOnly: false,
            role: 'host',
            onInboundMessage: async (msg: Record<string, unknown>) => {
              logForDebugging(`[bridge:local] 收到入站消息: ${JSON.stringify(msg).slice(0, 200)}`);
            },
            onPermissionResponse: (msg: Record<string, unknown>) => {
              logForDebugging(`[bridge:local] 权限响应: ${JSON.stringify(msg).slice(0, 200)}`);
            },
            onStateChange: (state: string, detail?: string) => {
              if (cancelled) return;
              switch (state) {
                case 'ready':
                  setAppState(prev => ({ ...prev, replBridgeConnected: true, replBridgeError: undefined }));
                  break;
                case 'connected':
                  setAppState(prev => ({
                    ...prev,
                    replBridgeConnected: true,
                    replBridgeSessionActive: true,
                    replBridgeError: undefined,
                  }));
                  setMessages(prev => [...prev, createBridgeStatusMessage('本地桥接已连接 (桥接服务器 5678)')]);
                  break;
                case 'failed':
                  notifyBridgeFailed(detail);
                  setAppState(prev => ({ ...prev, replBridgeError: detail, replBridgeConnected: false }));
                  break;
                case 'disconnected':
                  setAppState(prev => ({ ...prev, replBridgeConnected: false, replBridgeSessionActive: false }));
                  break;
              }
            },
            sessionId: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            initialName: replBridgeInitialName || undefined,
          });
          if (cancelled) {
            if (localHandle) await localHandle.teardown();
            return;
          }
          if (!localHandle) {
            consecutiveFailuresRef.current++;
            setAppState(prev => ({ ...prev, replBridgeError: prev.replBridgeError ?? '本地桥接连接失败' }));
            failureTimeoutRef.current = setTimeout(() => {
              if (cancelled) return;
              failureTimeoutRef.current = undefined;
              setAppState(prev => {
                if (!prev.replBridgeError) return prev;
                return { ...prev, replBridgeEnabled: false, replBridgeError: undefined };
              });
            }, BRIDGE_FAILURE_DISMISS_MS);
            return;
          }
          handleRef.current = localHandle as unknown as ReplBridgeHandle;
          setReplBridgeHandle(localHandle as unknown as ReplBridgeHandle);
          consecutiveFailuresRef.current = 0;
          setAppState(prev => ({
            ...prev,
            replBridgeConnected: true,
            replBridgeSessionActive: true,
            replBridgeSessionId: localHandle.bridgeSessionId,
            replBridgeError: undefined,
          }));
          setMessages(prev => [...prev, createBridgeStatusMessage('本地桥接已连接 (ws://localhost:5678)')]);
          logForDebugging('[bridge:repl] 本地桥接已连接');
          return;
        }

        // 正常桥接模式（Anthropic 云端）
        const { initReplBridge } = await import('../bridge/initReplBridge.js');
        const { shouldShowAppUpgradeMessage } = await import('../bridge/envLessBridgeConfig.js');

        let perpetual = false;
        if (feature('KAIROS')) {
          const { isAssistantMode } = await import('../assistant/index.js');
          perpetual = isAssistantMode();
        }

        async function handleInboundMessage(msg: SDKMessage): Promise<void> {
          try {
            const fields = extractInboundMessageFields(msg);
            if (!fields) return;
            const { uuid, toolUseBlocks } = fields;
            if (toolUseBlocks && toolUseBlocks.length > 0) {
              logForDebugging(`[bridge:repl] 注入入站用户消息（包含 ${toolUseBlocks.length} 个工具调用）${uuid ? ` uuid=${uuid}` : ''}`);
              const userMessage = {
                type: 'user' as const,
                message: { role: 'user' as const, content: fields.content as unknown as Record<string, unknown>[] },
                session_id: 'bridge-inbound',
                parent_tool_use_id: null,
                uuid: uuid || undefined,
              };
              enqueue({ value: userMessage, mode: 'prompt' as const, uuid, skipSlashCommands: true, bridgeOrigin: true });
            } else {
              const { resolveAndPrepend } = await import('../bridge/inboundAttachments.js');
              let sanitized = fields.content;
              if (feature('KAIROS_GITHUB_WEBHOOKS')) {
                const { sanitizeInboundWebhookContent } = require('../bridge/webhookSanitizer.js') as typeof import('../bridge/webhookSanitizer.js');
                sanitized = sanitizeInboundWebhookContent(fields.content);
              }
              const content = await resolveAndPrepend(msg, sanitized);
              const preview = typeof content === 'string' ? content.slice(0, 80) : `[${content.length} 个内容块]`;
              logForDebugging(`[bridge:repl] 注入入站用户消息：${preview}${uuid ? ` uuid=${uuid}` : ''}`);
              enqueue({ value: content, mode: 'prompt' as const, uuid, skipSlashCommands: true, bridgeOrigin: true });
            }
          } catch (e) {
            logForDebugging(`[bridge:repl] handleInboundMessage 失败：${e}`, { level: 'error' });
          }
        }

        function handleStateChange(state: BridgeState, detail_0?: string): void {
          if (cancelled) return;
          if (outboundOnly) {
            logForDebugging(`[bridge:repl] 镜像状态=${state}${detail_0 ? ` detail=${detail_0}` : ''}`);
            if (state === 'failed') {
              setAppState(prev => { if (!prev.replBridgeConnected) return prev; return { ...prev, replBridgeConnected: false }; });
            } else if (state === 'ready' || state === 'connected') {
              setAppState(prev => { if (prev.replBridgeConnected) return prev; return { ...prev, replBridgeConnected: true }; });
            }
            return;
          }
          const handle = handleRef.current;
          switch (state) {
            case 'ready':
              setAppState(prev => {
                const connectUrl = handle && handle.environmentId !== '' ? buildBridgeConnectUrl(handle.environmentId, handle.sessionIngressUrl) : prev.replBridgeConnectUrl;
                const sessionUrl = handle ? getRemoteSessionUrl(handle.bridgeSessionId, handle.sessionIngressUrl) : prev.replBridgeSessionUrl;
                const envId = handle?.environmentId;
                const sessionId = handle?.bridgeSessionId;
                if (prev.replBridgeConnected && !prev.replBridgeSessionActive && !prev.replBridgeReconnecting && prev.replBridgeConnectUrl === connectUrl && prev.replBridgeSessionUrl === sessionUrl && prev.replBridgeEnvironmentId === envId && prev.replBridgeSessionId === sessionId) {
                  return prev;
                }
                return {
                  ...prev,
                  replBridgeConnected: true,
                  replBridgeSessionActive: false,
                  replBridgeReconnecting: false,
                  replBridgeConnectUrl: connectUrl,
                  replBridgeSessionUrl: sessionUrl,
                  replBridgeEnvironmentId: envId,
                  replBridgeSessionId: sessionId,
                  replBridgeError: undefined
                };
              });
              break;
            case 'connected':
              setAppState(prev => {
                if (prev.replBridgeSessionActive) return prev;
                return { ...prev, replBridgeConnected: true, replBridgeSessionActive: true, replBridgeReconnecting: false, replBridgeError: undefined };
              });
              if (getFeatureValue_CACHED_MAY_BE_STALE('tengu_bridge_system_init', false)) {
                void (async () => {
                  try {
                    const skills = await getSlashCommandToolSkills(getCwd());
                    if (cancelled) return;
                    const state_0 = store.getState();
                    handleRef.current?.writeSdkMessages([buildSystemInitMessage({
                      tools: [], mcpClients: [], model: mainLoopModelRef.current,
                      permissionMode: state_0.toolPermissionContext.mode as PermissionMode,
                      commands: commandsRef.current.filter(isBridgeSafeCommand),
                      agents: state_0.agentDefinitions.activeAgents, skills, plugins: [],
                      fastMode: state_0.fastMode
                    })]);
                  } catch (err_0) {
                    logForDebugging(`[bridge:repl] 发送 system/init 失败：${errorMessage(err_0)}`, { level: 'error' });
                  }
                })();
              }
              break;
            case 'reconnecting':
              setAppState(prev => {
                if (prev.replBridgeReconnecting) return prev;
                return { ...prev, replBridgeReconnecting: true, replBridgeSessionActive: false };
              });
              break;
            case 'failed':
              clearTimeout(failureTimeoutRef.current);
              notifyBridgeFailed(detail_0);
              setAppState(prev => ({
                ...prev, replBridgeError: detail_0, replBridgeReconnecting: false,
                replBridgeSessionActive: false, replBridgeConnected: false
              }));
              failureTimeoutRef.current = setTimeout(() => {
                if (cancelled) return;
                failureTimeoutRef.current = undefined;
                setAppState(prev => {
                  if (!prev.replBridgeError) return prev;
                  return { ...prev, replBridgeEnabled: false, replBridgeError: undefined };
                });
              }, BRIDGE_FAILURE_DISMISS_MS);
              break;
          }
        }

        const pendingPermissionHandlers = new Map<string, (response: BridgePermissionResponse) => void>();
        function handlePermissionResponse(msg_0: SDKControlResponse): void {
          const requestId = msg_0.response?.request_id;
          if (!requestId) return;
          const handler = pendingPermissionHandlers.get(requestId);
          if (!handler) return;
          pendingPermissionHandlers.delete(requestId);
          const inner = msg_0.response;
          if (inner.subtype === 'success' && inner.response && isBridgePermissionResponse(inner.response)) {
            handler(inner.response);
          }
        }

        const handle_0 = await initReplBridge({
          outboundOnly,
          tags: outboundOnly ? ['ccr-mirror'] : undefined,
          onInboundMessage: handleInboundMessage,
          onPermissionResponse: handlePermissionResponse,
          onInterrupt() { abortControllerRef.current?.abort(); },
          onSetModel(model) {
            const resolved = model === 'default' ? null : model ?? null;
            setMainLoopModelOverride(resolved);
            setAppState(prev => {
              if (prev.mainLoopModelForSession === resolved) return prev;
              return { ...prev, mainLoopModelForSession: resolved };
            });
          },
          onSetMaxThinkingTokens(maxTokens) {
            const enabled = maxTokens !== null;
            setAppState(prev => {
              if (prev.thinkingEnabled === enabled) return prev;
              return { ...prev, thinkingEnabled: enabled };
            });
          },
          onSetPermissionMode(mode) {
            if (mode === 'bypassPermissions') {
              if (isBypassPermissionsModeDisabled()) return { ok: false, error: 'bypassPermissions 已被禁用' };
              if (!store.getState().toolPermissionContext.isBypassPermissionsModeAvailable) {
                return { ok: false, error: '会话未使用 --dangerously-skip-permissions 启动' };
              }
            }
            if (feature('TRANSCRIPT_CLASSIFIER') && mode === 'auto' && !isAutoModeGateEnabled()) {
              const reason = getAutoModeUnavailableReason();
              return { ok: false, error: reason ? `无法设置为 auto：${getAutoModeUnavailableNotification(reason)}` : '无法设置为 auto' };
            }
            setAppState(prev => {
              const current = prev.toolPermissionContext.mode;
              if (current === mode) return prev;
              const next = transitionPermissionMode(current, mode, prev.toolPermissionContext);
              return { ...prev, toolPermissionContext: { ...next, mode } };
            });
            setImmediate(() => { getLeaderToolUseConfirmQueue()?.(currentQueue => { currentQueue.forEach(item => { void item.recheckPermission(); }); return currentQueue; }); });
            return { ok: true };
          },
          onStateChange: handleStateChange,
          initialMessages: messages.length > 0 ? messages : undefined,
          getMessages: () => messagesRef.current,
          previouslyFlushedUUIDs: flushedUUIDsRef.current,
          initialName: replBridgeInitialName,
          perpetual
        });

        if (cancelled) {
          logForDebugging(`[bridge:repl] 钩子：初始化在飞行中被取消，正在拆除${handle_0 ? ` env=${handle_0.environmentId}` : ''}`);
          if (handle_0) { void handle_0.teardown(); }
          return;
        }
        if (!handle_0) {
          consecutiveFailuresRef.current++;
          logForDebugging(`[bridge:repl] 初始化返回 null（前提条件或会话创建失败）；连续失败次数：${consecutiveFailuresRef.current}`);
          clearTimeout(failureTimeoutRef.current);
          setAppState(prev => ({ ...prev, replBridgeError: prev.replBridgeError ?? '检查调试日志以了解详细信息' }));
          failureTimeoutRef.current = setTimeout(() => {
            if (cancelled) return;
            failureTimeoutRef.current = undefined;
            setAppState(prev => {
              if (!prev.replBridgeError) return prev;
              return { ...prev, replBridgeEnabled: false, replBridgeError: undefined };
            });
          }, BRIDGE_FAILURE_DISMISS_MS);
          return;
        }
        handleRef.current = handle_0;
        setReplBridgeHandle(handle_0);
        consecutiveFailuresRef.current = 0;
        lastWrittenIndexRef.current = initialMessageCount;
        if (outboundOnly) {
          setAppState(prev => {
            if (prev.replBridgeConnected && prev.replBridgeSessionId === handle_0.bridgeSessionId) return prev;
            return { ...prev, replBridgeConnected: true, replBridgeSessionId: handle_0.bridgeSessionId, replBridgeSessionUrl: undefined, replBridgeConnectUrl: undefined, replBridgeError: undefined };
          });
          logForDebugging(`[bridge:repl] 镜像已初始化，会话=${handle_0.bridgeSessionId}`);
        } else {
          const permissionCallbacks: BridgePermissionCallbacks = {
            sendRequest(requestId_0, toolName, input, toolUseId, description, permissionSuggestions, blockedPath) {
              handle_0.sendControlRequest({ type: 'control_request', request_id: requestId_0, request: { subtype: 'can_use_tool', tool_name: toolName, input, tool_use_id: toolUseId, description, ...(permissionSuggestions ? { permission_suggestions: permission_suggestions } : {}), ...(blockedPath ? { blocked_path: blockedPath } : {}) } });
            },
            sendResponse(requestId_1, response) {
              const payload: Record<string, unknown> = { ...response };
              handle_0.sendControlResponse({ type: 'control_response', response: { subtype: 'success', request_id: requestId_1, response: payload } });
            },
            cancelRequest(requestId_2) { handle_0.sendControlCancelRequest(requestId_2); },
            onResponse(requestId_3, handler_0) {
              pendingPermissionHandlers.set(requestId_3, handler_0);
              return () => { pendingPermissionHandlers.delete(requestId_3); };
            }
          };
          setAppState(prev => ({ ...prev, replBridgePermissionCallbacks: permissionCallbacks }));
          const url = getRemoteSessionUrl(handle_0.bridgeSessionId, handle_0.sessionIngressUrl);
          const hasEnv = handle_0.environmentId !== '';
          const connectUrl_0 = hasEnv ? buildBridgeConnectUrl(handle_0.environmentId, handle_0.sessionIngressUrl) : undefined;
          setAppState(prev => {
            if (prev.replBridgeConnected && prev.replBridgeSessionUrl === url) return prev;
            return { ...prev, replBridgeConnected: true, replBridgeSessionUrl: url, replBridgeConnectUrl: connectUrl_0 ?? prev.replBridgeConnectUrl, replBridgeEnvironmentId: handle_0.environmentId, replBridgeSessionId: handle_0.bridgeSessionId, replBridgeError: undefined };
          });

          const upgradeNudge = !perpetual ? await shouldShowAppUpgradeMessage().catch(() => false) : false;
          if (cancelled) return;
          setMessages(prev => [...prev, createBridgeStatusMessage(url, upgradeNudge ? '请升级到最新版本的 Claude 移动应用。' : undefined)]);
          logForDebugging(`[bridge:repl] 钩子已初始化，会话=${handle_0.bridgeSessionId}`);
        }
      } catch (err) {
        if (cancelled) return;
        consecutiveFailuresRef.current++;
        const errMsg = errorMessage(err);
        logForDebugging(`[bridge:repl] 初始化失败：${errMsg}；连续失败次数：${consecutiveFailuresRef.current}`);
        clearTimeout(failureTimeoutRef.current);
        notifyBridgeFailed(errMsg);
        setAppState(prev => ({ ...prev, replBridgeError: errMsg }));
        failureTimeoutRef.current = setTimeout(() => {
          if (cancelled) return;
          failureTimeoutRef.current = undefined;
          setAppState(prev => {
            if (!prev.replBridgeError) return prev;
            return { ...prev, replBridgeEnabled: false, replBridgeError: undefined };
          });
        }, BRIDGE_FAILURE_DISMISS_MS);
        if (!outboundOnly) {
          setMessages(prev => [...prev, createSystemMessage(`远程控制连接失败：${errMsg}`, 'warning')]);
        }
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(failureTimeoutRef.current);
      failureTimeoutRef.current = undefined;
      if (handleRef.current) {
        logForDebugging(`[bridge:repl] 钩子清理：开始拆除 env=${handleRef.current.environmentId} 会话=${handleRef.current.bridgeSessionId}`);
        teardownPromiseRef.current = handleRef.current.teardown();
        handleRef.current = null;
        setReplBridgeHandle(null);
      }
      setAppState(prev => {
        if (!prev.replBridgeConnected && !prev.replBridgeSessionActive && !prev.replBridgeError) return prev;
        return { ...prev, replBridgeConnected: false, replBridgeSessionActive: false, replBridgeReconnecting: false, replBridgeConnectUrl: undefined, replBridgeSessionUrl: undefined, replBridgeEnvironmentId: undefined, replBridgeSessionId: undefined, replBridgeError: undefined, replBridgePermissionCallbacks: undefined };
      });
      lastWrittenIndexRef.current = 0;
    };
  }, [replBridgeEnabled, replBridgeOutboundOnly, setAppState, setMessages, addNotification]);

  // 消息转发 effect
  useEffect(() => {
    if (!isLocalBridgeMode() && !feature('BRIDGE_MODE')) return;
    if (!replBridgeConnected) return;
    const handle_1 = handleRef.current;
    if (!handle_1) return;
    if (lastWrittenIndexRef.current > messages.length) {
      logForDebugging(`[bridge:repl] 检测到压缩：lastWrittenIndex=${lastWrittenIndexRef.current} > messages.length=${messages.length}，正在钳制`);
    }
    const startIndex = Math.min(lastWrittenIndexRef.current, messages.length);
    const newMessages: Message[] = [];
    for (let i = startIndex; i < messages.length; i++) {
      const msg_1 = messages[i];
      if (msg_1 && (msg_1.type === 'user' || msg_1.type === 'assistant' || msg_1.type === 'system' && msg_1.subtype === 'local_command')) {
        newMessages.push(msg_1);
      }
    }
    lastWrittenIndexRef.current = messages.length;
    if (newMessages.length > 0) {
      handle_1.writeMessages(newMessages);
    }
  }, [messages, replBridgeConnected]);

  const sendBridgeResult = useCallback(() => {
    if (isLocalBridgeMode() || feature('BRIDGE_MODE')) {
      handleRef.current?.sendResult();
    }
  }, []);

  return { sendBridgeResult };
}
