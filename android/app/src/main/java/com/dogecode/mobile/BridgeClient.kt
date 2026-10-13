package com.dogecode.mobile

import android.os.Handler
import android.os.Looper
import android.util.Log
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * 与 doge-code 移动桥接服务对话的 WebSocket 客户端。
 *
 * 协议（见 src/bridge/mobileBridge.ts）：
 *   连接： ws://<host>:5680/mobile/ws?deviceId=..&deviceType=android[&secret=..]
 *   发送： {"type":"control","action":"sendMessage","params":{"message":".."},"requestId":".."}
 *         另有 action:"interrupt" 可中断当前回合
 *   接收： client_connected / assistant / system / result / error
 *
 * 断线自动重连：指数退避（1s,2s,4s…上限 30s），非主动断开时一直重试。
 * 所有回调都切回主线程，调用方无需再处理线程切换。
 */
class BridgeClient(
    private val onEvent: (Event) -> Unit,
    /**
     * 失败记录回调。
     *
     * 用回调而非注入 Context：本类目前是纯逻辑（有完整单测），
     * 引入 Context 会破坏可测性。记录历史是**宿主**的职责。
     */
    private val onDiagnosis: ((reason: String, httpCode: Int?, address: String) -> Unit)? = null,
) {
    sealed interface Event {
        /**
         * 已连接；interactive=false 表示 CLI 跑在非交互终端，消息不会被处理。
         *
         * 随附服务端下发的本会话可用地址与标识（sessionEndpoints），
         * 供会话记录落库/展示 —— 老服务端不带这些字段时为空值。
         */
        data class Connected(
            val interactive: Boolean,
            val lan: List<String> = emptyList(),
            val tunnel: String? = null,
            val label: String = "",
            val cwd: String = "",
            val port: Int = 0,
            val resumeSessionId: String? = null,
            /**
             * 同机其他会话的接入信息（服务端 peer 发现）。
             *
             * 手机连上任一实例即拿到全部会话的 lan/tunnel，据此可连到每个
             * 会话（含各自隧道），无须自己扫端口段或等 UDP 广播。
             */
            val peers: List<BridgeProtocol.Msg.PeerInfo> = emptyList(),
        ) : Event

        /**
         * 连接**期间**服务端推来的「地址已更新」。
         *
         * 与 [Connected] 的区别：那个是握手一次性给的；本事件是后续变化
         * （隧道换子域、新实例起来）。宿主据此更新本会话地址与已知会话库。
         */
        data class EndpointsUpdated(
            val lan: List<String> = emptyList(),
            val tunnel: String? = null,
            val peers: List<BridgeProtocol.Msg.PeerInfo> = emptyList(),
        ) : Event

        data class Disconnected(val reason: String) : Event
        data class Incoming(
            val role: String,
            val text: String,
            val suppressNotify: Boolean = false,
            /**
             * 来源消息 uuid（手机端发出的消息其 uuid 即当初 requestId）。
             * 服务端推送回所有手机时带此值，用于精确去重「自己刚发、被回推」的那条。
             */
            val sourceRequestId: String = "",
        ) : Event
        /** 自己发出的消息被服务端确认入队 */
        data class Queued(val requestId: String) : Event
        data class Error(val message: String) : Event

        /**
         * 服务端以 4001 拒绝（密钥不符）。
         * 与普通断开分开：这是配置错误，重连无用，且需要引导用户去改设置。
         */
        data class AuthFailed(val reason: String) : Event

        /**
         * 服务端以 4002 拒绝（同一 CLI 上连接的设备数已达上限）。
         *
         * 与 [AuthFailed] 的区别：这是**可恢复**的 —— 关掉一台旧设备后重连
         * 就能成功，故不能像 4001 那样永久停止重连。但也不能按普通断线的
         * 1 秒级退避狂重试：会话数不会因为快速重连而释放，那样只会让状态栏
         * 反复闪「已断开，重连中」，用户无法知道真实原因（会话满了）。
         *
         * 处理方式：派发本事件让界面明确提示「设备数已满」，重连改用更长的
         * 起始退避（见 [SESSION_LIMIT_RETRY_MS]）。
         */
        data class SessionLimitReached(val reason: String) : Event

        /**
         * 服务端请求远程批准一次工具执行。
         * 用户点「批准/拒绝」后由调用方调 [sendPermissionResponse] 回传。
         */
        data class PermissionRequested(
            val requestId: String,
            val toolName: String,
            val description: String,
            val inputPreview: String,
            /** diff 预览行（+/- 前缀）；非文件修改类工具时为空。 */
            val diffLines: List<String> = emptyList(),
        ) : Event

        /** 服务端撤销先前发出的权限请求（本地终端已先决定）。 */
        data class PermissionCancelled(val requestId: String) : Event

        /** 流式增量（尽力而为的预览，定稿消息到达时会替换它）。 */
        data class Delta(val text: String, val seq: Int) : Event

        /**
         * 回合结束信号（与内容解耦）。
         *
         * 收到即收起「中断」与进度条。此前只靠 role=assistant 定稿倒推结束，
         * 导致「只调工具不出文本」的回合永远收不到结束信号、界面永久卡在
         * 「返回中」。现以本事件为权威结束信号。
         *
         * @param reason complete=正常 interrupted=被中断 error=出错
         */
        data class TurnEnd(val reason: String) : Event

                /** 回合用量快照（累计值）。收到后更新界面上的用量条。 */
        data class Usage(            val inputTokens: Int,
            val outputTokens: Int,
            val cacheReadTokens: Int,
            val durationMs: Long,
            val costUSD: Double,
        ) : Event

        /** 工具/子代理活动（tool/thinking 落成工具气泡，agent 进活动区）。 */
        data class ToolActivity(
            val kind: String,
            val name: String,
            val target: String,
            val state: String,
            val detail: String = "",
            val result: String = "",
            val toolUseId: String = "",
            val truncated: Boolean = false,
            val fullLength: Int = 0,
        ) : Event
    }

    private val main = Handler(Looper.getMainLooper())
    private val http = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS)   // WS 长连接，不设读超时
        .pingInterval(20, TimeUnit.SECONDS)      // 心跳保活，及时发现半开连接
        .build()

    private var socket: WebSocket? = null
    private var url: String? = null
    private var manualClose = false
    private var retryDelayMs = 1000L
    private var connected = false

    /**
     * 最近一次连接失败的诊断摘要。
     *
     * 暴露给界面：用户「连不上」时只看到状态栏一闪而过，无从判断
     * 该改地址、改密钥还是开防火墙。这里保留最关键的三条
     * —— 失败类型、HTTP 响应码、重试次数。
     */
    data class Diagnosis(
        val reason: String,
        val httpCode: Int?,
        val attempts: Int,
        val at: Long,
    )

    var lastDiagnosis: Diagnosis? = null
        private set

    /** 清除失败记录（诊断页的「清除」按钮）。 */
    fun clearDiagnosis() {
        lastDiagnosis = null
        reconnectAttempts = 0
    }

    /** 累计重连尝试次数（跨多次成功/失败累计，用于判断是否长期连不上）。 */
    private var reconnectAttempts = 0

    val isConnected: Boolean get() = connected

    fun connect(wsUrl: String) {
        // 先关掉可能存在的旧连接再开新的。
        //
        // 若不关：一次 connectWith 里若 connect() 被调用两次（或重连与手动
        // 连接叠加），会同时存在**两个** WebSocket —— 服务端 sendToAll 会把
        // 每条消息广播到两个连接，手机端就**收到两份**（发送回显、助手回复
        // 全都重复）。真机实测复现过此症状。
        // 旧 socket 关闭会触发 onClosed/onFailure，但此处 manualClose 先置
        // true，故不会调度重连，安全。
        manualClose = true
        socket?.close(1000, "reconnect")
        socket = null

        manualClose = false
        url = wsUrl
        retryDelayMs = 1000L
        openSocket()
    }

    /** 主动断开，不再重连。 */
    fun close() {
        manualClose = true
        connected = false
        socket?.close(1000, "client closing")
        socket = null
    }

    fun sendMessage(text: String, requestId: String): Boolean {
        val ws = socket ?: return false
        val payload = JSONObject().apply {
            put("type", "control")
            put("action", "sendMessage")
            put("requestId", requestId)
            put("params", JSONObject().put("message", text))
            put("timestamp", System.currentTimeMillis())
        }
        return ws.send(payload.toString())
    }

    /**
     * 发送带图片的消息。
     *
     * 图片必须以内容块数组（ContentBlockParam[]）形式发送，不能拼进
     * message 字符串 —— 后者会被模型当纯文本读，完全看不到图。
     *
     * 内容块顺序即模型看到的顺序：先文本后图片，符合「描述 + 附图」
     * 的自然表达。若无文本则只发图片块（纯截图场景很常见，比如
     * 拍一张报错截图让 AI 看）。
     */
    fun sendMessageWithImages(
        text: String,
        imagesBase64: List<Pair<String, String>>,  // (mediaType, base64data)
        requestId: String,
    ): Boolean {
        val ws = socket ?: return false
        if (imagesBase64.isEmpty()) return sendMessage(text, requestId)

        val blocks = org.json.JSONArray()
        if (text.isNotBlank()) {
            blocks.put(JSONObject().apply {
                put("type", "text")
                put("text", text)
            })
        }
        imagesBase64.forEach { (mediaType, data) ->
            blocks.put(JSONObject().apply {
                put("type", "image")
                put("source", JSONObject().apply {
                    put("type", "base64")
                    put("media_type", mediaType)
                    put("data", data)
                })
            })
        }

        val payload = JSONObject().apply {
            put("type", "control")
            put("action", "sendMessage")
            put("requestId", requestId)
            put("params", JSONObject().apply { put("content", blocks) })
            put("timestamp", System.currentTimeMillis())
        }
        return ws.send(payload.toString())
    }

    fun sendInterrupt() {
        val ws = socket ?: return
        val payload = JSONObject().apply {
            put("type", "control")
            put("action", "interrupt")
            put("requestId", ChatMessage.newId())
            put("timestamp", System.currentTimeMillis())
        }
        ws.send(payload.toString())
    }

    /**
     * 请求修改一项服务端配置。
     *
     * 通用方法而非三个专用方法：配置项由服务端白名单决定，
     * 客户端只负责传 key/value —— 这样新增配置项不必改协议。
     */
    fun setConfig(key: String, value: Any?, requestId: String): Boolean {
        val ws = socket ?: return false
        val payload = JSONObject().apply {
            put("type", "control")
            put("action", "setConfig")
            put("requestId", requestId)
            put("params", JSONObject().apply {
                put("key", key)
                put("value", value ?: JSONObject.NULL)
            })
            put("timestamp", System.currentTimeMillis())
        }
        return ws.send(payload.toString())
    }

    /**
     * 请求编辑最后一条用户消息（撤回 + 重发）。
     *
     * 结果由服务端以 result 消息返回（data.oldText 是原文本）。
     */
    fun editMessage(newText: String, requestId: String): Boolean {
        val ws = socket ?: return false
        val payload = JSONObject().apply {
            put("type", "control")
            put("action", "editMessage")
            put("requestId", requestId)
            put("params", JSONObject().put("text", newText))
            put("timestamp", System.currentTimeMillis())
        }
        return ws.send(payload.toString())
    }

    /**
     * 请求重命名当前会话（服务端改进程内标签，不写磁盘）。
     *
     * 回执由服务端以 result 消息返回（data.label 是生效后的标签）——
     * 服务端会做长度/控制字符校验，可能与我们发送的不同，故以回执为准。
     */
    fun renameSession(label: String, requestId: String): Boolean {
        val ws = socket ?: return false
        val payload = JSONObject().apply {
            put("type", "control")
            put("action", "renameSession")
            put("requestId", requestId)
            put("params", JSONObject().put("label", label))
            put("timestamp", System.currentTimeMillis())
        }
        return ws.send(payload.toString())
    }

    /**
     * 回传一次权限请求的决定。
     *
     * 必须带**原请求的 requestId**（不是新生成的）—— 服务端用它找到等待中的
     * 处理器（mobileBridge 的 mobilePermissionWaiters）。用新 id 会导致
     * 响应被丢弃、权限对话框永久挂起。
     *
     * @param behavior 只能传 "allow" / "deny"；服务端对其它值一律按 deny 处理
     */
    fun sendPermissionResponse(requestId: String, behavior: String, message: String? = null): Boolean {
        val ws = socket ?: return false
        val params = JSONObject().apply {
            put("requestId", requestId)
            put("behavior", behavior)
            if (!message.isNullOrBlank()) put("message", message)
        }
        val payload = JSONObject().apply {
            put("type", "control")
            put("action", "permissionResponse")
            put("requestId", ChatMessage.newId())
            put("params", params)
            put("timestamp", System.currentTimeMillis())
        }
        return ws.send(payload.toString())
    }

    private fun openSocket() {
        val target = url ?: return
        Log.i(TAG, "连接 $target")
        val req = Request.Builder().url(target).build()
        val ws = http.newWebSocket(req, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Log.i(TAG, "WS 已打开，等待 client_connected")
                // 真正的"可用"要等 client_connected，这里不置 connected
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                // **只处理"当前"连接的消息**：旧的、已被替换的连接在真正关闭前
                // 仍可能回调 onMessage。若不校验，重连时新旧的 listener 都在跑，
                // 同一条服务端 push（assistant/回显）会被处理两次 → 界面显示两份。
                // OkHttp 的 close() 是异步的，这个窗口真实存在，不是理论问题。
                if (webSocket !== socket) return
                handleMessage(text)
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                // 旧连接的失败不得触发重连：否则会把新连接也顶掉，
                // 两条 WS 并存 → 消息重复。见上 onMessage 的说明。
                if (webSocket !== socket) return
                // 带上异常类型与 HTTP 响应码：真机排查时只看到 "连接失败"
                // 完全无法区分是 DNS、拒绝连接、升级被拒还是证书问题。
                Log.w(
                    TAG,
                    "WS 失败 url=$target code=${response?.code} " +
                        "type=${t.javaClass.simpleName} msg=${t.message}",
                )
                connected = false
                reconnectAttempts++
                val reason = "${t.javaClass.simpleName}: ${t.message ?: "无详情"}"
                lastDiagnosis = Diagnosis(
                    reason = reason,
                    httpCode = response?.code,
                    attempts = reconnectAttempts,
                    at = System.currentTimeMillis(),
                )
                onDiagnosis?.invoke(reason, response?.code, url ?: "")
                post { onEvent(Event.Disconnected(t.message ?: "连接失败")) }
                scheduleReconnect()
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                // 旧连接的关闭同样要忽略：否则一次重连会因旧连接的 onClosed
                // 再触发一次 scheduleReconnect，开出一条多余的 WS（消息重复）。
                if (webSocket !== socket) return
                connected = false
                when (classifyClose(code)) {
                    // 密钥不对是永久性失败：重连多少次都一样，只会每 30 秒
                    // 无意义地重试一次。转为 AuthFailed 让界面提示去填密钥。
                    CloseAction.AUTH_FAILED -> {
                        manualClose = true   // 停止重连
                        post { onEvent(Event.AuthFailed(reason.ifBlank { "认证失败" })) }
                    }
                    // 会话数已满是可恢复的（关掉旧设备后即可连上），故不停止重连；
                    // 但会话数不会因快速重连而释放，故把退避起点抬到 30 秒，
                    // 并派发专门事件让界面说明原因（而非只闪「已断开，重连中」）。
                    CloseAction.SESSION_LIMIT -> {
                        retryDelayMs = SESSION_LIMIT_RETRY_MS
                        reconnectAttempts++
                        lastDiagnosis = Diagnosis(
                            reason = "会话数已达上限（code=4002）",
                            httpCode = null,
                            attempts = reconnectAttempts,
                            at = System.currentTimeMillis(),
                        )
                        onDiagnosis?.invoke("会话数已达上限", null, url ?: "")
                        post { onEvent(Event.SessionLimitReached(reason.ifBlank { "设备数已达上限" })) }
                        if (!manualClose) scheduleReconnect()
                    }
                    CloseAction.NORMAL -> {
                        reconnectAttempts++
                        val closeReason = "服务端关闭连接（code=$code${if (reason.isNotBlank()) ": $reason" else ""}）"
                        lastDiagnosis = Diagnosis(
                            reason = closeReason,
                            httpCode = null,
                            attempts = reconnectAttempts,
                            at = System.currentTimeMillis(),
                        )
                        onDiagnosis?.invoke(closeReason, null, url ?: "")
                        post { onEvent(Event.Disconnected(reason.ifBlank { "已断开" })) }
                        if (!manualClose) scheduleReconnect()
                    }
                }
            }
        })
        // newWebSocket 的回调是**异步**的（onOpen/onMessage 都在建好之后才触发），
        // 故此处的赋值必然先于任何回调；listener 里的 `webSocket !== socket`
        // 判断因此能正确区分「当前连接」与「被替换的旧连接」。
        socket = ws
    }

    private fun handleMessage(text: String) {
        when (val m = BridgeProtocol.parse(text)) {
            is BridgeProtocol.Msg.Connected -> {
                connected = true
                retryDelayMs = 1000L
                // 连上了就清掉诊断：它是「当前问题」的指示，不是历史账本
                reconnectAttempts = 0
                lastDiagnosis = null
                post {
                    onEvent(
                        Event.Connected(
                            interactive = m.interactive,
                            lan = m.lan,
                            tunnel = m.tunnel,
                            label = m.label,
                            cwd = m.cwd,
                            port = m.port,
                            resumeSessionId = m.resumeSessionId,
                            peers = m.peers,
                        ),
                    )
                }
            }
            is BridgeProtocol.Msg.SessionsUpdated -> {
                // 服务端在「地址发生变化」时主动推（隧道换了子域、新实例起来等）。
                // 不更新的话手机会一直用握手时拿到的旧隧道地址，连不上。
                post { onEvent(Event.EndpointsUpdated(lan = m.lan, tunnel = m.tunnel, peers = m.peers)) }
            }
            is BridgeProtocol.Msg.Incoming -> {
                Log.i(TAG, "[PROBE] Incoming role=${m.role} srcRid='${m.sourceRequestId}' text=${m.text.take(20)}")
                post { onEvent(Event.Incoming(m.role, m.text, m.suppressNotify, m.sourceRequestId)) }
            }
            is BridgeProtocol.Msg.Queued -> post { onEvent(Event.Queued(m.requestId)) }
            is BridgeProtocol.Msg.Error -> post { onEvent(Event.Error(m.message)) }
            is BridgeProtocol.Msg.PermissionRequest -> post {
                onEvent(
                    Event.PermissionRequested(
                        m.requestId, m.toolName, m.description, m.inputPreview, m.diffLines,
                    ),
                )
            }
            is BridgeProtocol.Msg.PermissionCancel -> post {
                onEvent(Event.PermissionCancelled(m.requestId))
            }
            is BridgeProtocol.Msg.Delta -> post { onEvent(Event.Delta(m.text, m.seq)) }
            is BridgeProtocol.Msg.TurnEnd -> post { onEvent(Event.TurnEnd(m.reason)) }
            is BridgeProtocol.Msg.ToolActivity -> post {
                onEvent(
                    Event.ToolActivity(
                        m.kind, m.name, m.target, m.state,
                        m.detail, m.result, m.toolUseId, m.truncated, m.fullLength,
                    ),
                )
            }
            is BridgeProtocol.Msg.Usage -> post {
                onEvent(
                    Event.Usage(
                        m.inputTokens, m.outputTokens, m.cacheReadTokens,
                        m.durationMs, m.costUSD,
                    ),
                )
            }
            BridgeProtocol.Msg.Ignored, BridgeProtocol.Msg.Unparsed -> {}
        }
    }

    /** 指数退避重连，上限 30 秒；只重试连接失败，不重试主动关闭。 */
    private fun scheduleReconnect() {
        if (manualClose) return
        val delay = retryDelayMs
        retryDelayMs = (retryDelayMs * 2).coerceAtMost(30_000L)
        main.postDelayed({
            if (!manualClose && !connected) openSocket()
        }, delay)
    }

    private fun post(block: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) block() else main.post(block)
    }

    /**
     * 服务端关闭码的分类与对应重连策略。
     *
     * 抽成纯函数（无 Android 依赖）以便单测 —— 这是「密钥不对该不该重连」
     * 「设备满了该等多久」这类决策的唯一来源，写错会直接表现为用户困惑
     * （状态栏反复闪却不知原因）。放回 [openSocket] 的匿名监听器里就只能
     * 靠真机试，而这正是 4002 缺口长期未被发现的原因。
     */
    internal enum class CloseAction(val stopReconnect: Boolean, val retryDelayMs: Long?) {
        /** 密钥不符：永久失败，停止重连，提示去改设置。 */
        AUTH_FAILED(stopReconnect = true, retryDelayMs = null),

        /** 会话数已满：可恢复但不该快速重试，用较长退避。 */
        SESSION_LIMIT(stopReconnect = false, retryDelayMs = SESSION_LIMIT_RETRY_MS),

        /** 其它：普通断线，走默认指数退避。 */
        NORMAL(stopReconnect = false, retryDelayMs = null),
    }

    companion object {
        private const val TAG = "BridgeClient"

        /**
         * 4002（会话数已达上限）后的重连起始退避。
         * 取 30 秒（而非普通断线的 1 秒）：会话数不会因快速重连而释放，
         * 30 秒既给了用户「去关掉一台旧设备」的时间，又不至于放弃恢复。
         */
        internal const val SESSION_LIMIT_RETRY_MS = 30_000L

        /**
         * 把服务端关闭码映射为处理策略（纯逻辑，供 [onClosed] 与单测共用）。
         *
         * 4001 = 密钥不符（mobileBridge.ts:799）；4002 = 会话数已达上限
         * （mobileBridge.ts:814）。其余（含 1000 正常关闭、无码断线）走普通重连。
         */
        internal fun classifyClose(code: Int): CloseAction = when (code) {
            4001 -> CloseAction.AUTH_FAILED
            4002 -> CloseAction.SESSION_LIMIT
            else -> CloseAction.NORMAL
        }
    }
}
