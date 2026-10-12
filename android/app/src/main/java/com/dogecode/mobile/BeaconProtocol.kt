package com.dogecode.mobile

import org.json.JSONObject

/**
 * 服务端 UDP 广播的报文解析（纯逻辑，可单测）。
 *
 * ## 为什么必须抽成独立类
 *
 * 这是**跨端契约**：服务端 `mobileBeacon.ts` 发、客户端收。字段名或
 * 类型不一致会表现为「手机完全发现不了会话」——而 UDP 无连接、无回执，
 * **没有任何报错**，只能靠抓包才发现。故逐字段钉死。
 *
 * ## 与 [SessionScanner] 的关系
 *
 * 两者产出同一个概念（一个可连接的会话）。字段名刻意与服务端 HTTP
 * 接口 `/mobile/session-info` 保持一致，这样两路发现的结果可以
 * 直接合并去重（见 [merge]）。
 */
object BeaconProtocol {

    /** 协议标识（与服务端 BEACON_GROUP 处的 `beacon` 字段一致）。 */
    const val TAG = "doge-mobile"

    /** 支持的协议版本（与服务端 BEACON_VERSION 一致）。 */
    const val VERSION = 1

    /**
     * 广播新鲜度阈值。
     *
     * 服务端每 3 秒发一次；超过该阈值未收到，视为该会话已离线。
     * 取 10 秒 = 容忍连丢 3 个包 —— 家庭 WiFi 偶发丢包很常见，
     * 判太紧会让列表里的会话频繁闪进闪出。
     */
    const val STALE_MS = 10_000L

    /**
     * 解析一条广播报文。
     *
     * @param host 发送方地址（UDP 报文的来源 IP）。广播报文里没有主机名，
     *   只能从数据包来源取 —— 这正好是客户端要连的地址。
     * @return 解析成功返回 [SessionScanner.Session]；非本协议/字段非法则 null
     */
    fun parse(raw: String, host: String, now: Long = System.currentTimeMillis()): SessionScanner.Session? {
        val o = runCatching { JSONObject(raw) }.getOrNull() ?: return null

        // 三个必查项，缺一不可：
        // 1. 协议标识 —— 同一组播地址可能有别的程序在用
        // 2. 版本 —— 新旧字段语义可能不同，猜错比不认更糟
        // 3. 端口 —— 非法端口会让用户连到错的地方（比不连更糟）
        if (o.optString("beacon") != TAG) return null
        if (o.optInt("v", -1) != VERSION) return null
        // 端口必须**是 JSON 数字**，且是合法范围。
        //
        // 必须先判类型再取值：`org.json` 的 `optInt` 会把**数字字符串**
        // 也解析成整数（`optInt("port")` 对 `"5680"` 返回 5680）。
        // 若只判范围，`{"port":"5680"}` 会被当成合法 —— 而服务端发的是
        // 数字，出现字符串说明**对端实现有误或报文被篡改**，
        // 此时应拒绝而非宽容接受（宽容会让协议悄悄漂移）。
        if (o.opt("port") !is Number) return null
        val port = o.optInt("port", 0)
        if (port <= 0 || port > 65535) return null

        // 可选字段回落安全默认值；类型异常时用 optString 的默认值
        // （optString 对 JSON 对象/数组会返回 toString，故先判类型）
        return SessionScanner.Session(
            port = port,
            // 桥接自造的会话 id（与 --resume 用的 resumeSessionId 不同）
            sessionId = str(o, "sessionId"),
            host = host,
            label = str(o, "label").ifBlank { host },
            cwd = str(o, "cwd"),
            interactive = o.opt("interactive") == true,
            clients = if (o.opt("clients") is Number) o.optInt("clients") else 0,
            resumeSessionId = str(o, "resumeSessionId").takeIf { it.isNotBlank() },
            lastActivity = now,
            // 隧道地址只在服务端起了 --tunnel 时才有；无则 null（不影响其它字段）。
            tunnelUrl = str(o, "tunnelUrl").takeIf { it.isNotBlank() },
        )
    }

    /** 安全取字符串：非字符串类型返回空串（而非 toString 的怪输出）。 */
    private fun str(o: JSONObject, key: String): String {
        val v = o.opt(key)
        return if (v is String) v else ""
    }

    /** 广播是否已过期（该会话应视为离线）。 */
    fun isStale(lastSeen: Long, now: Long = System.currentTimeMillis()): Boolean =
        now - lastSeen > STALE_MS

    /**
     * 合并「广播发现」与「扫描发现」的会话，按 (host, port) 去重。
     *
     * ## 为什么以广播为准
     *
     * 同一个会话可能被两路同时发现。冲突时取**广播**的信息：
     * 它是服务端主动推送的**实时值**（客户端数、标签可能在变），
     * 而扫描拿到的是探测那一刻的快照。
     *
     * 但**扫描结果里独有的会话要保留** —— 广播被路由器拦掉时
     * （AP 隔离、组播过滤），扫描是唯一发现途径。两者互补，
     * 不能因为做了广播就丢掉扫描。
     *
     * @param beacon 广播发现的（较新，优先）
     * @param scanned 扫描发现的
     * @return 合并后的列表：先广播的（按端口升序），再扫描独有的
     */
    fun merge(
        beacon: List<SessionScanner.Session>,
        scanned: List<SessionScanner.Session>,
    ): List<SessionScanner.Session> {
        // **两个列表各自先去重**：广播是周期性重复的，同一个会话会被
        // 反复加入；扫描的并发探测也可能对同一 (host,port) 返回多次。
        // 只对「扫描独有」做过滤是不够的 —— 那会让输入列表内部的重复
        // 原样透传出去，列表里出现同一个会话的多条条目。
        // （这条正是被单测抓出来的：原实现只 filterNot，没 distinct。）
        val dedupedBeacon = beacon.distinctBy { it.host to it.port }
        val seen = dedupedBeacon.map { it.host to it.port }.toSet()
        val onlyScanned = scanned
            .distinctBy { it.host to it.port }
            .filterNot { (it.host to it.port) in seen }
        // 广播的排在前面：用户更可能选刚被推送的活跃会话
        return (dedupedBeacon + onlyScanned).sortedWith(
            compareBy({ it.host }, { it.port }),
        )
    }
}
