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
) {
    sealed interface Event {
        /** 已连接；interactive=false 表示 CLI 跑在非交互终端，消息不会被处理 */
        data class Connected(val interactive: Boolean) : Event
        data class Disconnected(val reason: String) : Event
        data class Incoming(val role: String, val text: String) : Event
        /** 自己发出的消息被服务端确认入队 */
        data class Queued(val requestId: String) : Event
        data class Error(val message: String) : Event

        /**
         * 服务端以 4001 拒绝（密钥不符）。
         * 与普通断开分开：这是配置错误，重连无用，且需要引导用户去改设置。
         */
        data class AuthFailed(val reason: String) : Event
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

    val isConnected: Boolean get() = connected

    fun connect(wsUrl: String) {
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

    private fun openSocket() {
        val target = url ?: return
        Log.i(TAG, "连接 $target")
        val req = Request.Builder().url(target).build()
        socket = http.newWebSocket(req, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Log.i(TAG, "WS 已打开，等待 client_connected")
                // 真正的"可用"要等 client_connected，这里不置 connected
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                handleMessage(text)
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                // 带上异常类型与 HTTP 响应码：真机排查时只看到 "连接失败"
                // 完全无法区分是 DNS、拒绝连接、升级被拒还是证书问题。
                Log.w(
                    TAG,
                    "WS 失败 url=$target code=${response?.code} " +
                        "type=${t.javaClass.simpleName} msg=${t.message}",
                )
                connected = false
                post { onEvent(Event.Disconnected(t.message ?: "连接失败")) }
                scheduleReconnect()
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                connected = false
                // 4001 = 服务端因密钥不符拒绝（mobileBridge.ts:684）。
                // 这是永久性失败：密钥不对，重连多少次都一样，只会每 30 秒
                // 无意义地重试一次。转为 AuthFailed 让界面提示去设置里填密钥。
                if (code == 4001) {
                    manualClose = true   // 停止重连
                    post { onEvent(Event.AuthFailed(reason.ifBlank { "认证失败" })) }
                    return
                }
                post { onEvent(Event.Disconnected(reason.ifBlank { "已断开" })) }
                if (!manualClose) scheduleReconnect()
            }
        })
    }

    private fun handleMessage(text: String) {
        when (val m = BridgeProtocol.parse(text)) {
            is BridgeProtocol.Msg.Connected -> {
                connected = true
                retryDelayMs = 1000L
                post { onEvent(Event.Connected(m.interactive)) }
            }
            is BridgeProtocol.Msg.Incoming -> post { onEvent(Event.Incoming(m.role, m.text)) }
            is BridgeProtocol.Msg.Queued -> post { onEvent(Event.Queued(m.requestId)) }
            is BridgeProtocol.Msg.Error -> post { onEvent(Event.Error(m.message)) }
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

    companion object {
        private const val TAG = "BridgeClient"
    }
}
