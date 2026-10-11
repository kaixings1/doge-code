package com.dogecode.mobile

import java.util.concurrent.ConcurrentHashMap

/**
 * 广播会话的本地状态管理（纯逻辑，可单测，不依赖 socket/Android）。
 *
 * ## 为什么从 [BeaconListener] 抽出
 *
 * [BeaconListener] 原本把「收包 → 解析 → 存 seen → 过期剔除 → 回调」全塞在
 * `loop()` 里。那一段逻辑**无法单测**：它夹在真实 MulticastSocket 的 I/O 中，
 * 而真实多播在某些环境（只含虚拟网卡/路由器禁组播）根本收不到包，测试无法
 * 稳定触发。
 *
 * 抽成独立类后，核心逻辑（端口穿过、去重、过期、非法拒绝）可以在**不发真实
 * 网络包**的情况下稳定验证 —— 这正是用户要求的「网络健壮性测试」该覆盖的。
 *
 * ## 职责边界
 * - 本类只管「内存里的会话表」：ingest 一条报文、过期剔除、导出快照。
 * - socket I/O（bind/joinGroup/receive）仍归 [BeaconListener]。
 * - 合并广播与扫描的结果仍归 [BeaconProtocol.merge]（两路互补）。
 */
class BeaconRegistry {

    /** host:port → 会话（最新一次广播的信息）。 */
    private val seen = ConcurrentHashMap<String, SessionScanner.Session>()

    /** host:port → 最后收到广播的时间（毫秒）。 */
    private val lastSeenAt = ConcurrentHashMap<String, Long>()

    /** 当前是否空（无已发现会话）。 */
    fun isEmpty(): Boolean = seen.isEmpty()

    /**
     * 摄入一条原始广播报文。
     *
     * @param raw 报文原文（UTF-8 字符串）
     * @param host 发送方地址（UDP 包来源，客户端要连的地址）
     * @param now 当前时间（注入以便测试）
     * @return 解析成功并摄入的会话；非法报文返回 null（不污染状态）
     */
    fun ingest(
        raw: String,
        host: String,
        now: Long = System.currentTimeMillis(),
    ): SessionScanner.Session? {
        val s = BeaconProtocol.parse(raw, host, now) ?: return null
        val key = "${s.host}:${s.port}"
        seen[key] = s
        lastSeenAt[key] = now
        return s
    }

    /**
     * 剔除过期会话并返回当前仍存活的列表（按 host、port 升序）。
     *
     * 必须在**每次摄入与周期性 tick** 时调用：若某 CLI 退出了（不再广播），
     * 仅靠「收到时更新」会让它永远留在列表里，用户点了连不上。
     *
     * @param now 当前时间（注入以便测试过期逻辑）
     */
    fun pruneAndSnapshot(now: Long = System.currentTimeMillis()): List<SessionScanner.Session> {
        val stale = lastSeenAt.filterValues { BeaconProtocol.isStale(it, now) }.keys
        stale.forEach {
            lastSeenAt.remove(it)
            seen.remove(it)
        }
        return seen.values.sortedWith(compareBy({ it.host }, { it.port }))
    }

    /** 清空（网络切换后旧结果已失效）。 */
    fun clear() {
        seen.clear()
        lastSeenAt.clear()
    }
}
