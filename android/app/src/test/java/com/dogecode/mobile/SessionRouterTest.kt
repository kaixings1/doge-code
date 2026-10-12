package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * SessionRouter 测试 —— 真·并行连接的**路由与回收判据**。
 *
 * 这两条判据错了后果严重且静默：
 * - 路由判据错 → 后台会话的消息污染当前界面（历史串味，无报错）
 * - 回收判据错 → 泄漏连接拖死 App，或误杀正在用的会话
 *
 * ## 变异锚点（每条都用「取反判据后用例应失败」验证测试有效）
 *
 * 1. affectsUi：把 `eventKey == activeKey` 改成恒 true → 「非活动不刷 UI」失败
 * 2. affectsUi：把 `activeKey != null` 去掉 → 「无活动会话不刷 UI」失败
 * 3. isConnectionStateEvent：把 Connected 从集合移除 → 「Connected 算状态事件」失败
 * 4. shouldNotifyBackground：把 `role == "assistant"` 放宽为恒 true →
 *    「user/system 不通知」失败
 * 5. shouldRecycle：去掉 `if (isActive) return false` → 「活动不回收」失败
 * 6. shouldRecycle：去掉 `if (connected) return false` → 「已连不回收」失败
 * 7. shouldRecycle：把 `>=` 改成 `>` → 「恰好等于阈值应回收」失败
 */
class SessionRouterTest {

    // ── affectsUi：事件是否作用于当前界面 ──

    @Test
    fun `活动会话的事件应作用于UI`() {
        assertTrue(SessionRouter.affectsUi("192.168.1.5_5680", "192.168.1.5_5680"))
    }

    @Test
    fun `非活动会话的事件不应作用于UI`() {
        // 变异 1 锚点：若改成恒 true，本用例失败
        assertFalse(SessionRouter.affectsUi("192.168.1.5_5680", "192.168.1.6_5680"))
    }

    @Test
    fun `无活动会话时任何事件都不作用于UI`() {
        // 变异 2 锚点：若去掉 activeKey != null 判断，本用例失败
        assertFalse(SessionRouter.affectsUi("192.168.1.5_5680", null))
    }

    // ── isConnectionStateEvent ──

    @Test
    fun `Connected 是连接状态事件`() {
        // 变异 3 锚点：若从集合移除 Connected，本用例失败
        assertTrue(
            SessionRouter.isConnectionStateEvent(
                BridgeClient.Event.Connected(interactive = true),
            ),
        )
    }

    @Test
    fun `Disconnected 是连接状态事件`() {
        assertTrue(
            SessionRouter.isConnectionStateEvent(BridgeClient.Event.Disconnected("x")),
        )
    }

    @Test
    fun `AuthFailed 与 SessionLimitReached 是连接状态事件`() {
        assertTrue(SessionRouter.isConnectionStateEvent(BridgeClient.Event.AuthFailed("x")))
        assertTrue(SessionRouter.isConnectionStateEvent(BridgeClient.Event.SessionLimitReached("x")))
    }

    @Test
    fun `Incoming 内容事件不是连接状态事件`() {
        // 反向锚点：内容事件若被误判为状态事件，会走错分流路径
        assertFalse(
            SessionRouter.isConnectionStateEvent(
                BridgeClient.Event.Incoming("assistant", "hi"),
            ),
        )
    }

    // ── shouldNotifyBackground：后台会话通知 ──

    @Test
    fun `后台助手回复应发通知`() {
        assertTrue(SessionRouter.shouldNotifyBackground("assistant", "完成"))
    }

    @Test
    fun `后台用户消息不应发通知`() {
        // 变异 4 锚点：若放宽 role 判断，本用例失败
        assertFalse(SessionRouter.shouldNotifyBackground("user", "hi"))
    }

    @Test
    fun `后台系统消息不应发通知`() {
        assertFalse(SessionRouter.shouldNotifyBackground("system", "提示"))
    }

    @Test
    fun `后台空白助手回复不应发通知`() {
        assertFalse(SessionRouter.shouldNotifyBackground("assistant", "   "))
    }

    // ── shouldRecycle：失联连接回收（防卡死） ──

    private val IDLE = 5 * 60 * 1000L

    @Test
    fun `活动会话即使失联也不回收`() {
        // 变异 5 锚点：若去掉 isActive 早退，本用例失败
        assertFalse(
            SessionRouter.shouldRecycle(
                isActive = true, connected = false, userClosed = false,
                lastActivityAt = 0, now = IDLE * 10, idleRecycleMs = IDLE,
            ),
        )
    }

    @Test
    fun `已连接的会话不回收`() {
        // 变异 6 锚点：若去掉 connected 早退，本用例失败
        assertFalse(
            SessionRouter.shouldRecycle(
                isActive = false, connected = true, userClosed = false,
                lastActivityAt = 0, now = IDLE * 10, idleRecycleMs = IDLE,
            ),
        )
    }

    @Test
    fun `非活动且失联超阈值应回收`() {
        assertTrue(
            SessionRouter.shouldRecycle(
                isActive = false, connected = false, userClosed = false,
                lastActivityAt = 0, now = IDLE + 1, idleRecycleMs = IDLE,
            ),
        )
    }

    @Test
    fun `恰好达到阈值即回收（边界含等号）`() {
        // 变异 7 锚点：若把 >= 改成 >，本用例失败
        assertTrue(
            SessionRouter.shouldRecycle(
                isActive = false, connected = false, userClosed = false,
                lastActivityAt = 0, now = IDLE, idleRecycleMs = IDLE,
            ),
        )
    }

    @Test
    fun `未达阈值不回收`() {
        assertFalse(
            SessionRouter.shouldRecycle(
                isActive = false, connected = false, userClosed = false,
                lastActivityAt = 0, now = IDLE - 1, idleRecycleMs = IDLE,
            ),
        )
    }

    @Test
    fun `用户主动关闭的非活动会话立即回收（不等阈值）`() {
        assertTrue(
            SessionRouter.shouldRecycle(
                isActive = false, connected = false, userClosed = true,
                lastActivityAt = 0, now = 0, idleRecycleMs = IDLE,
            ),
        )
    }

    @Test
    fun `用户主动关闭但仍是活动会话时不回收`() {
        // 保护：关闭动作尚未切走时，不能把用户正看着的会话抽掉
        assertFalse(
            SessionRouter.shouldRecycle(
                isActive = true, connected = false, userClosed = true,
                lastActivityAt = 0, now = 0, idleRecycleMs = IDLE,
            ),
        )
    }

    @Test
    fun `默认阈值是5分钟`() {
        assertEquals(5 * 60 * 1000L, SessionRouter.DEFAULT_IDLE_RECYCLE_MS)
    }
}
