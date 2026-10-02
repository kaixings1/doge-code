package com.dogecode.mobile

import android.util.Log
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Callable
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * 扫描端口段，发现本机/局域网中正在运行的 doge 移动桥接实例。
 *
 * 对每个端口请求 GET /mobile/session-info（见 src/bridge/mobileBridge.ts），
 * 能拿到 JSON 的即为活会话。并发扫描，单端口超时 300ms。
 *
 * 必须在后台线程调用（内部已用线程池，但整体是阻塞的）。
 */
object SessionScanner {

    private const val TAG = "SessionScanner"
    private const val TIMEOUT_MS = 300

    /** 一个发现的会话。 */
    data class Session(
        val port: Int,
        val sessionId: String,
        val label: String,
        val cwd: String,
        val interactive: Boolean,
        val clients: Int,
    ) {
        /** 拼出可用的连接地址（用探测时的主机）。 */
        fun httpUrl(host: String) = "http://$host:$port"
    }

    /**
     * 扫描 [host] 上的 [startPort]..[endPort]。
     * 返回按端口升序排列的活会话列表；一个都没有则返回空列表。
     */
    fun scan(host: String, startPort: Int = 5680, endPort: Int = 5690): List<Session> {
        val ports = (startPort..endPort).toList()
        val pool = Executors.newFixedThreadPool(minOf(10, ports.size))
        return try {
            val tasks = ports.map { p ->
                Callable { probe(host, p) }
            }
            pool.invokeAll(tasks, 5, TimeUnit.SECONDS)
                .mapNotNull { f -> runCatching { if (f.isCancelled) null else f.get() }.getOrNull() }
                .sortedBy { it.port }
        } catch (e: Exception) {
            Log.w(TAG, "扫描失败：${e.message}")
            emptyList()
        } finally {
            pool.shutdownNow()
        }
    }

    private fun probe(host: String, port: Int): Session? {
        var conn: HttpURLConnection? = null
        return try {
            val url = URL("http://$host:$port/mobile/session-info")
            conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = TIMEOUT_MS
                readTimeout = TIMEOUT_MS
                setRequestProperty("Accept", "application/json")
            }
            if (conn.responseCode != 200) return null
            val body = conn.inputStream.bufferedReader().use { it.readText() }
            parseSessionInfo(body, port)
        } catch (e: Exception) {
            null   // 端口无服务是常态，不记日志避免刷屏
        } finally {
            conn?.disconnect()
        }
    }

    /**
     * 把 /mobile/session-info 的响应体解析为 Session。
     *
     * 纯逻辑（无网络/Android 依赖），独立出来以便单测 —— 这里有两处
     * 判定直接决定「会话列表对不对」：什么算会话、字段缺失时怎么兜底。
     *
     * 返回 null 的情形：非法 JSON、缺少 port 或 sessionId。
     * 缺字段判定是必需的 —— 端口段里可能有其它恰好返回 JSON 的服务，
     * 若不校验就会出现在会话列表里，用户点进去连不上。
     *
     * @param fallbackPort 探测时用的端口，响应里没带 port 时用它兜底
     */
    fun parseSessionInfo(body: String, fallbackPort: Int): Session? {
        val o = runCatching { JSONObject(body) }.getOrNull() ?: return null
        if (!o.has("port") || !o.has("sessionId")) return null
        val sessionId = o.optString("sessionId")
        if (sessionId.isBlank()) return null
        val port = o.optInt("port", fallbackPort)
        return Session(
            port = port,
            sessionId = sessionId,
            label = o.optString("label").ifBlank { "会话 $port" },
            cwd = o.optString("cwd"),
            interactive = o.optBoolean("interactive", true),
            clients = o.optInt("clients", 0),
        )
    }
}
