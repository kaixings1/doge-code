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

    /** 并发度上限。太大时低端路由器会丢包，反而漏掉目标。 */
    private const val MAX_THREADS = 64

    /**
     * 整个扫描的 deadline，兜底防止个别 IP 卡满超时。
     *
     * 100 秒（原 20 秒）：真机实测本机 3 个网卡共 **762 个候选 IP**，
     * 20 秒内扫不完 → deadline 截断靠后的 IP（含本机所在网段）→ **静默漏报**，
     * 用户看到「找不到会话」，与服务端没起无从区分。
     *
     * 100 秒给足余量：即便候选 762 个、每 IP 首轮 2-3 端口，64 并发下
     * 也能扫完。用户侧有进度提示 + 「停止」按钮（见 SessionFragment），
     * 等不了可随时中断，故延长时间不会再造成「卡死」体感。
     * 配合主机号范围收窄（默认 100-130，见 [candidates]）实际耗时远小于此。
     */
    private const val TOTAL_TIMEOUT_MS = 100_000L

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
    /**
     * 生成候选 IP：本机各网段 + 内置常用网段。
     *
     * ## 顺序即优先级（真机实测驱动）
     *
     * 1. **[preferredSubnet] 所在的网段**排最前 —— 它是手机实际连着的那个
     *    网段（调用方传入，如默认路由网段 `192.168.0`）。真机实测：本机有
     *    3 个网卡（含 VMware `192.168.26.x`、Tailscale `100.99.x`），
     *    762 个候选在 20s 内扫不完，导致排在后面的**本机网段**反被截断漏扫。
     *    把真正能连的网段提到最前，是「扫得完」的关键。
     * 2. 其余本机网段（[localIpv4]）；
     * 3. 内置常用网段（兜底「电脑与手机不同网段」）。
     *
     * ## 主机号范围（[hostFrom]..[hostTo]）
     *
     * 只生成该范围内的主机地址（默认 1..254 全段）。真机实测电脑 DHCP 租约
     * 多落在 100~130 段，收窄到这段可把候选从 254 降到 31 → 扫描时间降到
     * 约 1/8。范围由用户偏好配置（见 ScanPortPrefs 同级的 IP 段偏好）。
     *
     * @param preferredSubnet 优先网段前缀（如 "192.168.0"）；空则跳过该步
     * @param hostFrom 主机号下界（含），默认 1
     * @param hostTo   主机号上界（含），默认 254
     */
    fun candidates(
        preferredSubnet: String = "",
        hostFrom: Int = 1,
        hostTo: Int = SubnetCandidates.MAX_PER_SUBNET,
    ): List<String> {
        val groups = ArrayList<List<String>>()
        val localCidrs = localIpv4()

        // 优先网段排在第一位（若它确实是本机网段之一，避免凭空扫别人的网段）
        if (preferredSubnet.isNotBlank()) {
            localCidrs.firstOrNull { SubnetCandidates.ipOf(it).startsWith("$preferredSubnet.") }
                ?.let { cidr ->
                    groups.add(
                        SubnetCandidates.forHost(
                            SubnetCandidates.ipOf(cidr),
                            SubnetCandidates.prefixOf(cidr) ?: 24,
                            hostFrom, hostTo,
                        ),
                    )
                }
        }

        localCidrs.forEach { cidr ->
            groups.add(
                SubnetCandidates.forHost(
                    SubnetCandidates.ipOf(cidr),
                    SubnetCandidates.prefixOf(cidr) ?: 24,
                    hostFrom, hostTo,
                ),
            )
        }
        // 常用网段也传同一范围（否则它的 254×2 会把总候选数顶回去，收窄无效）
        groups.add(SubnetCandidates.commonSubnetCandidates(hostFrom, hostTo))
        // merge 去重且**保序**（首个出现的优先），故上面的优先级安排得以保留
        val merged = SubnetCandidates.merge(*groups.toTypedArray())
        Log.i(TAG, "候选 IP ${merged.size} 个（优先网段=$preferredSubnet，主机号 $hostFrom-$hostTo）：${merged.take(8).joinToString()}…")
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
     *      有命中 → 补探该 IP 的**全部剩余端口**（覆盖整段，不截断）。
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
        /**
         * 取消检查：返回 true 则**在下一个网段边界提前结束**。
         *
         * 为什么需要：扫描 deadline 提到 100s 后，用户可能等不了那么久
         * （尤其是已经看到了想要的会话）。UI 的「停止」按钮据此让扫描
         * 尽快返回——已扫到的结果仍会被返回（不是丢弃），用户可立即使用。
         *
         * 粒度是「网段边界」而非「每个 IP」：检查太频繁会拖慢扫描，
         * 而跨网段本身就是要按秒计的时间，这个粒度对用户感知足够。
         */
        shouldStop: (() -> Boolean)? = null,
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
                // 用户取消：立即停（保留已扫到的结果）
                if (shouldStop?.invoke() == true) {
                    Log.i(TAG, "扫描被用户取消，返回已发现的 ${found.size} 个会话")
                    break
                }
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
                    if (shouldStop?.invoke() == true) break
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
     * 第一轮取前 [FIRST_ROUND_PORTS] 个；其余**全部**留给第二轮
     *（第二轮只对第一轮有命中的 IP 执行，故不设上限——否则段宽大于
     * 3+上限 时尾部端口会被漏掉，真机实测的 6011 漏扫即此类）。
     *
     * **第一轮端口数必须 ≥ [REJECT_THRESHOLD]** 否则该 IP 在第一轮无论结果
     * 如何都达不到否决线 —— 死主机会全数存活，第二轮被迫对每个 IP 探满，
     * 退化成「全量扫描」（正是要避免的）。取 `min` 保证这条不变量成立，
     * 测试见 `LanScannerLayeringTest`。
     */
    internal fun splitPorts(ports: List<Int>): Pair<List<Int>, List<Int>> {
        val first = ports.take(maxOf(FIRST_ROUND_PORTS, minOf(REJECT_THRESHOLD, ports.size)))
        // 第二轮取**全部剩余端口**（不再受固定预算截断）。
        //
        // 真机实测缺陷：原先 `.take(SECOND_ROUND_PORTS)`（=8），配合第一轮 3，
        // 合计只覆盖前 11 个端口；而默认段 6000-6020 有 21 个 → 第 12 个
        // （6011）起永远扫不到。用户看到「服务起来了，手机找不到」。
        //
        // 代价可控：第二轮**只对第一轮有命中的 IP** 执行（绝大多数无关 IP
        // 在第一轮就被否掉，不吃这段预算），真实目标主机只有个位数。
        // 用 rest 而非 rest.take(SECOND_ROUND_PORTS)：段宽由用户配置（可 >21），
        // 固定预算会随段宽增长再次漏尾部 —— 这正是要根治的模式。
        val rest = ports - first.toSet()
        val second = rest.toList()
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
