package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 自动连接策略测试。
 *
 * 判据错了的两个方向都不会报错、只会让人恼火：
 * · 「该连不连」→ 用户以为自动连接没生效
 * · 「不该连连上」→ 连错会话，或**断不掉**（用户会认为程序有 bug）
 *
 * 变异验证：把 `userDisconnected` 那个早退删掉，
 * 「用户手动断开后不再自动连」用例失败。
 */
class AutoConnectTest {

    private fun s(port: Int, host: String = "192.168.1.5", label: String = "会话$port") =
        SessionScanner.Session(
            port = port, sessionId = "id-$port", label = label, cwd = "",
            interactive = true, clients = 0, host = host,
        )

    private fun decide(
        candidates: List<SessionScanner.Session>,
        enabled: Boolean = true,
        alreadyConnected: Boolean = false,
        userDisconnected: Boolean = false,
        currentPort: Int? = null,
    ) = AutoConnect.shouldConnect(enabled, candidates, alreadyConnected, userDisconnected, currentPort)

    // ── 正常连接 ──

    @Test
    fun `只有一个会话时自动连接`() {
        val d = decide(listOf(s(5680)))
        assertTrue("应连接", d is AutoConnect.Decision.Connect)
        assertEquals(5680, (d as AutoConnect.Decision.Connect).session.port)
    }

    @Test
    fun `连接理由可读`() {
        val d = decide(listOf(s(5680))) as AutoConnect.Decision.Connect
        assertTrue("应给出理由", d.reason.isNotBlank())
    }

    // ── 不连接的情形 ──

    @Test
    fun `多个会话时不猜（连错比不连更烦）`() {
        val d = decide(listOf(s(5680), s(5681)))
        assertTrue("应跳过", d is AutoConnect.Decision.Skip)
        assertTrue("理由应说明有几个", (d as AutoConnect.Decision.Skip).reason.contains("2"))
    }

    @Test
    fun `关闭时跳过`() {
        val d = decide(listOf(s(5680)), enabled = false)
        assertTrue(d is AutoConnect.Decision.Skip)
    }

    @Test
    fun `已连接时不重复连`() {
        val d = decide(listOf(s(5680)), alreadyConnected = true)
        assertTrue(d is AutoConnect.Decision.Skip)
    }

    @Test
    fun `用户手动断开后不再自动连（关键：否则断不掉）`() {
        // 没有这条，用户断开后下次广播又连回来 —— 会认为程序有 bug
        val d = decide(listOf(s(5680)), userDisconnected = true)
        assertTrue("必须跳过", d is AutoConnect.Decision.Skip)
        assertNull("不应给出会话", d.connectedSession)
    }

    @Test
    fun `无候选时跳过`() {
        val d = decide(emptyList())
        assertTrue(d is AutoConnect.Decision.Skip)
    }

    // ── 当前端口匹配 ──

    @Test
    fun `候选恰是当前端口时连（恢复上次会话）`() {
        val d = decide(listOf(s(5680)), currentPort = 5680)
        assertTrue(d is AutoConnect.Decision.Connect)
        assertEquals(5680, (d as AutoConnect.Decision.Connect).session.port)
    }

    @Test
    fun `候选端口与当前不同时仍连（换会话）`() {
        // 只有一个候选，且不是上次那个 —— 说明上次的没了，连这个
        val d = decide(listOf(s(5681)), currentPort = 5680)
        assertTrue(d is AutoConnect.Decision.Connect)
        assertEquals(5681, (d as AutoConnect.Decision.Connect).session.port)
    }

    // ── 优先级（多个跳过条件同时成立时）──

    @Test
    fun `已连接优先于其他条件`() {
        // 已连接时即便有其他问题也不该重复连
        val d = decide(listOf(s(5680), s(5681)), alreadyConnected = true, userDisconnected = true)
        assertTrue(d is AutoConnect.Decision.Skip)
        assertTrue("理由应是已连接", (d as AutoConnect.Decision.Skip).reason.contains("已连接"))
    }

    // ── 多会话提示文案 ──

    @Test
    fun `多会话提示带数量且可操作`() {
        val hint = AutoConnect.multiSessionHint(3)
        assertTrue("应含数量", hint.contains("3"))
        assertTrue("应引导用户操作", hint.contains("点选") || hint.contains("选择"))
    }

    @Test
    fun `默认开启自动连接`() {
        assertEquals(true, AutoConnect.DEFAULT_ENABLED)
    }
}
