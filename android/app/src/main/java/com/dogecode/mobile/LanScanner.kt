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

    /**
     * 单 IP 单端口的探测超时。局域网内 RTT 通常 <5ms，250ms 足够且能容忍弱信号。
     *
     * 比单端口直连探测（300ms）略短：这条路径要跑上千次探测，
     * 单次超时直接决定总耗时能否落在 [TOTAL_TIMEOUT_MS] 内。
     */
    private const val PROBE_TIMEOUT_MS = 250

    /**
     * 默认扫描端口段（起点即 [PortScanRange.DEFAULT_START]，与服务端默认一致）。
     *
     * 与 CLI 侧的多会话约定一致（每个实例一个端口）。
     * internal 而非 private：便于单测断言覆盖顺延段。
     *
     * 注：实际扫描范围由 [scan] 的 `ports` 参数决定，调用方应传入
     * `ScanPortPrefs.range()` 展开后的列表（用户可能把起始端口配成 6000）。
     * 这里的默认值只作为未传参时的兜底，**不要**在调用点依赖它。
     */
    internal val PORTS = PortScanRange.DEFAULT_START..(PortScanRange.DEFAULT_END + 1)

    /**
     * 每台主机**第一轮**探几个端口。
     *
     * 为什么不是全探 [PORTS]：候选集是整个 /24（254 个 IP），若每 IP 探 10 个
     * 端口就是 2540 个请求，家用路由在短时间大量连接下会丢包 —— 丢包又会误判
     * 成「不通」，反而降低发现率（这是实测过的）。
     *
     * 取 3 而非 2：第一轮同时承担「筛掉非目标主机」的职责（见 [REJECT_THRESHOLD]），
     * 端口数必须够到否决阈值，否则死主机永远否不掉。
     */
    internal const val FIRST_ROUND_PORTS = 3

    /**
     * 第一轮落空几路就把该 IP 判成「非 doge 主机」并放弃其剩余端口。
     *
     * **必须 ≤ [FIRST_ROUND_PORTS]**：若阈值大于第一轮端口数，本轮无论结果如何
     * 都达不到阈值 → 死主机全数存活 → 第二轮被迫对每个 IP 探满，退化成旧行为。
     *
     * 为何不全探完再放弃（即阈值 = 全部端口数）：那样每台无关主机都要吃满
     * 10 次请求，正是家庭路由器丢包的主因。
     */
    internal const val REJECT_THRESHOLD = 3

    /**
     * 「某 IP 第一轮有命中」时的第二轮端口预算。
     *
     * 两轮合计覆盖 [FIRST_ROUND_PORTS] + 8 ≥ 默认段宽度（10），即存活主机能
     * 拿到**完整**端口段覆盖；而非目标主机只吃 3 次请求就被否掉。
     */
    internal const val SECOND_ROUND_PORTS = 8

    /** 并发度上限。太大时低端路由器会丢包，反而漏掉目标。 */
    private const val MAX_THREADS = 64

    /**
     * 整个扫描的 deadline，兜底防止个别 IP 卡满超时。
     *
     * 20 秒：最坏情况要跑「首轮 254 IP × 2 端口 + 次轮 254 × 8」= 2540 次
     * 探测，64 并发约 10 秒；再留一倍余量给弱网，避免被提前截断 ——
     * 截断的表现是**静默漏报**，用户看到「找不到会话」，与服务端没起无从区分。
     */
    private const val TOTAL_TIMEOUT_MS = 20_000L

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
     * 扫描一组主机上的 doge 移动桥接（**三层递进**：端口 → IP → 网段）。
     *
     * ## 为什么是三层
     *
     * 用户报的真实痛点：「一个 IP 连不上就换下一个 IP，最后整段都扫不到」。
     * 根因是搜索只按「IP」一维推进 —— 一个 IP 上的 2 个端口不通，就把整台
     * 电脑（可能跑在 6002、6008 上）判成没有，然后去探下一个 IP。真实部署里
     * 多开窗口会顺延端口，顺延到 6002 以后就必然漏。
     *
     * 三层顺序：
     *   1. **端口层**：同一 IP 上先探 [FIRST_ROUND_PORTS] 个主端口；
     *      落空达 [REJECT_THRESHOLD] 路 → 判非目标主机，放弃其剩余端口；
     *      有命中 → 补探该 IP 剩余端口（最多 [SECOND_ROUND_PORTS] 个）。
     *   2. **IP 层**：本网段内所有 IP 的第一轮跑完，才汇总进入第二轮。
     *   3. **网段层**：本网段两轮都跑完 → 才换下一个网段
     *      （[SubnetCandidates.groupBySubnet] 分组）。
     *
     * 为什么「先跑完本网段第一轮，再跑第二轮」而不是「每 IP 一次跑完 10 个」：
     * 绝大多数 IP 上根本没有服务，它们应在探 3 个端口后就被否掉。若每 IP 都
     * 探满 10 个，254 个 IP 就是 2540 次请求，家用路由在短时间大量连接下会
     * 丢包 —— 丢包又会误判成「不通」，反而降低发现率。
     *
     * ## deadline
     *
     * [TOTAL_TIMEOUT_MS] 覆盖**整个**三层流程（不是每层）—— 层级越靠后越可能
     * 被截断，而截断的表现是静默漏报，故宁可先把前两层做快做准。
     *
     * @param hosts 候选 IP 列表；为空时自动用 [candidates]。
     * @param ports 每台主机要探的端口（**第一轮取前 [FIRST_ROUND_PORTS] 个**）。
     *              调用方应从 `ScanPortPrefs.range()` 展开后传入 —— 否则用户
     *              把起始端口配成 6000 时，局域网发现会静默漏掉该主机。
     *              默认用 [PORTS] 仅作兜底。
     * @param onProgress 每进入一层回调一次（在主调线程之外，供 UI 显示
     *                   「正在搜 192.168.1.0/24 · 第 2 轮」）。
     * @return 发现的会话，按 (host, port) 排序；无结果返回空列表。
     */
    fun scan(
        hosts: List<String> = emptyList(),
        ports: List<Int> = PORTS.toList(),
        onProgress: ((String, Int) -> Unit)? = null,
    ): List<SessionScanner.Session> {
        val targets = hosts.ifEmpty { candidates() }
        if (targets.isEmpty()) return emptyList()

        val (firstRound, secondRound) = splitPorts(ports)
        if (firstRound.isEmpty()) return emptyList()

        val subnets = SubnetCandidates.groupBySubnet(targets)
        Log.i(TAG, "候选 ${targets.size} 个 IP，分 ${subnets.size} 个网段")

        val deadline = System.currentTimeMillis() + TOTAL_TIMEOUT_MS
        val found = LinkedHashMap<Pair<String, Int>, SessionScanner.Session>()
        val pool = java.util.concurrent.Executors.newFixedThreadPool(MAX_THREADS)

        try {
            for (group in subnets) {
                if (expired(deadline)) break

                // ── 第一轮：本网段全部 IP × 主端口 ──
                onProgress?.invoke(group.prefix, 1)
                val round1 = runRound(pool, group.ips, firstRound, deadline)
                found.putAll(round1.found)

                // ── 第二轮：只对第一轮「部分命中」的 IP 补探剩余端口 ──
                //   判据是「命中数 ≥ 1 且未否掉」，而非「全通」——
                //   主机上第 1 个实例在 6000 上、后续顺延到 6002 时，
                //   第一轮只命中 6000，仍需补探才能发现 6002 那个。
                if (secondRound.isNotEmpty() && round1.aliveHosts.isNotEmpty()) {
                    if (expired(deadline)) break
                    onProgress?.invoke(group.prefix, 2)
                    found.putAll(runRound(pool, round1.aliveHosts, secondRound, deadline).found)
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "局域网扫描失败：${e.message}")
        } finally {
            pool.shutdownNow()
        }

        return found.values.sortedWith(compareBy({ it.host }, { it.port }))
    }

    /** deadline 是否已过。 */
    private fun expired(deadline: Long): Boolean =
        System.currentTimeMillis() >= deadline

    /**
     * 把端口表切成「第一轮 / 第二轮」两段（纯逻辑，可单测）。
     *
     * 第一轮取前 [FIRST_ROUND_PORTS] 个；其余留给第二轮（最多
     * [SECOND_ROUND_PORTS] 个）。
     *
     * **第一轮端口数必须 ≥ [REJECT_THRESHOLD]** 否则该 IP 在第一轮无论结果
     * 如何都达不到否决线 —— 死主机会全数存活，第二轮被迫对每个 IP 探满，
     * 退化成「全量扫描」（正是要避免的）。取 `min` 保证这条不变量成立，
     * 测试见 `LanScannerLayeringTest`。
     */
    internal fun splitPorts(ports: List<Int>): Pair<List<Int>, List<Int>> {
        val first = ports.take(maxOf(FIRST_ROUND_PORTS, minOf(REJECT_THRESHOLD, ports.size)))
        val second = (ports - first.toSet()).take(SECOND_ROUND_PORTS)
        return first to second
    }

    /** 一轮并发探测的结果。 */
    private data class RoundResult(
        /** 命中的会话，key = (host, port)。 */
        val found: Map<Pair<String, Int>, SessionScanner.Session>,
        /**
         * 本轮**未被否掉**的主机（失败数 < [REJECT_THRESHOLD]）。
         * 下一轮只对它们补探剩余端口。
         */
        val aliveHosts: List<String>,
    )

    /**
     * 跑一轮：(ip × port) 全组合并发探测。
     *
     * 「否掉某 IP」的判据：**该 IP 本轮失败数 ≥ [REJECT_THRESHOLD]**。
     * 用失败数而非「全不通」—— 端口数少于阈值时（如用户只配了 1 个端口）
     * 「全不通」会让每个 IP 都被否掉，第二轮永远为空，等于退回旧行为。
     */
    private fun runRound(
        pool: java.util.concurrent.ExecutorService,
        ips: List<String>,
        ports: List<Int>,
        deadline: Long,
    ): RoundResult {
        val tasks = ArrayList<Pair<String, Int>>(ips.size * ports.size)
        for (h in ips) for (p in ports) tasks.add(h to p)

        val remainingMs = (deadline - System.currentTimeMillis()).coerceAtLeast(1L)
        val futures = pool.invokeAll(
            tasks.map { (h, p) ->
                java.util.concurrent.Callable {
                    h to SessionScanner.probePublic(h, p, PROBE_TIMEOUT_MS)
                }
            },
            remainingMs,
            java.util.concurrent.TimeUnit.MILLISECONDS,
        )

        val found = LinkedHashMap<Pair<String, Int>, SessionScanner.Session>()
        val fails = HashMap<String, Int>()
        for (f in futures) {
            val pair = runCatching { if (f.isCancelled) null else f.get() }.getOrNull() ?: continue
            val (host, session) = pair
            if (session != null) {
                found[host to session.port] = session
            } else {
                fails[host] = (fails[host] ?: 0) + 1
            }
        }

        val alive = ips.filter { (fails[it] ?: 0) < REJECT_THRESHOLD }
        return RoundResult(found, alive)
    }
}
