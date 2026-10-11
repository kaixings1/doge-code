package com.dogecode.mobile

import android.util.Log
import java.net.DatagramPacket
import java.net.InetAddress
import java.net.MulticastSocket
import java.net.NetworkInterface
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * UDP 多播监听器：被动接收电脑上各 CLI 会话的广播。
 *
 * ## 与 [LanScanner] 的分工（**两条路都要走**）
 *
 * | | 广播监听 | 主动扫描 |
 * |---|---|---|
 * | 速度 | 毫秒级（被动） | 3-8 秒（扫全网段） |
 * | 实时 | 新会话立刻感知 | 需重扫 |
 * | 耗电 | 极低 | 高（并发几千连接） |
 * | 可靠性 | **常被路由器拦**（AP 隔离/组播过滤） | 更可靠 |
 *
 * 广播快但可能不通，扫描慢但更可靠 —— 故**两者并存**，
 * 由 [BeaconProtocol.merge] 合并去重。**不要因为做了广播就删掉扫描**。
 *
 * ## 生命周期
 *
 * [start] / [stop] 由页面控制（可见时监听、离开时停）：
 * 长期持有 MulticastSocket 会占住网卡与电源，且网络切换后
 * 旧 socket 已失效，需要重建。
 */
class BeaconListener(
    /** 收到/更新会话列表时回调（在监听线程调用，调用方负责切主线程）。 */
    private val onSessions: (List<SessionScanner.Session>) -> Unit,
) {

    private val running = AtomicBoolean(false)
    private var socket: MulticastSocket? = null
    private val worker = Executors.newSingleThreadExecutor { r ->
        Thread(r, "beacon-listener").apply { isDaemon = true }
    }

    /** 会话状态（摄入/过期/去重），独立可测（见 [BeaconRegistry]）。 */
    private val registry = BeaconRegistry()

    fun start() {
        if (!running.compareAndSet(false, true)) return
        worker.execute { loop() }
    }

    fun stop() {
        running.set(false)
        runCatching { socket?.close() }
        socket = null
    }

    /** 清空已发现的会话（如网络切换后旧结果已无效）。 */
    fun clear() {
        registry.clear()
    }

    private fun loop() {
        val s = try {
            // 绑定到 BEACON_PORT 以接收发往该端口的多播
            MulticastSocket(BEACON_PORT).apply {
                // 允许端口复用：多个 App 实例/页面重建时不至于 bind 失败
                reuseAddress = true
                // 1 跳：只在同一子网内传播，与服务端的 TTL 设置对应
                timeToLive = 1
            }
        } catch (e: Exception) {
            Log.w(TAG, "创建多播 socket 失败：${e.message}")
            running.set(false)
            return
        }
        socket = s

        // 在所有可用网卡上加入组播组。
        // 为什么遍历所有网卡：手机可能同时有 WiFi 与蜂窝（或 VPN），
        // 只在默认网卡上加入时，组播可能走错接口而收不到广播。
        // 网卡取舍统一由 [LanScanner.isUsableInterface] 决定 —— 与
        // LanScanner.localIpv4 同一标准（此前两处各写一份且已漂移，见该函数注释）。
        var joined = 0
        try {
            val group = InetAddress.getByName(BEACON_GROUP)
            val ifaces = NetworkInterface.getNetworkInterfaces()
            while (ifaces.hasMoreElements()) {
                val nif = ifaces.nextElement()
                if (!nif.isUp || nif.isLoopback) continue
                if (!LanScanner.isUsableInterface(nif.name)) continue
                runCatching {
                    s.joinGroup(java.net.InetSocketAddress(group, BEACON_PORT), nif)
                    joined++
                }.onFailure {
                    Log.w(TAG, "网卡 ${nif.name} 加入组播组失败：${it.message}")
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "加入组播组失败：${e.message}")
        }

        if (joined == 0) {
            // 一个网卡都没加入成功 —— 广播路走不通，由扫描兜底。
            // 记日志（便于诊断），但不当作错误：这是常见情况
            //（无 WiFi、或系统限制组播）
            Log.i(TAG, "未能在任何网卡上加入组播组，广播发现不可用（将依赖端口扫描）")
        } else {
            Log.i(TAG, "已在 $joined 个网卡上监听广播")
        }

        val buf = ByteArray(MAX_PACKET)
        while (running.get() && !s.isClosed) {
            try {
                val packet = DatagramPacket(buf, buf.size)
                // 设超时以便周期性检查 running 与清理过期会话
                s.soTimeout = POLL_TIMEOUT_MS
                s.receive(packet)

                val host = packet.address?.hostAddress ?: continue
                val raw = String(packet.data, 0, packet.length, Charsets.UTF_8)
                // 摄入（解析 + 存状态）交给 BeaconRegistry；非法报文被它拒掉
                registry.ingest(raw, host) ?: continue
                emitAlive()
            } catch (e: java.net.SocketTimeoutException) {
                // 超时是正常的：用于周期性清理过期会话
                emitAlive()
            } catch (e: Exception) {
                if (running.get()) Log.w(TAG, "接收广播异常：${e.message}")
            }
        }

        runCatching { s.close() }
    }

    /**
     * 发出「当前仍在线」的会话列表。
     *
     * 每次收到广播或超时时调用 —— 后者保证**过期的会话会被剔除**：
     * 若某 CLI 退出了（不再广播），仅靠「收到时更新」会让它
     * 永远留在列表里，用户点了连不上。过期与去重逻辑在 [BeaconRegistry]。
     */
    private fun emitAlive() {
        onSessions(registry.pruneAndSnapshot())
    }

    companion object {
        private const val TAG = "BeaconListener"

        /**
         * 组播地址与端口（**必须与服务端 mobileBeacon.ts 一致**）。
         *
         * 端口用 5600 而非 5681：5681 位于桥接端口顺延区间
         *（5680-5689）内，实测会被第二个 CLI 实例占用，造成
         * 「这个号到底是广播还是桥接」的排查困扰。
         */
        const val BEACON_GROUP = "239.255.42.99"
        const val BEACON_PORT = 5600

        /** UDP 包上限。广播报文很小，1KB 足够且防异常大包。 */
        private const val MAX_PACKET = 1024

        /** 接收超时：周期性检查退出标志 + 清理过期会话。 */
        private const val POLL_TIMEOUT_MS = 2000
    }
}
