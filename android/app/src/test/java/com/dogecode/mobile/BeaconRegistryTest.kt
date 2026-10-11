package com.dogecode.mobile

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * BeaconRegistry 测试（纯逻辑，不依赖真实 socket）。
 *
 * 从 BeaconListener 抽出后，端口穿过、去重、过期、非法拒绝都能稳定验证 ——
 * 不再受测试环境多播路由不可控的影响。这是用户要求的「网络健壮性」核心覆盖。
 *
 * ## 变异测试锚点
 * - 去掉 ingest 里的端口校验 → 非法端口用例失败
 * - 去掉 pruneAndSnapshot 的过期剔除 → 过期用例失败
 * - 去掉去重 → 重复摄入用例失败
 */
class BeaconRegistryTest {

    private fun raw(port: Int, host: String = "192.168.1.5", sessionId: String = "mobile-1") =
        JSONObject().apply {
            put("beacon", BeaconProtocol.TAG)
            put("v", BeaconProtocol.VERSION)
            put("port", port)
            put("sessionId", sessionId)
            put("label", "s$port")
        }.toString()

    @Test
    fun `摄入顺延端口 5686 且 host 正确穿过`() {
        // 关键契约：服务端自动顺延时广播 port=5686，手机端收到后必须拿
        // port=5686 去连，而不是监听端口 5600 或失效的 5680
        val r = BeaconRegistry()
        val s = r.ingest(raw(5686), "10.0.0.9")!!
        assertEquals(5686, s.port)
        assertEquals("10.0.0.9", s.host)
        assertEquals("mobile-1", s.sessionId)
    }

    @Test
    fun `多会话（同 host 不同 port）全部保留`() {
        // 同一台电脑上多个 CLI 实例：同 host 不同 port，必须都列出
        val r = BeaconRegistry()
        r.ingest(raw(5680), "192.168.1.5")
        r.ingest(raw(5681), "192.168.1.5")
        r.ingest(raw(5686), "192.168.1.5")
        val snapped = r.pruneAndSnapshot()
        assertEquals(3, snapped.size)
        assertEquals(listOf(5680, 5681, 5686), snapped.map { it.port })
    }

    @Test
    fun `多实例同端口段全覆盖（5680到5689）`() {
        // 服务端顺延 10 个端口全部在扫描/广播范围内；接收端必须不丢任一
        val r = BeaconRegistry()
        (5680..5689).forEach { r.ingest(raw(it, sessionId = "m-$it"), "192.168.1.5") }
        assertEquals(10, r.pruneAndSnapshot().size)
    }

    @Test
    fun `周期性重复广播被去重（同一会话只一条）`() {
        val r = BeaconRegistry()
        repeat(5) { r.ingest(raw(5682, sessionId = "m-5682"), "192.168.1.5") }
        assertEquals(1, r.pruneAndSnapshot().size)
    }

    @Test
    fun `非法端口的报文被拒（不污染状态）`() {
        val r = BeaconRegistry()
        assertNull(r.ingest(
            JSONObject().apply {
                put("beacon", BeaconProtocol.TAG); put("v", BeaconProtocol.VERSION)
                put("port", 70000); put("sessionId", "bad")
            }.toString(), "1.2.3.4",
        ))
        assertTrue("非法端口不应出现在状态", r.isEmpty())
    }

    @Test
    fun `非本协议报文被拒`() {
        val r = BeaconRegistry()
        assertNull(r.ingest("""{"some":"other","port":5680}""", "1.2.3.4"))
        assertTrue(r.isEmpty())
    }

    @Test
    fun `版本不匹配被拒`() {
        val r = BeaconRegistry()
        assertNull(r.ingest(
            JSONObject().apply {
                put("beacon", BeaconProtocol.TAG); put("v", 2)
                put("port", 5680); put("sessionId", "x")
            }.toString(), "1.2.3.4",
        ))
        assertTrue(r.isEmpty())
    }

    @Test
    fun `过期会话被剔除（CLI 退出后消失）`() {
        val r = BeaconRegistry()
        r.ingest(raw(5680), "192.168.1.5", now = 1000)
        // 超过 STALE_MS 无续包 → 应被剔除
        val alive = r.pruneAndSnapshot(now = 1000 + BeaconProtocol.STALE_MS + 1)
        assertTrue("退出后不再出现", alive.none { it.port == 5680 })
    }

    @Test
    fun `持续收到则不误剔（健康会话保留）`() {
        val r = BeaconRegistry()
        r.ingest(raw(5680), "192.168.1.5", now = 1000)
        // 恰好在阈值内刷新 → 保留
        r.ingest(raw(5680), "192.168.1.5", now = 1000 + BeaconProtocol.STALE_MS)
        val alive = r.pruneAndSnapshot(now = 1000 + BeaconProtocol.STALE_MS + 1)
        assertEquals(1, alive.count { it.port == 5680 })
    }

    @Test
    fun `更新会话信息（如 clients 变化）被刷新`() {
        val r = BeaconRegistry()
        r.ingest(raw(5680, sessionId = "m1"), "192.168.1.5")
        val updated = JSONObject().apply {
            put("beacon", BeaconProtocol.TAG); put("v", BeaconProtocol.VERSION)
            put("port", 5680); put("sessionId", "m1"); put("label", "s5680")
            put("clients", 3)
        }.toString()
        r.ingest(updated, "192.168.1.5")
        val snap = r.pruneAndSnapshot()
        assertEquals(3, snap.first { it.port == 5680 }.clients)
    }

    @Test
    fun `快照按 host 与 port 升序`() {
        val r = BeaconRegistry()
        r.ingest(raw(5681), "192.168.1.9")
        r.ingest(raw(5680), "192.168.1.5")
        r.ingest(raw(5680), "192.168.1.9")
        val snap = r.pruneAndSnapshot()
        assertEquals(listOf("192.168.1.5", "192.168.1.9", "192.168.1.9"), snap.map { it.host })
        assertEquals(listOf(5680, 5680, 5681), snap.map { it.port })
    }

    @Test
    fun `clear 清空所有状态`() {
        val r = BeaconRegistry()
        r.ingest(raw(5680), "192.168.1.5")
        r.clear()
        assertTrue(r.isEmpty())
    }
}
