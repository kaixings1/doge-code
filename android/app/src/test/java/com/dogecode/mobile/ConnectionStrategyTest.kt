package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * ConnectionStrategy 测试 —— 覆盖用户最痛的「拔 USB 卡死在 127.0.0.1」。
 *
 * 变异锚点：
 * - 去掉 confirmedDead 阈值 → 「单次失败就切」用例应失败（过度切换）
 * - 去掉回环判断 → 「正常局域网地址不应乱切」用例应失败
 */
class ConnectionStrategyTest {

    private fun lan(host: String, port: Int = 5680) = SessionScanner.Session(
        port = port, sessionId = "m-$host", label = host, cwd = "",
        interactive = true, clients = 0, host = host,
    )

    private fun loopback(port: Int = 5680) = SessionScanner.Session(
        port = port, sessionId = "m-lb", label = "lb", cwd = "",
        interactive = true, clients = 0, host = "127.0.0.1",
    )

    @Test
    fun `拔USB：回环地址多次失败且发现局域网会话应建议切换`() {
        // 用户痛点核心：savedHost=127.0.0.1，拔线后连不上，但发现了 192.168.1.5
        val d = ConnectionStrategy.decide(
            savedHost = "127.0.0.1", savedPort = 5680,
            discovered = listOf(lan("192.168.1.5")), failedAttempts = 3,
        )
        assertTrue(d is ConnectionStrategy.Decision.SwitchTo)
        assertEquals("192.168.1.5", (d as ConnectionStrategy.Decision.SwitchTo).session.host)
    }

    @Test
    fun `回环地址单次失败不切换（避免抖动误切）`() {
        // 阈值保护：一次失败就切会打断正常重连
        val d = ConnectionStrategy.decide(
            savedHost = "127.0.0.1", savedPort = 5680,
            discovered = listOf(lan("192.168.1.5")), failedAttempts = 1,
        )
        assertTrue("单次失败应继续重试当前地址", d is ConnectionStrategy.Decision.RetrySaved)
    }

    @Test
    fun `正常局域网地址不应因失败而乱切`() {
        // 当前已是局域网地址，失败可能是临时抖动，继续重试而非切到别的
        val d = ConnectionStrategy.decide(
            savedHost = "192.168.1.5", savedPort = 5680,
            discovered = listOf(lan("192.168.1.9")), failedAttempts = 5,
        )
        assertTrue(d is ConnectionStrategy.Decision.RetrySaved)
    }

    @Test
    fun `发现多个局域网会话时让用户选（不猜）`() {
        val d = ConnectionStrategy.decide(
            savedHost = "127.0.0.1", savedPort = 5680,
            discovered = listOf(lan("192.168.1.5"), lan("192.168.1.9")), failedAttempts = 3,
        )
        assertTrue(d is ConnectionStrategy.Decision.ChooseFrom)
        assertEquals(2, (d as ConnectionStrategy.Decision.ChooseFrom).sessions.size)
    }

    @Test
    fun `回环失效但无局域网会话可发现时只能重试（等USB重连）`() {
        // 没发现任何会话，无路可走，继续重试回环（等用户重插 USB 或重跑 adb reverse）
        val d = ConnectionStrategy.decide(
            savedHost = "127.0.0.1", savedPort = 5680,
            discovered = emptyList(), failedAttempts = 5,
        )
        assertTrue(d is ConnectionStrategy.Decision.RetrySaved)
    }

    @Test
    fun `回环失效但只发现另一个回环会话时不切（无意义）`() {
        // 发现的也是回环（如其它来源的 127.0.0.1），切过去一样连不上
        val d = ConnectionStrategy.decide(
            savedHost = "127.0.0.1", savedPort = 5680,
            discovered = listOf(loopback(5681)), failedAttempts = 3,
        )
        assertTrue(d is ConnectionStrategy.Decision.RetrySaved)
    }

    @Test
    fun `isLikelyDeadLoopback 正确识别回环地址`() {
        assertTrue(ConnectionStrategy.isLikelyDeadLoopback("127.0.0.1"))
        assertTrue(ConnectionStrategy.isLikelyDeadLoopback("localhost"))
        assertTrue(ConnectionStrategy.isLikelyDeadLoopback("::1"))
        assertTrue(ConnectionStrategy.isLikelyDeadLoopback("[::1]"))
        assertTrue(ConnectionStrategy.isLikelyDeadLoopback("[::1]".lowercase()))
        assertTrue(!ConnectionStrategy.isLikelyDeadLoopback("192.168.1.5"))
        assertTrue(!ConnectionStrategy.isLikelyDeadLoopback("10.0.0.9"))
    }

    @Test
    fun `整个 127 段都是回环（修复前只认 127_0_0_1）`() {
        // 127.0.0.0/8 整段皆回环，用户可能填其中任一地址；
        // 修复前只认字面量 127.0.0.1，其余会被误判为「正常局域网地址」
        // → 永不切换 → 卡死在失效地址（正是本模块要解决的场景）。
        assertTrue(ConnectionStrategy.isLikelyDeadLoopback("127.0.0.2"))
        assertTrue(ConnectionStrategy.isLikelyDeadLoopback("127.1.1.1"))
        assertTrue(ConnectionStrategy.isLikelyDeadLoopback("127.255.255.254"))
        assertTrue("大小写/空格应容错", ConnectionStrategy.isLikelyDeadLoopback("  127.0.0.1  "))
    }

    @Test
    fun `相近但非回环的地址不被误判`() {
        // 防止 startsWith("127.") 过度匹配：这些都不属于 127.0.0.0/8
        assertTrue(!ConnectionStrategy.isLikelyDeadLoopback("12.7.0.1"))
        assertTrue(!ConnectionStrategy.isLikelyDeadLoopback("128.0.0.1"))
        assertTrue(!ConnectionStrategy.isLikelyDeadLoopback("1270.0.0.1"))
        assertTrue(!ConnectionStrategy.isLikelyDeadLoopback("192.168.127.1"))
    }

    @Test
    fun `127 段回环被认为失效后会切到发现的局域网会话`() {
        // 端到端串起：savedHost=127.1.1.1（非标准回环但同段）+ 失败 2 次 +
        // 发现 1 个局域网会话 → 应切过去（修复前会 RetrySaved 卡死）
        val target = lan("192.168.1.50")
        val d = ConnectionStrategy.decide("127.1.1.1", 5680, listOf(target), failedAttempts = 2)
        assertEquals(ConnectionStrategy.Decision.SwitchTo(target), d)
    }
}
