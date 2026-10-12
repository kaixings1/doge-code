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
    /**
     * 归一化用户输入：
     *   "127.0.0.1"                 → "http://127.0.0.1:5680"
     *   "192.168.0.106:5681"        → "http://192.168.0.106:5681"
     *   "http://host:5680"          → 原样
     *   "https://host"              → "https://host:5680"
     *   "wss://x.trycloudflare.com/mobile/ws" → **原样**（隧道模式直接粘贴的地址）
     * 空输入回落到默认地址。
     *
     * ## 必须识别 wss:// / ws:// —— 隧道（TUNNEL）模式的成败点
     *
     * 电脑端 `--tunnel` 回传给手机的是 `wss://<子域>.trycloudflare.com/mobile/ws`。
     * 若不在此识别它，会被当成"裸主机名"补成
     * `http://wss://x.trycloudflare.com/mobile/ws:5680` —— 一个必然连不上的
     * 地址，而手机端只显示"已断开"，用户无从判断是地址格式问题。
     * 故 ws/wss 视为**已是最终协议**，不再补前缀、不再改协议。
     */
    fun normalize(raw: String): String {
        var v = raw.trim()
        if (v.isEmpty()) return "http://127.0.0.1:$DEFAULT_PORT"

        // ── 自愈历史脏数据 ──
        // 老版本会把 wss:// 误加前缀，存成 "http://wss://host/path" 之类。
        // 这类值还留在 SharedPreferences 里（host_history / last_url）。若不
        // 剥掉错误前缀，它既不是 wss://（不被下面早退）、也不像正常 host，
        // 会被当裸主机继续补 :5680 —— 每次重连再补一遍，最终堆出
        // "...:5680:5680:5680..."。这里先还原成正确的 wss:// 地址。
        val stripped = v
            .removePrefix("http://")   // "http://wss://x" → "wss://x"
            .removePrefix("https://")
        if (stripped.startsWith("wss://") || stripped.startsWith("ws://")) {
            v = stripped
        }

        // ws:// 与 wss:// 是终态地址：原样返回（不补前缀、不补端口、不追加）。
        if (v.startsWith("wss://") || v.startsWith("ws://")) return v

        // ── 隧道域名的误输入自愈 ──
        // 隧道（cloudflared 快隧道）只经 443 暴露 https/wss，**不存在** 6000/6003/
        // 5680 等本地端口。用户常把隧道地址错写成 `http://<子域>.trycloudflare.com:6003`
        // （误加了本地端口），或粘成 `http://<子域>.trycloudflare.com`。
        // 这类值若原样送进 buildWsUrl → `ws://…:6003/mobile/ws` → 连不上（隧道不开该端口）。
        // 真机实测踩过：prefs 里存着 `http://deposit-hills-regards-fees.trycloudflare.com:6003`。
        // 识别出 trycloudflare 域名后，**只把"带端口"的误输入**还原成隧道终态
        // `wss://<域名>/mobile/ws`（丢掉那个必然连不上的端口）。
        //   - `http(s)://<域>:6003` / `<域>:6003` → 端口无意义（隧道只走 443）→ 自愈
        // **裸域名 `<域>` 与已规范的 `https://<域>[/mobile/ws]` 一律不改**：
        //   它们本来就对（buildWsUrl 会把 https 转 wss），改了反而破坏
        //   "https 不被补端口"的既有语义（有测试守着）。
        if (v.contains(".trycloudflare.com")) {
            val u = runCatching {
                URI(if (v.startsWith("http://") || v.startsWith("https://")) v else "http://$v")
            }.getOrNull()
            val host = u?.host
            val hasPort = (u?.port ?: -1) > 0
            if (!host.isNullOrBlank() && hasPort) return "wss://$host$WS_PATH"
        }

        // https:// 是**公网隧道域名的常见写法**（用户可能粘 https://… 而非
        // wss://…）。对这类地址**绝不补 :5680** —— HTTPS 走 443，补 5680 会
        // 连到隧道的 5680 端口（不存在）→ 超时。真机实测踩过：
        // 存成了 "https://xxx.trycloudflare.com:5680"，手机一直连不上。
        if (v.startsWith("https://")) return v

        if (!v.startsWith("http://")) v = "http://$v"
        val afterScheme = v.removePrefix("http://")
        // 只判断"是否含冒号"不足以确定有端口：IPv6 字面量形如 [::1] 也含冒号。
        // 用 URI 解析更稳；解析失败时退化为原有判断。
        val hasPort = runCatching {
            val u = URI(v)
            u.port > 0 || (u.host == null && afterScheme.contains(":"))
        }.getOrDefault(afterScheme.contains(":"))
        return if (hasPort) v else "$v:$DEFAULT_PORT"
    }

    /**
     * 地址 → WebSocket 地址。
     *
     * 已是 `ws://` / `wss://` 的输入**原样透传**（隧道模式用户直接粘贴的
     * 隧道地址，无需再转换）；http(s) 按 TLS 语义升级（https→wss, http→ws）。
     * 服务端把 secret 放在 query 里校验（mobileBridge.ts:655），缺少或不符
     * 会被 close(4001)。secret 需 URL 编码 —— 含特殊字符的密钥若不编码，
     * query 会被截断或解析错。
     */
    fun buildWsUrl(httpUrl: String, secret: String): String {
        val ws = when {
            // 已是 ws/wss：直接用（保留其域名与可能的路径前缀）。
            httpUrl.startsWith("wss://") || httpUrl.startsWith("ws://") -> httpUrl
            httpUrl.startsWith("https://") -> "wss://" + httpUrl.removePrefix("https://")
            httpUrl.startsWith("http://") -> "ws://" + httpUrl.removePrefix("http://")
            else -> "ws://$httpUrl"
        }.trimEnd('/')

        // 用户可能直接粘贴带 /mobile/ws 的完整隧道地址：此时不再重复追加路径，
        // 否则会得到 .../mobile/ws/mobile/ws，服务端 404 → 连不上。
        val base = if (ws.endsWith(WS_PATH)) ws else ws + WS_PATH

        val sb = StringBuilder(base)
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
