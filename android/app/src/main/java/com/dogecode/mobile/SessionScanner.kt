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

    /**
     * 单端口直连的超时。比扫描用的 300ms 宽：扫描是「扫 11 个端口、绝大多数
     * 无服务」，超时必须短；这里是「连自己已知在跑的那个端口」，需要给足
     * 建连与响应时间，否则会把标签探测搞成偶发失败。
     */
    private const val FETCH_TIMEOUT_MS = 2000

    /** 一个发现的会话。 */
    data class Session(
        val port: Int,
        val sessionId: String,
        val label: String,
        val cwd: String,
        val interactive: Boolean,
        val clients: Int,
        /** 所在主机。scan 时填入被扫描的 host —— 分组展示需要它。 */
        val host: String = "",
        /**
         * **真实**的 doge 会话 ID，供 `--resume` 用。
         *
         * 注意与 [sessionId] 的区别：那个是移动桥接自造的
         * `mobile-<时间戳>`，拿它 --resume 必然失败。
         * 服务端取不到时为 null。
         */
        val resumeSessionId: String? = null,
        /**
         * 服务端上报的最后活跃时间（毫秒）。
         *
         * 0 表示服务端没给（老版本）—— 排序时会把 0 排在最后，
         * 而不是当成「1970 年最久远」之外的特殊值处理，省一层判断。
         */
        val lastActivity: Long = 0L,
        /**
         * 该会话的公网隧道地址（`wss://<子域>.trycloudflare.com/mobile/ws`）。
         *
         * 仅由 **UDP 广播**携带（服务端起了 `--tunnel` 时才有）——
         * 端口扫描拿不到它。手机据此自动记住隧道地址，出门切流量可用。
         * 无隧道 / 老版本 / 扫描发现时为 null。
         */
        val tunnelUrl: String? = null,
        /**
         * 来源模式（LAN/CLOUD/TUNNEL 的 AppMode.name）。
         *
         * 空串 = 端口扫描/广播发现的 LAN 会话（真实网络探测所得）。
         * 非空 = 来自 [KnownSessionStore] 的已知会话（连接成功时服务端下发
         * 并落库）—— 这类会话在 TUNNEL/户外场景下是唯一能列出的，
         * 因为扫描与广播都够不到。列表据此给条目打模式标签，让用户
         * 一眼看出「这条是本机隧道、那条是局域网」。
         */
        val mode: String = "",
    ) {
        /** 拼出可用的连接地址。 */
        fun httpUrl(host: String = this.host) = "http://$host:$port"

        /** 是否是本机会话（USB 反向转发或直接本机访问）。 */
        fun isLocal(): Boolean =
            host == "127.0.0.1" || host == "localhost" || host == "::1" || host == "[::1]"
    }

    /**
     * 扫描 [host] 上的 [startPort]..[endPort]。
     * 返回按端口升序排列的活会话列表；一个都没有则返回空列表。
     *
     * 默认范围来自 [PortScanRange]：与服务端的「起始端口起试 10 个」
     * **成对**，保证服务端自动顺延后的端口仍在扫描范围内。
     * 范围会经 normalize 校正（起止写反、越界、跨度过大都能兜住）。
     */
    fun scan(
        host: String,
        startPort: Int = PortScanRange.DEFAULT_START,
        endPort: Int = PortScanRange.DEFAULT_END,
    ): List<Session> {
        val ports = PortScanRange.portsOf(startPort, endPort)
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

    /**
     * 按完整 URL 拉取 /mobile/session-info 原始响应体。
     *
     * 与 host/port 重载分工：
     * - host/port 重载：LAN 局域网直连 `http://host:port`，由本函数拼出 URL 后转调；
     * - 此重载直接吃 URL：给 TUNNEL 模式用 —— 隧道地址是 `wss://域名/mobile/ws`，
     *   不能用 `http://域名:443` 直连（隧道只暴露 wss + 同源 https，与 wss 同转发到
     *   本地 server）。TUNNEL 下调用方传 `https://域名/mobile/session-info`，
     *   经 cloudflared 命中本地 server 的同名 HTTP 端点（mobileBridge.ts:641，不校验 secret）。
     *
     * 失败一律返回 null（未启用移动桥接的端口是常态，不该刷日志）。
     * 必须在后台线程调用。
     */
    fun fetchSessionInfo(url: String): String? {
        var conn: HttpURLConnection? = null
        return try {
            conn = (URL(url).openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = FETCH_TIMEOUT_MS
                readTimeout = FETCH_TIMEOUT_MS
                setRequestProperty("Accept", "application/json")
            }
            if (conn.responseCode != 200) return null
            conn.inputStream.bufferedReader().use { it.readText() }
        } catch (e: Exception) {
            null
        } finally {
            conn?.disconnect()
        }
    }

    /** 局域网直连重载：拼出 `http://host:port/mobile/session-info` 后转调 URL 版。 */
    fun fetchSessionInfo(host: String, port: Int): String? =
        fetchSessionInfo("http://$host:$port/mobile/session-info")

    /**
     * 探测单个 (host, port) 是否为 doge 移动桥接。
     *
     * internal 而非 private：LanScanner 的局域网发现要复用同一套探测与解析
     * （超时、字段、吞异常），复制一份必然漂移 —— 服务端加字段时只改一处，
     * 另一处静默变旧，表现为「扫描能列出会话但字段是空的」。
     */
    internal fun probePublic(
        host: String,
        port: Int,
        timeoutMs: Int = TIMEOUT_MS,
    ): Session? = probe(host, port, timeoutMs)

    private fun probe(host: String, port: Int, timeoutMs: Int = TIMEOUT_MS): Session? {
        var conn: HttpURLConnection? = null
        return try {
            val url = URL("http://$host:$port/mobile/session-info")
            conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = timeoutMs
                readTimeout = timeoutMs
                setRequestProperty("Accept", "application/json")
            }
            if (conn.responseCode != 200) return null
            val body = conn.inputStream.bufferedReader().use { it.readText() }
            parseSessionInfo(body, port, host)
        } catch (e: Exception) {
            null   // 端口无服务是常态，不记日志避免刷屏
        } finally {
            conn?.disconnect()
        }
    }

    /** 服务端当前生效的配置快照。 */
    data class MobileConfigSnapshot(
        val model: String?,
        val thinkingTokens: Int?,
        val permissionMode: String?,
        /**
         * 详细模式当前值。
         *
         * 可空 Boolean：缺字段（老服务端）时为 null，界面**不显示**该开关，
         * 而不是显示成「关闭」—— 后者会让用户以为服务端支持但当前是关的。
         */
        val verbose: Boolean? = null,
        /**
         * 每项值的来源（见服务端 mobileBridge.currentMobileConfig）。
         *
         * 用途：用户「改不成」时给出解释 —— 最常见的是环境变量覆盖。
         * 缺字段时为 null，界面不显示来源行（老服务端不支持）。
         */
        val sources: Map<String, String> = emptyMap(),
    )

    /**
     * 从 /mobile/session-info 响应中解析当前配置。
     *
     * 缺字段返回 null 而非编造默认值 —— 客户端据此显示「—」，
     * 比显示一个假的默认值诚实（后者会让用户以为真的改成那样了）。
     */
    fun configFrom(body: String?): MobileConfigSnapshot? {
        if (body.isNullOrBlank()) return null
        val o = runCatching { JSONObject(body) }.getOrNull() ?: return null
        val c = o.optJSONObject("config") ?: return null
        val src = c.optJSONObject("sources")
        return MobileConfigSnapshot(
            model = c.optString("model").takeIf { it.isNotBlank() },
            thinkingTokens = if (c.has("thinkingTokens")) c.optInt("thinkingTokens") else null,
            permissionMode = c.optString("permissionMode").takeIf { it.isNotBlank() },
            // 必须判 has 而非 optBoolean：后者对缺字段返回 false，
            // 会让「老服务端不支持」与「服务端说当前是关」混为一谈
            verbose = if (c.has("verbose")) c.optBoolean("verbose") else null,
            sources = if (src == null) {
                emptyMap()
            } else {
                src.keys().asSequence().associateWith { k -> src.optString(k) }
            },
        )
    }

    /**
     * 从 /mobile/session-info 响应中取出会话标签。
     *
     * 与 [parseSessionInfo] 分开的原因：连接成功后只需要标签（用于通知标题），
     * 而 parseSessionInfo 要求 port/sessionId 齐全。若复用后者，服务端未来
     * 精简响应体时标签会静默失效，通知标题退回「doge-code」，多会话下无法区分。
     *
     * 返回值语义：拿到非空字符串 label 返回它；缺字段/类型不对/空串/非法 JSON
     * 返回 null，由调用方决定回落策略（不要在此处编造占位标签，否则调用方无法
     * 区分「服务端说标签叫这个」与「服务端没说标签」）。
     *
     * 类型判定必须显式做：`JSONObject.optString` 对 JSON 对象/数组会返回其
     * toString（`{}`、`[]`）而非空串 —— 若不挡住，服务端字段类型意外变化时
     * 通知标题会变成「doge-code · {}」这种无意义文本。
     */
    fun labelFrom(body: String?): String? {
        if (body.isNullOrBlank()) return null
        val o = runCatching { JSONObject(body) }.getOrNull() ?: return null
        if (!o.has("label")) return null
        val raw = o.opt("label")
        if (raw !is String) return null
        return raw.trim().ifBlank { null }
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
    fun parseSessionInfo(body: String, fallbackPort: Int, host: String = ""): Session? {
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
            host = host,
            // 服务端返回的是毫秒时间戳；缺字段时 0（见 Session.lastActivity 的说明）
            lastActivity = o.optLong("lastActivity", 0L),
            // 老服务端不带此字段 → null → 客户端不显示恢复命令（而非显示错的）
            resumeSessionId = o.optString("resumeSessionId").takeIf { it.isNotBlank() },
        )
    }
}
