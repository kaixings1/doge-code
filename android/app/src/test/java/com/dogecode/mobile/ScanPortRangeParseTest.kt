package com.dogecode.mobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * 设置页「扫描端口段」输入解析的测试。
 *
 * 为什么必须测：解析失败的**表现是「什么都没发生」**——用户填了 6000-6009
 * 点保存，若无 UI 反馈，他无法区分「保存成功」和「格式被拒后静默回退」。
 * 而这块最易错的正是格式边界：全角连字符、缺分隔符、非数字、多余空格。
 *
 * 变异验证：把 parseRange 里的 split('-', '－') 改成 split('-')，
 * 「全角连字符」用例失败 —— 证明全角兼容分支被真实覆盖。
 */
class ScanPortRangeParseTest {

    @Test
    fun `标准半角连字符可解析`() {
        assertEquals(6000 to 6009, ScanPortPrefs.parseRange("6000-6009"))
    }

    @Test
    fun `全角连字符也可解析`() {
        // 中文输入法下极易打出全角『－』（U+FF0D）。若不兼容，用户会
        // 以为「填了没反应」，而屏幕上两个字符看起来几乎一样。
        assertEquals(5680 to 5689, ScanPortPrefs.parseRange("5680－5689"))
    }

    @Test
    fun `两侧与内部空格被容忍`() {
        assertEquals(6000 to 6009, ScanPortPrefs.parseRange("  6000 - 6009  "))
    }

    @Test
    fun `单个端口也可解析`() {
        assertEquals(5680 to 5680, ScanPortPrefs.parseRange("5680-5680"))
    }

    @Test
    fun `缺分隔符返回 null`() {
        assertNull(ScanPortPrefs.parseRange("6000"))
    }

    @Test
    fun `非数字返回 null`() {
        assertNull(ScanPortPrefs.parseRange("abc-def"))
        assertNull(ScanPortPrefs.parseRange("6000-abc"))
    }

    @Test
    fun `空串返回 null`() {
        assertNull(ScanPortPrefs.parseRange(""))
        assertNull(ScanPortPrefs.parseRange("   "))
    }

    @Test
    fun `多余分隔符返回 null`() {
        assertNull(ScanPortPrefs.parseRange("6000-6009-6010"))
    }

    @Test
    fun `formatRange 与 parseRange 互逆`() {
        val (s, e) = ScanPortPrefs.parseRange(ScanPortPrefs.formatRange(6000, 6009))!!
        assertEquals(6000, s)
        assertEquals(6009, e)
    }

    @Test
    fun `解析倒置输入后由 normalize 纠正`() {
        // 解析层不管语义，只做格式；语义纠正交给 PortScanRange.normalize。
        // 端到端确认二者串起来能得到合法非空区间。
        val (s, e) = ScanPortPrefs.parseRange("6009-6000")!!
        val (ns, ne) = PortScanRange.normalize(s, e)
        assertEquals(6009, ns)
        assertEquals(6009, ne)
    }
}
