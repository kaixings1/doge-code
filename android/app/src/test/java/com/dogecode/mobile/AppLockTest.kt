package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * AppLock 判定逻辑的单元测试。
 *
 * 覆盖 2×2 组合 + shouldLock 语义。这些是「开不了 App」级别的分支，
 * 必须可单测（设备可用性由 BiometricGate 单独判定，本类只吃布尔）。
 */
class AppLockTest {

    @Test
    fun `开关关闭时恒为 OFF，与设备是否设凭据无关`() {
        assertEquals(AppLock.Status.OFF, AppLock.evaluate(prefOn = false, hasCredential = true))
        assertEquals(AppLock.Status.OFF, AppLock.evaluate(prefOn = false, hasCredential = false))
    }

    @Test
    fun `开关开且设备设凭据时为 REQUIRED`() {
        assertEquals(
            AppLock.Status.REQUIRED,
            AppLock.evaluate(prefOn = true, hasCredential = true),
        )
    }

    @Test
    fun `开关开但设备未设凭据时降级为 UNSUPPORTED，不能卡死用户`() {
        assertEquals(
            AppLock.Status.UNSUPPORTED,
            AppLock.evaluate(prefOn = true, hasCredential = false),
        )
    }

    @Test
    fun `shouldLock 仅在 REQUIRED 时为真`() {
        assertEquals(false, AppLock.shouldLock(prefOn = false, hasCredential = true))
        assertEquals(true, AppLock.shouldLock(prefOn = true, hasCredential = true))
        // 设备没设凭据时即便开了也不拦 —— 否则用户卡在弹不出解锁的界面
        assertEquals(false, AppLock.shouldLock(prefOn = true, hasCredential = false))
    }

    /**
     * 变异验证：把 evaluate 的降级分支改成「没凭据也 REQUIRED」，
     * 本条应失败（确认我们真的在约束「没凭据时不拦」）。
     */
    @Test
    fun `变异：若没凭据也返回 REQUIRED 则测试失败`() {
        // 真实实现下，开+没凭据 必须不是 REQUIRED
        val actual = AppLock.evaluate(prefOn = true, hasCredential = false)
        assert(actual != AppLock.Status.REQUIRED) {
            "设备没设锁屏凭据时不应要求解锁，否则用户会被卡死"
        }
    }
}
