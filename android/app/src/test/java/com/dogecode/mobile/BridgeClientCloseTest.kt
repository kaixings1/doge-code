package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * [BridgeClient.classifyClose] 的测试。
 *
 * 这个函数决定「服务端关闭连接后怎么办」，写错的表现是**用户困惑**：
 * 密钥不对却疯狂重连、或设备数满了却只闪「已断开，重连中」不知原因
 * （4002 缺口长期未被发现正因如此）。所以三个分支各自的策略必须逐个钉死。
 */
class BridgeClientCloseTest {

    @Test
    fun `4001 认证失败停止重连且无退避`() {
        val a = BridgeClient.classifyClose(4001)
        assertEquals(BridgeClient.CloseAction.AUTH_FAILED, a)
        assertTrue("认证失败必须停止重连", a.stopReconnect)
        assertNull("认证失败不设退避（不再重连）", a.retryDelayMs)
    }

    @Test
    fun `4002 会话数上限不停止重连但用长退避`() {
        val a = BridgeClient.classifyClose(4002)
        assertEquals(BridgeClient.CloseAction.SESSION_LIMIT, a)
        assertFalse("会话数上限可恢复，不应停止重连", a.stopReconnect)
        assertEquals(
            "退避应为 30 秒，避免快速重连狂闪状态栏",
            BridgeClient.SESSION_LIMIT_RETRY_MS,
            a.retryDelayMs,
        )
    }

    @Test
    fun `其它码走普通重连`() {
        // 1000 正常关闭、1006 异常断线、0 无码 —— 都应按普通断线处理（重连）
        for (code in listOf(1000, 1006, 1001, 0)) {
            val a = BridgeClient.classifyClose(code)
            assertEquals("code=$code 应为普通断线", BridgeClient.CloseAction.NORMAL, a)
            assertFalse("code=$code 不应停止重连", a.stopReconnect)
            assertNull("code=$code 用默认退避", a.retryDelayMs)
        }
    }

    @Test
    fun `4002 退避显著长于普通起始退避`() {
        // 普通断线起始退避为 1 秒（connect() 里 retryDelayMs=1000L）；
        // 4002 必须显著更长，否则等于没区分。
        assertTrue(
            "4002 退避应远大于普通起始 1 秒",
            BridgeClient.SESSION_LIMIT_RETRY_MS >= 10_000L,
        )
    }
}
