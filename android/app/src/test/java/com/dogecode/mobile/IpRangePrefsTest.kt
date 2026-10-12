package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * [IpRangePrefs.normalize] 的边界测试。
 *
 * 这些判据驱动真实扫描范围：算错会让「扫描永远扫不到」（范围落到空段）
 * 或「扫描过慢」（范围没夹住），两者都表现为用户层面的「找不到会话」。
 */
class IpRangePrefsTest {

    @Test
    fun `默认 100-130 原样通过`() {
        assertEquals(100 to 130, IpRangePrefs.normalize(100, 130))
    }

    @Test
    fun `低于 1 夹到 1`() {
        assertEquals(1 to 130, IpRangePrefs.normalize(0, 130))
        assertEquals(1 to 130, IpRangePrefs.normalize(-5, 130))
    }

    @Test
    fun `高于 254 夹到 254`() {
        assertEquals(100 to 254, IpRangePrefs.normalize(100, 999))
        assertEquals(100 to 254, IpRangePrefs.normalize(100, 255))
    }

    @Test
    fun `倒置自动互换`() {
        // 用户填反了（130-100）应纠正为 100-130，而不是拒绝或生成空段
        assertEquals(100 to 130, IpRangePrefs.normalize(130, 100))
    }

    @Test
    fun `单值范围合法`() {
        assertEquals(50 to 50, IpRangePrefs.normalize(50, 50))
    }

    @Test
    fun `两端都越界时夹取后仍有序`() {
        // -10 → 1，999 → 254，结果 1..254
        assertEquals(1 to 254, IpRangePrefs.normalize(-10, 999))
    }

    @Test
    fun `越界导致倒置时先夹取再互换`() {
        // 500 → 254，3 → 3；此时 254 > 3 → 互换为 3..254
        assertEquals(3 to 254, IpRangePrefs.normalize(500, 3))
    }

    @Test
    fun `渲染与解析互逆`() {
        val text = IpRangePrefs.formatRange(100, 130)
        assertEquals("100-130", text)
        // 复用 ScanPortPrefs 的解析器（同一套格式）
        assertEquals(100 to 130, ScanPortPrefs.parseRange(text))
    }
}
