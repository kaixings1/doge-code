import { feature } from 'bun:bundle';
import React, { useCallback, useEffect, useRef } from 'react';
import { isLocalBridgeMode } from '../bridge/bridgeConfig.js';
import { setMainLoopModelOverride } from '../bootstrap/state.js';
import { type BridgePermissionCallbacks, type BridgePermissionResponse, isBridgePermissionResponse } from '../bridge/bridgePermissionCallbacks.js';
import { buildBridgeConnectUrl } from '../bridge/bridgeStatusUtil.js';
import { extractInboundMessageFields } from '../bridge/inboundMessages.js';
import type { BridgeState, ReplBridgeHandle } from '../bridge/replBridge.js';
import { setReplBridgeHandle } from '../bridge/replBridgeHandle.js';
import { getActiveMobileBridgeServer, pushToMobileClients, registerMobileHistoryProvider, type MobileReplayItem } from '../bridge/mobileBridge.js';
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

/**
 * 从消息中提取可推送给手机端的纯文本。
 * 仅取 text 内容块，忽略工具调用、tool_result 等非展示内容。
 */
function extractPlainText(m: Message): string {
  const content = (m as { message?: { content?: unknown } }).message?.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content) {
    if (block && typeof block === 'object' && (block as { type?: string }).type === 'text') {
      const text = (block as { text?: unknown }).text;
      if (typeof text === 'string') parts.push(text);
    }
  }
  return parts.join('\n');
}

/**
 * 判断一条消息是否含有可推送给手机端的内容。
 * 与 extractPlainText 不同：这里只看「有没有」，不取文本，用于区分
 * 「回复确实是空的」与「回复内容结构不被 extractPlainText 识别」。
 */
function hasPushableContent(m: Message): boolean {
  const content = (m as { message?: { content?: unknown } }).message?.content;
  if (typeof content === 'string') return content.length > 0;
  if (!Array.isArray(content)) return false;
  return content.some(
    b => b && typeof b === 'object' && (b as { type?: string }).type === 'text',
  );
}

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

  // 注册「历史消息提供者」供移动端重连回放（catch-up）。
  // 设备断网/切后台期间产生的消息，实时广播送不到；它重连时由
  // mobileBridge 调用此 getter 拿当前会话全文，定向回放给该设备。
  // 读 messagesRef（始终指向最新数组），故只需注册一次、无依赖。
  useEffect(() => {
    registerMobileHistoryProvider(() => {
      const out: MobileReplayItem[] = [];
      // 工具结果按 tool_use_id 索引，等遇到对应的 tool_use 时配对合并，
      // 避免「命令」与「结果」在历史里各占一条（与实时推送同样的合并语义）。
      const resultById = new Map<string, { output: string; error: boolean }>();
      const blocksOf = (m: Message): any[] => {
        const c = (m as { message?: { content?: unknown } }).message?.content;
        return Array.isArray(c) ? (c as any[]) : [];
      };
      // 先扫一遍收集 tool_result（它们在后续 user 消息里）
      for (const m of messagesRef.current) {
        for (const b of blocksOf(m)) {
          if (b && b.type === 'tool_result' && typeof b.tool_use_id === 'string') {
            const outText = typeof b.content === 'string'
              ? b.content
              : Array.isArray(b.content)
                ? b.content.filter((x: any) => x?.type === 'text').map((x: any) => x.text).join('\n')
                : '';
            resultById.set(b.tool_use_id, { output: outText, error: b.is_error === true });
          }
        }
      }
      for (const m of messagesRef.current) {
        if (!m) continue;
        if (m.type !== 'user' && m.type !== 'assistant') continue;
        for (const b of blocksOf(m)) {
          // 思考块：让手机历史也看得到「AI 在想什么」
          if (b && b.type === 'thinking' && typeof b.thinking === 'string' && b.thinking.trim()) {
            out.push({ role: 'thinking', text: b.thinking });
          }
          // 工具调用：配对结果
          if (b && b.type === 'tool_use' && typeof b.name === 'string') {
            const id = typeof b.id === 'string' ? b.id : '';
            const res = id ? resultById.get(id) : null;
            // target 取 input 里最能说明「这次在做什么」的字段 —— 与手机端
            // 实时气泡标题口径一致（标题含 target），否则去重会失配。
            const inp = (b.input ?? {}) as Record<string, unknown>
            const target = String(
              inp.file_path ?? inp.path ?? inp.command ?? inp.pattern ?? inp.query ?? '',
            ).slice(0, 200);
            out.push({
              role: 'tool',
              name: b.name,
              target,
              detail: typeof b.input === 'object' ? JSON.stringify(b.input) : String(b.input ?? ''),
              result: res ? res.output : '',
              toolUseId: id,
            });
          }
        }
        // 正文放在活动之后：与实时顺序一致（先思考/工具，再最终回复）
        const text = extractPlainText(m);
        if (text) out.push({ role: m.type, text });
      }
      return out;
    });
    return () => registerMobileHistoryProvider(null);
  }, []);

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
            <Text color="error">✗ 远程控制失败</Text>
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

        // 把入站消息投递给 REPL 处理（enqueue 到命令队列）。
        // 本地桥接与云端桥接必须共用此逻辑——曾因本地桥分支只 log 不 enqueue，
        // 导致本地桥模式下客户端发的消息被静默丢弃、界面无任何回应。
        async function deliverInboundMessage(msg: SDKMessage): Promise<void> {
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
                const { sanitizeWebhookPayload } = require('../bridge/webhookSanitizer.js') as typeof import('../bridge/webhookSanitizer.js');
                sanitized = sanitizeWebhookPayload(fields.content);
              }
              const content = await resolveAndPrepend(msg, sanitized);
              const preview = typeof content === 'string' ? content.slice(0, 80) : `[${content.length} 个内容块]`;
              logForDebugging(`[bridge:repl] 注入入站用户消息：${preview}${uuid ? ` uuid=${uuid}` : ''}`);
              enqueue({ value: content, mode: 'prompt' as const, uuid, skipSlashCommands: true, bridgeOrigin: true });
            }
          } catch (e) {
            logForDebugging(`[bridge:repl] 入站消息投递失败：${e}`, { level: 'error' });
          }
        }

        // 本地桥接模式：连接本地桥接服务器
        if (isLocalBridgeMode()) {
          const { initLocalBridge } = await import('../bridge/localBridge.js');
          const localHandle = await initLocalBridge({
            outboundOnly: false,
            role: 'host',
            onInboundMessage: async (msg: Record<string, unknown>) => {
              logForDebugging(`[bridge:local] 收到入站消息: ${JSON.stringify(msg).slice(0, 200)}`);
              // 曾只 log 不投递，导致本地桥模式下消息被静默丢弃、界面无回应。
              await deliverInboundMessage(msg as unknown as SDKMessage);
            },
            onPermissionResponse: (msg: Record<string, unknown>) => {
              logForDebugging(`[bridge:local] 权限响应: ${JSON.stringify(msg).slice(0, 200)}`);
              // 与入站消息同理：曾只 log 不处理，本地桥模式下客户端的权限
              // 授权响应被丢弃，导致 REPL 侧权限请求永久挂起。
              handlePermissionResponse(msg as unknown as SDKControlResponse);
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
          return deliverInboundMessage(msg);
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
              // 【修复 --dsp 别名及运行时切换】以下原始检查已注释，原因：
              // 原逻辑要求 isBypassPermissionsModeAvailable 为 true 才能切换到 bypassPermissions，
              // 导致启动时未加 --dsp 的用户无法通过 Shift+Tab 切换进入绕过权限模式。
              // 现在改为允许随时切换（仅检查是否被禁用）。
              // if (!store.getState().toolPermissionContext.isBypassPermissionsModeAvailable) {
              //   return { ok: false, error: '会话未使用 --dangerously-skip-permissions 或 --dsp 启动' };
              // }
              if (isBypassPermissionsModeDisabled()) return { ok: false, error: 'bypassPermissions 已被禁用' };
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
              handle_0.sendControlRequest({ type: 'control_request', request_id: requestId_0, request: { subtype: 'can_use_tool', tool_name: toolName, input, tool_use_id: toolUseId, description, ...(permissionSuggestions ? { permission_suggestions: permissionSuggestions } : {}), ...(blockedPath ? { blocked_path: blockedPath } : {}) } });
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

  // 手机端推送：必须独立于上面的桥接 effect。
  // 上面的 effect 有三个守卫（isLocalBridgeMode/BRIDGE_MODE、replBridgeConnected、
  // handleRef），而移动桥接（CLAUDE_CODE_MOBILE_BRIDGE=1）并不满足它们——
  // replBridgeConnected 仅在 feature('BRIDGE_MODE') 为真时才读 AppState，
  // 否则恒为 false。若把推送放在那里，手机永远收不到回复。
  const mobilePushIndexRef = useRef(0);
  useEffect(() => {
    // 游标必须先推进，再判断是否推送。
    // 若先 `if (!server) return`，服务器未启动期间（手机尚未扫码）游标停留
    // 在 0，等手机连上后首个 effect 会把整段历史对话一次性灌给手机。
    const start = Math.min(mobilePushIndexRef.current, messages.length);
    mobilePushIndexRef.current = messages.length;
    const server = getActiveMobileBridgeServer();
    // 「无活动服务器」是常态（未启用手机桥接时恒成立），不是事件。
    // 此处曾每次 messages 变化都打一条日志，实测单会话刷出 3.7 万条。
    // 游标推进逻辑见上方注释；若需排查推送时序，用下方成功路径的汇总日志
    // 或 mobileBridge 自身的调试输出，不必在常态分支记录。
    if (!server) return
    let pushed = 0;
    let skippedEmpty = 0;
    let skippedUnrecognized = 0;
    for (let i = start; i < messages.length; i++) {
      const m = messages[i];
      if (!m) continue;
      if (m.type !== 'user' && m.type !== 'assistant') continue;
      const text = extractPlainText(m);
      if (!text) {
        // 区分「确实是空消息」与「有内容但结构不被识别」——后者是真实的
        // 推送丢失，此前因静默 continue 而无任何线索（手机只看到"已提交"）。
        if (hasPushableContent(m)) {
          skippedUnrecognized++;
          logForDebugging(
            `[mobile-push] 消息有内容但提取为空（结构不被识别），跳过 role=${m.type} index=${i}`,
          );
        } else {
          skippedEmpty++;
        }
        continue;
      }
      // 推送是旁路能力：任何异常都不得影响主流程
      try {
        // 透传消息 uuid 作为 sourceUuid：手机端发送的消息在入站时已被
        // enqueue 赋了「手机端 requestId」作为 uuid（见 forwardToBridge），
        // 原样回推后手机端据此精确去重「自己发出、被服务端回推」的那条。
        // 不传则回推帧缺该字段 → 手机端 sourceRequestId 为空 →
        // 去重失败 → 同一条消息显示两次（本地回显 + 服务端回推）。
        // 服务端本地产生的消息（终端键入等）无 uuid，不去重，符合预期。
        logForDebugging(`[mobile-push][PROBE] push role=${m.type} uuid=${String(m.uuid)} text=${text.slice(0, 20)}`);
        pushToMobileClients({ role: m.type, text, sourceUuid: m.uuid });
        pushed++;
      } catch (e) {
        logForDebugging(`[bridge:repl] 推送移动端失败（已忽略）：${errorMessage(e)}`);
      }
    }
    logForDebugging(
      `[mobile-push] effect 触发，messages=${messages.length}，range=[${start},${messages.length})，已推送=${pushed}，空消息=${skippedEmpty}，结构未识别=${skippedUnrecognized}，客户端=${server.getClientCount()}`,
    );
  }, [messages]);

  // 飞书推送：与手机端同理，必须独立于上面的桥接 effect。
  // 飞书入站走 enqueue（见 services/feishu/index.ts），回复从这里取，
  // 按入站顺序写回对应卡片。未启用飞书或无等待中的请求时静默跳过。
  const feishuPushIndexRef = useRef(0);
  useEffect(() => {
    // 游标必须先推进再判断，理由同手机端（避免连上后一次性灌入历史）。
    const start = Math.min(feishuPushIndexRef.current, messages.length);
    feishuPushIndexRef.current = messages.length;
    // 动态导入：飞书服务依赖 webhook/卡片模块，不应进入每个会话的首屏路径。
    void import('../services/feishu/index.js')
      .then(({ getFeishuBridge, pushAssistantTextToFeishu }) => {
        // 未启动飞书桥接是常态，直接返回（不产生日志噪音）。
        if (!getFeishuBridge()) return;
        for (let i = start; i < messages.length; i++) {
          const m = messages[i];
          if (!m || m.type !== 'assistant') continue;
          const text = extractPlainText(m);
          if (!text) continue;
          // 旁路能力：异常不得影响主流程
          void pushAssistantTextToFeishu(text).catch(() => {});
        }
      })
      .catch(() => {});
  }, [messages]);

  const sendBridgeResult = useCallback(() => {
    if (isLocalBridgeMode() || feature('BRIDGE_MODE')) {
      handleRef.current?.sendResult();
    }
  }, []);

  return { sendBridgeResult };
}
