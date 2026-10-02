package com.dogecode.mobile

import org.json.JSONObject

/**
 * 移动桥接协议的解析（纯逻辑，无 Android/网络依赖）。
 *
 * 从 BridgeClient 抽出，因为这是最该被测的一环：协议字段名写错、
 * 分支漏写，都会表现为「消息莫名不见了」或「一直没回复」，
 * 而这类问题在真机上极难定位（要抓包才能看出来）。
 *
 * 协议定义见 src/bridge/mobileBridge.ts。
 */
object BridgeProtocol {

    /** 解析结果。Unparsed 表示不是合法 JSON 或不认识的消息。 */
    sealed interface Msg {
        data class Connected(val interactive: Boolean) : Msg
        data class Incoming(val role: String, val text: String) : Msg
        data class Queued(val requestId: String) : Msg
        data class Error(val message: String) : Msg
        /** 合法 JSON 但类型未知/无需处理（如 client_disconnected）。 */
        object Ignored : Msg
        /** 非法 JSON 或缺关键字段。 */
        object Unparsed : Msg
    }

    /**
     * 把一条 WS 文本消息解析为 Msg。
     * 任何异常都返回 Unparsed —— 收到坏数据不应让客户端崩溃。
     */
    fun parse(text: String): Msg {
        val o = runCatching { JSONObject(text) }.getOrNull() ?: return Msg.Unparsed
        return when (o.optString("type")) {
            "client_connected" -> Msg.Connected(
                // 缺 interactive 字段时按 true 处理：服务端旧版本没有该字段，
                // 误报「非交互」比漏报更扰人。
                o.optJSONObject("data")?.optBoolean("interactive", true) ?: true,
            )

            "assistant", "message" -> {
                val d = o.optJSONObject("data") ?: return Msg.Unparsed
                // 服务端不同路径下文本字段名不一致，按优先级依次尝试
                val t = d.optString("text")
                    .ifBlank { d.optString("message") }
                    .ifBlank { d.optString("content") }
                if (t.isBlank()) Msg.Unparsed else Msg.Incoming("assistant", t)
            }

            "system" -> {
                val t = o.optJSONObject("data")?.optString("message").orEmpty()
                if (t.isBlank()) Msg.Unparsed else Msg.Incoming("system", t)
            }

            "result" -> {
                val d = o.optJSONObject("data")
                if (d == null) return Msg.Unparsed
                if (d.optString("status") == "queued") {
                    Msg.Queued(o.optString("requestId"))
                } else {
                    // 非 queued 的 result 可能带 message（如错误说明）
                    val m = d.optString("message").orEmpty()
                    if (m.isBlank()) Msg.Ignored else Msg.Incoming("assistant", m)
                }
            }

            "error" -> {
                val e = o.optJSONObject("data")?.optString("error").orEmpty()
                Msg.Error(e.ifBlank { "未知错误" })
            }

            else -> Msg.Ignored
        }
    }
}
