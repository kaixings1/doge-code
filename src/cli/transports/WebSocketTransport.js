import { logEvent } from '../../services/analytics/index.js';
import { CircularBuffer } from '../../utils/CircularBuffer.js';
import { logForDebugging } from '../../utils/debug.js';
import { logForDiagnosticsNoPII } from '../../utils/diagLogs.js';
import { isEnvTruthy } from '../../utils/envUtils.js';
import { getWebSocketTLSOptions } from '../../utils/mtls.js';
import { getWebSocketProxyAgent, getWebSocketProxyUrl, } from '../../utils/proxy.js';
import { registerSessionActivityCallback, unregisterSessionActivityCallback, } from '../../utils/sessionActivity.js';
import { jsonStringify } from '../../utils/slowOperations.js';
const KEEP_ALIVE_FRAME = '{"type":"keep_alive"}\n';
const DEFAULT_MAX_BUFFER_SIZE = 1000;
const DEFAULT_BASE_RECONNECT_DELAY = 1000;
const DEFAULT_MAX_RECONNECT_DELAY = 30000;
/** 重新连接尝试的时间预算，超过后放弃（10 分钟）。 */
const DEFAULT_RECONNECT_GIVE_UP_MS = 600_000;
const DEFAULT_PING_INTERVAL = 10000;
const DEFAULT_KEEPALIVE_INTERVAL = 1000_000; // 5 分钟
/**
 * 检测系统睡眠/唤醒的阈值。如果连续两次
 * 重新连接尝试之间的间隔超过此值，机器可能睡眠了。
 * 我们重置重新连接的预算并重试 —— 如果会话在睡眠期间被回收，
 * 服务器将使用永久关闭代码（4001/1002）拒绝。
 */
const SLEEP_DETECTION_THRESHOLD_MS = DEFAULT_MAX_RECONNECT_DELAY * 2; // 60s
/**
 * 表示永久性服务器端拒绝的 WebSocket 关闭代码。
 * 传输层将立即转换为 'closed' 状态而不重试。
 */
const PERMANENT_CLOSE_CODES = new Set([
    1002, // 协议错误 —— 服务器拒绝握手（例如会话被回收）
    4001, // 会话过期 / 未找到
    4003, // 未授权
]);
export class WebSocketTransport {
    ws = null;
    lastSentId = null;
    url;
    state = 'idle';
    onData;
    onCloseCallback;
    onConnectCallback;
    headers;
    sessionId;
    autoReconnect;
    isBridge;
    // 重连状态
    reconnectAttempts = 0;
    reconnectStartTime = null;
    reconnectTimer = null;
    lastReconnectAttemptTime = null;
    // 上次 WS 数据帧活动的挂钟时间（入站消息或出站
    // ws.send）。用于在关闭时计算空闲时间 —— 用于诊断
    // 代理空闲超时 RST（例如 Cloudflare 5 分钟）。排除 ping/pong
    // 控制帧（代理不计数）。
    lastActivityTime = 0;
    // 连接健康检查的 ping 间隔
    pingInterval = null;
    pongReceived = true;
    // 周期性保活数据帧，用于重置代理空闲计时器
    keepAliveInterval = null;
    // 用于重新连接时重播的消息缓冲
    messageBuffer;
    // 跟踪我们使用的是哪个运行时的 WS，以便我们可以
    // 使用匹配的 API 移除监听器（removeEventListener vs. off）。
    isBunWs = false;
    // 在 connect() 时捕获用于 handleOpenEvent 计时。存储为
    // 实例字段，以便 onOpen 处理程序可以是稳定的类属性
    // 箭头函数（可在 doDisconnect 中移除），而不是局部变量的闭包。
    connectStartTime = 0;
    refreshHeaders;
    constructor(url, headers = {}, sessionId, refreshHeaders, options) {
        this.url = url;
        this.headers = headers;
        this.sessionId = sessionId;
        this.refreshHeaders = refreshHeaders;
        this.autoReconnect = options?.autoReconnect ?? true;
        this.isBridge = options?.isBridge ?? false;
        this.messageBuffer = new CircularBuffer(DEFAULT_MAX_BUFFER_SIZE);
    }
    async connect() {
        if (this.state !== 'idle' && this.state !== 'reconnecting') {
            logForDebugging(`WebSocketTransport: 无法连接，当前状态为 ${this.state}`, { level: 'error' });
            logForDiagnosticsNoPII('error', 'cli_websocket_connect_failed');
            return;
        }
        this.state = 'reconnecting';
        this.connectStartTime = Date.now();
        logForDebugging(`WebSocketTransport: Opening ${this.url.href}`);
        logForDiagnosticsNoPII('info', 'cli_websocket_connect_opening');
        // 从提供的头部开始并添加运行时头部
        const headers = { ...this.headers };
        if (this.lastSentId) {
            headers['X-Last-Request-Id'] = this.lastSentId;
            logForDebugging(`WebSocketTransport: Adding X-Last-Request-Id header: ${this.lastSentId}`);
        }
        logForDebugging(`WebSocketTransport: 连接请求头部: ${jsonStringify(headers)}`);
        if (typeof Bun !== 'undefined') {
            // Bun 的 WebSocket 支持 headers/proxy 选项，但 DOM 类型定义不支持
            // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
            const ws = new globalThis.WebSocket(this.url.href, {
                headers,
                proxy: getWebSocketProxyUrl(this.url.href),
                tls: getWebSocketTLSOptions() || undefined,
            });
            this.ws = ws;
            this.isBunWs = true;
            ws.addEventListener('open', this.onBunOpen);
            ws.addEventListener('message', this.onBunMessage);
            ws.addEventListener('error', this.onBunError);
            // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
            ws.addEventListener('close', this.onBunClose);
            // 'pong' is Bun-specific — not in DOM typings.
            ws.addEventListener('pong', this.onPong);
        }
        else {
            const { default: WS } = await import('ws');
            const ws = new WS(this.url.href, {
                headers,
                agent: getWebSocketProxyAgent(this.url.href),
                ...getWebSocketTLSOptions(),
            });
            this.ws = ws;
            this.isBunWs = false;
            ws.on('open', this.onNodeOpen);
            ws.on('message', this.onNodeMessage);
            ws.on('error', this.onNodeError);
            ws.on('close', this.onNodeClose);
            ws.on('pong', this.onPong);
        }
    }
    // --- Bun（原生 WebSocket）事件处理程序 ---
    // 存储为类属性箭头函数，以便可以在 doDisconnect() 中移除。
    // 如果不移除，每次重连都会使旧的 WS 对象及其 5 个闭包
    // 成为孤儿直到 GC，在网络不稳定时会累积。
    // 镜像 src/utils/mcpWebSocketTransport.ts 中的模式。
    onBunOpen = () => {
        logForDebugging('WebSocketTransport: Bun WS 触发 open 事件');
        this.handleOpenEvent();
        // Bun 的 WebSocket 不暴露升级响应头，
        // 所以重播所有缓冲的消息。服务器按 UUID 去重。
        if (this.lastSentId) {
            logForDebugging(`WebSocketTransport: lastSentId=${this.lastSentId}, 开始重播缓冲消息`);
            this.replayBufferedMessages('');
        }
        else {
            logForDebugging('WebSocketTransport: 无 lastSentId, 不需要重播缓冲消息');
        }
    };
    onBunMessage = (event) => {
        const message = typeof event.data === 'string' ? event.data : String(event.data);
        this.lastActivityTime = Date.now();
        const sessionLabel = this.sessionId ? ` session=${this.sessionId}` : '';
        logForDebugging(`WS⬇ 收到数据 length=${message.length}${sessionLabel} preview=${message.slice(0, 500).replace(/\n/g, '↵')}`);
        logForDiagnosticsNoPII('info', 'cli_websocket_message_received', {
            length: message.length,
        });
        // ====== 调试日志：记录收到的原始 WebSocket 消息 ======
        logForDebugging(`WebSocketTransport: 收到消息 length=${message.length} data=${message.slice(0, 500)}${message.length > 500 ? '...(truncated)' : ''}`);
        // 尝试解析为 JSON 以便更好地调试
        try {
            const parsed = JSON.parse(message);
            logForDebugging(`WebSocketTransport: 消息解析为 JSON, type=${parsed.type || '(无type字段)'}`);
        }
        catch {
            logForDebugging(`WebSocketTransport: 消息不是有效 JSON`);
        }
        // =====================================================
        if (this.onData) {
            logForDebugging(`WebSocketTransport: 调用 onData 回调, 消息长度=${message.length}`);
            this.onData(message);
        }
        else {
            logForDebugging(`WebSocketTransport: onData 回调未设置, 消息被丢弃`);
        }
    };
    onBunError = () => {
        logForDebugging('WebSocketTransport: Error', {
            level: 'error',
        });
        logForDiagnosticsNoPII('error', 'cli_websocket_connect_error');
        // close 事件在 error 后触发 —— 让它调用 handleConnectionError
    };
    // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
    onBunClose = (event) => {
        const isClean = event.code === 1000 || event.code === 1001;
        logForDebugging(`WebSocketTransport: Closed: code=${event.code} reason="${event.reason}" wasClean=${event.wasClean}`, isClean ? { level: "debug" } : { level: "error" });
        logForDiagnosticsNoPII('error', 'cli_websocket_connect_closed');
        this.handleConnectionError(event.code);
    };
    // --- Node（ws 包）事件处理程序 ---
    onNodeOpen = () => {
        logForDebugging('WebSocketTransport: Node WS 触发 open 事件');
        // 在 handleOpenEvent() 调用 onConnectCallback 之前捕获 ws —— 如果
        // 回调同步关闭传输，this.ws 会变为 null。
        // 旧的内联闭包代码通过闭包捕获隐式提供此安全性。
        const ws = this.ws;
        this.handleOpenEvent();
        if (!ws)
            return;
        // 检查升级响应头中的 last-id（仅 ws 包）
        const nws = ws;
        const upgradeResponse = nws.upgradeReq;
        if (upgradeResponse?.headers?.['x-last-request-id']) {
            const serverLastId = upgradeResponse.headers['x-last-request-id'];
            logForDebugging(`WebSocketTransport: 服务器升级响应 x-last-request-id=${serverLastId}`);
            this.replayBufferedMessages(serverLastId);
        }
        else {
            logForDebugging('WebSocketTransport: 服务器升级响应中无 x-last-request-id 头部');
        }
    };
    onNodeMessage = (data) => {
        const message = data.toString();
        this.lastActivityTime = Date.now();
        const sessionLabel = this.sessionId ? ` session=${this.sessionId}` : '';
        logForDebugging(`WS⬇ 收到数据 length=${message.length}${sessionLabel} preview=${message.slice(0, 500).replace(/\n/g, '↵')}`);
        logForDiagnosticsNoPII('info', 'cli_websocket_message_received', {
            length: message.length,
        });
        // ====== 调试日志：记录收到的原始 WebSocket 消息 ======
        logForDebugging(`WebSocketTransport: 收到消息 length=${message.length} data=${message.slice(0, 500)}${message.length > 500 ? '...(truncated)' : ''}`);
        // 尝试解析为 JSON 以便更好地调试
        try {
            const parsed = JSON.parse(message);
            logForDebugging(`WebSocketTransport: 消息解析为 JSON, type=${parsed.type || '(无type字段)'}`);
        }
        catch {
            logForDebugging(`WebSocketTransport: 消息不是有效 JSON`);
        }
        // =====================================================
        if (this.onData) {
            logForDebugging(`WebSocketTransport: 调用 onData 回调, 消息长度=${message.length}`);
            this.onData(message);
        }
        else {
            logForDebugging(`WebSocketTransport: onData 回调未设置, 消息被丢弃`);
        }
    };
    onNodeError = (err) => {
        logForDebugging(`WebSocketTransport: Error: ${err.message}\n${err.stack || '(无堆栈)'}`, { level: 'error' });
        logForDiagnosticsNoPII('error', 'cli_websocket_connect_error');
        // close 事件在 error 后触发 —— 让它调用 handleConnectionError
    };
    onNodeClose = (code, _reason) => {
        const isClean = code === 1000 || code === 1001;
        logForDebugging(`WebSocketTransport: Closed: ${code}`, isClean ? { level: "debug" } : { level: "error" });
        logForDiagnosticsNoPII('error', 'cli_websocket_connect_closed');
        this.handleConnectionError(code);
    };
    // --- Shared handlers ---
    onPong = () => {
        this.pongReceived = true;
    };
    handleOpenEvent() {
        const connectDuration = Date.now() - this.connectStartTime;
        logForDebugging('WebSocketTransport: Connected');
        logForDiagnosticsNoPII('info', 'cli_websocket_connect_connected', {
            duration_ms: connectDuration,
        });
        // 重连成功 —— 在重置前记录尝试次数 + 停机时间。
        // reconnectStartTime 在首次连接时为 null，重新打开时非 null。
        if (this.isBridge && this.reconnectStartTime !== null) {
            logEvent('tengu_ws_transport_reconnected', {
                attempts: this.reconnectAttempts,
                downtimeMs: Date.now() - this.reconnectStartTime,
            });
        }
        this.reconnectAttempts = 0;
        this.reconnectStartTime = null;
        this.lastReconnectAttemptTime = null;
        this.lastActivityTime = Date.now();
        this.state = 'connected';
        this.onConnectCallback?.();
        // 启动定期 ping 以检测死连接
        this.startPingInterval();
        // 启动定期 keep_alive 数据帧以重置代理空闲计时器
        this.startKeepaliveInterval();
        // 注册会话活动信号的回调
        registerSessionActivityCallback(() => {
            void this.write({ type: 'keep_alive' });
        });
    }
    sendLine(line) {
        if (!this.ws || this.state !== 'connected') {
            logForDebugging(`WebSocketTransport: WS 未连接，跳过发送 (state=${this.state}, ws=${this.ws ? 'exists' : 'null'})`);
            logForDiagnosticsNoPII('info', 'cli_websocket_send_not_connected');
            return false;
        }
        try {
            const sessionLabel = this.sessionId ? ` session=${this.sessionId}` : '';
            logForDebugging(`WebSocketTransport: Sending line length=${line.length} data=${line.slice(0, 500)}${line.length > 500 ? '...(truncated)' : ''}`);
            // 尝试解析发送的消息以调试
            try {
                const parsed = JSON.parse(line);
                logForDebugging(`WebSocketTransport: 发送消息 type=${parsed.type || '(无type字段)'}`);
            }
            catch {
                logForDebugging('WebSocketTransport: 发送消息不是有效 JSON');
            }
            this.ws.send(line);
            this.lastActivityTime = Date.now();
            logForDebugging('WebSocketTransport: 消息发送成功');
            return true;
        }
        catch (error) {
            logForDebugging(`WebSocketTransport: Failed to send: ${error}\n${error instanceof Error ? error.stack || '(无堆栈)' : '(非Error)'}`, { level: 'error' });
            logForDiagnosticsNoPII('error', 'cli_websocket_send_error');
            // 不要在这里将 this.ws 设为 null —— 让 doDisconnect()（通过 handleConnectionError）
            // 处理清理，以便在 WS 释放前移除监听器。
            this.handleConnectionError();
            return false;
        }
    }
    /**
     * 移除在 connect() 中为给定 WebSocket 添加的所有监听器。
     * 如果不移除，每次重连都会使旧的 WS 对象及其闭包成为孤儿
     * 直到 GC —— 这些会在网络不稳定时累积。
     * 镜像 src/utils/mcpWebSocketTransport.ts 中的模式。
     */
    removeWsListeners(ws) {
        logForDebugging(`WebSocketTransport: 移除 WebSocket 监听器 (${this.isBunWs ? 'Bun' : 'Node'})`);
        if (this.isBunWs) {
            const nws = ws;
            nws.removeEventListener('open', this.onBunOpen);
            nws.removeEventListener('message', this.onBunMessage);
            nws.removeEventListener('error', this.onBunError);
            // eslint-disable-next-line eslint-plugin-n/no-unsupported-features/node-builtins
            nws.removeEventListener('close', this.onBunClose);
            // 'pong' is Bun-specific — not in DOM typings
            nws.removeEventListener('pong', this.onPong);
        }
        else {
            const nws = ws;
            nws.off('open', this.onNodeOpen);
            nws.off('message', this.onNodeMessage);
            nws.off('error', this.onNodeError);
            nws.off('close', this.onNodeClose);
            nws.off('pong', this.onPong);
        }
        logForDebugging('WebSocketTransport: WebSocket 监听器已移除');
    }
    doDisconnect() {
        // 断开连接时停止 ping 和 keepalive
        this.stopPingInterval();
        this.stopKeepaliveInterval();
        // 注销会话活动回调
        unregisterSessionActivityCallback();
        if (this.ws) {
            // 在 close() 之前移除监听器，以便旧的 WS + 闭包可以
            // 及时被 GC，而不是停留到下一次标记清除。
            this.removeWsListeners(this.ws);
            this.ws.close();
            this.ws = null;
        }
    }
    handleConnectionError(closeCode) {
        logForDebugging(`WebSocketTransport: Disconnected from ${this.url.href}` +
            (closeCode != null ? ` (code ${closeCode})` : '') +
            `, state=${this.state}, reconnectAttempts=${this.reconnectAttempts}, lastActivity=${this.lastActivityTime > 0 ? Date.now() - this.lastActivityTime + 'ms ago' : 'never'}`, { level: 'error' });
        logForDiagnosticsNoPII('info', 'cli_websocket_disconnected', {
            closeCode: closeCode ?? -1,
            state: this.state,
            reconnectAttempts: this.reconnectAttempts,
        });
        if (this.isBridge) {
            // 每次关闭时触发 —— 包括重连风暴期间的中间关闭
            //（这些永远不会暴露给 onCloseCallback 调用者）。
            // 对于 Cloudflare-5min-idle 假设：集群 msSinceLastActivity；
            // 如果峰值在 ~300s 且 closeCode 1006，那就是代理 RST。
            logEvent('tengu_ws_transport_closed', {
                closeCode,
                msSinceLastActivity: this.lastActivityTime > 0 ? Date.now() - this.lastActivityTime : -1,
                // 'connected' = 健康断开（Cloudflare 情况）；'reconnecting' =
                // 风暴中间的连接拒绝。状态在下面的分支之前不会改变，
                // 所以这里读取的是关闭前的值。
                wasConnected: this.state === 'connected',
                reconnectAttempts: this.reconnectAttempts,
            });
        }
        this.doDisconnect();
        if (this.state === 'closing' || this.state === 'closed')
            return;
        // 永久关闭码：不重试 —— 服务器已明确结束会话。
        // 例外：4003（未授权）可以在 refreshHeaders 可用且
        // 返回新令牌时重试（例如父进程在重连期间
        // 生成新会话入口令牌后）。
        let headersRefreshed = false;
        if (closeCode === 4003 && this.refreshHeaders) {
            logForDebugging(`WebSocketTransport: 收到 4003 (未授权)，尝试刷新认证头部`);
            const freshHeaders = this.refreshHeaders();
            logForDebugging(`WebSocketTransport: 刷新后的头部: ${JSON.stringify(freshHeaders).slice(0, 200)}`);
            if (freshHeaders.Authorization !== this.headers.Authorization) {
                Object.assign(this.headers, freshHeaders);
                headersRefreshed = true;
                logForDebugging('WebSocketTransport: 4003 认证头部已刷新，准备重连');
                logForDiagnosticsNoPII('info', 'cli_websocket_4003_token_refreshed');
            }
            else {
                logForDebugging('WebSocketTransport: 4003 刷新后认证头部未变化，不重连');
            }
        }
        if (closeCode != null &&
            PERMANENT_CLOSE_CODES.has(closeCode) &&
            !headersRefreshed) {
            logForDebugging(`WebSocketTransport: 永久关闭码 ${closeCode}，不重连`, { level: 'error' });
            logForDebugging(`WebSocketTransport: PERMANENT_CLOSE_CODES=${JSON.stringify([...PERMANENT_CLOSE_CODES])}, headersRefreshed=${headersRefreshed}`);
            logForDiagnosticsNoPII('error', 'cli_websocket_permanent_close', {
                closeCode,
            });
            this.state = 'closed';
            this.onCloseCallback?.(closeCode);
            return;
        }
        // 当 autoReconnect 禁用时，直接进入关闭状态。
        // 调用者（例如 REPL 桥轮询循环）处理恢复。
        if (!this.autoReconnect) {
            logForDebugging('WebSocketTransport: autoReconnect=false，直接进入关闭状态');
            this.state = 'closed';
            this.onCloseCallback?.(closeCode);
            return;
        }
        // 使用指数退避和时间预算调度重连
        const now = Date.now();
        if (!this.reconnectStartTime) {
            this.reconnectStartTime = now;
        }
        // 检测系统睡眠/唤醒：如果自上次重连尝试以来的间隔
        // 大大超过最大延迟，机器可能睡眠了
        //（例如笔记本合盖）。重置预算并从头重试 ——
        // 如果会话在我们睡眠期间被回收，
        // 服务器将用永久关闭码（4001/1002）拒绝。
        if (this.lastReconnectAttemptTime !== null &&
            now - this.lastReconnectAttemptTime > SLEEP_DETECTION_THRESHOLD_MS) {
            logForDebugging(`WebSocketTransport: Detected system sleep (${Math.round((now - this.lastReconnectAttemptTime) / 1000)}s gap), resetting reconnection budget`);
            logForDiagnosticsNoPII('info', 'cli_websocket_sleep_detected', {
                gapMs: now - this.lastReconnectAttemptTime,
            });
            this.reconnectStartTime = now;
            this.reconnectAttempts = 0;
        }
        this.lastReconnectAttemptTime = now;
        const elapsed = now - this.reconnectStartTime;
        if (elapsed < DEFAULT_RECONNECT_GIVE_UP_MS) {
            // 清除任何现有的重连定时器以避免重复
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }
            // 重连前刷新头部（例如获取新会话令牌）。
            // 如果已被上面的 4003 路径刷新则跳过。
            if (!headersRefreshed && this.refreshHeaders) {
                const freshHeaders = this.refreshHeaders();
                logForDebugging(`WebSocketTransport: 重连前刷新头部: ${JSON.stringify(freshHeaders).slice(0, 200)}`);
                Object.assign(this.headers, freshHeaders);
                logForDebugging('WebSocketTransport: Headers refreshed for reconnect');
            }
            else if (headersRefreshed) {
                logForDebugging('WebSocketTransport: 头部已在 4003 路径中刷新，跳过');
            }
            this.state = 'reconnecting';
            this.reconnectAttempts++;
            logForDebugging(`WebSocketTransport: 重连状态更新: attempts=${this.reconnectAttempts}, state=reconnecting`);
            const baseDelay = Math.min(DEFAULT_BASE_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts - 1), DEFAULT_MAX_RECONNECT_DELAY);
            // 添加 ±25% 抖动以避免惊群效应
            const delay = Math.max(0, baseDelay + baseDelay * 0.25 * (2 * Math.random() - 1));
            logForDebugging(`WebSocketTransport: Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts}, ${Math.round(elapsed / 1000)}s elapsed)`);
            logForDiagnosticsNoPII('error', 'cli_websocket_reconnect_attempt', {
                reconnectAttempts: this.reconnectAttempts,
            });
            if (this.isBridge) {
                logEvent('tengu_ws_transport_reconnecting', {
                    attempt: this.reconnectAttempts,
                    elapsedMs: elapsed,
                    delayMs: Math.round(delay),
                });
            }
            this.reconnectTimer = setTimeout(() => {
                this.reconnectTimer = null;
                void this.connect();
            }, delay);
        }
        else {
            logForDebugging(`WebSocketTransport: 重连时间预算耗尽 after ${Math.round(elapsed / 1000)}s for ${this.url.href}, totalAttempts=${this.reconnectAttempts}`, { level: 'error' });
            logForDiagnosticsNoPII('error', 'cli_websocket_reconnect_exhausted', {
                reconnectAttempts: this.reconnectAttempts,
                elapsedMs: elapsed,
            });
            this.state = 'closed';
            logForDebugging(`WebSocketTransport: 状态已设置为 closed, 即将调用 onCloseCallback`);
            // 通知关闭回调
            if (this.onCloseCallback) {
                logForDebugging(`WebSocketTransport: 调用 onCloseCallback with code=${closeCode}`);
                this.onCloseCallback(closeCode);
            }
            else {
                logForDebugging('WebSocketTransport: onCloseCallback 未设置');
            }
        }
    }
    close() {
        logForDebugging('WebSocketTransport: close() called');
        // 清除任何待处理的重连定时器
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
            logForDebugging('WebSocketTransport: 重连定时器已清除');
        }
        // 清除 ping 和 keepalive 间隔
        this.stopPingInterval();
        this.stopKeepaliveInterval();
        // 注销会话活动回调
        unregisterSessionActivityCallback();
        logForDebugging('WebSocketTransport: 会话活动回调已注销');
        this.state = 'closing';
        logForDebugging('WebSocketTransport: 状态已设置为 closing');
        this.doDisconnect();
    }
    replayBufferedMessages(lastId) {
        const messages = this.messageBuffer.toArray();
        logForDebugging(`WebSocketTransport: replayBufferedMessages 开始, lastId=${lastId || '(无)'}, 缓冲区大小=${messages.length}`);
        if (messages.length === 0) {
            logForDebugging('WebSocketTransport: 缓冲区为空，无需重播');
            return;
        }
        // 根据服务器最后接收的消息找到开始重播的位置
        let startIndex = 0;
        if (lastId) {
            logForDebugging(`WebSocketTransport: 查找 lastId=${lastId} 在缓冲区中的位置`);
            const lastConfirmedIndex = messages.findIndex(message => 'uuid' in message && message.uuid === lastId);
            logForDebugging(`WebSocketTransport: lastConfirmedIndex=${lastConfirmedIndex}`);
            if (lastConfirmedIndex >= 0) {
                // 服务器已确认到 lastConfirmedIndex 的消息 —— 驱逐它们
                startIndex = lastConfirmedIndex + 1;
                // 仅用未确认的消息重建缓冲区
                const remaining = messages.slice(startIndex);
                this.messageBuffer.clear();
                this.messageBuffer.addAll(remaining);
                if (remaining.length === 0) {
                    this.lastSentId = null;
                    logForDebugging('WebSocketTransport: 所有消息已确认，清空 lastSentId');
                }
                logForDebugging(`WebSocketTransport: 已驱逐 ${startIndex} 条已确认消息，剩余 ${remaining.length} 条`);
                logForDiagnosticsNoPII('info', 'cli_websocket_evicted_confirmed_messages', {
                    evicted: startIndex,
                    remaining: remaining.length,
                });
            }
            else {
                logForDebugging(`WebSocketTransport: 未在缓冲区中找到 lastId=${lastId}，将重播全部消息`);
            }
        }
        else {
            logForDebugging('WebSocketTransport: 无 lastId，将重播全部缓冲消息');
        }
        const messagesToReplay = messages.slice(startIndex);
        if (messagesToReplay.length === 0) {
            logForDebugging('WebSocketTransport: 无新消息需要重播');
            logForDiagnosticsNoPII('info', 'cli_websocket_no_messages_to_replay');
            return;
        }
        logForDebugging(`WebSocketTransport: 将重播 ${messagesToReplay.length} 条缓冲消息`);
        logForDiagnosticsNoPII('info', 'cli_websocket_messages_to_replay', {
            count: messagesToReplay.length,
        });
        for (let i = 0; i < messagesToReplay.length; i++) {
            const message = messagesToReplay[i];
            const line = jsonStringify(message) + '\n';
            logForDebugging(`WebSocketTransport: 重播消息 [${i + 1}/${messagesToReplay.length}] type=${message.type} uuid=${('uuid' in message ? message.uuid : 'none')}`);
            const success = this.sendLine(line);
            if (!success) {
                logForDebugging(`WebSocketTransport: 重播消息发送失败 [${i + 1}/${messagesToReplay.length}]`, { level: 'error' });
                this.handleConnectionError();
                break;
            }
        }
        logForDebugging(`WebSocketTransport: 消息重播完成`);
        // 重播后不要清除缓冲区 —— 消息保持缓冲直到
        // 服务器在下次重连确认接收。这可以防止
        // 连接在重播后但服务器处理消息前断开导致的消息丢失。
    }
    isConnectedStatus() {
        return this.state === 'connected';
    }
    isClosedStatus() {
        return this.state === 'closed';
    }
    setOnData(callback) {
        this.onData = callback;
    }
    setOnConnect(callback) {
        this.onConnectCallback = callback;
    }
    setOnClose(callback) {
        this.onCloseCallback = callback;
    }
    getStateLabel() {
        return this.state;
    }
    async write(message) {
        logForDebugging(`WebSocketTransport: write() called, message type=${message.type}, uuid=${('uuid' in message ? message.uuid : 'none')}`);
        if ('uuid' in message && typeof message.uuid === 'string') {
            this.messageBuffer.add(message);
            this.lastSentId = message.uuid;
            logForDebugging(`WebSocketTransport: Message buffered, lastSentId=${this.lastSentId}, bufferSize=${this.messageBuffer.size()}`);
        }
        const line = jsonStringify(message) + '\n';
        if (this.state !== 'connected') {
            // 消息已缓冲，待连接后重播（如果有 UUID）
            logForDebugging(`WebSocketTransport: 消息因状态非 connected 而缓冲 (state=${this.state})`);
            // 消息已缓冲，待连接后重播（如果有 UUID）
            return;
        }
        const sessionLabel = this.sessionId ? ` session=${this.sessionId}` : '';
        const detailLabel = this.getControlMessageDetailLabel(message);
        logForDebugging(`WebSocketTransport: Sending message type=${message.type}${sessionLabel}${detailLabel}, line length=${line.length}`);
        this.sendLine(line);
    }
    getControlMessageDetailLabel(message) {
        if (message.type === 'control_request') {
            const { request_id, request } = message;
            const toolName = request.subtype === 'can_use_tool' ? request.tool_name : '';
            return ` subtype=${request.subtype} request_id=${request_id}${toolName ? ` tool=${toolName}` : ''}`;
        }
        if (message.type === 'control_response') {
            const { subtype, request_id } = message.response;
            return ` subtype=${subtype} request_id=${request_id}`;
        }
        return '';
    }
    startPingInterval() {
        // 清除任何现有的间隔
        this.stopPingInterval();
        this.pongReceived = true;
        let lastTickTime = Date.now();
        let tickCount = 0;
        logForDebugging(`WebSocketTransport: 启动 ping 间隔 (interval=${DEFAULT_PING_INTERVAL}ms)`);
        // 定期发送 ping 以检测死连接。
        // 如果上一次 ping 没有收到 pong，将连接视为死连接。
        this.pingInterval = setInterval(() => {
            tickCount++;
            if (this.state === 'connected' && this.ws) {
                const now = Date.now();
                const gap = now - lastTickTime;
                lastTickTime = now;
                logForDebugging(`WebSocketTransport: ping tick #${tickCount} gap=${gap}ms pongReceived=${this.pongReceived}`);
                // 进程挂起检测。如果 tick 之间的挂钟时间间隔
                // 大大超过 10s 间隔，进程被挂起了
                //（笔记本合盖、SIGSTOP、VM 暂停）。setInterval 不会排队
                // 错过的 tick —— 它会合并 —— 所以唤醒时此回调触发
                // 一次，带有巨大的间隔。套接字几乎肯定是死的：
                // NAT 映射在 30s-5min 内丢弃，服务器一直在
                // 向虚空重传。不要等待 ping/pong
                // 往返确认（死套接字上的 ws.ping() 返回
                // 立即且无错误 —— 字节进入内核发送
                // 缓冲区）。假设已死并立即重连。
                // 短暂睡眠后的虚假重连代价很低 —— replayBufferedMessages() 处理
                // 它，服务器按 UUID 去重。
                if (gap > SLEEP_DETECTION_THRESHOLD_MS) {
                    logForDebugging(`WebSocketTransport: ${Math.round(gap / 1000)}s tick gap detected (${tickCount} ticks) — process was suspended, forcing reconnect`, { level: 'error' });
                    logForDiagnosticsNoPII('info', 'cli_websocket_sleep_detected_on_ping', { gapMs: gap, tickCount });
                    this.handleConnectionError();
                    return;
                }
                if (!this.pongReceived) {
                    logForDebugging(`WebSocketTransport: tick #${tickCount} 未收到 pong，连接似乎已死`, { level: 'error' });
                    logForDiagnosticsNoPII('error', 'cli_websocket_pong_timeout');
                    this.handleConnectionError();
                    return;
                }
                this.pongReceived = false;
                try {
                    logForDebugging(`WebSocketTransport: 发送 ping (tick #${tickCount})`);
                    this.ws.ping?.();
                }
                catch (error) {
                    logForDebugging(`WebSocketTransport: Ping 失败: ${error} (tick #${tickCount})`, { level: 'error' });
                    logForDiagnosticsNoPII('error', 'cli_websocket_ping_failed');
                }
            }
            else {
                logForDebugging(`WebSocketTransport: ping tick #${tickCount} 跳过 (state=${this.state}, ws=${this.ws ? 'exists' : 'null'})`);
            }
        }, DEFAULT_PING_INTERVAL);
    }
    stopPingInterval() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
            logForDebugging('WebSocketTransport: ping 间隔已停止');
        }
    }
    onPong = () => {
        this.pongReceived = true;
        logForDebugging('WebSocketTransport: 收到 pong 响应');
    };
    startKeepaliveInterval() {
        this.stopKeepaliveInterval();
        // 在 CCR 会话中，会话活动心跳处理保持活动
        if (isEnvTruthy(process.env.CLAUDE_CODE_REMOTE)) {
            logForDebugging('WebSocketTransport: CLAUDE_CODE_REMOTE 已设置，跳过 keepalive 间隔');
            return;
        }
        logForDebugging(`WebSocketTransport: 启动 keepalive 间隔 (interval=${DEFAULT_KEEPALIVE_INTERVAL}ms)`);
        this.keepAliveInterval = setInterval(() => {
            if (this.state === 'connected' && this.ws) {
                try {
                    logForDebugging('WebSocketTransport: 发送定期 keep_alive 数据帧');
                    this.ws.send(KEEP_ALIVE_FRAME);
                    this.lastActivityTime = Date.now();
                    logForDebugging('WebSocketTransport: 已发送定期 keep_alive 数据帧');
                }
                catch (error) {
                    logForDebugging(`WebSocketTransport: 定期 keep_alive 失败: ${error}`, { level: 'error' });
                    logForDiagnosticsNoPII('error', 'cli_websocket_keepalive_failed');
                }
            }
            else {
                logForDebugging(`WebSocketTransport: keepalive tick 跳过 (state=${this.state}, ws=${this.ws ? 'exists' : 'null'})`);
            }
        }, DEFAULT_KEEPALIVE_INTERVAL);
    }
    stopKeepaliveInterval() {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
            logForDebugging('WebSocketTransport: keepalive 间隔已停止');
        }
    }
}
//# sourceMappingURL=WebSocketTransport.js.map