package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Calendar

/**
 * 时间分隔线判据测试。
 *
 * 两类错误都不报错、只是体验变差：
 *   ① 该插不插 → 用户看不出「这是昨天的事」
 *   ② 不该插却插 → 列表被一堆线切碎，更难读
 * 且「跨日」判据涉及时区与日历日，用毫秒差直接算会错。
 *
 * 变异验证：把 shouldDivide 的 `index <= 0` 改成 `< 0`，
 * 「首条消息前不插」用例失败。
 */
class TimeDividerTest {

    private fun ts(y: Int, mo: Int, d: Int, h: Int, mi: Int): Long =
        Calendar.getInstance().apply {
            clear()
            set(y, mo - 1, d, h, mi, 0)
        }.timeInMillis

    // ── shouldDivide ──

    @Test
    fun `首条消息前不插分隔线`() {
        // 没有「间隔」可言，凭空一条线很奇怪
        val list = listOf(ts(2026, 8, 1, 10, 0))
        assertFalse(TimeDivider.shouldDivide(list, 0))
    }

    @Test
    fun `间隔很短时不插`() {
        val list = listOf(ts(2026, 8, 1, 10, 0), ts(2026, 8, 1, 10, 5))
        assertFalse(TimeDivider.shouldDivide(list, 1))
    }

    @Test
    fun `间隔超过阈值时插`() {
        val list = listOf(ts(2026, 8, 1, 10, 0), ts(2026, 8, 1, 11, 0))
        assertTrue(TimeDivider.shouldDivide(list, 1))
    }

    @Test
    fun `恰好等于阈值时不插（须超过而非达到）`() {
        val a = ts(2026, 8, 1, 10, 0)
        val list = listOf(a, a + TimeDivider.GAP_MS)
        assertFalse(TimeDivider.shouldDivide(list, 1))
    }

    @Test
    fun `越界下标安全返回 false`() {
        val list = listOf(1000L, 2000L)
        assertFalse(TimeDivider.shouldDivide(list, -1))
        assertFalse(TimeDivider.shouldDivide(list, 5))
    }

    @Test
    fun `时间戳为 0 的旧数据不插`() {
        // 关键：0 会让时间差变得极大而误插 —— 会在每条旧消息前
        // 都插一条「今天 08:00」之类的线。宁可漏也不可滥。
        val list = listOf(0L, ts(2026, 8, 1, 10, 0))
        assertFalse(TimeDivider.shouldDivide(list, 1))
        val list2 = listOf(ts(2026, 8, 1, 10, 0), 0L)
        assertFalse(TimeDivider.shouldDivide(list2, 1))
    }

    @Test
    fun `阈值取 30 分钟`() {
        assertEquals(30 * 60 * 1000L, TimeDivider.GAP_MS)
    }

    // ── label ──

    @Test
    fun `今天的消息标「今天 + 时间」`() {
        val now = ts(2026, 8, 1, 15, 0)
        val t = ts(2026, 8, 1, 9, 5)
        assertEquals("今天 09:05", TimeDivider.label(t, now))
    }

    @Test
    fun `昨天的消息标「昨天」`() {
        val now = ts(2026, 8, 2, 15, 0)
        val t = ts(2026, 8, 1, 23, 30)
        assertTrue(TimeDivider.label(t, now).startsWith("昨天"))
    }

    @Test
    fun `跨日按日历日判定而非 24 小时（关键）`() {
        // 昨天 23:00 到 今天 01:00 只隔 2 小时，但已跨日 ——
        // 若按毫秒差算会说成「今天」，用户看到「今天 23:00」
        // 而今天才刚过午夜，明显反直觉
        val now = ts(2026, 8, 2, 1, 0)
        val t = ts(2026, 8, 1, 23, 0)
        assertTrue(
            "跨日必须判为昨天，实际：${TimeDivider.label(t, now)}",
            TimeDivider.label(t, now).startsWith("昨天"),
        )
    }

    @Test
    fun `几天前标「N 天前」`() {
        val now = ts(2026, 8, 5, 12, 0)
        val t = ts(2026, 8, 2, 12, 0)
        assertEquals("3 天前", TimeDivider.label(t, now))
    }

    @Test
    fun `超过一周用具体日期`() {
        // 说「23 天前」用户还得自己换算，不如直接给日期
        val now = ts(2026, 8, 30, 12, 0)
        val t = ts(2026, 8, 1, 9, 5)
        assertEquals("2026-08-01", TimeDivider.label(t, now))
    }

    @Test
    fun `时间戳为 0 返回空串`() {
        assertEquals("", TimeDivider.label(0L, ts(2026, 8, 1, 12, 0)))
    }

    @Test
    fun `时间格式补零`() {
        val now = ts(2026, 8, 1, 20, 0)
        val t = ts(2026, 8, 1, 9, 5)
        assertTrue("个位数应补零", TimeDivider.label(t, now).contains("09:05"))
    }
}
