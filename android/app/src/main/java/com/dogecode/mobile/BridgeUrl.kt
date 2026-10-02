package com.dogecode.mobile

import java.net.URI
import java.net.URLEncoder

/**
 * 桥接地址的解析与构造。
 *
 * 从 MainActivity 抽出来独立成对象，原因有二：
 * 1. 这些是纯字符串逻辑，与 UI 无关，放在 Activity 里既臃肿又无法单测；
 * 2. 它们是连接成败的第一道关口 —— normalize 少补端口、buildWsUrl 少带
 *    secret，都会导致连不上或 4001 认证失败，而这些错误在 UI 上表现为
 *    「连不上」，很难反查到是 URL 拼错。所以必须可测。
 */
object BridgeUrl {

    const val DEFAULT_PORT = 5680

    /** WebSocket 端点路径，与服务端 mobileBridge.ts 的注册路径一致。 */
    private const val WS_PATH = "/mobile/ws"

    /**
     * 归一化用户输入：
     *   "127.0.0.1"            → "http://127.0.0.1:5680"
     *   "192.168.0.106:5681"   → "http://192.168.0.106:5681"
     *   "http://host:5680"     → 原样
     *   "https://host"         → "https://host:5680"
     * 空输入回落到默认地址。
     */
    fun normalize(raw: String): String {
        var v = raw.trim()
        if (v.isEmpty()) return "http://127.0.0.1:$DEFAULT_PORT"
        if (!v.startsWith("http://") && !v.startsWith("https://")) v = "http://$v"
        val afterScheme = v.removePrefix("http://").removePrefix("https://")
        // 只判断"是否含冒号"不足以确定有端口：IPv6 字面量形如 [::1] 也含冒号。
        // 用 URI 解析更稳；解析失败时退化为原有判断。
        val hasPort = runCatching {
            val u = URI(v)
            u.port > 0 || (u.host == null && afterScheme.contains(":"))
        }.getOrDefault(afterScheme.contains(":"))
        return if (hasPort) v else "$v:$DEFAULT_PORT"
    }

    /**
     * http(s) 地址 → WebSocket 地址。
     *
     * 服务端把 secret 放在 query 里校验（mobileBridge.ts:655），
     * 缺少或不符会被 close(4001)。secret 需 URL 编码 —— 含特殊字符的
     * 密钥若不编码，query 会被截断或解析错。
     */
    fun buildWsUrl(httpUrl: String, secret: String): String {
        val ws = when {
            httpUrl.startsWith("https://") -> "wss://" + httpUrl.removePrefix("https://")
            httpUrl.startsWith("http://") -> "ws://" + httpUrl.removePrefix("http://")
            else -> "ws://$httpUrl"
        }.trimEnd('/')

        val sb = StringBuilder(ws).append(WS_PATH)
            .append("?deviceId=android-app&deviceType=android")
        if (secret.isNotBlank()) {
            sb.append("&secret=").append(URLEncoder.encode(secret, "UTF-8"))
        }
        return sb.toString()
    }

    /** 从（可能未归一化的）地址中取主机名；不可解析时回落 127.0.0.1。 */
    fun hostOf(raw: String): String =
        runCatching { URI(normalize(raw)).host }.getOrNull()?.takeIf { it.isNotBlank() }
            ?: "127.0.0.1"

    /** 从（可能未归一化的）地址中取端口；不可解析时回落默认端口。 */
    fun portOf(raw: String): Int =
        runCatching { URI(normalize(raw)).port }.getOrNull()?.takeIf { it > 0 } ?: DEFAULT_PORT
}
