package com.dogecode.mobile

import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 连接失败提示测试。
 *
 * 为什么必须测：提示文案本身不影响逻辑，但**提示错了会让用户
 * 走错方向**（如把「USB 转发丢失」说成「网络问题」，用户会去调
 * 路由器而不是重跑 adb 命令）。且这类判据错了不会报错。
 *
 * 变异验证：把 isLoopback 的 `127.0.0.1` 判断去掉，
 * 「回环地址给出 USB 转发提示」用例失败。
 */
class ConnectionHintTest {

    // ── isLoopback ──

    @Test
    fun `识别所有回环形态`() {
        assertTrue(ConnectionHint.isLoopback("http://127.0.0.1:5680"))
        assertTrue(ConnectionHint.isLoopback("127.0.0.1"))
        assertTrue(ConnectionHint.isLoopback("http://localhost:5680"))
        assertTrue(ConnectionHint.isLoopback("http://[::1]:5680"))
        assertTrue(ConnectionHint.isLoopback("::1"))
    }

    @Test
    fun `局域网地址不是回环`() {
        assertFalse(ConnectionHint.isLoopback("http://192.168.1.5:5680"))
        assertFalse(ConnectionHint.isLoopback("http://10.0.0.7:5680"))
    }

    @Test
    fun `大小写不敏感`() {
        assertTrue(ConnectionHint.isLoopback("HTTP://LOCALHOST:5680"))
    }

    // ── hintFor ──

    @Test
    fun `首次失败不提示（避免噪音）`() {
        // 瞬时抖动很常见，一失败就弹提示会让人麻木
        assertNull(ConnectionHint.hintFor("http://127.0.0.1:5680", failedAttempts = 1))
        assertNull(ConnectionHint.hintFor("http://127.0.0.1:5680", failedAttempts = 0))
    }

    @Test
    fun `回环地址连续失败时给出 USB 转发提示`() {
        val hint = ConnectionHint.hintFor("http://127.0.0.1:5680", failedAttempts = 3)!!
        // 必须给出**可直接执行**的命令 —— 只说「转发可能没了」用户不知道怎么办
        assertTrue("应含 adb reverse 命令", hint.contains("adb reverse"))
        assertTrue("应说明拔插后会失效", hint.contains("拔插") || hint.contains("数据线"))
    }

    @Test
    fun `回环提示给出替代方案（局域网）`() {
        // 只告诉用户「有问题」不够 —— 要给一条能走通的路
        val hint = ConnectionHint.hintFor("http://localhost:5680", failedAttempts = 3)!!
        assertTrue("应建议改用局域网", hint.contains("局域网") || hint.contains("WiFi"))
    }

    @Test
    fun `局域网地址失败时给出网络排查提示`() {
        val hint = ConnectionHint.hintFor("http://192.168.1.5:5680", failedAttempts = 3)!!
        assertTrue("应提示同网段", hint.contains("同一 WiFi") || hint.contains("网段"))
        assertTrue("应提示防火墙", hint.contains("防火墙"))
        assertTrue("应提示 AP 隔离", hint.contains("AP 隔离") || hint.contains("隔离"))
    }

    @Test
    fun `局域网提示带上尝试的地址（便于核对）`() {
        val hint = ConnectionHint.hintFor("http://192.168.1.99:5680", failedAttempts = 3)!!
        assertTrue("应含地址", hint.contains("192.168.1.99"))
    }

    // ── shouldSuggestDiscovery ──

    @Test
    fun `连续失败时建议去发现会话`() {
        assertFalse(ConnectionHint.shouldSuggestDiscovery(1))
        assertTrue(ConnectionHint.shouldSuggestDiscovery(2))
        assertTrue(ConnectionHint.shouldSuggestDiscovery(5))
    }

    // ── waitingHint（基于实测 13.3 秒的启动延迟）──

    @Test
    fun `刚开始等待时不提示（避免一闪而过）`() {
        // 3 秒内若已发现会话，这条提示根本不该显示
        assertNull(ConnectionHint.waitingHint(0))
        assertNull(ConnectionHint.waitingHint(1_000))
        assertNull(ConnectionHint.waitingHint(ConnectionHint.WAIT_HINT_AFTER_MS - 1))
    }

    @Test
    fun `等待超过阈值后提示`() {
        val hint = ConnectionHint.waitingHint(ConnectionHint.WAIT_HINT_AFTER_MS)!!
        assertTrue("应说明正在搜索", hint.contains("搜索"))
    }

    @Test
    fun `CLI 启动窗口内解释需等十几秒`() {
        // 实测启动需 13.3 秒 —— 这段窗口内要为 CLI 开脱，
        // 否则用户会以为是自己网络的问题
        val hint = ConnectionHint.waitingHint(5_000)!!
        assertTrue("应说明 CLI 需加载时间", hint.contains("加载") || hint.contains("稍候"))
    }

    @Test
    fun `超出启动窗口后转为网络排查建议`() {
        // 超过 15 秒仍没发现，就不该继续为 CLI 开脱
        val hint = ConnectionHint.waitingHint(ConnectionHint.CLI_STARTUP_MS + 5_000)!!
        assertTrue("应给出排查项", hint.contains("WiFi") || hint.contains("adb reverse"))
    }

    @Test
    fun `提示带已等待秒数（让用户有进度感）`() {
        val hint = ConnectionHint.waitingHint(8_000)!!
        assertTrue("应含秒数", hint.contains("8秒") || hint.contains("8 秒"))
    }

    @Test
    fun `启动耗时常量与实测相符`() {
        // 实测首条广播 13.3 秒；常量应覆盖它（否则会过早停止"为 CLI 开脱"）
        assertTrue(
            "CLI_STARTUP_MS 应 >= 实测值 13.3 秒",
            ConnectionHint.CLI_STARTUP_MS >= 13_300L,
        )
    }

    @Test
    fun `阈值常量与提示判据一致`() {
        // 两处必须同步：阈值改了而提示没改会导致「该提示时不提示」
        assertNull(ConnectionHint.hintFor("http://127.0.0.1:1", ConnectionHint.HINT_THRESHOLD - 1))
        assertTrue(
            ConnectionHint.hintFor("http://127.0.0.1:1", ConnectionHint.HINT_THRESHOLD) != null,
        )
    }
}
