/**
 * Shared transport-layer helpers for bridge message handling.
 *
 * Extracted from replBridge.ts so both the env-based core (initBridgeCore)
 * and the env-less core (initEnvLessBridgeCore) can use the same ingress
 * parsing, control-request handling, and echo-dedup machinery.
 *
 * Everything here is pure — no closure over bridge-specific state. All
 * collaborators (transport, sessionId, UUID sets, callbacks) are passed
 * as params.
 */

import { randomUUID } from 'crypto'
import type { SDKMessage } from '../entrypoints/agentSdkTypes.js'
import type {
  SDKControlRequest,
  SDKControlResponse,
} from '../entrypoints/sdk/controlTypes.js'
import type { SDKResultSuccess } from '../entrypoints/sdk/coreTypes.js'
import { logEvent } from '../services/analytics/index.js'
import { EMPTY_USAGE } from '../services/api/emptyUsage.js'
import type { Message } from '../types/message.js'
import { normalizeControlMessageKeys } from '../utils/controlMessageCompat.js'
import { logForDebugging } from '../utils/debug.js'
import { stripDisplayTagsAllowEmpty } from '../utils/displayTags.js'
import { errorMessage } from '../utils/errors.js'
import type { PermissionMode } from '../utils/permissions/PermissionMode.js'
import { jsonParse } from '../utils/slowOperations.js'
import type { ReplBridgeTransport } from './replBridgeTransport.js'

// ─── Type guards ─────────────────────────────────────────────────────────────

/** Type predicate for parsed WebSocket messages. SDKMessage is a
 *  discriminated union on `type` — validating the discriminant is
 *  sufficient for the predicate; callers narrow further via the union. */
export function isSDKMessage(value: unknown): value is SDKMessage {
  return (
    value !== null &&
    typeof value === 'object' &&
    'type' in value &&
    typeof value.type === 'string'
  )
}

/** Type predicate for control_response messages from the server. */
export function isSDKControlResponse(
  value: unknown,
): value is SDKControlResponse {
  return (
    value !== null &&
    typeof value === 'object' &&
    'type' in value &&
    value.type === 'control_response' &&
    'response' in value
  )
}

/** Type predicate for control_request messages from the server. */
export function isSDKControlRequest(
  value: unknown,
): value is SDKControlRequest {
  return (
    value !== null &&
    typeof value === 'object' &&
    'type' in value &&
    value.type === 'control_request' &&
    'request_id' in value &&
    'request' in value
  )
}

/**
 * True for message types that should be forwarded to the bridge transport.
 * The server only wants user/assistant turns and slash-command system events;
 * everything else (tool_result, progress, etc.) is internal REPL chatter.
 */
export function isEligibleBridgeMessage(m: Message): boolean {
  // 虚拟消息 (REPL 内部调用) 仅用于显示——bridge/SDK
  // 消费者看到 REPL tool_use/result 汇总工作。
  if ((m.type === 'user' || m.type === 'assistant') && m.isVirtual) {
    return false
  }
  return (
    m.type === 'user' ||
    m.type === 'assistant' ||
    (m.type === 'system' && m.subtype === 'local_command')
  )
}

/**
 * Extract title-worthy text from a Message for onUserMessage. Returns
 * undefined for messages that shouldn't title the session: non-user, meta
 * (nudges), tool results, compact summaries, non-human origins (task
 * notifications, channel messages), or pure display-tag content
 * (<ide_opened_file>, <session-start-hook>, etc.).
 *
 * Synthetic interrupts ([Request interrupted by user]) are NOT filtered here —
 * isSyntheticMessage lives in messages.ts (heavy import, pulls command
 * registry). The initialMessages path in initReplBridge checks it; the
 * writeMessages path reaching an interrupt as the *first* message is
 * implausible (an interrupt implies a prior prompt already flowed through).
 */
export function extractTitleText(m: Message): string | undefined {
  if (m.type !== 'user' || m.isMeta || m.toolUseResult || m.isCompactSummary)
    return undefined
  if (m.origin && m.origin.kind !== 'human') return undefined
  const content = m.message.content
  let raw: string | undefined
  if (typeof content === 'string') {
    raw = content
  } else {
    for (const block of content) {
      if (block.type === 'text') {
        raw = block.text
        break
      }
    }
  }
  if (!raw) return undefined
  const clean = stripDisplayTagsAllowEmpty(raw)
  return clean || undefined
}

// ─── Ingress routing ─────────────────────────────────────────────────────────

/**
 * Parse an ingress WebSocket message and route it to the appropriate handler.
 * Ignores messages whose UUID is in recentPostedUUIDs (echoes of what we sent)
 * or in recentInboundUUIDs (re-deliveries we've already forwarded — e.g.
 * server replayed history after a transport swap lost the seq-num cursor).
 */
export function handleIngressMessage(
  data: string,
  recentPostedUUIDs: BoundedUUIDSet,
  recentInboundUUIDs: BoundedUUIDSet,
  onInboundMessage: ((msg: SDKMessage) => void | Promise<void>) | undefined,
  onPermissionResponse?: ((response: SDKControlResponse) => void) | undefined,
  onControlRequest?: ((request: SDKControlRequest) => void) | undefined,
): void {
  try {
    // ====== 调试日志：记录收到的原始入站数据 ======
    logForDebugging(
      `[bridge:repl] handleIngressMessage: ====== 开始处理入站消息 ======`,
    )
    logForDebugging(
      `[bridge:repl] handleIngressMessage: 收到原始数据 length=${data.length}`,
    )
    logForDebugging(
      `[bridge:repl] handleIngressMessage: 原始数据内容(前2000字符): ${data.slice(0, 2000)}${data.length > 2000 ? '...(truncated)' : ''}`,
    )
    logForDebugging(
      `[bridge:repl] handleIngressMessage: recentPostedUUIDs count=${(recentPostedUUIDs as any).size ?? 'N/A'}, recentInboundUUIDs count=${(recentInboundUUIDs as any).size ?? 'N/A'}`,
    )
    // =====================================================

    const parsed: unknown = normalizeControlMessageKeys(jsonParse(data))

    // ====== 调试日志：记录解析后的消息 ======
    logForDebugging(
      `[bridge:repl] handleIngressMessage: 解析完成, parsed type=${typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>).type : typeof parsed}`,
    )
    if (typeof parsed === 'object' && parsed !== null) {
      const pObj = parsed as Record<string, unknown>
      const allKeys = Object.keys(pObj).join(', ')
      logForDebugging(
        `[bridge:repl] handleIngressMessage: 解析后对象的所有字段: [${allKeys}]`,
      )
      if ('type' in pObj) {
        logForDebugging(
          `[bridge:repl] handleIngressMessage:   -> type = "${pObj.type}"`,
        )
      }
      if ('uuid' in pObj) {
        logForDebugging(
          `[bridge:repl] handleIngressMessage:   -> uuid = "${pObj.uuid}"`,
        )
      }
      if ('session_id' in pObj) {
        logForDebugging(
          `[bridge:repl] handleIngressMessage:   -> session_id = "${pObj.session_id}"`,
        )
      }
      if ('subtype' in pObj) {
        logForDebugging(
          `[bridge:repl] handleIngressMessage:   -> subtype = "${pObj.subtype}"`,
        )
      }
    }
    // =====================================================

    // control_response is not an SDKMessage — check before the type guard
    if (isSDKControlResponse(parsed)) {
      const pObj = parsed as Record<string, unknown>
      const respObj = pObj.response as Record<string, unknown>
            logForDebugging(`[bridge:repl] ⬇ 收到控制响应 control_response request_id=${parsed.request_id} subtype=${parsed.response.subtype} data=${JSON.stringify(parsed.response).slice(0,500)}`)

      logForDebugging(
        `[bridge:repl] handleIngressMessage: 收到 control_response, subtype=${respObj.subtype}, request_id=${respObj.request_id}`,
      )
      logForDebugging(
        `[bridge:repl] handleIngressMessage:   response=${jsonStringify(pObj.response).slice(0, 1000)}`,
      )
      onPermissionResponse?.(parsed)
      return
    }

    // 来自服务器的 control_request（initialize、set_model、can_use_tool）。
    // 必须快速响应，否则服务器会关闭 WS（约 10-14 秒超时）。
    if (isSDKControlRequest(parsed)) {
      const pObj = parsed as Record<string, unknown>
      const reqObj = pObj.request as Record<string, unknown>
      logForDebugging(
        `[bridge:repl] ⬇ 收到控制请求 control_request subtype=${parsed.request.subtype} request_id=${parsed.request_id} data=${JSON.stringify(parsed.request).slice(0,500)}`,
      )
      logForDebugging(
        `[bridge:repl] handleIngressMessage:   request=${jsonStringify(pObj.request).slice(0, 1000)}`,
      )
      onControlRequest?.(parsed)
      return
    }

    if (!isSDKMessage(parsed)) {
      logForDebugging(`[bridge:repl] ⬇ 收到未知消息类型: ${JSON.stringify(parsed).slice(0,300)}`)
      logForDebugging(
        `[bridge:repl] handleIngressMessage: parsed 不是 SDKMessage, 丢弃`,
        { level: 'warn' },
      )
      return
    }


    // 检查 UUID 以检测我们自己的消息的回声
    const uuid =
      'uuid' in parsed && typeof parsed.uuid === 'string'
        ? parsed.uuid
        : undefined

    // ====== 调试日志：SDKMessage 详情 ======
    const parsedObj = parsed as Record<string, unknown>
    logForDebugging(
      `[bridge:repl] handleIngressMessage: SDKMessage type=${parsedObj.type} uuid=${uuid || '(无)'} session_id=${(parsedObj.session_id as string) || '(无)'}`,
    )
    // =====================================================

    if (uuid && recentPostedUUIDs.has(uuid)) {
      logForDebugging(
        `[bridge:repl] ⬇ 忽略回声消息 type=${parsed.type} uuid=${uuid}`,
      )
      return
    }

    // 防御性去重：丢弃我们已经转发过的入站提示。SSE 序列号延续（lastTransportSequenceNum）
    // 是修复历史重播的主要方法；这会捕获那些谈判失败的边缘情况
    //（服务器忽略 from_sequence_num，传输在接收任何帧之前就已死亡等）。
    if (uuid && recentInboundUUIDs.has(uuid)) {
      logForDebugging(
        `[bridge:repl] ⬇ 忽略重复入站消息 type=${parsed.type} uuid=${uuid}`,
      )
      return
    }

    logForDebugging(
      `[bridge:repl] ⬇ 收到入站消息 type=${parsed.type}${uuid ? ` uuid=${uuid}` : ''}
  raw_data=${data.slice(0,500)}`,
    )

    if (parsed.type === 'user') {
      if (uuid) recentInboundUUIDs.add(uuid)
      logEvent('tengu_bridge_message_received', {
        is_repl: true,
      })
      // 火后即忘——处理器可能是异步的（附件解析）。
      void onInboundMessage?.(parsed)
    } else {
      logForDebugging(
        `[bridge:repl] ⬇ 忽略非用户入站消息 type=${parsed.type}`,
      )
    }
  } catch (err) {
    logForDebugging(
      `[bridge:repl] ⬇ 解析入站消息失败：${errorMessage(err)}`,
    )
  }
}

// ─── Server-initiated control requests ───────────────────────────────────────

export type ServerControlRequestHandlers = {
  transport: ReplBridgeTransport | null
  sessionId: string
  /**
   * When true, all mutable requests (interrupt, set_model, set_permission_mode,
   * set_max_thinking_tokens) reply with an error instead of false-success.
   * initialize still replies success — the server kills the connection otherwise.
   * Used by the outbound-only bridge mode and the SDK's /bridge subpath so claude.ai sees a
   * proper error instead of "action succeeded but nothing happened locally".
   */
  outboundOnly?: boolean
  onInterrupt?: () => void
  onSetModel?: (model: string | undefined) => void
  onSetMaxThinkingTokens?: (maxTokens: number | null) => void
  onSetPermissionMode?: (
    mode: PermissionMode,
  ) => { ok: true } | { ok: false; error: string }
}

const OUTBOUND_ONLY_ERROR =
  '此会话仅出站。请在本地启用远程控制以允许入站控制。'

/**
 * Respond to inbound control_request messages from the server. The server
 * sends these for session lifecycle events (initialize, set_model) and
 * for turn-level coordination (interrupt, set_max_thinking_tokens). If we
 * don't respond, the server hangs and kills the WS after ~10-14s.
 *
 * Previously a closure inside initBridgeCore's onWorkReceived; now takes
 * collaborators as params so both cores can use it.
 */
export function handleServerControlRequest(
  request: SDKControlRequest,
  handlers: ServerControlRequestHandlers,
): void {
  const {
    transport,
    sessionId,
    outboundOnly,
    onInterrupt,
    onSetModel,
    onSetMaxThinkingTokens,
    onSetPermissionMode,
  } = handlers
  if (!transport) {
    logForDebugging(
      '[bridge:repl] 无法响应 control_request：传输层未配置',
    )
    return
  }

  let response: SDKControlResponse

  // 仅出站：为可修改的请求回复错误，以便 claude.ai 不会显示
  // 虚假的成功。initialize 仍然必须成功（如果失败，服务器会终止连接
  // 如果失败——见上面的注释）。
  if (outboundOnly && request.request.subtype !== 'initialize') {
    response = {
      type: 'control_response',
      response: {
        subtype: 'error',
        request_id: request.request_id,
        error: OUTBOUND_ONLY_ERROR,
      },
    }
    const event = { ...response, session_id: sessionId }
    void transport.write(event)
    logForDebugging(
      `[bridge:repl] Rejected ${request.request.subtype} (outbound-only) request_id=${request.request_id}`,
    )
    return
  }

  switch (request.request.subtype) {
    case 'initialize':
      // 用最小功能响应——REPL 自己处理
      // 命令、模型和账户信息。
      response = {
        type: 'control_response',
        response: {
          subtype: 'success',
          request_id: request.request_id,
          response: {
            commands: [],
            output_style: 'normal',
            available_output_styles: ['normal'],
            models: [],
            account: {},
            pid: process.pid,
          },
        },
      }
      break

    case 'set_model':
      onSetModel?.(request.request.model as string)
      response = {
        type: 'control_response',
        response: {
          subtype: 'success',
          request_id: request.request_id,
        },
      }
      break

    case 'set_max_thinking_tokens':
      onSetMaxThinkingTokens?.(request.request.max_thinking_tokens as number)
      response = {
        type: 'control_response',
        response: {
          subtype: 'success',
          request_id: request.request_id,
        },
      }
      break

    case 'set_permission_mode': {
      // 回调返回政策裁决，这样我们可以在不导入 isAutoModeGateEnabled/
      // isBypassPermissionsModeDisabled 的情况下发送错误
      // control_response（bootstrap-isolation）。如果没有注册
      // 回调（守护进程上下文，没有连接这个——
      // 参见 daemonBridge.ts），返回错误裁决而不是静默
      // 假成功：该上下文中永远不会实际应用该模式，
      // 因此成功会欺骗客户端。
      const verdict = onSetPermissionMode?.(request.request.mode as any) ?? {
        ok: false,
        error:
          'set_permission_mode is not supported in this context (onSetPermissionMode callback not registered)',
      }
      if (verdict.ok) {
        response = {
          type: 'control_response',
          response: {
            subtype: 'success',
            request_id: request.request_id,
          },
        }
      } else {
        response = {
          type: 'control_response',
          response: {
            subtype: 'error',
            request_id: request.request_id,
            error: 'ok' in verdict && !verdict.ok ? (verdict as any).error : 'Unknown error',
          },
        }
      }
      break
    }

    case 'interrupt':
      onInterrupt?.()
      response = {
        type: 'control_response',
        response: {
          subtype: 'success',
          request_id: request.request_id,
        },
      }
      break

    default:
      // 未知子类型——用错误响应，以便服务器不会
      // 挂起等待永远不会到来的回复。
      response = {
        type: 'control_response',
        response: {
          subtype: 'error',
          request_id: request.request_id,
          error: `REPL bridge 不处理 control_request 子类型: ${request.request.subtype}`,
        },
      }
  }

  const event = { ...response, session_id: sessionId }
  void transport.write(event)
  logForDebugging(
    `[bridge:repl] ⬆ 发送控制响应 control_response subtype=${request.request.subtype} request_id=${request.request_id} result=${response.response.subtype}`,
  )
}

// ─── Result message (for session archival on teardown) ───────────────────────

/**
 * Build a minimal `SDKResultSuccess` message for session archival.
 * The server needs this event before a WS close to trigger archival.
 */
export function makeResultMessage(sessionId: string): SDKResultSuccess {
  return {
    type: 'result',
    subtype: 'success',
    duration_ms: 0,
    duration_api_ms: 0,
    is_error: false,
    num_turns: 0,
    result: '',
    stop_reason: null,
    total_cost_usd: 0,
    usage: { ...EMPTY_USAGE },
    modelUsage: {},
    permission_denials: [],
    session_id: sessionId,
    uuid: randomUUID(),
  }
}

// ─── BoundedUUIDSet (echo-dedup ring buffer) ─────────────────────────────────

/**
 * FIFO-bounded set backed by a circular buffer. Evicts the oldest entry
 * when capacity is reached, keeping memory usage constant at O(capacity).
 *
 * Messages are added in chronological order, so evicted entries are always
 * the oldest. The caller relies on external ordering (the hook's
 * lastWrittenIndexRef) as the primary dedup — this set is a secondary
 * safety net for echo filtering and race-condition dedup.
 */
export class BoundedUUIDSet {
  private readonly capacity: number
  private readonly ring: (string | undefined)[]
  private readonly set = new Set<string>()
  private writeIdx = 0

  constructor(capacity: number) {
    this.capacity = capacity
    this.ring = new Array<string | undefined>(capacity)
  }

  add(uuid: string): void {
    if (this.set.has(uuid)) return
    // 驱逐当前写入位置的条目（如果被占用）
    const evicted = this.ring[this.writeIdx]
    if (evicted !== undefined) {
      this.set.delete(evicted)
    }
    this.ring[this.writeIdx] = uuid
    this.set.add(uuid)
    this.writeIdx = (this.writeIdx + 1) % this.capacity
  }

  has(uuid: string): boolean {
    return this.set.has(uuid)
  }

  clear(): void {
    this.set.clear()
    this.ring.fill(undefined)
    this.writeIdx = 0
  }
}
