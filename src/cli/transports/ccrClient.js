import { randomUUID } from 'crypto';
import { decodeJwtExpiry } from '../../bridge/jwtUtils.js';
import { logForDebugging } from '../../utils/debug.js';
import { getSessionIngressAuthHeaders, getSessionIngressAuthToken, } from '../../utils/sessionIngressAuth.js';
import { sleep } from '../../utils/sleep.js';
import { getClaudeCodeUserAgent } from '../../utils/userAgent.js';
import { RetryableError, SerialBatchEventUploader, } from './SerialBatchEventUploader.js';
import { WorkerStateUploader } from './WorkerStateUploader.js';
/** 心跳事件之间的默认间隔（20 秒；服务器 TTL 是 60 秒） */
const DEFAULT_HEARTBEAT_INTERVAL_MS = 20000;
/**
 * stream_event 消息在此时间内累积在延迟缓冲区中，然后才进行排队，
 * 镜像 HybridTransport 的批处理窗口。text_delta 事件为相同的内容块
 * 累积成单个 full-so-far 快照 per flush — 每个发出的事件都是自包含的，
 * 所以中途连接的客户看到的是完整的文本，而不是片段。
 */
const STREAM_EVENT_FLUSH_INTERVAL_MS = +process.env.STREAM_FLUSH_MS || 16;
/** 提升的 axios validateStatus 回调，避免每请求闭包分配。 */
function alwaysValidStatus() {
    return true;
}
/** 由 initialize() 抛出；携带用于诊断分类器的类型化原因。 */
export class CCRInitError extends Error {
    constructor(reason) {
        super(`CCRClient 初始化失败: ${reason}`);
        this.reason = reason;
    }
}
/**
 * 在放弃前，持有看似有效的令牌时连续 401/403 的次数。
 * 过期的 JWT 会短路此逻辑（立即退出 — 确定性，重试无意义）。
 * 此阈值针对不确定情况：令牌的 exp 在未来但服务器返回 401
 *（userauth 宕机、KMS 故障、时钟偏差）。10 × 20s 心跳 ≈ 200s 等待。
 */
const MAX_CONSECUTIVE_AUTH_FAILURES = 10;
export function createStreamAccumulator() {
    return { byMessage: new Map(), scopeToMessage: new Map() };
}
function scopeKey(m) {
    return `${m.session_id}:${m.parent_tool_use_id ?? ''}`;
}
/**
 * 将 text_delta stream_events 累积为每个内容块的 full-so-far 快照。
 * 每次刷新为每个被触发的块发出一个事件，包含从块开始的完整累积文本
 * — 中途连接的客户端收到自包含的快照，而不是片段。
 *
 * 非 text-delta 事件原样通过。message_start 记录作用域的活跃消息 ID；
 * content_block_delta 追加块；快照事件重用此刷新中为该块看到的
 * 第一个 text_delta UUID，以便服务端幂等性在重试间保持稳定。
 *
 * 清理在 writeEvent 中当完整的 assistant 消息到达时进行（可靠），
 * 而不是在此处的停止事件上（abort/error 路径会跳过那些）。
 */
export function accumulateStreamEvents(buffer, state) {
    var _a;
    const out = [];
    const touched = new Map();
    for (const msg of buffer) {
        switch (msg.event.type) {
            case 'message_start': {
                const id = msg.event.message.id;
                const prevId = state.scopeToMessage.get(scopeKey(msg));
                if (prevId)
                    state.byMessage.delete(prevId);
                state.scopeToMessage.set(scopeKey(msg), id);
                state.byMessage.set(id, []);
                out.push(msg);
                break;
            }
            case 'content_block_delta': {
                // ✅ 修改点1：同时允许 text_delta 和 thinking_delta 通过
                if (msg.event.delta.type !== 'text_delta' &&
                    msg.event.delta.type !== 'thinking_delta') {
                    out.push(msg);
                    break;
                }
                const messageId = state.scopeToMessage.get(scopeKey(msg));
                const blocks = messageId ? state.byMessage.get(messageId) : undefined;
                if (!blocks) {
                    out.push(msg);
                    break;
                }
                const chunks = (blocks[_a = msg.event.index] ?? (blocks[_a] = []));
                // ✅ 修改点2：从 delta 中提取正确的文本字段
                // 对于 thinking_delta，提取 thinking 字段；对于 text_delta，提取 text 字段
                const text = msg.event.delta.type === 'thinking_delta'
                    ? msg.event.delta.thinking
                    : msg.event.delta.text;
                chunks.push(text);
                const existing = touched.get(chunks);
                if (existing) {
                    existing.event.delta.text = chunks.join('');
                    break;
                }
                const snapshot = {
                    type: 'stream_event',
                    uuid: msg.uuid,
                    session_id: msg.session_id,
                    parent_tool_use_id: msg.parent_tool_use_id,
                    event: {
                        type: 'content_block_delta',
                        index: msg.event.index,
                        delta: { type: 'text_delta', text: chunks.join('') }, // 统一转换为 text_delta
                    },
                };
                touched.set(chunks, snapshot);
                out.push(snapshot);
                break;
            }
            default:
                out.push(msg);
        }
    }
    return out;
}
/**
 * 清除已完成 assistant 消息的累加器条目。从 writeEvent 中
 * 当 SDKAssistantMessage 到达时调用 — 即使 abort/interrupt/error
 * 跳过 SSE 停止事件也会触发的可靠流结束信号。
 */
export function clearStreamAccumulatorForMessage(state, assistant) {
    state.byMessage.delete(assistant.message.id);
    const scope = scopeKey(assistant);
    if (state.scopeToMessage.get(scope) === assistant.message.id) {
        state.scopeToMessage.delete(scope);
    }
}
/**
 * 管理与 CCR v2 的工人生命周期协议：
 * - 纪元管理：从 CLAUDE_CODE_WORKER_EPOCH 环境变量读取 worker_epoch
 * - 运行时状态报告：PUT /sessions/{id}/worker
 * - 心跳：POST /sessions/{id}/worker/heartbeat 用于活跃度检测
 *
 * 所有写入操作都通过 this.request() 进行。
 */
export class CCRClient {
    constructor(transport, sessionUrl, opts) {
        this.workerEpoch = 0;
        this.heartbeatTimer = null;
        this.heartbeatInFlight = false;
        this.closed = false;
        this.consecutiveAuthFailures = 0;
        this.currentState = null;
        this.http = createAxiosInstance({ keepAlive: true });
        // stream_event 延迟缓冲区 — 在入队前累积最多
        // STREAM_EVENT_FLUSH_INTERVAL_MS 的内容增量（减少 POST 次数
        // 并启用 text_delta 合并）。镜像 HybridTransport 的模式。
        this.streamEventBuffer = [];
        this.streamEventTimer = null;
        // 截至目前完整的文本累加器。跨刷新持久化，以便每个发出的
        // text_delta 事件携带从块开始的完整文本 —
        // 流中重连时可以看到自包含的快照。以 API 消息 ID
        // 为键；在 complete assistant message 到达时的 writeEvent 中清除。
        this.streamTextAccumulator = createStreamAccumulator();
        this.onEpochMismatch =
            opts?.onEpochMismatch ??
                (() => {
                    // eslint-disable-next-line custom-rules/no-process-exit
                    process.exit(1);
                });
        this.heartbeatIntervalMs =
            opts?.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
        this.heartbeatJitterFraction = opts?.heartbeatJitterFraction ?? 0;
        this.getAuthHeaders = opts?.getAuthHeaders ?? getSessionIngressAuthHeaders;
        // 会话 URL：https://host/v1/code/sessions/{id}
        if (sessionUrl.protocol !== 'http:' && sessionUrl.protocol !== 'https:') {
            throw new Error(`CCRClient: 期望 http(s) URL，得到 ${sessionUrl.protocol}`);
        }
        const pathname = sessionUrl.pathname.replace(/\/$/, '');
        this.sessionBaseUrl = `${sessionUrl.protocol}//${sessionUrl.host}${pathname}`;
        // 从 URL 路径提取会话 ID（最后一段）
        this.sessionId = pathname.split('/').pop() || '';
        this.workerState = new WorkerStateUploader({
            send: body => this.request('put', '/worker', { worker_epoch: this.workerEpoch, ...body }, '写入worker').then(r => r.ok),
            baseDelayMs: 500,
            maxDelayMs: 30000,
            jitterMs: 500,
        });
        this.eventUploader = new SerialBatchEventUploader({
            maxBatchSize: 100,
            maxBatchBytes: 10 * 1024 * 1024,
            // flushStreamEventBuffer() 在一次调用中入队完整的 100ms 累积
            // stream_events 窗口。混合增量类型的突发无法折叠到
            // 单个快照中，可能超出旧的限制 (50) 并导致
            // SerialBatchEventUploader 背压检查死锁。匹配
            // HybridTransport 的界限 — 足够高以致仅受内存限制。
            maxQueueSize: 100000,
            send: async (batch) => {
                const result = await this.request('post', '/worker/events', { worker_epoch: this.workerEpoch, events: batch }, '客户端事件');
                if (!result.ok) {
                    throw new RetryableError('客户端事件 POST 失败', result.retryAfterMs);
                }
            },
            baseDelayMs: 500,
            maxDelayMs: 30000,
            jitterMs: 500,
        });
        this.internalEventUploader = new SerialBatchEventUploader({
            maxBatchSize: 100,
            maxBatchBytes: 10 * 1024 * 1024,
            maxQueueSize: 200,
            send: async (batch) => {
                const result = await this.request('post', '/worker/internal-events', { worker_epoch: this.workerEpoch, events: batch }, '内部事件');
                if (!result.ok) {
                    throw new RetryableError('内部事件 POST 失败', result.retryAfterMs);
                }
            },
            baseDelayMs: 500,
            maxDelayMs: 30000,
            jitterMs: 500,
        });
        this.deliveryUploader = new SerialBatchEventUploader({
            maxBatchSize: 64,
            maxQueueSize: 64,
            send: async (batch) => {
                const result = await this.request('post', '/worker/events/delivery', {
                    worker_epoch: this.workerEpoch,
                    updates: batch.map(d => ({
                        event_id: d.eventId,
                        status: d.status,
                    })),
                }, '投递批次');
                if (!result.ok) {
                    throw new RetryableError('投递 POST 失败', result.retryAfterMs);
                }
            },
            baseDelayMs: 500,
            maxDelayMs: 30000,
            jitterMs: 500,
        });
        // 确认每个收到的 client_event，以便 CCR 可以跟踪投递状态。
        // 在此处连接（而不是在 initialize() 中），以便回调在
        // new CCRClient() 返回的那一刻就注册 — remoteIO 必须能够
        // 在之后立即调用 transport.connect()，而不会让第一个
        // SSE 追赶帧与未连接的 onEventCallback 发生竞态。
        transport.setOnEvent((event) => {
            this.reportDelivery(event.event_id, 'received');
        });
    }
    /**
     * 初始化会话工人：
     * 1. 从参数获取 worker_epoch，或回退到
     *    CLAUDE_CODE_WORKER_EPOCH（由 env-manager / bridge spawner 设置）
     * 2. 将状态报告为 'idle'
     * 3. 启动心跳计时器
     *
     * 进程内调用者（replBridge）直接传递纪元 — 它们自己注册了工人，
     * 且没有父进程设置环境变量。
     */
    async initialize(epoch) {
        const startMs = Date.now();
        if (Object.keys(this.getAuthHeaders()).length === 0) {
            throw new CCRInitError('no_auth_headers');
        }
        if (epoch === undefined) {
            const rawEpoch = process.env.CLAUDE_CODE_WORKER_EPOCH;
            epoch = rawEpoch ? parseInt(rawEpoch, 10) : NaN;
        }
        if (isNaN(epoch)) {
            throw new CCRInitError('missing_epoch');
        }
        this.workerEpoch = epoch;
        // 与 init PUT 并发 — 两者互不依赖。
        const restoredPromise = this.getWorkerState();
        const result = await this.request('put', '/worker', {
            worker_status: 'idle',
            worker_epoch: this.workerEpoch,
            // 清除先前工作器崩溃留下的过期 pending_action/task_summary —
            // 会话内的清除在进程重启后不会保留。
            external_metadata: {
                pending_action: null,
                task_summary: null,
            },
        }, '写入worker (初始化)');
        if (!result.ok) {
            // 409 → onEpochMismatch 可能抛出，但 request() 捕获它并返回
            // false。如果没有这个检查，我们会继续 startHeartbeat()，泄漏一个
            // 针对已失效纪元的 20s 定时器。抛出异常以便 connect() 的拒绝处理程序
            // 触发，而不是走成功路径。
            throw new CCRInitError('worker_register_failed');
        }
        this.currentState = 'idle';
        this.startHeartbeat();
        // sessionActivity 的引用计数计时器在 API 调用或工具
        // 进行中时触发；没有写入，容器租约可能在等待期间过期。
        // v1 在 WebSocketTransport 中按连接连接此功能。
        registerSessionActivityCallback(() => {
            void this.writeEvent({ type: 'keep_alive' });
        });
        logForDebugging(`CCRClient: 已初始化，epoch=${this.workerEpoch}`);
        // 等待并发的 GET 并在此记录 state_restored，在 PUT 成功后 —
        // 在 getWorkerState() 内部记录存在竞态：如果 GET
        // 在 PUT 失败之前解析，诊断会显示同一会话同时出现
        // init_failed 和 state_restored。
        const { metadata, durationMs } = await restoredPromise;
        if (!this.closed) {
        }
        return metadata;
    }
    // Control_requests 被标记为已处理，重启时不会重新投递，
    // 因此读取之前工人写入的内容。
    async getWorkerState() {
        const startMs = Date.now();
        const authHeaders = this.getAuthHeaders();
        if (Object.keys(authHeaders).length === 0) {
            return { metadata: null, durationMs: 0 };
        }
        const data = await this.getWithRetry(`${this.sessionBaseUrl}/worker`, authHeaders, 'worker_state');
        return {
            metadata: data?.worker?.external_metadata ?? null,
            durationMs: Date.now() - startMs,
        };
    }
    /**
     * 向 CCR 发送经过身份验证的 HTTP 请求。处理身份验证头部、
     * 409 纪元不匹配和错误日志记录。2xx 时返回 { ok: true }。
     * 遇到 429 时读取 Retry-After（整数秒），以便上传器可以
     * 遵守服务器的退避提示，而不是盲目指数增长。
     */
    async request(method, path, body, label, { timeout = 10000 } = {}) {
        const authHeaders = this.getAuthHeaders();
        if (Object.keys(authHeaders).length === 0)
            return { ok: false };
        // 详细的发送日志
        const bodyStr = JSON.stringify(body);
        const bodyPreview = bodyStr.length > 500 ? bodyStr.slice(0, 500) + `...(共${bodyStr.length}字符)` : bodyStr;
        logForDebugging(`CCR⬆ HTTP ${method.toUpperCase()} ${path} label=${label} epoch=${this.workerEpoch} bodyLen=${bodyStr.length}\n  body=${bodyPreview}`);
        try {
            const response = await this.http[method](`${this.sessionBaseUrl}${path}`, body, {
                headers: {
                    ...authHeaders,
                    'Content-Type': 'application/json',
                    'anthropic-version': '2023-06-01',
                    'User-Agent': getClaudeCodeUserAgent(),
                },
                validateStatus: alwaysValidStatus,
                timeout,
            });
            const respBody = JSON.stringify(response.data ?? '');
            const respPreview = respBody.length > 500 ? respBody.slice(0, 500) + `...(共${respBody.length}字符)` : respBody;
            logForDebugging(`CCR⬇ HTTP响应 ${response.status} ${label} bodyLen=${respBody.length}\n  body=${respPreview}`);
            if (response.status >= 200 && response.status < 300) {
                this.consecutiveAuthFailures = 0;
                return { ok: true };
            }
            if (response.status === 409) {
                this.handleEpochMismatch();
            }
            if (response.status === 401 || response.status === 403) {
                // 带有过期 JWT 的 401 是确定性的 — 重试永远不会成功。
                // 在阈值循环消耗挂钟时间之前，先检查令牌自身的 exp。
                const tok = getSessionIngressAuthToken();
                const exp = tok ? decodeJwtExpiry(tok) : null;
                if (exp !== null && exp * 1000 < Date.now()) {
                    logForDebugging(`CCRClient: 会话令牌已过期 (exp=${new Date(exp * 1000).toISOString()}) — 未收到刷新，正在退出`, { level: 'error' });
                    this.onEpochMismatch();
                }
                // 令牌看起来有效但服务器返回 401 — 可能是服务器端
                // 小故障（用户认证宕机、KMS 问题）。计入阈值计数。
                this.consecutiveAuthFailures++;
                if (this.consecutiveAuthFailures >= MAX_CONSECUTIVE_AUTH_FAILURES) {
                    logForDebugging(`CCRClient: 连续 ${this.consecutiveAuthFailures} 次认证失败（令牌看似有效）— 服务端认证无法恢复，正在退出`, { level: 'error' });
                    this.onEpochMismatch();
                }
            }
            logForDebugging(`CCR⬇ ${label} 返回 ${response.status}`, {
                level: 'warn',
            });
            if (response.status === 429) {
                const raw = response.headers?.['retry-after'];
                const seconds = typeof raw === 'string' ? parseInt(raw, 10) : NaN;
                if (!isNaN(seconds) && seconds >= 0) {
                    return { ok: false, retryAfterMs: seconds * 1000 };
                }
            }
            return { ok: false };
        }
        catch (error) {
            logForDebugging(`CCR⬇ ${label} 请求异常: ${errorMessage(error)}`, {
                level: 'warn',
            });
            return { ok: false };
        }
    }
    /** 通过 PUT /sessions/{id}/worker 向 CCR 报告工人状态。 */
    reportState(state, details) {
        if (state === this.currentState && !details)
            return;
        this.currentState = state;
        this.workerState.enqueue({
            worker_status: state,
            requires_action_details: details
                ? {
                    tool_name: details.tool_name,
                    action_description: details.action_description,
                    request_id: details.request_id,
                }
                : null,
        });
    }
    /** 通过 PUT /worker 向 CCR 报告外部元数据。 */
    reportMetadata(metadata) {
        this.workerState.enqueue({ external_metadata: metadata });
    }
    /**
     * 处理纪元不匹配（409 Conflict）。更新的 CC 实例已取代
     * 当前实例 — 立即退出。
     */
    handleEpochMismatch() {
        logForDebugging('⏳ CCRClient: Epoch 不匹配 (409)，正在关闭', {
            level: 'error',
        });
        this.onEpochMismatch();
    }
    /** 启动周期性心跳。 */
    startHeartbeat() {
        this.stopHeartbeat();
        const schedule = () => {
            const jitter = this.heartbeatIntervalMs *
                this.heartbeatJitterFraction *
                (2 * Math.random() - 1);
            this.heartbeatTimer = setTimeout(tick, this.heartbeatIntervalMs + jitter);
        };
        const tick = () => {
            void this.sendHeartbeat();
            // stopHeartbeat 将定时器置空；在发送后（即发即弃）
            // 但在重新调度前检查，以便在 sendHeartbeat 期间调用 close() 被尊重。
            if (this.heartbeatTimer === null)
                return;
            schedule();
        };
        schedule();
    }
    /** 停止心跳计时器。 */
    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearTimeout(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }
    /** 通过 POST /sessions/{id}/worker/heartbeat 发送心跳。 */
    async sendHeartbeat() {
        if (this.heartbeatInFlight)
            return;
        this.heartbeatInFlight = true;
        try {
            const result = await this.request('post', '/worker/heartbeat', { session_id: this.sessionId, worker_epoch: this.workerEpoch }, '心跳', { timeout: 5000 });
            if (result.ok) {
                logForDebugging('CCRClient: 心跳已发送');
            }
        }
        finally {
            this.heartbeatInFlight = false;
        }
    }
    /**
     * 通过 POST /sessions/{id}/worker/events 将 StdoutMessage 写为客户端事件。
     * 这些事件通过 SSE 流对前端客户端可见。
     * 如果缺少 UUID 则注入一个，以确保重试时的服务端幂等性。
     *
     * stream_event 消息保存在 100ms 延迟缓冲区中并累积
     *（相同内容块的 text_deltas 每次刷新发出一个 full-so-far 快照）。
     * 非 stream_event 的写入先刷新缓冲区以保持下游顺序。
     */
    async writeEvent(message) {
        if (message.type === 'stream_event') {
            this.streamEventBuffer.push(message);
            if (!this.streamEventTimer) {
                this.streamEventTimer = setTimeout(() => void this.flushStreamEventBuffer(), STREAM_EVENT_FLUSH_INTERVAL_MS);
            }
            return;
        }
        await this.flushStreamEventBuffer();
        if (message.type === 'assistant') {
            clearStreamAccumulatorForMessage(this.streamTextAccumulator, message);
        }
        const msg = message;
        logForDebugging(`CCR⬆ 入队事件 type=${message.type} uuid=${msg.uuid ?? '-'}`);
        await this.eventUploader.enqueue(this.toClientEvent(message));
    }
    /** 将 StdoutMessage 包装为 ClientEvent，如果缺少则注入 UUID。 */
    toClientEvent(message) {
        const msg = message;
        return {
            payload: {
                ...msg,
                uuid: typeof msg.uuid === 'string' ? msg.uuid : randomUUID(),
            },
        };
    }
    /**
     * 清空 stream_event 延迟缓冲区：将 text_deltas 累积为
     * full-so-far 快照，清除计时器，将结果事件入队。
     * 从计时器、writeEvent（非 stream 消息）和 flush() 调用。
     * close() 会丢弃缓冲区 — 如果需要投递，先调用 flush()。
     */
    async flushStreamEventBuffer() {
        if (this.streamEventTimer) {
            clearTimeout(this.streamEventTimer);
            this.streamEventTimer = null;
        }
        if (this.streamEventBuffer.length === 0)
            return;
        const buffered = this.streamEventBuffer;
        this.streamEventBuffer = [];
        const payloads = accumulateStreamEvents(buffered, this.streamTextAccumulator);
        const deltaTypes = buffered.map(m => (m.event.type === 'content_block_delta'
            ? `${m.event.delta.type}`
            : m.event.type)).join(',');
        logForDebugging(`CCR⬆ 刷新stream缓冲区 count=${buffered.length} → 合并后${payloads.length}事件 eventTypes=[${deltaTypes}]`);
        await this.eventUploader.enqueue(payloads.map(payload => ({ payload, ephemeral: true })));
    }
    /**
     * 通过 POST /sessions/{id}/worker/internal-events 写入内部工作器事件。
     * 这些事件对前端客户端不可见 — 它们存储工作器内部状态
     *（转录消息、压缩标记），用于会话恢复。
     */
    async writeInternalEvent(eventType, payload, { isCompaction = false, agentId, } = {}) {
        const event = {
            payload: {
                type: eventType,
                ...payload,
                uuid: typeof payload.uuid === 'string' ? payload.uuid : randomUUID(),
            },
            ...(isCompaction && { is_compaction: true }),
            ...(agentId && { agent_id: agentId }),
        };
        await this.internalEventUploader.enqueue(event);
    }
    /**
     * 刷新待处理的内部事件。在轮次之间和关闭时调用，
     * 以确保转录条目被持久化。
     */
    flushInternalEvents() {
        return this.internalEventUploader.flush();
    }
    /**
     * 刷新待处理的客户端事件（writeEvent 队列）。在 close() 之前调用，
     * 当调用者需要投递确认时使用 — close() 会放弃队列。
     * 在上传器排空或拒绝后解析；无论单个 POST 是否成功都返回
     *（如果关心，请单独检查服务器状态）。
     */
    async flush() {
        await this.flushStreamEventBuffer();
        return this.eventUploader.flush();
    }
    /**
     * 读取前台代理内部事件，来自
     * GET /sessions/{id}/worker/internal-events。
     * 返回自上次压缩边界以来的转录条目，失败时返回 null。
     * 用于会话恢复。
     */
    async readInternalEvents() {
        return this.paginatedGet('/worker/internal-events', {}, 'internal_events');
    }
    /**
     * 读取所有子代理内部事件，来自
     * GET /sessions/{id}/worker/internal-events?subagents=true。
     * 返回跨所有非前台代理的合并流，每个从其压缩点开始。
     * 用于会话恢复。
     */
    async readSubagentInternalEvents() {
        return this.paginatedGet('/worker/internal-events', { subagents: 'true' }, 'subagent_events');
    }
    /**
     * 带重试的分页 GET。从列表端点获取所有页面，
     * 失败时使用指数退避 + 抖动重试每个页面。
     */
    async paginatedGet(path, params, context) {
        const authHeaders = this.getAuthHeaders();
        if (Object.keys(authHeaders).length === 0)
            return null;
        const allEvents = [];
        let cursor;
        do {
            const url = new URL(`${this.sessionBaseUrl}${path}`);
            for (const [k, v] of Object.entries(params)) {
                url.searchParams.set(k, v);
            }
            if (cursor) {
                url.searchParams.set('cursor', cursor);
            }
            const page = await this.getWithRetry(url.toString(), authHeaders, context);
            if (!page)
                return null;
            allEvents.push(...(page.data ?? []));
            cursor = page.next_cursor;
        } while (cursor);
        logForDebugging(`CCRClient: 从 ${path} 读取了 ${allEvents.length} 个内部事件${params.subagents ? ' (子代理)' : ''}`);
        return allEvents;
    }
    /**
     * 单个带重试的 GET 请求。成功时返回解析后的响应体，
     * 如果所有重试耗尽则返回 null。
     */
    async getWithRetry(url, authHeaders, context) {
        for (let attempt = 1; attempt <= 10; attempt++) {
            let response;
            try {
                response = await this.http.get(url, {
                    headers: {
                        ...authHeaders,
                        'anthropic-version': '2023-06-01',
                        'User-Agent': getClaudeCodeUserAgent(),
                    },
                    validateStatus: alwaysValidStatus,
                    timeout: 30000,
                });
            }
            catch (error) {
                logForDebugging(`CCRClient: GET ${url} 失败 (第 ${attempt}/10 次尝试): ${errorMessage(error)}`, { level: 'warn' });
                if (attempt < 10) {
                    const delay = Math.min(500 * 2 ** (attempt - 1), 30000) + Math.random() * 500;
                    await sleep(delay);
                }
                continue;
            }
            if (response.status >= 200 && response.status < 300) {
                return response.data;
            }
            if (response.status === 409) {
                this.handleEpochMismatch();
            }
            logForDebugging(`CCRClient: GET ${url} 返回 ${response.status} (第 ${attempt}/10 次尝试)`, { level: 'warn' });
            if (attempt < 10) {
                const delay = Math.min(500 * 2 ** (attempt - 1), 30000) + Math.random() * 500;
                await sleep(delay);
            }
        }
        logForDebugging('CCRClient: GET 重试已耗尽', { level: 'error' });
        return null;
    }
    /**
     * 报告客户端到工作器事件的投递状态。
     * POST /v1/code/sessions/{id}/worker/events/delivery（批量端点）
     */
    reportDelivery(eventId, status) {
        void this.deliveryUploader.enqueue({ eventId, status });
    }
    /** 获取当前纪元（供外部使用）。 */
    getWorkerEpoch() {
        return this.workerEpoch;
    }
    /** 内部事件队列深度 — 关闭快照的背压信号。 */
    get internalEventsPending() {
        return this.internalEventUploader.pendingCount;
    }
    /** 清理上传器和定时器。 */
    close() {
        this.closed = true;
        this.stopHeartbeat();
        unregisterSessionActivityCallback();
        if (this.streamEventTimer) {
            clearTimeout(this.streamEventTimer);
            this.streamEventTimer = null;
        }
        this.streamEventBuffer = [];
        this.streamTextAccumulator.byMessage.clear();
        this.streamTextAccumulator.scopeToMessage.clear();
        this.workerState.close();
        this.eventUploader.close();
        this.internalEventUploader.close();
        this.deliveryUploader.close();
    }
}
