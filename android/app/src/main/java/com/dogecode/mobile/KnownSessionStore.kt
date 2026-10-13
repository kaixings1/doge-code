package com.dogecode.mobile

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

/**
 * 已知会话的记录（多会话管理的持久化底座）。
 *
 * ## 为什么需要它（而不是只靠扫描）
 *
 * 会话页原先只靠「扫端口段 + UDP 广播」发现 LAN 会话。这在两种情况下
 * **完全失效**：
 * - TUNNEL：会话在公网隧道后面，扫网段扫不到、广播也只在同 WiFi 有效；
 * - 手机换了网段/户外用流量：连广播都收不到。
 *
 * 而服务端在连接成功时已经把「本会话的可用地址（lan/tunnel）+ 标识
 * （label/cwd/resumeSessionId）」下发了（sessionEndpoints）。把这些**落库**，
 * 会话页就能脱离扫描、直接列出历史连过的所有会话 —— 覆盖三模式。
 *
 * ## 存储形态
 *
 * 单个 SharedPreferences 存一个 JSON 数组，每条是一个会话记录。
 * 不用多文件：记录条数有限（用户手头的会话数），单文件读写更简单、
 * 原子性更好（不会出现「列到一半某个文件没了」）。
 *
 * ## 三模式的来源
 *
 * - LAN：连接成功下发（lan 地址）；也兼容扫描到的结果（调用方转成记录后 upsert）
 * - TUNNEL：手动填入的隧道地址，或连接成功下发（tunnel 地址）
 * - CLOUD：本地配置的多套 Provider/目录（调用方构造记录后 upsert）
 *
 * 记录用 (mode, primaryAddress) 作**唯一键**去重：同一地址重复连接只刷新
 * lastSeen，不产生重复条目。
 */
class KnownSessionStore(context: Context) {

    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /**
     * 一条已知会话。
     *
     * @param mode 所属模式（LAN/CLOUD/TUNNEL）的 name，存字符串以稳定（枚举顺序变不影响）
     * @param label 展示名（服务端 label，或用户自定义）
     * @param cwd 工作目录（多会话区分的关键信息）
     * @param port 服务端端口（TUNNEL 下可能无意义，为 0）
     * @param resumeSessionId 真实 doge 会话 id，供 --resume；无则 null
     * @param addresses 可用地址列表（lan 的 http://... 与 tunnel 的 wss://...）
     * @param lastSeen 最后见到的时间（毫秒）—— 列表按它降序，最近在前
     */
    data class KnownSession(
        val mode: String,
        val label: String,
        val cwd: String,
        val port: Int,
        val resumeSessionId: String?,
        val addresses: List<String>,
        val lastSeen: Long,
    ) {
        /** 唯一键：模式 + 首个可用地址（地址是会话在网络上的真实身份）。 */
        fun key(): String = "$mode|${addresses.firstOrNull().orEmpty()}"

        /** 首选连接地址（列表项点击时用它）。 */
        fun primaryAddress(): String? = addresses.firstOrNull()

        /**
         * 映射为会话列表可渲染的 [SessionScanner.Session]。
         *
         * host/port 从首选地址解析（BridgeUrl 解析对 http/wss 都适用）；
         * 地址无法解析时返回 null（跳过该条，不让列表出现点不动的僵尸项）。
         * mode 原样带上，供列表打模式标签；tunnelUrl 单独给 TUNNEL 地址，
         * 与既有「广播带 tunnelUrl」的语义一致。
         */
        fun toSessionOrNull(): SessionScanner.Session? {
            val addr = primaryAddress() ?: return null
            val host = BridgeUrl.hostOf(addr)
            if (host.isBlank()) return null
            return SessionScanner.Session(
                port = port,
                sessionId = "",
                label = label,
                cwd = cwd,
                interactive = true,
                clients = 0,
                host = host,
                resumeSessionId = resumeSessionId,
                lastActivity = lastSeen,
                tunnelUrl = addresses.firstOrNull { it.startsWith("wss://") || it.startsWith("ws://") },
                mode = mode,
            )
        }
    }

    /**
     * 列出全部已知会话，按 lastSeen **降序**（最近连过的在前）。
     *
     * 解析失败一律跳过（不抛异常）—— 一条坏记录不该让整个列表打不开。
     */
    fun list(): List<KnownSession> {
        val raw = prefs.getString(KEY_SESSIONS, null) ?: return emptyList()
        return runCatching {
            val arr = JSONArray(raw)
            (0 until arr.length()).mapNotNull { i -> parseOne(arr.optJSONObject(i)) }
                .sortedByDescending { it.lastSeen }
        }.getOrElse {
            Log.w(TAG, "已知会话解析失败（返回空列表）：${it.message}")
            emptyList()
        }
    }

    /**
     * 插入或更新一条会话记录。
     *
     * 去重规则：同 (mode, 首地址) 视为同一会话 —— 只刷新其余字段与 lastSeen，
     * 不新增条目。这样反复重连同一地址不会把列表撑爆。
     *
     * @return 更新后的完整列表（调用方可直接拿去渲染，省一次 list() 读盘）
     */
    fun upsert(session: KnownSession): List<KnownSession> {
        val merged = merge(list(), session)
        write(merged)
        return merged
    }

    /** 删除一条（按唯一键）。 */
    fun remove(key: String): List<KnownSession> {
        val kept = list().filterNot { it.key() == key }
        write(kept)
        return kept
    }

    /** 清空全部。 */
    fun clear() {
        prefs.edit().remove(KEY_SESSIONS).apply()
    }

    private fun write(sessions: List<KnownSession>) {
        val arr = JSONArray()
        sessions.forEach { arr.put(toJson(it)) }
        prefs.edit().putString(KEY_SESSIONS, arr.toString()).apply()
    }

    /** 从服务端下发的连接信息构造记录（LAN/TUNNEL 连接成功路径用）。 */
    fun fromConnected(
        mode: AppMode,
        lan: List<String>,
        tunnel: String?,
        label: String,
        cwd: String,
        port: Int,
        resumeSessionId: String?,
        now: Long = System.currentTimeMillis(),
    ): KnownSession {
        // TUNNEL 优先用隧道地址（户外可用）；LAN 优先用 lan 地址。
        // 两处都**滤掉字符串 "null"**（上游 JSONObject.optString 在字段为
        // JSON null 时会返回 "null"，见 BridgeProtocol.optStringOrNull）——
        // 否则会写下 `addresses:["null"]` 这种点不动的僵尸条目（实测踩过）。
        val clean = { xs: List<String> -> xs.filter { it.isNotBlank() && it != "null" } }
        val addresses = when (mode) {
            AppMode.TUNNEL -> clean(listOfNotNull(tunnel)).ifEmpty { clean(lan) }
            else -> clean(lan)
        }
        return KnownSession(
            mode = mode.name,
            label = label.ifBlank { cwd.substringAfterLast('/').substringAfterLast('\\').ifBlank { "未命名" } },
            cwd = cwd,
            port = port,
            resumeSessionId = resumeSessionId,
            addresses = addresses,
            lastSeen = now,
        )
    }

    private fun parseOne(o: JSONObject?): KnownSession? = parseOnePure(o)

    private fun toJson(s: KnownSession): JSONObject = toJsonPure(s)

    companion object {
        private const val TAG = "KnownSessionStore"
        private const val PREFS = "doge_known_sessions"
        private const val KEY_SESSIONS = "sessions"

        /** 最多保留的记录数（超出按 lastSeen 淘汰最旧的）。 */
        const val MAX_ENTRIES = 50

        /**
         * 合并一条新记录进列表（纯函数，可 JVM 单测）。
         *
         * 规则：同 key（模式 + 首地址）替换原条目；否则追加。
         * 最后按 lastSeen 降序截断到 [MAX_ENTRIES] —— 防无限增长，
         * 且老记录被淘汰而非新记录被丢（用户要的是「最近能连的」）。
         */
        fun merge(current: List<KnownSession>, session: KnownSession): List<KnownSession> {
            val out = current.toMutableList()
            val idx = out.indexOfFirst { it.key() == session.key() }
            if (idx >= 0) out[idx] = session else out.add(session)
            return out.sortedByDescending { it.lastSeen }.take(MAX_ENTRIES)
        }

        /** 反序列化单条；无效（缺 mode / 无地址）返回 null（跳过而非崩）。 */
        fun parseOnePure(o: JSONObject?): KnownSession? {
            o ?: return null
            val mode = o.optString("mode").takeIf { it.isNotBlank() } ?: return null
            val addrArr = o.optJSONArray("addresses") ?: JSONArray()
            val addresses = (0 until addrArr.length())
                // 滤掉字符串 "null"：`JSONObject.optString` 对 JSON null 返回 "null"
                // 而非空串，历史脏数据里存过 `addresses:["null"]`，会让会话列表
                // 出现点不动的僵尸条目（实测见 doge_known_sessions.xml）。
                // 在此清洗，旧记录也会自愈。
                .mapNotNull { addrArr.optString(it).takeIf { s -> s.isNotBlank() && s != "null" } }
            if (addresses.isEmpty()) return null
            return KnownSession(
                mode = mode,
                label = o.optString("label").takeIf { it != "null" }.orEmpty(),
                cwd = o.optString("cwd").takeIf { it != "null" }.orEmpty(),
                port = o.optInt("port", 0),
                resumeSessionId = o.optString("resumeSessionId").takeIf { it.isNotBlank() && it != "null" },
                addresses = addresses,
                lastSeen = o.optLong("lastSeen", 0L),
            )
        }

        /** 序列化单条。 */
        fun toJsonPure(s: KnownSession): JSONObject = JSONObject().apply {
            put("mode", s.mode)
            put("label", s.label)
            put("cwd", s.cwd)
            put("port", s.port)
            put("resumeSessionId", s.resumeSessionId ?: JSONObject.NULL)
            put("addresses", JSONArray(s.addresses))
            put("lastSeen", s.lastSeen)
        }
    }
}
