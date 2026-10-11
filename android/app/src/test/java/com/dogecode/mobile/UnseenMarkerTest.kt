package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * 未读提示判据测试。
 *
 * 这段错了不会报错，只是「提示不出现」或「提示赖着不走」，
 * 且其中一个边界（未布局返回 -1）会让**刚打开 App 就显示假未读**。
 *
 * 变异验证：把 shouldMark 里 `lastVisiblePos < 0` 的早退删掉，
 * 「未布局时不提示」用例失败（-1 会让距离算出很大值）。
 */
class UnseenMarkerTest {

    // ── shouldMark ──

    @Test
    fun `在底部时不提示`() {
        // 10 项，最后一项可见（下标 9）
        assertFalse(UnseenMarker.shouldMark(totalItems = 10, lastVisiblePos = 9))
    }

    @Test
    fun `最后一项部分可见时不提示`() {
        // 下标 8 可见 → 距底部 1 项，属阈值内
        assertFalse(UnseenMarker.shouldMark(totalItems = 10, lastVisiblePos = 8))
    }

    @Test
    fun `明显不在底部时提示`() {
        // 下标 5 可见 → 距底部 4 项
        assertTrue(UnseenMarker.shouldMark(totalItems = 10, lastVisiblePos = 5))
    }

    @Test
    fun `未布局时（-1）不提示（关键：防开盘假未读）`() {
        // RecyclerView 尚未走 layout 时返回 -1。
        // 若按「总项 - (-1) > 1」算会判成有未读，导致刚打开 App
        // 就挂一个「N 条新消息」——而用户明明正看着最新。
        assertFalse(UnseenMarker.shouldMark(totalItems = 10, lastVisiblePos = -1))
    }

    @Test
    fun `空列表不提示`() {
        assertFalse(UnseenMarker.shouldMark(totalItems = 0, lastVisiblePos = -1))
        assertFalse(UnseenMarker.shouldMark(totalItems = 0, lastVisiblePos = 0))
    }

    @Test
    fun `单项列表不提示`() {
        // 只有一条消息，不存在「在底部但看不到最新」的情形
        assertFalse(UnseenMarker.shouldMark(totalItems = 1, lastVisiblePos = 0))
    }

    // ── isNearBottom ──

    @Test
    fun `最后一项可见时视为在底部`() {
        assertTrue(UnseenMarker.isNearBottom(totalItems = 10, lastVisiblePos = 9))
    }

    @Test
    fun `距底部一项时视为在底部（阈值 1）`() {
        assertTrue(UnseenMarker.isNearBottom(totalItems = 10, lastVisiblePos = 8))
    }

    @Test
    fun `距底部两项时不视为在底部`() {
        assertFalse(UnseenMarker.isNearBottom(totalItems = 10, lastVisiblePos = 7))
    }

    @Test
    fun `未布局时视为在底部（不显示箭头）`() {
        // 与 shouldMark 保持一致：未布局不该触发任何提示 UI
        assertTrue(UnseenMarker.isNearBottom(totalItems = 10, lastVisiblePos = -1))
    }

    @Test
    fun `空列表视为在底部`() {
        assertTrue(UnseenMarker.isNearBottom(totalItems = 0, lastVisiblePos = -1))
    }

    // ── 互补性（两条判据不能同时为真）──

    @Test
    fun `shouldMark 与 isNearBottom 互补`() {
        // 同时为真会导致「既提示有新消息、又显示滚到底箭头」的重叠 UI
        for (total in listOf(1, 2, 5, 20)) {
            for (last in -1 until total) {
                val mark = UnseenMarker.shouldMark(total, last)
                val near = UnseenMarker.isNearBottom(total, last)
                assertFalse(
                    "total=$total last=$last 时两者不应同时为真",
                    mark && near,
                )
            }
        }
    }

    // ── badgeText ──

    @Test
    fun `零条返回空串（不显示）`() {
        assertEquals("", UnseenMarker.badgeText(0))
        assertEquals("", UnseenMarker.badgeText(-3))
    }

    @Test
    fun `正常条数带「条新消息」`() {
        assertEquals("1 条新消息", UnseenMarker.badgeText(1))
        assertEquals("12 条新消息", UnseenMarker.badgeText(12))
    }

    @Test
    fun `超过 99 显示 99+`() {
        // 三位数以上的具体数字对用户没帮助，且会把按钮撑宽挤占列表
        assertEquals("99+ 条新消息", UnseenMarker.badgeText(100))
        assertEquals("99+ 条新消息", UnseenMarker.badgeText(9999))
    }

    @Test
    fun `恰好 99 显示具体数字`() {
        assertEquals("99 条新消息", UnseenMarker.badgeText(99))
    }

    @Test
    fun `阈值常量为 1`() {
        assertEquals(1, UnseenMarker.NEAR_BOTTOM_THRESHOLD)
    }
}
