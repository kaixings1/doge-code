import { feature } from 'bun:bundle';
import React, { useCallback, useEffect, useRef } from 'react';
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

/** 失败后自动清除 replBridgeEnabled 前等待的时间（毫秒）（停止重试）。 */
export const BRIDGE_FAILURE_DISMISS_MS = 10_000;

/**
 * 在钩子停止重试之前，连续调用 initReplBridge 失败的最大次数（会话生命周期内）。
 * 防止在底层 OAuth 无法恢复的情况下，通过设置同步、/remote-control、配置工具等方式在自动禁用后重新打开 replBridgeEnabled 的路径
 * —— 每次重试都会对 POST /v1/environments/bridge 产生一次必然的 401 错误。
 * Datadog 2026-03-08：最严重的卡住客户端每天产生 2,879 次 401 错误（占该路由所有 401 错误的 17%）。
 */
const MAX_CONSECUTIVE_INIT_FAILURES = 3;

/**
 * 钩子，用于在后台初始化始终在线的桥接连接，并将新的用户/助手消息写入桥接会话。
 *
 * 如果未启用桥接或用户未经过 OAuth 身份验证，则静默跳过。
 *
 * 监听 AppState.replBridgeEnabled —— 当通过 /config 或页脚关闭时，桥接被拆除。
 * 当重新打开时，会重新初始化。
 *
 * 来自 claude.ai 的入站消息通过 queuedCommands 注入到 REPL 中。
 */
export function useReplBridge(messages: Message[], setMessages: (action: React.SetStateAction<Message[]>) => void, abortControllerRef: React.RefObject<AbortController | null>, commands: readonly Command[], mainLoopModel: string): {
  sendBridgeResult: () => void;
} {
  const handleRef = useRef<ReplBridgeHandle | null>(null);
  const teardownPromiseRef = useRef<Promise<void> | undefined>(undefined);
  const lastWrittenIndexRef = useRef(0);
  // 跟踪已作为初始消息刷新的 UUID。跨桥接重连持久化，以便第二次及以后的桥接只发送新消息
  // —— 发送重复的 UUID 会导致服务器关闭 WebSocket。
  const flushedUUIDsRef = useRef(new Set<string>());
  const failureTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // 跨 effect 重新运行持久化（与 effect 的局部状态不同）。仅在成功初始化时重置。
  // 达到 MAX_CONSECUTIVE_INIT_FAILURES 后，会话期间熔断器断开，无论 replBridgeEnabled 如何重新切换。
  const consecutiveFailuresRef = useRef(0);
  const setAppState = useSetAppState();
  const commandsRef = useRef(commands);
  commandsRef.current = commands;
  const mainLoopModelRef = useRef(mainLoopModel);
  mainLoopModelRef.current = mainLoopModel;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const store = useAppStateStore();
  const {
    addNotification
  } = useNotifications();
  const replBridgeEnabled = feature('BRIDGE_MODE') ?
  // biome-ignore lint/correctness/useHookAtTopLevel: feature() 是编译时常量
  useAppState(s => s.replBridgeEnabled) : false;
  const replBridgeConnected = feature('BRIDGE_MODE') ?
  // biome-ignore lint/correctness/useHookAtTopLevel: feature() 是编译时常量
  useAppState(s_0 => s_0.replBridgeConnected) : false;
  const replBridgeOutboundOnly = feature('BRIDGE_MODE') ?
  // biome-ignore lint/correctness/useHookAtTopLevel: feature() 是编译时常量
  useAppState(s_1 => s_1.replBridgeOutboundOnly) : false;
  const replBridgeInitialName = feature('BRIDGE_MODE') ?
  // biome-ignore lint/correctness/useHookAtTopLevel: feature() 是编译时常量
  useAppState(s_2 => s_2.replBridgeInitialName) : undefined;

  // 当启用状态发生变化时初始化/拆除桥接。
  // 传递当前消息作为 initialMessages，以便远程会话以现有对话上下文开始（例如来自 /bridge）。
  useEffect(() => {
    // feature() 检查必须使用正模式以实现死代码消除 ——
    // 负模式（if (!feature(...)) return）不会消除下面的动态导入。
    if (feature('BRIDGE_MODE')) {
      if (!replBridgeEnabled) return;
      const outboundOnly = replBridgeOutboundOnly;
      function notifyBridgeFailed(detail?: string): void {
        if (outboundOnly) return;
        addNotification({
          key: 'bridge-failed',
          jsx: <>
              <Text color="error">远程控制失败</Text>
              {detail && <Text dimColor> · {detail}</Text>}
            </>,
          priority: 'immediate'
        });
      }
      if (consecutiveFailuresRef.current >= MAX_CONSECUTIVE_INIT_FAILURES) {
        logForDebugging(`[bridge:repl] 钩子：${consecutiveFailuresRef.current} 次连续初始化失败，本次会话不再重试`);
        // 清除 replBridgeEnabled，这样 /remote-control 就不会错误地为从未连接过的桥接显示 BridgeDisconnectDialog。
        const fuseHint = '因重复失败已禁用 · 重启以重试';
        notifyBridgeFailed(fuseHint);
        setAppState(prev => {
          if (prev.replBridgeError === fuseHint && !prev.replBridgeEnabled) return prev;
          return {
            ...prev,
            replBridgeError: fuseHint,
            replBridgeEnabled: false
          };
        });
        return;
      }
      let cancelled = false;
      // 现在捕获 messages.length，这样我们就不会在桥接连接后通过 writeMessages 重新发送初始消息。
      const initialMessageCount = messages.length;
      void (async () => {
        try {
          // 在注册新环境之前等待任何正在进行的拆除完成。
          // 否则，前一个拆除中的注销 HTTP 调用会与新注册调用产生竞争，
          // 服务器可能会拆除刚刚创建的环境。
          if (teardownPromiseRef.current) {
            logForDebugging('[bridge:repl] 钩子：等待前一次拆除完成后再重新初始化');
            await teardownPromiseRef.current;
            teardownPromiseRef.current = undefined;
            logForDebugging('[bridge:repl] 钩子：前一次拆除已完成，继续重新初始化');
          }
          if (cancelled) return;

          // 动态导入，以便该模块在外部构建中被树摇
          const {
            initReplBridge
          } = await import('../bridge/initReplBridge.js');
          const {
            shouldShowAppUpgradeMessage
          } = await import('../bridge/envLessBridgeConfig.js');

          // 助手模式：持久的桥接会话 —— claude.ai 在 CLI 重启之间显示一个连续的对话，而不是每次调用一个新会话。
          // initBridgeCore 读取 bridge-pointer.json（#20735 添加的同一崩溃恢复文件）并通过 reuseEnvironmentId +
          // api.reconnectSession() 重用其 {environmentId, sessionId}。
          // 拆除时跳过 archive/deregister/pointer-clear，以便会话在正常退出（不仅是崩溃）后仍然存活。
          // 非助手模式的桥接在拆除时会清除指针（仅用于崩溃恢复）。
          let perpetual = false;
          if (feature('KAIROS')) {
            const {
              isAssistantMode
            } = await import('../assistant/index.js');
            perpetual = isAssistantMode();
          }

          // 当来自 claude.ai 的用户消息到达时，将其注入 REPL。
          // 保留原始 UUID，以便当消息被转发回 CCR 时，与原始消息匹配 —— 避免重复消息。
          //
          // 异步处理，因为 file_attachments（如果存在）需要进行网络获取 + 磁盘写入，然后才能以 @path 前缀入队。
          // 调用者不等待 —— 带有附件的消息只是稍晚一点到达队列，这没问题（Web 消息不是快速连续的）。
          async function handleInboundMessage(msg: SDKMessage): Promise<void> {
            try {
              const fields = extractInboundMessageFields(msg);
              if (!fields) return;
              const {
                uuid
              } = fields;

              // 动态导入，使桥接代码远离非 BRIDGE_MODE 构建。
              const {
                resolveAndPrepend
              } = await import('../bridge/inboundAttachments.js');
              let sanitized = fields.content;
              if (feature('KAIROS_GITHUB_WEBHOOKS')) {
                 
                const {
                  sanitizeInboundWebhookContent
                } = require('../bridge/webhookSanitizer.js') as typeof import('../bridge/webhookSanitizer.js');
                 
                sanitized = sanitizeInboundWebhookContent(fields.content);
              }
              const content = await resolveAndPrepend(msg, sanitized);
              const preview = typeof content === 'string' ? content.slice(0, 80) : `[${content.length} 个内容块]`;
              logForDebugging(`[bridge:repl] 注入入站用户消息：${preview}${uuid ? ` uuid=${uuid}` : ''}`);
              enqueue({
                value: content,
                mode: 'prompt' as const,
                uuid,
                // skipSlashCommands 保持 true 作为纵深防御 ——
                // processUserInputBase 在设置了 bridgeOrigin 且解析出的命令通过 isBridgeSafeCommand 时会在内部覆盖它。
                // 这使退出词抑制和即时命令块对于任何直接检查 skipSlashCommands 的代码路径保持完整。
                skipSlashCommands: true,
                bridgeOrigin: true
              });
            } catch (e) {
              logForDebugging(`[bridge:repl] handleInboundMessage 失败：${e}`, {
                level: 'error'
              });
            }
          }

          // 状态更改回调 —— 将桥接生命周期事件映射到 AppState。
          function handleStateChange(state: BridgeState, detail_0?: string): void {
            if (cancelled) return;
            if (outboundOnly) {
              logForDebugging(`[bridge:repl] 镜像状态=${state}${detail_0 ? ` detail=${detail_0}` : ''}`);
              // 同步 replBridgeConnected，以便转发 effect 在传输启动或停止时开始/停止写入。
              if (state === 'failed') {
                setAppState(prev_3 => {
                  if (!prev_3.replBridgeConnected) return prev_3;
                  return {
                    ...prev_3,
                    replBridgeConnected: false
                  };
                });
              } else if (state === 'ready' || state === 'connected') {
                setAppState(prev_4 => {
                  if (prev_4.replBridgeConnected) return prev_4;
                  return {
                    ...prev_4,
                    replBridgeConnected: true
                  };
                });
              }
              return;
            }
            const handle = handleRef.current;
            switch (state) {
              case 'ready':
                setAppState(prev_9 => {
                  const connectUrl = handle && handle.environmentId !== '' ? buildBridgeConnectUrl(handle.environmentId, handle.sessionIngressUrl) : prev_9.replBridgeConnectUrl;
                  const sessionUrl = handle ? getRemoteSessionUrl(handle.bridgeSessionId, handle.sessionIngressUrl) : prev_9.replBridgeSessionUrl;
                  const envId = handle?.environmentId;
                  const sessionId = handle?.bridgeSessionId;
                  if (prev_9.replBridgeConnected && !prev_9.replBridgeSessionActive && !prev_9.replBridgeReconnecting && prev_9.replBridgeConnectUrl === connectUrl && prev_9.replBridgeSessionUrl === sessionUrl && prev_9.replBridgeEnvironmentId === envId && prev_9.replBridgeSessionId === sessionId) {
                    return prev_9;
                  }
                  return {
                    ...prev_9,
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
                {
                  setAppState(prev_8 => {
                    if (prev_8.replBridgeSessionActive) return prev_8;
                    return {
                      ...prev_8,
                      replBridgeConnected: true,
                      replBridgeSessionActive: true,
                      replBridgeReconnecting: false,
                      replBridgeError: undefined
                    };
                  });
                  // 发送 system/init，以便远程客户端（web/iOS/Android）获取会话元数据。
                  // REPL 直接使用 query() —— 从不经过 QueryEngine 的 SDKMessage 层 ——
                  // 因此这是唯一将 system/init 放到 REPL 桥接线路上的路径。
                  // 技能加载是异步的（记忆化，REPL 启动后开销很小）；触发后不管，以免阻塞连接状态转换。
                  if (getFeatureValue_CACHED_MAY_BE_STALE('tengu_bridge_system_init', false)) {
                    void (async () => {
                      try {
                        const skills = await getSlashCommandToolSkills(getCwd());
                        if (cancelled) return;
                        const state_0 = store.getState();
                        handleRef.current?.writeSdkMessages([buildSystemInitMessage({
                          // 为 REPL 桥接编辑了 tools/mcpClients/plugins：
                          // MCP 前缀的工具名称和服务器名称会泄露用户已集成的集成；
                          // 插件路径会泄露原始文件系统路径（用户名、项目结构）。
                          // CCR v2 将 SDK 消息持久化到 Spanner —— 点击“从手机连接”的用户可能不希望这些出现在 Anthropic 的服务器上。
                          // QueryEngine（SDK）仍然发出完整列表 —— SDK 消费者期望完整的遥测数据。
                          tools: [],
                          mcpClients: [],
                          model: mainLoopModelRef.current,
                          permissionMode: state_0.toolPermissionContext.mode as PermissionMode,
                          // TODO: 避免强制类型转换
                          // 远程客户端只能调用桥接安全的命令 ——
                          // 广告不安全的命令（local-jsx、不允许的 local）会让移动/网页端尝试它们并遇到错误。
                          commands: commandsRef.current.filter(isBridgeSafeCommand),
                          agents: state_0.agentDefinitions.activeAgents,
                          skills,
                          plugins: [],
                          fastMode: state_0.fastMode
                        })]);
                      } catch (err_0) {
                        logForDebugging(`[bridge:repl] 发送 system/init 失败：${errorMessage(err_0)}`, {
                          level: 'error'
                        });
                      }
                    })();
                  }
                  break;
                }
              case 'reconnecting':
                setAppState(prev_7 => {
                  if (prev_7.replBridgeReconnecting) return prev_7;
                  return {
                    ...prev_7,
                    replBridgeReconnecting: true,
                    replBridgeSessionActive: false
                  };
                });
                break;
              case 'failed':
                // 清除任何之前的失败关闭定时器
                clearTimeout(failureTimeoutRef.current);
                notifyBridgeFailed(detail_0);
                setAppState(prev_5 => ({
                  ...prev_5,
                  replBridgeError: detail_0,
                  replBridgeReconnecting: false,
                  replBridgeSessionActive: false,
                  replBridgeConnected: false
                }));
                // 超时后自动禁用，以便钩子停止重试。
                failureTimeoutRef.current = setTimeout(() => {
                  if (cancelled) return;
                  failureTimeoutRef.current = undefined;
                  setAppState(prev_6 => {
                    if (!prev_6.replBridgeError) return prev_6;
                    return {
                      ...prev_6,
                      replBridgeEnabled: false,
                      replBridgeError: undefined
                    };
                  });
                }, BRIDGE_FAILURE_DISMISS_MS);
                break;
            }
          }

          // 待处理的桥接权限响应处理程序映射，以 request_id 为键。
          // 每个条目是一个等待 CCR 回复的 onResponse 处理程序。
          const pendingPermissionHandlers = new Map<string, (response: BridgePermissionResponse) => void>();

          // 将传入的 control_response 消息分发给已注册的处理程序
          function handlePermissionResponse(msg_0: SDKControlResponse): void {
            const requestId = msg_0.response?.request_id;
            if (!requestId) return;
            const handler = pendingPermissionHandlers.get(requestId);
            if (!handler) {
              logForDebugging(`[bridge:repl] 没有处理程序用于 control_response request_id=${requestId}`);
              return;
            }
            pendingPermissionHandlers.delete(requestId);
            // 从 control_response 负载中提取权限决定
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
            onInterrupt() {
              abortControllerRef.current?.abort();
            },
            onSetModel(model) {
              const resolved = model === 'default' ? null : model ?? null;
              setMainLoopModelOverride(resolved);
              setAppState(prev_10 => {
                if (prev_10.mainLoopModelForSession === resolved) return prev_10;
                return {
                  ...prev_10,
                  mainLoopModelForSession: resolved
                };
              });
            },
            onSetMaxThinkingTokens(maxTokens) {
              const enabled = maxTokens !== null;
              setAppState(prev_11 => {
                if (prev_11.thinkingEnabled === enabled) return prev_11;
                return {
                  ...prev_11,
                  thinkingEnabled: enabled
                };
              });
            },
            onSetPermissionMode(mode) {
              // 策略守卫必须在 transitionPermissionMode 之前触发 ——
              // 其内部自动门控检查是一个防御性抛出（在抛出之前有 setAutoModeActive(true) 副作用），而不是优雅拒绝。
              // 让该抛出逃逸将：
              // (1) 在模式未改变的情况下使 STATE.autoModeActive=true（违反 3 向不变量，见 src/CLAUDE.md）
              // (2) 无法发送 control_response → 服务器关闭 WS
              // 这些与 print.ts 中的 handleSetPermissionMode 对应；桥接无法直接导入这些检查（引导隔离），
              // 因此依赖此判决来发出错误响应。
              if (mode === 'bypassPermissions') {
                if (isBypassPermissionsModeDisabled()) {
                  return {
                    ok: false,
                    error: '无法将权限模式设置为 bypassPermissions，因为它已被设置或配置禁用'
                  };
                }
                if (!store.getState().toolPermissionContext.isBypassPermissionsModeAvailable) {
                  return {
                    ok: false,
                    error: '无法将权限模式设置为 bypassPermissions，因为会话未使用 --dangerously-skip-permissions 启动'
                  };
                }
              }
              if (feature('TRANSCRIPT_CLASSIFIER') && mode === 'auto' && !isAutoModeGateEnabled()) {
                const reason = getAutoModeUnavailableReason();
                return {
                  ok: false,
                  error: reason ? `无法将权限模式设置为 auto：${getAutoModeUnavailableNotification(reason)}` : '无法将权限模式设置为 auto'
                };
              }
              // 守卫通过 —— 通过集中式转换应用，以便 prePlanMode 存储和自动模式状态同步全部触发。
              setAppState(prev_12 => {
                const current = prev_12.toolPermissionContext.mode;
                if (current === mode) return prev_12;
                const next = transitionPermissionMode(current, mode, prev_12.toolPermissionContext);
                return {
                  ...prev_12,
                  toolPermissionContext: {
                    ...next,
                    mode
                  }
                };
              });
              // 模式更改后立即重新检查排队的权限提示。
              setImmediate(() => {
                getLeaderToolUseConfirmQueue()?.(currentQueue => {
                  currentQueue.forEach(item => {
                    void item.recheckPermission();
                  });
                  return currentQueue;
                });
              });
              return {
                ok: true
              };
            },
            onStateChange: handleStateChange,
            initialMessages: messages.length > 0 ? messages : undefined,
            getMessages: () => messagesRef.current,
            previouslyFlushedUUIDs: flushedUUIDsRef.current,
            initialName: replBridgeInitialName,
            perpetual
          });
          if (cancelled) {
            // 在 initReplBridge 进行中时 effect 被取消。
            // 拆除句柄以避免泄漏资源（轮询循环、WebSocket、已注册的环境、清理回调）。
            logForDebugging(`[bridge:repl] 钩子：初始化在飞行中被取消，正在拆除${handle_0 ? ` env=${handle_0.environmentId}` : ''}`);
            if (handle_0) {
              void handle_0.teardown();
            }
            return;
          }
          if (!handle_0) {
            // initReplBridge 返回 null —— 前提条件失败。对于大多数情况（no_oauth、policy_denied 等），
            // onStateChange('failed') 已经触发了具体提示。GrowthBook 门控关闭的情况是故意静默的 —— 不是失败，只是未推出。
            consecutiveFailuresRef.current++;
            logForDebugging(`[bridge:repl] 初始化返回 null（前提条件或会话创建失败）；连续失败次数：${consecutiveFailuresRef.current}`);
            clearTimeout(failureTimeoutRef.current);
            setAppState(prev_13 => ({
              ...prev_13,
              replBridgeError: prev_13.replBridgeError ?? '检查调试日志以了解详细信息'
            }));
            failureTimeoutRef.current = setTimeout(() => {
              if (cancelled) return;
              failureTimeoutRef.current = undefined;
              setAppState(prev_14 => {
                if (!prev_14.replBridgeError) return prev_14;
                return {
                  ...prev_14,
                  replBridgeEnabled: false,
                  replBridgeError: undefined
                };
              });
            }, BRIDGE_FAILURE_DISMISS_MS);
            return;
          }
          handleRef.current = handle_0;
          setReplBridgeHandle(handle_0);
          consecutiveFailuresRef.current = 0;
          // 在转发 effect 中跳过初始消息 —— 它们已在创建期间作为会话事件加载。
          lastWrittenIndexRef.current = initialMessageCount;
          if (outboundOnly) {
            setAppState(prev_15 => {
              if (prev_15.replBridgeConnected && prev_15.replBridgeSessionId === handle_0.bridgeSessionId) return prev_15;
              return {
                ...prev_15,
                replBridgeConnected: true,
                replBridgeSessionId: handle_0.bridgeSessionId,
                replBridgeSessionUrl: undefined,
                replBridgeConnectUrl: undefined,
                replBridgeError: undefined
              };
            });
            logForDebugging(`[bridge:repl] 镜像已初始化，会话=${handle_0.bridgeSessionId}`);
          } else {
            // 构建桥接权限回调，以便交互式权限处理程序可以竞速桥接响应与本地用户交互。
            const permissionCallbacks: BridgePermissionCallbacks = {
              sendRequest(requestId_0, toolName, input, toolUseId, description, permissionSuggestions, blockedPath) {
                handle_0.sendControlRequest({
                  type: 'control_request',
                  request_id: requestId_0,
                  request: {
                    subtype: 'can_use_tool',
                    tool_name: toolName,
                    input,
                    tool_use_id: toolUseId,
                    description,
                    ...(permissionSuggestions ? {
                      permission_suggestions: permissionSuggestions
                    } : {}),
                    ...(blockedPath ? {
                      blocked_path: blockedPath
                    } : {})
                  }
                });
              },
              sendResponse(requestId_1, response) {
                const payload: Record<string, unknown> = {
                  ...response
                };
                handle_0.sendControlResponse({
                  type: 'control_response',
                  response: {
                    subtype: 'success',
                    request_id: requestId_1,
                    response: payload
                  }
                });
              },
              cancelRequest(requestId_2) {
                handle_0.sendControlCancelRequest(requestId_2);
              },
              onResponse(requestId_3, handler_0) {
                pendingPermissionHandlers.set(requestId_3, handler_0);
                return () => {
                  pendingPermissionHandlers.delete(requestId_3);
                };
              }
            };
            setAppState(prev_16 => ({
              ...prev_16,
              replBridgePermissionCallbacks: permissionCallbacks
            }));
            const url = getRemoteSessionUrl(handle_0.bridgeSessionId, handle_0.sessionIngressUrl);
            // environmentId === '' 表示 v2 无环境路径。buildBridgeConnectUrl 构建特定环境的连接 URL，没有环境则不存在。
            const hasEnv = handle_0.environmentId !== '';
            const connectUrl_0 = hasEnv ? buildBridgeConnectUrl(handle_0.environmentId, handle_0.sessionIngressUrl) : undefined;
            setAppState(prev_17 => {
              if (prev_17.replBridgeConnected && prev_17.replBridgeSessionUrl === url) {
                return prev_17;
              }
              return {
                ...prev_17,
                replBridgeConnected: true,
                replBridgeSessionUrl: url,
                replBridgeConnectUrl: connectUrl_0 ?? prev_17.replBridgeConnectUrl,
                replBridgeEnvironmentId: handle_0.environmentId,
                replBridgeSessionId: handle_0.bridgeSessionId,
                replBridgeError: undefined
              };
            });

            // 在记录中显示桥接状态和 URL。perpetual（KAIROS 助手模式）在 initReplBridge.ts 中回退到 v1 —— 跳过他们的 v2 专用升级提示。
            // 用自己的 try/catch，以免外观性的 GrowthBook 问题影响到外部初始化失败处理程序。
            const upgradeNudge = !perpetual ? await shouldShowAppUpgradeMessage().catch(() => false) : false;
            if (cancelled) return;
            setMessages(prev_18 => [...prev_18, createBridgeStatusMessage(url, upgradeNudge ? '请升级到最新版本的 Claude 移动应用以查看您的远程控制会话。' : undefined)]);
            logForDebugging(`[bridge:repl] 钩子已初始化，会话=${handle_0.bridgeSessionId}`);
          }
        } catch (err) {
          // 决不能让 REPL 崩溃 —— 在 UI 中显示错误。
          // 首先检查 cancelled（与 ~386 行的 !handle 路径对称）：
          // 如果在快速关闭期间 initReplBridge 抛出（在途网络错误），不要将其计入熔断器，也不要在 UI 中散布过时错误。
          // 还修复了在取消的抛出上先前存在的虚假 setAppState/setMessages。
          if (cancelled) return;
          consecutiveFailuresRef.current++;
          const errMsg = errorMessage(err);
          logForDebugging(`[bridge:repl] 初始化失败：${errMsg}；连续失败次数：${consecutiveFailuresRef.current}`);
          clearTimeout(failureTimeoutRef.current);
          notifyBridgeFailed(errMsg);
          setAppState(prev_0 => ({
            ...prev_0,
            replBridgeError: errMsg
          }));
          failureTimeoutRef.current = setTimeout(() => {
            if (cancelled) return;
            failureTimeoutRef.current = undefined;
            setAppState(prev_1 => {
              if (!prev_1.replBridgeError) return prev_1;
              return {
                ...prev_1,
                replBridgeEnabled: false,
                replBridgeError: undefined
              };
            });
          }, BRIDGE_FAILURE_DISMISS_MS);
          if (!outboundOnly) {
            setMessages(prev_2 => [...prev_2, createSystemMessage(`远程控制连接失败：${errMsg}`, 'warning')]);
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
        setAppState(prev_19 => {
          if (!prev_19.replBridgeConnected && !prev_19.replBridgeSessionActive && !prev_19.replBridgeError) {
            return prev_19;
          }
          return {
            ...prev_19,
            replBridgeConnected: false,
            replBridgeSessionActive: false,
            replBridgeReconnecting: false,
            replBridgeConnectUrl: undefined,
            replBridgeSessionUrl: undefined,
            replBridgeEnvironmentId: undefined,
            replBridgeSessionId: undefined,
            replBridgeError: undefined,
            replBridgePermissionCallbacks: undefined
          };
        });
        lastWrittenIndexRef.current = 0;
      };
    }
  }, [replBridgeEnabled, replBridgeOutboundOnly, setAppState, setMessages, addNotification]);

  // 当新消息出现时写入它们。
  // 当 replBridgeConnected 更改时也会重新运行（桥接完成初始化），
  // 以便任何在桥接就绪之前到达的消息都会被写入。
  useEffect(() => {
    // 正 feature() 守卫 —— 参见第一个 useEffect 的注释
    if (feature('BRIDGE_MODE')) {
      if (!replBridgeConnected) return;
      const handle_1 = handleRef.current;
      if (!handle_1) return;

      // 如果消息被压缩（数组变短），则钳制索引。
      // 压缩后 ref 可能超过 messages.length，如果不钳制，将不会转发新消息。
      if (lastWrittenIndexRef.current > messages.length) {
        logForDebugging(`[bridge:repl] 检测到压缩：lastWrittenIndex=${lastWrittenIndexRef.current} > messages.length=${messages.length}，正在钳制`);
      }
      const startIndex = Math.min(lastWrittenIndexRef.current, messages.length);

      // 收集自上次写入以来的新消息
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
    }
  }, [messages, replBridgeConnected]);

  const sendBridgeResult = useCallback(() => {
    if (feature('BRIDGE_MODE')) {
      handleRef.current?.sendResult();
    }
  }, []);

  return {
    sendBridgeResult
  };
}
