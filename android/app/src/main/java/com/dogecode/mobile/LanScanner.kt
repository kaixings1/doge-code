package com.dogecode.mobile

import android.util.Log
import java.net.Inet4Address
import java.net.NetworkInterface

/**
 * 局域网自动发现：找出本机所在 WiFi 网段里跑着移动桥接的电脑。
 *
 * 为什么需要它：此前每次连接都必须
 *   ① 插 USB、② 在电脑上跑 adb reverse、③ 手机填 127.0.0.1 ——
 * 少一步就连不上，且失败表现是「连不上」，用户很难意识到是漏了 adb reverse。
 * 局域网模式下手机与电脑本来就在同一网段，探测一遍即可找到，
 * 不需要用户知道 IP。
 *
 * 探测的是 `/mobile/session-info`（非 `/mobile/status`）：前者能一次拿到
 * 标签、端口、工作目录、交互状态，直接可用于列表展示；后者只有一个布尔值，
 * 探到了还得再请求一次。
 */
object LanScanner {

    private const val TAG = "LanScanner"

    /** 单 IP 的探测超时。局域网内 RTT 通常 <5ms，300ms 足够且能容忍弱信号。 */
    private const val PROBE_TIMEOUT_MS = 300

    /** 扫描端口段。与 CLI 侧的多会话约定一致（每个实例一个端口）。
     *  internal 而非 private：便于单测断言「覆盖顺延段 5680..5689」。
     *
     *  ponytail: 此处硬编码 5680 段，**不读 ScanPortPrefs**。上限明确：
     *  若服务端起始端口改到别处（如本机因 Windows 保留区被迫用 6000），
     *  局域网自动发现会漏掉该主机 —— 但用户可用设置页填 URL 直连，
     *  或用「当前主机 + 历史主机」路径（SessionScanner 走 ScanPortPrefs）
     *  补齐。升级路径：把 PORTS 改为从 ScanPortPrefs 读取即可。 */
    internal val PORTS = 5680..5690

    /**
     * 局域网发现每台主机只探的端口数。
     *
     * 为什么不全探 [PORTS]：候选集已扩展为**整个 /24（254 个 IP）**，
     * 若每 IP 探 11 个端口则 2794 个请求，远超 [TOTAL_TIMEOUT_SEC] 预算、
     * 且大量请求会让家用路由丢包。改为每 IP 只探前 [LAN_PORTS_PER_HOST] 个
     * 端口：真实部署里一个电脑通常一个 CLI 实例（默认 5680），覆盖前 2 个
     * 端口已能命中「起始端口被占自动顺延一位」的常见情况。
     *
     * 代价：某主机上版本号更高的第 3+ 个实例（如 5682）在局域网发现里会漏。
     * 那条路径由「当前主机 + 历史主机」（SessionScanner 全端口精确探测）补齐。
     */
    private const val LAN_PORTS_PER_HOST = 2

    /** 并发度上限。太大时低端路由器会丢包，反而漏掉目标。 */
    private const val MAX_THREADS = 48

    /**
     * 整个扫描的 deadline，兜底防止个别 IP 卡满超时。
     *
     * 15 秒：候选含「本机网段 + 2 个内置常用网段」，最多约 762 个 IP ×
     * [LAN_PORTS_PER_HOST] 端口 = 1524 次探测，48 并发下理论耗时约 9.5 秒；
     * 留出余量到 15 秒，避免弱网/高延迟下被提前截断（截断会静默漏报）。
     */
    private const val TOTAL_TIMEOUT_SEC = 15L

    /**
     * 判断一个网卡名是否「可用于局域网发现」。
     *
     * 排除的干扰项及其理由（**单一来源，[LanScanner] 与 [BeaconListener] 共用**）：
     * - `rmnet*` / `ccmni*`：蜂窝数据 —— 不通局域网，且组播不可用；
     * - `p2p*`：WiFi Direct —— 非家用拓扑，网段里没有我们的目标；
     * - `rndis*` / `usb*`：USB 网卡（含 USB 共享网络）—— 与 WiFi 不同网段，
     *   且桥接走的是 WiFi 或 adb reverse，不在其网段内。
     *
     * **为何抽成函数**：此前 [BeaconListener] 与 [LanScanner] 各自手写这段
     * 过滤，且已经漂移（BeaconListener 少排除了 rndis/usb），而其注释却写着
     * 「两处标准一致」—— 注释与实现不符。两处标准不一致会让「广播发现了但
     * 扫描找不到」这类现象极难解释。抽成单一来源，从结构上杜绝漂移。
     *
     * `internal` 而非 `private`：便于单测直接断言各前缀的取舍。
     */
    internal fun isUsableInterface(name: String?): Boolean {
        val n = name?.lowercase() ?: return false
        // 空名同样排除：无名字的网卡无法引用，且不该被当作「可用 WiFi」放行
        if (n.isEmpty()) return false
        if (n.startsWith("rmnet") || n.startsWith("ccmni")) return false
        if (n.startsWith("p2p")) return false
        if (n.startsWith("rndis") || n.startsWith("usb")) return false
        return true
    }

    /**
     * 拿到本机所有可用的 IPv4（含掩码前缀），排除回环与虚拟接口。
     *
     * 返回 "ip/prefix" 形式，交给 [SubnetCandidates] 算网段。
     * 网卡取舍统一由 [isUsableInterface] 决定（与 [BeaconListener] 同一标准）。
     */
    fun localIpv4(): List<String> {
        val out = ArrayList<String>()
        val ifaces = runCatching { NetworkInterface.getNetworkInterfaces() }.getOrNull() ?: return out
        for (nif in ifaces) {
            if (!nif.isUp || nif.isLoopback) continue
            if (!isUsableInterface(nif.name)) continue
            for (addr in nif.interfaceAddresses) {
                val a = addr.address
                if (a !is Inet4Address) continue
                val host = a.hostAddress ?: continue
                val prefix = addr.networkPrefixLength.toInt()
                // networkPrefixLength 在部分机型上给出的是 0 或异常值，
                // 交给 SubnetCandidates 回退到 /24（家用网段的绝大多数）。
                out.add("$host/${if (prefix in 8..30) prefix else 24}")
            }
        }
        return out
    }

    /**
     * 生成候选 IP：本机各网段 + 内置常用网段。
     *
     * 顺序即优先级：
     *   1. 本机所在网段（最可能命中，见 [localIpv4]）；
     *   2. 内置常用网段（[SubnetCandidates.COMMON_SUBNET_PREFIXES]，兜底覆盖
     *      「电脑与手机不同网段」的场景）。
     *
     * 与本身网段重叠的预设地址由 [SubnetCandidates.merge] 去重。
     */
    fun candidates(): List<String> {
        val groups = ArrayList<List<String>>()
        localIpv4().forEach { cidr ->
            groups.add(
                SubnetCandidates.forHost(
                    SubnetCandidates.ipOf(cidr),
                    SubnetCandidates.prefixOf(cidr) ?: 24,
                ),
            )
        }
        groups.add(SubnetCandidates.commonSubnetCandidates())
        val merged = SubnetCandidates.merge(*groups.toTypedArray())
        Log.i(TAG, "候选 IP ${merged.size} 个：${merged.take(8).joinToString()}…")
        return merged
    }

    /**
     * 扫描一组主机上的 doge 移动桥接。
     *
     * 必须在后台线程调用（阻塞 IO）。
     *
     * @param hosts 候选 IP 列表；为空时自动用 [candidates]。
     * @return 发现的会话，按 (host, port) 排序；无结果返回空列表。
     */
    fun scan(hosts: List<String> = emptyList()): List<SessionScanner.Session> {
        val targets = hosts.ifEmpty { candidates() }
        if (targets.isEmpty()) return emptyList()

        val lanPorts = PORTS.take(LAN_PORTS_PER_HOST)
        val tasks = ArrayList<Pair<String, Int>>(targets.size * lanPorts.size)
        for (h in targets) for (p in lanPorts) tasks.add(h to p)

        val pool = java.util.concurrent.Executors.newFixedThreadPool(MAX_THREADS)
        return try {
            val futures = tasks.map { (h, p) ->
                java.util.concurrent.Callable { SessionScanner.probePublic(h, p) }
            }
            pool.invokeAll(futures, TOTAL_TIMEOUT_SEC, java.util.concurrent.TimeUnit.SECONDS)
                .mapNotNull { f ->
                    runCatching { if (f.isCancelled) null else f.get() }.getOrNull()
                }
                .sortedWith(compareBy({ it.host }, { it.port }))
        } catch (e: Exception) {
            Log.w(TAG, "局域网扫描失败：${e.message}")
            emptyList()
        } finally {
            pool.shutdownNow()
        }
    }
}
