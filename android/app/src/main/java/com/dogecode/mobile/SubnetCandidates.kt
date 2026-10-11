package com.dogecode.mobile

/**
 * 由「本机 IP + 子网前缀长度」推出该网段内值得探测的候选 IP。
 *
 * 为什么抽成独立对象：这是纯位运算，零 Android 依赖，可单测。
 * 放在 LanScanner 里会与 WiFi/网络接口 API 混在一起，无法验证 ——
 * 而这里的边界（/24 之外的掩码、跨网段的两个前缀）最容易算错，
 * 恰恰是最需要被测的部分。
 *
 * 设计取舍：**不做 254 个地址的全网段扫描**。
 * 理由：手机侧并发 254 个 HTTP 请求会明显耗电、且多数家用路由在
 * 短时间大量连接下会丢包，反而降低发现率。改为只探测「最可能的那几个」：
 *   1. 网关（`x.x.x.1`）—— 绝大多数家用/办公网关，而 CLI 常跑在
 *      同机或同机部署的机器上；
 *   2. 网关附近少量地址（`.2`~`.20`）—— 电脑的 DHCP 租约常落在低位；
 *   3. 本网段常见的 DHCP 高位段不取样，因为路由器分配顺序因厂商而异，
 *      取一半地址等于自己骗自己。
 *
 * 拿不到发现结果时，用户仍可扫描保存在历史里的具体地址（那条路径是精确的）。
 */
object SubnetCandidates {

    /**
     * 单个网段最多产出多少个候选。
     *
     * 设为 254：**覆盖整个 /24 网段**。此前只取低位 `.1`~`.24`，真机实测电脑
     * 的 DHCP 租约落在 `.228`，导致局域网扫描永远扫不到 —— 而「扫描为空」
     * 与「服务端没启动」在用户看来完全一样，极难自查。
     *
     * 抽样（如步长 8）看似省电，但 DHCP 分配顺序因厂商而异，任何固定抽样都
     * 可能恰好跳过真实地址（`.228` 就被步长 8 跳过），不可靠。改为全段覆盖后，
     * 耗时靠「LAN 路径每 IP 只探主端口」控制（见 LanScanner.scan），不靠砍地址数。
     */
    const val MAX_PER_SUBNET = 254

    /**
     * 内置「常用网段」前缀（`/24` 的网段前缀，如 `"192.168.1"`）。
     *
     * 用途：手机与电脑**不在同一网段**时（如电脑接 `192.168.1.x` 路由器、
     * 手机连 `192.168.110.x` 路由器），只扫本机网段发现不了电脑。把这两个
     * 最常见的家用网段作为**兜底**一并扫描，覆盖绝大多数真实部署。
     *
     * 顺序即优先级：本机所在网段排最前（见 [LanScanner.candidates]），
     * 其后是这些预设网段。与本身网段重叠的会被 [merge] 去重。
     *
     * **耗时**：多扫 2 个 /24 = 508 个候选。按 `LanScanner` 每 IP 2 端口、
     * 48 并发算约 +6.4s，故总额需把 deadline 放宽（见 `TOTAL_TIMEOUT_SEC`）。
     */
    val COMMON_SUBNET_PREFIXES = listOf("192.168.0", "192.168.1", "192.168.110")

    /**
     * 生成所有内置常用网段的候选（每段整段 /24）。
     *
     * @return 预设网段的候选 IP 列表（各段依次展开，段内顺序同 [forHost]）
     */
    fun commonSubnetCandidates(): List<String> {
        val out = ArrayList<String>(COMMON_SUBNET_PREFIXES.size * MAX_PER_SUBNET)
        for (prefix in COMMON_SUBNET_PREFIXES) {
            out.addAll(forHost("$prefix.1", 24))
        }
        return merge(out)
    }

    /**
     * 把形如 "192.168.0.106" 解析成 4 字节；非法输入返回 null。
     *
     * 只接受 IPv4 十进制点分。刻意不支持 IPv6：
     * 局域网发现走的是家用 WiFi，IPv4 是唯一实际场景，
     * 支持 IPv6 只会引入一个无法测试的分支。
     */
    fun parseIpv4(ip: String): IntArray? {
        val parts = ip.trim().split(".")
        if (parts.size != 4) return null
        val bytes = IntArray(4)
        for (i in 0..3) {
            // 显式拒绝空串与超范围：Integer.parseInt("") 抛异常、
            // "256" 会被接受 —— 两者都是脏输入，必须一致地拒绝。
            val p = parts[i]
            if (p.isEmpty() || p.length > 3) return null
            val v = p.toIntOrNull() ?: return null
            if (v < 0 || v > 255) return null
            bytes[i] = v
        }
        return bytes
    }

    /** 组回点分字符串。 */
    fun formatIpv4(bytes: IntArray): String =
        "${bytes[0]}.${bytes[1]}.${bytes[2]}.${bytes[3]}"

    /**
     * 由本机 IP 与掩码推候选：**覆盖整个网段的全部可用主机地址**。
     *
     * 顺序即优先级 —— 网关（`.1`）排第一（命中率最高，CLI 常与之同机的部署）。
     * 除网关外的地址按序号升序。
     *
     * 为什么是全段而非抽样：DHCP 租约位置不可预测（实测电脑拿到 `.228`），
     * 任何固定步长的抽样都可能恰好跳过真实地址。全段覆盖才能可靠发现。
     * 耗时靠调用方控制（LAN 路径每 IP 只探主端口），不靠砍地址数。
     *
     * @param ip      本机 IPv4，如 "192.168.0.106"
     * @param prefix  掩码前缀长度，如 24。非法（不在 8..30）时退回 24。
     * @return 候选 IP 列表；无法解析或网段过大时返回空列表。
     */
    fun forHost(ip: String, prefix: Int = 24): List<String> {
        val bytes = parseIpv4(ip) ?: return emptyList()
        val bits = if (prefix in 8..30) prefix else 24

        // 掩码：高 bits 位为 1
        val mask = if (bits == 0) 0 else (-1 shl (32 - bits))
        val ipInt = toInt(bytes)
        val network = ipInt and mask
        val hostBits = 32 - bits

        // 主机位太少（/30 只有 2 个地址）时「网段探索」没有意义：
        // 那是点对点链路，不该出现在这里的场景中。
        if (hostBits < 3) return emptyList()

        // 可用主机数（不含网络地址与广播地址），受 MAX_PER_SUBNET 截断。
        val hostMax = (1 shl hostBits) - 2
        val count = minOf(hostMax, MAX_PER_SUBNET)
        val out = ArrayList<String>(count)
        for (i in 1..count) {
            out.add(formatIpv4(fromInt(network or i)))
        }
        return out
    }

    /**
     * 一个网段的候选组（`/24` 前缀 + 该段内要探的 IP）。
     *
     * 为什么要把打平的 IP 列表按网段分组：**「换网段」是扫描的第三层循环**。
     * 打平后扫描器只看到 700 多个无差别 IP，无法表达「本网段全部探完仍无结果
     * → 才换下一个网段」，也无法给用户反馈「正在搜哪个网段」。
     */
    data class SubnetGroup(
        /** 网段前缀（前三段，如 `"192.168.1"`）。 */
        val prefix: String,
        /** 该段内的候选 IP，保持传入顺序（即优先级）。 */
        val ips: List<String>,
    )

    /**
     * 把打平的候选 IP 按 `/24` 分组。**组间顺序 = 各组首个成员出现的顺序**。
     *
     * 用前三段而非真实掩码分组：候选本来就是按 /24 展开的（见 [forHost]），
     * 且展示「正在搜 192.168.1.0/24」时用户认的是前三段。窄掩码（/27）的
     * 候选同样落在同一个前三段里，分组结果不受影响。
     *
     * 非法 IP 直接丢弃（不生成组）—— 脏输入不该让整个扫描计划失败。
     */
    fun groupBySubnet(ips: List<String>): List<SubnetGroup> {
        val order = ArrayList<String>()
        val buckets = LinkedHashMap<String, ArrayList<String>>()
        for (ip in ips) {
            val b = parseIpv4(ip) ?: continue
            val key = "${b[0]}.${b[1]}.${b[2]}"
            val bucket = buckets[key]
            if (bucket == null) {
                buckets[key] = ArrayList<String>().apply { add(ip) }
                order.add(key)
            } else {
                bucket.add(ip)
            }
        }
        return order.map { k -> SubnetGroup(k, buckets[k]!!) }
    }

    /**
     * 合并多组候选，按出现顺序去重。
     *
     * 顺序即优先级：调用方按「自机 → 历史地址 → 网段探索」的顺序传入，
     * 结果保持该顺序，UI 与并发探测都能据此优先处理高概率目标。
     */
    fun merge(vararg groups: List<String>): List<String> {
        val seen = HashSet<String>()
        val out = ArrayList<String>()
        for (g in groups) {
            for (ip in g) {
                val t = ip.trim()
                if (t.isEmpty() || !seen.add(t)) continue
                out.add(t)
            }
        }
        return out
    }

    /** 从 "192.168.0.106/24" 形式中取掩码；无斜杠返回 null。 */
    fun prefixOf(cidr: String): Int? {
        val idx = cidr.indexOf('/')
        if (idx < 0) return null
        return cidr.substring(idx + 1).toIntOrNull()?.takeIf { it in 0..32 }
    }

    /** 从 "192.168.0.106/24" 形式中取 IP；无斜杠则整串即 IP。 */
    fun ipOf(cidr: String): String {
        val idx = cidr.indexOf('/')
        return if (idx < 0) cidr else cidr.substring(0, idx)
    }

    private fun toInt(b: IntArray): Int =
        (b[0] shl 24) or (b[1] shl 16) or (b[2] shl 8) or b[3]

    private fun fromInt(v: Int): IntArray = intArrayOf(
        (v ushr 24) and 0xFF,
        (v ushr 16) and 0xFF,
        (v ushr 8) and 0xFF,
        v and 0xFF,
    )
}
